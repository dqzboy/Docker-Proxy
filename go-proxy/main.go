package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// adminPasswordSentinel is the value the UI sends back when the password field
// was left untouched (it shows "********" as a placeholder). The server then
// keeps the existing password instead of overwriting it.
const adminPasswordSentinel = "********"

// resolveConfigPath picks the YAML config to use:
//   1. explicit positional argument, e.g. `./go-proxy /etc/dqz-proxy/config.yaml`
//   2. files auto-discovered in the working directory, in priority order:
//      config.local.yaml (typical dev override) > config.yaml (committed default) > config.example.yaml
//
// When the operator is sitting in the repo with no flag, they'd otherwise see
// "usage: registry-proxy <config.yaml>" and exit — which looks like a crash
// rather than the documented requirement of pointing at a YAML. Picking up the
// first existing file matches what `make run` / `go run .` users actually want.
func resolveConfigPath(args []string) (string, error) {
	if len(args) >= 1 {
		p := args[0]
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		return "", fmt.Errorf("指定的配置文件 %q 不存在", p)
	}
	candidates := []string{"config.local.yaml", "config.yaml", "config.example.yaml"}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			log.Printf("未指定配置文件，自动使用当前目录下的 %s", c)
			return c, nil
		}
	}
	return "", fmt.Errorf("当前目录下未找到 config.yaml / config.local.yaml / config.example.yaml，请显式指定配置路径")
}

func main() {
	configPath, err := resolveConfigPath(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		fmt.Fprintln(os.Stderr, "usage: registry-proxy [config.yaml]")
		os.Exit(2)
	}
	cfg, err := loadConfig(configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	adminToken := os.Getenv("GO_PROXY_ADMIN_TOKEN")

	proxy := NewProxy(cfg)

	// --- Registry proxy server (the public-facing :5000) ---
	registryAddr := cfg.Server.Listen
	if registryAddr == "" {
		registryAddr = ":5000"
	}
	go func() {
		log.Printf("registry proxy listening on %s", registryAddr)
		if err := http.ListenAndServe(registryAddr, proxy); err != nil {
			log.Fatalf("registry proxy error: %v", err)
		}
	}()

	// --- Management API server (internal :5001, never publicly exposed) ---
	adminAddr := cfg.Server.AdminListen
	if adminAddr == "" {
		adminAddr = ":5001"
	}
	adminMux := http.NewServeMux()
	adminMux.HandleFunc("/-/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	adminMux.HandleFunc("/-/config", func(w http.ResponseWriter, r *http.Request) {
		handleAdminConfig(w, r, proxy, configPath, adminToken)
	})
	adminMux.HandleFunc("/-/credentials", func(w http.ResponseWriter, r *http.Request) {
		handleAdminCredentials(w, r, proxy, adminToken)
	})
	adminMux.HandleFunc("/-/reload", func(w http.ResponseWriter, r *http.Request) {
		handleAdminReload(w, r, proxy, configPath, adminToken)
	})
	adminMux.HandleFunc("/-/stats", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Query().Get("reset") == "1" {
			proxy.resetStats()
			writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "reset": true})
			return
		}
		if r.Method != http.MethodGet {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"clients": proxy.snapshotStats(),
		})
	})
	adminMux.HandleFunc("/-/cache", func(w http.ResponseWriter, r *http.Request) {
		handleAdminCache(w, r, proxy, configPath, adminToken)
	})

	adminHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// /-/healthz is a public liveness probe (no token required).
		if r.URL.Path == "/-/healthz" {
			adminMux.ServeHTTP(w, r)
			return
		}
		if adminToken != "" {
			tok := r.Header.Get("X-Admin-Token")
			if tok == "" {
				tok = r.URL.Query().Get("token")
			}
			if tok != adminToken {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		}
		adminMux.ServeHTTP(w, r)
	})

	log.Printf("management API listening on %s", adminAddr)
	if err := http.ListenAndServe(adminAddr, adminHandler); err != nil {
		log.Fatalf("management API error: %v", err)
	}
}

// handleAdminConfig implements GET (return current config, passwords always masked)
// and PUT (replace config: validate, write YAML, hot-reload).
//
// include_secrets=1 is intentionally ignored for backwards compatibility. It
// must never turn this general-purpose configuration endpoint into a plaintext
// secret disclosure API.
func handleAdminConfig(w http.ResponseWriter, r *http.Request, proxy *Proxy, configPath, adminToken string) {
	switch r.Method {
	case http.MethodGet:
		proxy.routeMux.RLock()
		out := *proxy.cfg
		// The top-level copy above still shares the Registries slice with the
		// live config. Clone it before masking so a UI GET can never replace the
		// credentials used by the running proxy with ********.
		out.Registries = append([]RegistryConfig(nil), proxy.cfg.Registries...)
		proxy.routeMux.RUnlock()
		for i := range out.Registries {
			if out.Registries[i].Auth.Password != "" {
				out.Registries[i].Auth.Password = adminPasswordSentinel
			}
		}
		writeJSON(w, http.StatusOK, out)

	case http.MethodPut:
		var incoming Config
		if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
			writeJSONError(w, http.StatusBadRequest, "无效的 JSON: "+err.Error())
			return
		}
		if err := validateConfig(&incoming); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		normalizeConfig(&incoming)
		// Preserve existing passwords when the UI sent the sentinel placeholder.
		proxy.routeMux.RLock()
		current := proxy.cfg
		proxy.routeMux.RUnlock()
		for i := range incoming.Registries {
			if incoming.Registries[i].Auth.Password == adminPasswordSentinel {
				// find matching current registry by name and keep its password
				for j := range current.Registries {
					if current.Registries[j].Name == incoming.Registries[i].Name {
						incoming.Registries[i].Auth.Password = current.Registries[j].Auth.Password
						break
					}
				}
			}
		}
		if err := saveConfig(configPath, &incoming); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "保存配置失败: "+err.Error())
			return
		}
		proxy.reload(&incoming)
		log.Printf("config updated via management API (%d registries)", len(incoming.Registries))
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "registries": len(incoming.Registries)})

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// credentialSyncResponse is an encrypted, machine-to-machine response used by
// hubcmd-ui to synchronize registry credentials without putting plaintext
// passwords on the admin HTTP wire. The encryption key is derived from the
// already-required GO_PROXY_ADMIN_TOKEN, so no additional deployment secret is
// needed. The payload is base64(nonce || ciphertext || auth tag).
type credentialSyncResponse struct {
	Algorithm string `json:"algorithm"`
	Payload   string `json:"payload"`
}

func credentialSyncKey(adminToken string) []byte {
	sum := sha256.Sum256([]byte(adminToken))
	return sum[:]
}

func encryptCredentialSyncPayload(registries []RegistryConfig, adminToken string) (credentialSyncResponse, error) {
	if adminToken == "" {
		return credentialSyncResponse{}, errors.New("GO_PROXY_ADMIN_TOKEN 未配置，无法安全同步凭证")
	}

	plaintext, err := json.Marshal(struct {
		Registries []RegistryConfig `json:"registries"`
	}{Registries: registries})
	if err != nil {
		return credentialSyncResponse{}, fmt.Errorf("序列化凭证失败: %w", err)
	}

	block, err := aes.NewCipher(credentialSyncKey(adminToken))
	if err != nil {
		return credentialSyncResponse{}, fmt.Errorf("初始化凭证加密失败: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return credentialSyncResponse{}, fmt.Errorf("初始化凭证加密失败: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return credentialSyncResponse{}, fmt.Errorf("生成凭证加密随机数失败: %w", err)
	}

	// gcm.Seal appends the authentication tag to the ciphertext.
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return credentialSyncResponse{
		Algorithm: "AES-256-GCM",
		Payload:   base64.StdEncoding.EncodeToString(sealed),
	}, nil
}

// handleAdminCredentials returns an encrypted credential-sync payload. Unlike
// /-/config?include_secrets=1, this endpoint never serializes a plaintext
// password into the HTTP response.
func handleAdminCredentials(w http.ResponseWriter, r *http.Request, proxy *Proxy, adminToken string) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if adminToken == "" {
		writeJSONError(w, http.StatusServiceUnavailable, "未配置 GO_PROXY_ADMIN_TOKEN，无法安全同步凭证")
		return
	}

	proxy.routeMux.RLock()
	registries := append([]RegistryConfig(nil), proxy.cfg.Registries...)
	proxy.routeMux.RUnlock()
	response, err := encryptCredentialSyncPayload(registries, adminToken)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// handleAdminReload re-reads the on-disk config file and hot-reloads.
func handleAdminReload(w http.ResponseWriter, r *http.Request, proxy *Proxy, configPath, adminToken string) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cfg, err := loadConfig(configPath)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "重新加载失败: "+err.Error())
		return
	}
	proxy.reload(cfg)
	log.Printf("config reloaded from disk via management API (%d registries)", len(cfg.Registries))
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "registries": len(cfg.Registries)})
}

// handleAdminCache implements GET (return current cache config + live stats),
// PUT (replace cache config, validate, persist, hot-reload) and POST ?clear=1
// (wipe the on-disk cache and reset counters).
func handleAdminCache(w http.ResponseWriter, r *http.Request, proxy *Proxy, configPath, adminToken string) {
	switch r.Method {
	case http.MethodGet:
		proxy.routeMux.RLock()
		cfg := proxy.cfg.Cache
		// secret_key 属于敏感凭据，GET 一律脱敏，前端拿到 ******** 后若未改动则不覆盖原值。
		if cfg.SecretKey != "" {
			cfg.SecretKey = adminPasswordSentinel
		}
		proxy.routeMux.RUnlock()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"config": cfg,
			"stats":  proxy.snapshotCacheStats(),
		})

	case http.MethodPut:
		var incoming CacheConfig
		if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
			writeJSONError(w, http.StatusBadRequest, "无效的 JSON: "+err.Error())
			return
		}
		proxy.routeMux.RLock()
		current := proxy.cfg
		proxy.routeMux.RUnlock()
		// 前端若未改动密钥，会原样回传脱敏哨兵值；这里还原为磁盘上的真实密钥。
		if incoming.SecretKey == adminPasswordSentinel {
			incoming.SecretKey = current.Cache.SecretKey
		}
		merged := *current
		merged.Cache = incoming
		normalizeConfig(&merged)
		if err := validateCache(&merged.Cache); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := saveConfig(configPath, &merged); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "保存配置失败: "+err.Error())
			return
		}
		proxy.reload(&merged)
		log.Printf("cache config updated via management API")
		writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "config": merged.Cache})

	case http.MethodPost:
		if r.URL.Query().Get("clear") == "1" {
			proxy.routeMux.RLock()
			c := proxy.cache
			proxy.routeMux.RUnlock()
			if c != nil {
				c.Clear()
			}
			proxy.cacheStats.mu.Lock()
			proxy.cacheStats.Hits = 0
			proxy.cacheStats.Misses = 0
			proxy.cacheStats.BytesServed = 0
			proxy.cacheStats.mu.Unlock()
			writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "cleared": true})
			return
		}
		writeJSONError(w, http.StatusBadRequest, "不支持的操作")

	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// validateConfig performs basic sanity checks on a config submitted via the UI.
func validateConfig(cfg *Config) error {
	if len(cfg.Registries) == 0 {
		return fmt.Errorf("至少需要配置一个 registry")
	}
	if err := validateAccessControl(&cfg.AccessControl); err != nil {
		return err
	}
	if err := validateCache(&cfg.Cache); err != nil {
		return err
	}
	names := make(map[string]bool)
	for _, r := range cfg.Registries {
		if r.Name == "" {
			return fmt.Errorf("存在 registry 缺少 name")
		}
		if names[r.Name] {
			return fmt.Errorf("registry name 重复: %s", r.Name)
		}
		names[r.Name] = true
		if len(r.Hosts) == 0 {
			return fmt.Errorf("registry %s 至少需要一个 host", r.Name)
		}
		if r.Upstream == "" {
			return fmt.Errorf("registry %s 缺少 upstream", r.Name)
		}
		if _, err := url.Parse(r.Upstream); err != nil {
			return fmt.Errorf("registry %s 的 upstream 不是合法 URL: %w", r.Name, err)
		}
		switch r.Auth.Type {
		case "", AuthToken, AuthAnonymous, AuthBasic:
		default:
			return fmt.Errorf("registry %s 的 auth.type 非法: %s", r.Name, r.Auth.Type)
		}
	}
	return nil
}

// validateCache checks the optional cache block. When disabled it is a no-op;
// when enabled, backend must be "disk" (needs a local volume) or "s3" (any
// S3-compatible service: MinIO/Ceph or 阿里云 OSS / 腾讯云 COS / 华为云 OBS).
func validateCache(c *CacheConfig) error {
	if !c.Enabled {
		return nil
	}
	switch c.Backend {
	case "disk":
		if c.Dir == "" {
			return fmt.Errorf("cache.enabled=true 且 backend=disk 时必须配置 cache.dir")
		}
	case "s3":
		if c.Endpoint == "" {
			return fmt.Errorf("cache.enabled=true 且 backend=s3 时必须配置 cache.endpoint")
		}
		if c.Bucket == "" {
			return fmt.Errorf("cache.enabled=true 且 backend=s3 时必须配置 cache.bucket")
		}
		if c.AccessKey == "" || c.SecretKey == "" {
			return fmt.Errorf("cache.enabled=true 且 backend=s3 时必须配置 cache.access_key / cache.secret_key")
		}
		if _, ok := s3VendorPresets[c.Provider]; !ok && c.Provider != "" {
			return fmt.Errorf("cache.provider 非法: %q（应为 minio/ceph/aliyun/tencent/huawei/custom）", c.Provider)
		}
	default:
		return fmt.Errorf("cache.backend 非法: %q（应为 disk 或 s3）", c.Backend)
	}
	if c.ManifestTTL < 0 || c.BlobTTL < 0 || c.TagsTTL < 0 {
		return fmt.Errorf("cache TTL 不能为负数")
	}
	return nil
}

// validateAccessControl checks the IP allow/deny configuration. Invalid IPs or
// CIDRs are rejected here so a bad rule can never fail silently (unlike the old
// iptables batch apply, where one bad entry broke the whole batch).
func validateAccessControl(ac *AccessControl) error {
	switch ac.Mode {
	case "", ACLModeOff, ACLModeWhitelist, ACLModeBlacklist:
	default:
		return fmt.Errorf("access_control.mode 非法: %q (应为 off / whitelist / blacklist)", ac.Mode)
	}
	if ac.Mode == ACLModeWhitelist && len(ac.Whitelist) == 0 {
		return fmt.Errorf("白名单模式至少需要配置一个 IP/CIDR")
	}
	for _, e := range ac.Whitelist {
		if err := checkIPRule(e); err != nil {
			return err
		}
	}
	for _, e := range ac.Blacklist {
		if err := checkIPRule(e); err != nil {
			return err
		}
	}
	return nil
}

// checkIPRule validates a single allow/deny entry: a plain IP or a CIDR, with
// an optional inline "# comment".
func checkIPRule(raw string) error {
	e := strings.TrimSpace(raw)
	if e == "" {
		return fmt.Errorf("存在空的 IP 规则")
	}
	if i := strings.IndexByte(e, '#'); i >= 0 {
		e = strings.TrimSpace(e[:i])
	}
	if e == "" {
		return nil
	}
	if _, _, err := net.ParseCIDR(e); err == nil {
		return nil
	}
	if net.ParseIP(e) != nil {
		return nil
	}
	return fmt.Errorf("非法的 IP/CIDR: %q", raw)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

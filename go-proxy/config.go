package main

import (
	"fmt"
	"log"
	"os"

	"gopkg.in/yaml.v3"
)

// AuthType describes how the proxy authenticates to the upstream registry.
type AuthType string

const (
	// AuthToken fetches a bearer token via the upstream WWW-Authenticate challenge.
	// This is what most public registries (Docker Hub, GHCR, Quay, ...) use.
	AuthToken AuthType = "token"
	// AuthAnonymous sends no credentials at all.
	AuthAnonymous AuthType = "anonymous"
	// AuthBasic uses HTTP Basic auth (rare, kept for completeness).
	AuthBasic AuthType = "basic"
)

// AuthConfig holds upstream credentials (used to obtain a token or for basic auth).
type AuthConfig struct {
	Type     AuthType `yaml:"type" json:"type"`
	Username string   `yaml:"username" json:"username"`
	Password string   `yaml:"password" json:"password"`
}

// RegistryConfig describes a single upstream registry and how to route to it.
type RegistryConfig struct {
	Name               string     `yaml:"name" json:"name"`                     // unique identifier
	Hosts              []string   `yaml:"hosts" json:"hosts"`                   // Host headers (or X-Forwarded-Host) that map to this upstream
	Upstream           string     `yaml:"upstream" json:"upstream"`             // upstream base URL, e.g. https://registry-1.docker.io
	Auth               AuthConfig `yaml:"auth" json:"auth"`                     // how to authenticate to the upstream
	InsecureSkipVerify bool       `yaml:"insecure_skip_verify" json:"insecure_skip_verify"` // skip TLS verification (not recommended)
	TokenCacheTTL      int        `yaml:"token_cache_ttl" json:"token_cache_ttl"`           // seconds; 0 -> default 1h
	// Enabled toggles routing for this registry. nil (unset) is treated as enabled,
	// so hand-written configs without this field keep working.
	Enabled *bool `yaml:"enabled" json:"enabled"`
}

// ServerConfig holds HTTP server tunables.
type ServerConfig struct {
	Listen       string `yaml:"listen" json:"listen"`               // registry proxy listen address, default :5000
	ReadTimeout  int    `yaml:"read_timeout" json:"read_timeout"`   // seconds; 0 -> 60
	WriteTimeout int    `yaml:"write_timeout" json:"write_timeout"` // seconds; 0 -> unlimited (needed for streaming large blobs)
	IdleTimeout  int    `yaml:"idle_timeout" json:"idle_timeout"`   // seconds; 0 -> 120
	AdminListen  string `yaml:"admin_listen" json:"admin_listen"`   // management API address, default :5001 (NOT publicly exposed)

	// StatsIdleTimeout is the duration after which an unused per-client traffic
	// record (lastSeen older than the cutoff) is evicted by the stats janitor.
	// 0 disables janitor cleanup and retains records indefinitely (NOT recommended:
	// unbounded growth from scanning clients). Seconds; 0 -> 3600 (1h).
	StatsIdleTimeout int `yaml:"stats_idle_timeout" json:"stats_idle_timeout"`
	// StatsJanitorInterval is how often the janitor sweeps stale records.
	// Seconds; 0 -> 300 (5min). Should be << StatsIdleTimeout.
	StatsJanitorInterval int `yaml:"stats_janitor_interval" json:"stats_janitor_interval"`
}

// AccessControlMode enumerates the IP filtering modes.
type AccessControlMode string

const (
	// ACLModeOff disables IP filtering (default).
	ACLModeOff AccessControlMode = "off"
	// ACLModeWhitelist allows only listed CIDRs/IPs, denies everything else.
	ACLModeWhitelist AccessControlMode = "whitelist"
	// ACLModeBlacklist denies listed CIDRs/IPs, allows everything else.
	ACLModeBlacklist AccessControlMode = "blacklist"
)

// CacheConfig controls the pull-through blob/manifest cache. Cached objects are
// content-addressed (by digest) so blobs are stored once and served directly on
// subsequent pulls without hitting the upstream.
//
// Backend "disk" stores objects on a local volume (needs a mounted volume).
// Backend "s3" stores objects in any S3-compatible service — MinIO / Ceph and
// the domestic clouds' S3 layers (阿里云 OSS / 腾讯云 COS / 华为云 OBS) — via a
// single minio-go client (see s3cache.go).
type CacheConfig struct {
	Enabled     bool   `yaml:"enabled" json:"enabled"`               // master switch; default false (backward compatible)
	Backend     string `yaml:"backend" json:"backend"`               // "disk" | "s3"
	Dir         string `yaml:"dir" json:"dir"`                       // disk cache root (backend=disk)
	MaxSizeGB   int    `yaml:"max_size_gb" json:"max_size_gb"`       // disk quota; 0 = unlimited (backend=disk)
	BlobTTL     int    `yaml:"blob_ttl" json:"blob_ttl"`             // seconds; 0 = permanent (immutable)
	ManifestTTL int    `yaml:"manifest_ttl" json:"manifest_ttl"`     // tag-addressed manifest TTL; 0 -> default 1h
	TagsTTL     int    `yaml:"tags_ttl" json:"tags_ttl"`             // tags/list TTL; 0 -> default 5m

	// --- S3 兼容后端配置（backend=s3 时生效）---
	// Provider selects a vendor preset that pre-fills path-style / secure /
	// region hints: minio | ceph | aliyun | tencent | huawei | custom.
	Provider  string `yaml:"provider" json:"provider"`
	Endpoint  string `yaml:"endpoint" json:"endpoint"`   // S3 服务域名，如 oss-cn-hangzhou.aliyuncs.com
	Region    string `yaml:"region" json:"region"`       // 区域，如 cn-hangzhou
	Bucket    string `yaml:"bucket" json:"bucket"`       // 桶名
	AccessKey string `yaml:"access_key" json:"access_key"` // AK
	SecretKey string `yaml:"secret_key" json:"secret_key"` // SK（GET 返回时脱敏为 ********）
	PathStyle bool   `yaml:"path_style" json:"path_style"` // 路径风格寻址（MinIO/Ceph 自托管默认开启；云厂商虚拟主机风格关闭）
}

// AccessControl configures per-request IP allow/deny at the proxy layer.
// It only affects the PUBLIC registry proxy (Proxy.ServeHTTP); the management
// API port (:5001) is deliberately NOT gated so the list can always be edited
// from the admin UI. Each entry may be a single IPv4/IPv6 address or a CIDR
// network (e.g. "192.168.1.0/24", "2001:db8::/32"). Inline "# comment" is allowed.
type AccessControl struct {
	Mode      AccessControlMode `yaml:"mode" json:"mode"`             // off | whitelist | blacklist
	Whitelist []string          `yaml:"whitelist" json:"whitelist"`  // allowed CIDRs/IPs (used in whitelist mode)
	Blacklist []string          `yaml:"blacklist" json:"blacklist"`  // denied CIDRs/IPs (used in blacklist mode)
}

// Config is the top-level configuration.
type Config struct {
	Server        ServerConfig      `yaml:"server" json:"server"`
	Default       string            `yaml:"default" json:"default"`               // registry name used when Host does not match
	LogLevel      string            `yaml:"log_level" json:"log_level"`           // quiet | normal (default) | debug
	AccessControl AccessControl     `yaml:"access_control" json:"access_control"` // IP 黑白名单（代理层）
	Cache         CacheConfig       `yaml:"cache" json:"cache"`                   // pull-through cache
	Registries    []RegistryConfig  `yaml:"registries" json:"registries"`
}

// normalizeConfig fills in defaults that are not expressible via zero values
// (e.g. Enabled being nil means "enabled").
func normalizeConfig(cfg *Config) {
	if cfg.Server.Listen == "" {
		cfg.Server.Listen = ":5000"
	}
	if cfg.Server.AdminListen == "" {
		cfg.Server.AdminListen = ":5001"
	}
	for i := range cfg.Registries {
		r := &cfg.Registries[i]
		if r.Auth.Type == "" {
			r.Auth.Type = AuthToken
		}
		if r.TokenCacheTTL == 0 {
			r.TokenCacheTTL = 3600
		}
		if r.Enabled == nil {
			t := true
			r.Enabled = &t
		}
	}
	// Normalize the access-control mode so an empty string behaves as "off".
	switch cfg.AccessControl.Mode {
	case "", ACLModeOff, ACLModeWhitelist, ACLModeBlacklist:
	default:
		log.Printf("[WARN] access_control.mode %q 非法，已重置为 off", cfg.AccessControl.Mode)
		cfg.AccessControl.Mode = ACLModeOff
	}
	if cfg.AccessControl.Mode == "" {
		cfg.AccessControl.Mode = ACLModeOff
	}

	// Normalize cache defaults.
	switch cfg.Cache.Backend {
	case "", "disk":
		cfg.Cache.Backend = "disk"
	case "s3":
		// s3 后端无需本地目录；若未指定 provider 默认 custom。
		if cfg.Cache.Provider == "" {
			cfg.Cache.Provider = "custom"
		}
	default:
		log.Printf("[WARN] cache.backend %q 非法，已重置为 disk", cfg.Cache.Backend)
		cfg.Cache.Backend = "disk"
	}
	if cfg.Cache.Dir == "" {
		cfg.Cache.Dir = "/app/cache"
	}
	if cfg.Cache.ManifestTTL == 0 {
		cfg.Cache.ManifestTTL = 3600
	}
	if cfg.Cache.TagsTTL == 0 {
		cfg.Cache.TagsTTL = 300
	}
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	normalizeConfig(&cfg)
	return &cfg, nil
}

// saveConfig serializes cfg to YAML and writes it atomically to path.
func saveConfig(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write temp config: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

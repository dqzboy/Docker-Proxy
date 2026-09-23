package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"sort"
	"strings"
	"sync"
	"time"
)

// Path patterns for the Docker Registry HTTP API V2.
var (
	manifestRe  = regexp.MustCompile(`^/v2/(.+)/manifests/([^/]+)$`)
	blobRe      = regexp.MustCompile(`^/v2/(.+)/blobs/([^/]+)$`)
	tagsRe      = regexp.MustCompile(`^/v2/(.+)/tags/list$`)
	referrersRe = regexp.MustCompile(`^/v2/(.+)/referrers/([^/]+)$`)
)

type tokenEntry struct {
	token     string
	expiresAt time.Time
}

// Proxy is the registry reverse proxy. It forwards Registry API V2 requests to
// the configured upstream, performing server-side bearer-token authentication so
// that clients behind restrictive networks never talk to the upstream auth server
// directly. Blobs and manifests are streamed back without being stored locally.
type Proxy struct {
	cfg        *Config
	hostIndex  map[string]*RegistryConfig
	defaultReg *RegistryConfig
	routeMux   sync.RWMutex

	clients   map[string]*http.Client
	clientMux sync.Mutex

	tokenCache map[string]tokenEntry
	cacheMux   sync.Mutex

	// Per-client traffic accounting (in-memory; reset on restart or via /-/stats?reset=1).
	statsMux    sync.Mutex
	clientStats map[string]*clientStat

	// statsJanitorCancel terminates the background sweeper goroutine that
	// evicts clientStat entries idle longer than statsIdleTimeout. Without this
	// the map would grow unbounded under scanner traffic (each new source IP
	// adds an entry that is never reclaimed). On reload, the previous janitor
	// is cancelled before a new one is started.
	statsJanitorCancel context.CancelFunc
	statsIdleTimeout   time.Duration
	statsSweepInterval time.Duration

	// acl is the compiled IP allow/deny rules. Rebuilt on every reload.
	// Guarded by routeMux; a single pointer swap is safe to read without the
	// lock, exactly like cfg itself.
	acl *aclMatcher

	// cache is the pull-through blob/manifest store (diskCache or s3Cache).
	// nil when disabled. The proxy depends only on the blobStore interface.
	cache     blobStore
	cacheSig  string
	cacheGroup *singleflight
	cacheStats *cacheStats
}

// cacheStats tracks cache effectiveness so the admin UI can show hit rate and
// upstream bandwidth saved. Guarded by mu.
type cacheStats struct {
	mu          sync.Mutex
	Hits        int64
	Misses      int64
	BytesServed int64
}

// clientStat holds cumulative traffic for a single client IP.
type clientStat struct {
	BytesTotal int64            `json:"bytesTotal"`
	Requests   int64            `json:"requests"`
	LastSeen   time.Time        `json:"lastSeen"`
	ByReg      map[string]int64 `json:"byRegistry"`
}

// statEntry is the JSON shape returned by the /-/stats endpoint.
type statEntry struct {
	IP         string            `json:"ip"`
	BytesTotal int64             `json:"bytesTotal"`
	Requests   int64             `json:"requests"`
	LastSeen   time.Time         `json:"lastSeen"`
	ByRegistry map[string]int64  `json:"byRegistry"`
}

// buildRoutes computes the Host->registry index and the default registry from cfg.
// Registries whose Enabled is explicitly false are skipped.
func buildRoutes(cfg *Config) (map[string]*RegistryConfig, *RegistryConfig) {
	idx := make(map[string]*RegistryConfig)
	var def *RegistryConfig
	for i := range cfg.Registries {
		r := &cfg.Registries[i]
		if r.Enabled != nil && !*r.Enabled {
			continue // disabled via UI
		}
		for _, h := range r.Hosts {
			idx[strings.ToLower(h)] = r
		}
		if r.Name == cfg.Default {
			def = r
		}
	}
	if def == nil && len(cfg.Registries) > 0 {
		def = &cfg.Registries[0]
	}
	return idx, def
}

func NewProxy(cfg *Config) *Proxy {
	p := &Proxy{
		cfg:        cfg,
		hostIndex:  make(map[string]*RegistryConfig),
		clients:    make(map[string]*http.Client),
		tokenCache: make(map[string]tokenEntry),
		clientStats: make(map[string]*clientStat),
	}
	idx, def := buildRoutes(cfg)
	p.hostIndex = idx
	p.defaultReg = def
	p.acl = buildACL(&cfg.AccessControl)
	p.applyStatsConfig(cfg)
	p.startStatsJanitor()
	p.cacheGroup = &singleflight{}
	p.cacheStats = &cacheStats{}
	p.initCache(cfg)
	return p
}

// applyStatsConfig reads stats timeouts from cfg and stores the resolved
// durations. Validation: idle timeout must be > sweep interval; if not, the
// janitor cannot make meaningful progress and we fall back to safe defaults.
func (p *Proxy) applyStatsConfig(cfg *Config) {
	idleSec := cfg.Server.StatsIdleTimeout
	if idleSec <= 0 {
		idleSec = 3600 // 1h default
	}
	sweepSec := cfg.Server.StatsJanitorInterval
	if sweepSec <= 0 {
		sweepSec = 300 // 5min default
	}
	idle := time.Duration(idleSec) * time.Second
	sweep := time.Duration(sweepSec) * time.Second
	if sweep >= idle {
		// Janitor interval must be strictly smaller than idle timeout, otherwise
		// every sweep sees everything as stale on the first iteration and churns.
		// Floor to idle/4 to keep a healthy ratio while preserving the user's intent.
		sweep = idle / 4
		if sweep < 30*time.Second {
			sweep = 30 * time.Second
		}
		log.Printf("[WARN] stats janitor interval (%s) >= idle timeout (%s), clamped sweep to %s", sweep, idle, sweep)
	}
	p.statsIdleTimeout = idle
	p.statsSweepInterval = sweep
}

// startStatsJanitor spawns the background sweeper goroutine. Cancelling the
// returned context stops it. safe to call multiple times: the previous janitor
// is cancelled first.
func (p *Proxy) startStatsJanitor() {
	p.statsMux.Lock()
	if p.statsJanitorCancel != nil {
		p.statsJanitorCancel()
		p.statsJanitorCancel = nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	p.statsJanitorCancel = cancel
	p.statsMux.Unlock()

	go func() {
		// Use a ticker rather than a sleep loop so back-to-back reloads do not
		// pile up overlapping sweeps; the cancel() call above is what actually
		// returns from select{}.
		ticker := time.NewTicker(p.statsSweepInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				p.cleanupIdleStats()
			}
		}
	}()
}

// cleanupIdleStats drops per-client traffic records idle longer than the
// configured timeout. The walk + delete is O(n) over the stats map; with a
// 5-minute sweep cadence and an idle cutoff of 1h this is well within budget
// (the map only ever contains entries from the last hour).
func (p *Proxy) cleanupIdleStats() {
	cutoff := time.Now().Add(-p.statsIdleTimeout)
	p.statsMux.Lock()
	defer p.statsMux.Unlock()
	removed := 0
	for ip, st := range p.clientStats {
		if st.LastSeen.Before(cutoff) {
			delete(p.clientStats, ip)
			removed++
		}
	}
	if removed > 0 {
		log.Printf("[stats] swept %d idle client records (cutoff=%s)", removed, cutoff.Format(time.RFC3339))
	}
}

// stopStatsJanitor cancels the background sweeper, primarily for tests.
func (p *Proxy) stopStatsJanitor() {
	p.statsMux.Lock()
	defer p.statsMux.Unlock()
	if p.statsJanitorCancel != nil {
		p.statsJanitorCancel()
		p.statsJanitorCancel = nil
	}
}

// reload swaps in a new configuration without dropping in-flight requests.
// It makes a heap copy of cfg first so we never retain the caller's (possibly
// stack-allocated) memory — storing a pointer to a local variable would become
// dangling once the caller returns and its stack frame is reused.
func (p *Proxy) reload(cfg *Config) {
	cp := new(Config)
	*cp = *cfg
	regs := make([]RegistryConfig, len(cfg.Registries))
	for i := range cfg.Registries {
		regs[i] = cfg.Registries[i] // string fields are heap-allocated and safe to share
	}
	cp.Registries = regs

	idx, def := buildRoutes(cp)
	p.routeMux.Lock()
	p.hostIndex = idx
	p.defaultReg = def
	p.cfg = cp
	p.acl = buildACL(&cp.AccessControl)
	p.routeMux.Unlock()
	// Drop cached upstream tokens; they may no longer be valid for the new routes.
	p.cacheMux.Lock()
	p.tokenCache = make(map[string]tokenEntry)
	p.cacheMux.Unlock()
	// Rebuild the cache only when its signature (enabled/backend/dir) changed;
	// otherwise just refresh the in-place quota.
		newSig := cacheSig(cp)
	if newSig != p.cacheSig {
		// initCache owns tearing down the previous cache, so we never stop it
		// here — doing both used to double-close the same cancel channel and
		// panic ("close of closed channel").
		p.initCache(cp)
	} else if p.cache != nil {
		p.cache.setMaxBytes(int64(cp.Cache.MaxSizeGB) * 1024 * 1024 * 1024)
	}
	// Re-apply stats idle/interval in case the operator tuned them in the new
	// config, then restart the janitor to pick up the new sweep cadence.
	p.applyStatsConfig(cp)
	p.startStatsJanitor()
}

// cacheSig is a stable identifier for the cache configuration that requires a
// full rebuild (backend / directory / S3 connection change), so reload can avoid
// re-walking the store on unrelated config edits. Secrets are deliberately NOT
// included — only the connection identity (endpoint/bucket/region/provider/AK).
func cacheSig(cfg *Config) string {
	c := cfg.Cache
	if c.Backend == "disk" {
		return fmt.Sprintf("disk|%t|%s", c.Enabled, c.Dir)
	}
	// s3: any connection change must rebuild the client.
	return fmt.Sprintf("s3|%t|%s|%s|%s|%s|%s", c.Enabled, c.Provider, c.Endpoint, c.Bucket, c.Region, c.AccessKey)
}

// initCache (re)builds the active cache from cfg. It stops and drops any
// previously running cache first, so the caller never has to — and the previous
// cache object is stopped exactly once (its janitor goroutine exits cleanly).
// Tearing down here, rather than in reload, removes the double-stop that used to
// panic with "close of closed channel".
func (p *Proxy) initCache(cfg *Config) {
	if p.cache != nil {
		p.cache.stop()
		p.cache = nil
	}
	if !cfg.Cache.Enabled {
		p.cacheSig = cacheSig(cfg)
		return
	}
	switch cfg.Cache.Backend {
	case "s3":
		c, err := newS3Cache(&cfg.Cache)
		if err != nil {
			log.Printf("[cache] S3 缓存初始化失败，已禁用缓存: %v", err)
			p.cacheSig = cacheSig(cfg)
			return
		}
		p.cache = c
	default: // disk
		p.cache = newDiskCache(cfg.Cache.Dir, cfg.Cache.MaxSizeGB)
	}
	p.cacheSig = cacheSig(cfg)
}

// activeCache returns the live cache together with whether caching is on. It is
// read under the route lock to avoid a race with reload swapping the pointer.
func (p *Proxy) activeCache() (blobStore, bool) {
	p.routeMux.RLock()
	defer p.routeMux.RUnlock()
	return p.cache, p.cfg.Cache.Enabled && p.cache != nil
}

func (p *Proxy) manifestTTL() time.Duration {
	p.routeMux.RLock()
	defer p.routeMux.RUnlock()
	return time.Duration(p.cfg.Cache.ManifestTTL) * time.Second
}

func (p *Proxy) recordCacheHit(size int64) {
	p.cacheStats.mu.Lock()
	p.cacheStats.Hits++
	p.cacheStats.BytesServed += size
	p.cacheStats.mu.Unlock()
}

func (p *Proxy) recordCacheMiss() {
	p.cacheStats.mu.Lock()
	p.cacheStats.Misses++
	p.cacheStats.mu.Unlock()
}

// snapshotCacheStats returns cache effectiveness counters for the admin API.
func (p *Proxy) snapshotCacheStats() map[string]interface{} {
	p.cacheStats.mu.Lock()
	defer p.cacheStats.mu.Unlock()
	count, bytes := int64(0), int64(0)
	if p.cache != nil {
		count, bytes = p.cache.Stat()
	}
	var rate float64
	total := p.cacheStats.Hits + p.cacheStats.Misses
	if total > 0 {
		rate = float64(p.cacheStats.Hits) / float64(total) * 100
	}
	return map[string]interface{}{
		"hits":        p.cacheStats.Hits,
		"misses":      p.cacheStats.Misses,
		"hitRate":     rate,
		"bytesServed": p.cacheStats.BytesServed,
		"entries":     count,
		"sizeBytes":   bytes,
		"enabled":     p.cache != nil,
	}
}

// resolveRegistry picks an upstream based on the request Host (or X-Forwarded-Host
// when running behind a reverse proxy such as nginx/Caddy).
func (p *Proxy) resolveRegistry(r *http.Request) *RegistryConfig {
	host := strings.ToLower(hostOnly(r.Host))
	p.routeMux.RLock()
	if reg, ok := p.hostIndex[host]; ok {
		p.routeMux.RUnlock()
		return reg
	}
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		fh := strings.ToLower(hostOnly(fwd))
		if reg, ok := p.hostIndex[fh]; ok {
			p.routeMux.RUnlock()
			return reg
		}
	}
	def := p.defaultReg
	p.routeMux.RUnlock()
	return def
}

// hostOnly strips the port from an HTTP Host header value, with full support for
// IPv6 literals. The naive `strings.SplitN(h, ":", 2)[0]` previously used in
// resolveRegistry silently corrupted bracketed IPv6 literals:
//
//	"[2001:db8::1]:5000" -> "[2001"   (BUG: missing the inner host)
//	"::1"               -> ""         (BUG: SplitN gives an empty head)
//
// RFC 3986 requires bracketed form for IPv6 literals in URIs/Host headers, but
// the previous code never enforced that, and naked `::1` is still common in
// X-Forwarded-Host from upstream proxies that failed to normalize. We handle:
//   - "[ipv6]:port"   -> "ipv6"
//   - "[ipv6]"        -> "ipv6"
//   - "host:port"     -> "host"
//   - "host"          -> "host"
//   - "::1"           -> "::1" (fallback; rare but possible)
func hostOnly(h string) string {
	if h == "" {
		return ""
	}
	// net.SplitHostPort correctly handles both "host:port" and "[ipv6]:port"
	// and rejects everything else with an "address" error we treat as "no port".
	if host, _, err := net.SplitHostPort(h); err == nil {
		return host
	}
	// bracketed IPv6 literal without port, e.g. "[::1]".
	if strings.HasPrefix(h, "[") && strings.HasSuffix(h, "]") && len(h) >= 2 {
		return h[1 : len(h)-1]
	}
	// Already a bare hostname or naked IPv6 literal; return as-is.
	return h
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ip := p.clientIP(r)

	// IP 访问控制：在路由与代理之前拦截。仅作用于对外注册表代理端口；
	// 管理端口（:5001）不受此限制，保证后台永远能进来修改名单。
	if p.acl != nil && !p.acl.allows(ip) {
		http.Error(w, "access denied", http.StatusForbidden)
		log.Printf("[ACL] denied %s (mode=%s) %s", ip, p.acl.mode, r.URL.Path)
		return
	}

	reg := p.resolveRegistry(r)
	if reg == nil {
		http.Error(w, "no upstream registry configured", http.StatusBadGateway)
		return
	}

	// API version check. We answer 200 directly so the docker client proceeds;
	// actual pulls go through server-side token authentication below.
	if r.URL.Path == "/v2/" || r.URL.Path == "/v2" {
		w.Header().Set("Docker-Distribution-Api-Version", "registry/2.0")
		w.WriteHeader(http.StatusOK)
		return
	}

	// We only proxy read operations. Push operations are not supported by a
	// pull-through proxy and would fail upstream anyway.
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	start := time.Now()
	bytes := p.proxyRequest(w, r, reg)
	p.recordTransfer(ip, reg.Name, bytes)
	p.maybeLog(r, reg, start)
}

// logLevel returns the configured log verbosity: "quiet", "normal" (default), or "debug".
func (p *Proxy) logLevel() string {
	p.routeMux.RLock()
	lv := p.cfg.LogLevel
	p.routeMux.RUnlock()
	switch lv {
	case "quiet", "debug", "normal":
		return lv
	default:
		return "normal"
	}
}

// maybeLog emits a per-request access line, throttled by the configured log level.
//   - quiet:  nothing (errors are still logged at their source)
//   - normal: skip high-volume blob transfers, keep manifests/tags/referrers
//   - debug:  log every request (original behaviour)
func (p *Proxy) maybeLog(r *http.Request, reg *RegistryConfig, start time.Time) {
	switch p.logLevel() {
	case "quiet":
		return
	case "normal":
		// Blobs make up the bulk of transfer log noise; drop them by default.
		if blobRe.MatchString(r.URL.Path) {
			return
		}
	}
	log.Printf("%s %s -> %s (%s)", r.Method, r.URL.Path, reg.Name, time.Since(start))
}

// clientIP extracts the real client address. When the proxy runs behind a
// reverse proxy (nginx/Caddy) that sets X-Forwarded-For, the first hop in the
// comma-separated chain is the original client; otherwise we fall back to the
// socket peer address (port stripped).
func (p *Proxy) clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if idx := strings.IndexByte(fwd, ','); idx >= 0 {
			return strings.TrimSpace(fwd[:idx])
		}
		return strings.TrimSpace(fwd)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// recordTransfer adds bytes served to a client's running tally.
func (p *Proxy) recordTransfer(ip, reg string, bytes int64) {
	if ip == "" || bytes <= 0 {
		return
	}
	p.statsMux.Lock()
	st, ok := p.clientStats[ip]
	if !ok {
		st = &clientStat{ByReg: make(map[string]int64)}
		p.clientStats[ip] = st
	}
	st.BytesTotal += bytes
	st.Requests++
	st.LastSeen = time.Now()
	if reg != "" {
		st.ByReg[reg] += bytes
	}
	p.statsMux.Unlock()
}

// snapshotStats returns per-client tallies sorted by total bytes (descending).
func (p *Proxy) snapshotStats() []statEntry {
	p.statsMux.Lock()
	defer p.statsMux.Unlock()
	out := make([]statEntry, 0, len(p.clientStats))
	for ip, st := range p.clientStats {
		out = append(out, statEntry{
			IP:         ip,
			BytesTotal: st.BytesTotal,
			Requests:   st.Requests,
			LastSeen:   st.LastSeen,
			ByRegistry: st.ByReg,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].BytesTotal > out[j].BytesTotal })
	return out
}

// resetStats clears all per-client tallies.
func (p *Proxy) resetStats() {
	p.statsMux.Lock()
	p.clientStats = make(map[string]*clientStat)
	p.statsMux.Unlock()
}

func (p *Proxy) proxyRequest(w http.ResponseWriter, r *http.Request, reg *RegistryConfig) (written int64) {
	client := p.getClient(reg)

	target, err := url.Parse(reg.Upstream)
	if err != nil {
		log.Printf("[ERR] bad upstream url %q: %v", reg.Upstream, err)
		http.Error(w, "bad upstream url", http.StatusBadGateway)
		return
	}
	target.Path = singleJoiningSlash(target.Path, r.URL.Path)
	target.RawQuery = r.URL.RawQuery

	repo := extractRepo(r.URL.Path)
	cacheKey, kind, isDigest, _, cacheable := p.classifyCache(r.URL.Path, reg.Name, repo)

	if cacheable {
		if c, ok := p.activeCache(); ok {
			if obj, hit := c.Open(cacheKey, p.manifestTTL()); hit {
				p.recordCacheHit(obj.Size)
				return p.serveFromCache(w, r, obj)
			}
			p.recordCacheMiss()

			var leaderWritten int64
			_, ferr, shared := p.cacheGroup.Do(cacheKey, func() (interface{}, error) {
				n, e := p.fetchAndStore(w, r, client, reg, target, c, cacheKey, kind, isDigest)
				leaderWritten = n
				return nil, e
			})
			if !shared {
				if ferr == nil || leaderWritten > 0 {
					return leaderWritten
				}
			} else if ferr == nil {
				if obj, hit := c.Open(cacheKey, p.manifestTTL()); hit {
					return p.serveFromCache(w, r, obj)
				}
			}
		}
	}

	resp, err := p.getUpstreamResponse(client, r, reg, target.String())
	if err != nil {
		log.Printf("[ERR] upstream %s: %v", reg.Name, err)
		http.Error(w, "upstream error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	return p.streamResponse(w, r, resp)
}

// classifyCache maps a Registry V2 path to a cache key + kind. Blob and
// digest-addressed manifest objects are immutable (isDigest=true); tag-addressed
// manifests carry a TTL and need revalidation (handled in fetchAndStore).
func (p *Proxy) classifyCache(path, registry, repo string) (key, kind string, isDigest bool, digest string, cacheable bool) {
	if repo == "" {
		return "", "", false, "", false
	}
	if m := blobRe.FindStringSubmatch(path); m != nil {
		d := m[2]
		return "b/" + registry + "/" + repo + "/" + d, "blob", true, d, true
	}
	if m := manifestRe.FindStringSubmatch(path); m != nil {
		ref := m[2]
		if strings.Contains(ref, ":") {
			return "m/" + registry + "/" + repo + "/" + ref, "manifest", true, ref, true
		}
		return "t/" + registry + "/" + repo + "/" + ref, "manifest", false, "", true
	}
	return "", "", false, "", false
}

// getUpstreamResponse issues the request and transparently handles the upstream
// bearer-token 401 challenge, mirroring the previous inline logic.
func (p *Proxy) getUpstreamResponse(client *http.Client, r *http.Request, reg *RegistryConfig, target string) (*http.Response, error) {
	resp, err := p.doUpstream(client, r, target, "")
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized && reg.Auth.Type != AuthAnonymous {
		challenge := resp.Header.Get("WWW-Authenticate")
		realm, service, challengedScope := parseBearerChallenge(challenge)
		if realm != "" {
			// A registry alias (e.g. lscr.io) may redirect to another host
			// (ghcr.io). Retry the URL that actually issued the challenge:
			// Go intentionally drops Authorization on cross-host redirects.
			retryURL := resp.Request.URL.String()
			resp.Body.Close()
			repo := extractRepo(r.URL.Path)
			scope := challengedScope
			if scope == "" && repo != "" {
				scope = "repository:" + repo + ":pull"
			}
			token, terr := p.getToken(client, realm, service, scope, reg)
			if terr != nil {
				return nil, terr
			}
			if token != "" {
				return p.doUpstream(client, r, retryURL, token)
			}
			return nil, fmt.Errorf("empty token from %s", realm)
		}
	}
	return resp, nil
}

// streamResponse proxies an upstream response to the client with the standard
// header adjustments. Used for non-cached responses and cache misses that fall
// back to plain proxying.
func (p *Proxy) streamResponse(w http.ResponseWriter, r *http.Request, resp *http.Response) (written int64) {
	copyHeaders(w.Header(), resp.Header)
	w.Header().Del("WWW-Authenticate")
	w.Header().Set("Docker-Distribution-Api-Version", "registry/2.0")
	w.WriteHeader(resp.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	buf := make([]byte, 32*1024)
	flusher, _ := w.(http.Flusher)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return
			}
			written += int64(n)
			if flusher != nil {
				flusher.Flush()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return
		}
	}
	return
}

// serveFromCache replays a cached object's stored headers and streams its bytes
// to the client, bypassing the upstream entirely.
func (p *Proxy) serveFromCache(w http.ResponseWriter, r *http.Request, obj *cacheObject) (written int64) {
	for k, vv := range obj.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.Header().Del("WWW-Authenticate")
	w.Header().Del("Transfer-Encoding")
	w.Header().Set("Docker-Distribution-Api-Version", "registry/2.0")
	w.Header().Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		obj.Reader.Close()
		return 0
	}
	buf := make([]byte, 32*1024)
	flusher, _ := w.(http.Flusher)
	for {
		n, rerr := obj.Reader.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				obj.Reader.Close()
				return written
			}
			written += int64(n)
			if flusher != nil {
				flusher.Flush()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			break
		}
	}
	obj.Reader.Close()
	return written
}

// fetchAndStore is the singleflight leader path: it fetches from upstream and, on
// a 200, streams the body to the client while writing it through to the cache.
// Non-200 responses are proxied without caching. The returned byte count is what
// was sent to the client (used by the leader's own request).
func (p *Proxy) fetchAndStore(w http.ResponseWriter, r *http.Request, client *http.Client, reg *RegistryConfig, target *url.URL, c blobStore, key, kind string, isDigest bool) (int64, error) {
	resp, err := p.getUpstreamResponse(client, r, reg, target.String())
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return p.streamResponse(w, r, resp), nil
	}
	digest := ""
	if isDigest {
		_, _, _, digest, _ = p.classifyCache(r.URL.Path, reg.Name, extractRepo(r.URL.Path))
	} else {
		digest = resp.Header.Get("Docker-Content-Digest")
		if digest == "" {
			digest = resp.Header.Get("ETag")
		}
	}
	var ttl time.Duration
	if kind == "manifest" && !isDigest {
		ttl = p.manifestTTL()
	}
	wtr, werr := c.Writer(key, cleanCacheHeaders(resp.Header), digest, kind, ttl)
	if werr != nil {
		return p.streamResponse(w, r, resp), nil
	}
	copyHeaders(w.Header(), resp.Header)
	w.Header().Del("WWW-Authenticate")
	w.Header().Set("Docker-Distribution-Api-Version", "registry/2.0")
	w.WriteHeader(resp.StatusCode)
	if r.Method == http.MethodHead {
		wtr.Close()
		return 0, nil
	}
	buf := make([]byte, 32*1024)
	flusher, _ := w.(http.Flusher)
	tee := io.TeeReader(resp.Body, wtr)
	var written int64
	for {
		n, rerr := tee.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				wtr.Abort()
				return written, werr
			}
			written += int64(n)
			if flusher != nil {
				flusher.Flush()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			wtr.Abort()
			return written, rerr
		}
	}
	if cerr := wtr.Close(); cerr != nil {
		wtr.Abort()
		return written, cerr
	}
	return written, nil
}

// cleanCacheHeaders keeps the response headers worth replaying and drops the
// hop-by-hop / auth / transfer-encoding headers that must not be cached.
func cleanCacheHeaders(h http.Header) http.Header {
	clone := h.Clone()
	for _, k := range hopHeaders {
		clone.Del(k)
	}
	clone.Del("WWW-Authenticate")
	clone.Del("Transfer-Encoding")
	return clone
}

// doUpstream issues a request to the upstream. When token != "" it is sent as a
// Bearer Authorization header (used after the 401 challenge retry).
func (p *Proxy) doUpstream(client *http.Client, r *http.Request, targetURL, token string) (*http.Response, error) {
	req, err := http.NewRequest(r.Method, targetURL, nil)
	if err != nil {
		return nil, err
	}
	copyHeaders(req.Header, r.Header)
	// We manage authentication ourselves; never forward the client's credentials.
	req.Header.Del("Authorization")
	removeHopByHop(req.Header)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return client.Do(req)
}

func (p *Proxy) getClient(reg *RegistryConfig) *http.Client {
	p.clientMux.Lock()
	defer p.clientMux.Unlock()
	if c, ok := p.clients[reg.Name]; ok {
		return c
	}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
	}
	if reg.InsecureSkipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	c := &http.Client{Transport: transport}
	p.clients[reg.Name] = c
	return c
}

// getToken fetches (and caches) a bearer token from the upstream auth realm.
func (p *Proxy) getToken(client *http.Client, realm, service, scope string, reg *RegistryConfig) (string, error) {
	key := realm + "|" + service + "|" + scope

	p.cacheMux.Lock()
	if e, ok := p.tokenCache[key]; ok && time.Now().Before(e.expiresAt) {
		tok := e.token
		p.cacheMux.Unlock()
		return tok, nil
	}
	p.cacheMux.Unlock()

	u, err := url.Parse(realm)
	if err != nil {
		return "", err
	}
	q := u.Query()
	if service != "" {
		q.Set("service", service)
	}
	if scope != "" {
		q.Set("scope", scope)
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	if reg.Auth.Type == AuthBasic && (reg.Auth.Username != "" || reg.Auth.Password != "") {
		req.SetBasicAuth(reg.Auth.Username, reg.Auth.Password)
	} else if reg.Auth.Username != "" || reg.Auth.Password != "" {
		// Provide credentials to the token endpoint to lift rate limits (Docker Hub).
		req.SetBasicAuth(reg.Auth.Username, reg.Auth.Password)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tr struct {
		Token       string `json:"token"`
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", err
	}
	tok := tr.Token
	if tok == "" {
		tok = tr.AccessToken
	}
	if tok == "" {
		return "", fmt.Errorf("no token in response")
	}

	ttl := tr.ExpiresIn
	if ttl <= 0 {
		ttl = reg.TokenCacheTTL
	}
	if ttl <= 0 {
		ttl = 3600
	}
	expiresAt := time.Now().Add(time.Duration(ttl-30) * time.Second)
	p.cacheMux.Lock()
	p.tokenCache[key] = tokenEntry{token: tok, expiresAt: expiresAt}
	p.cacheMux.Unlock()
	return tok, nil
}

// extractRepo returns the repository name from a Registry V2 path, or "" if the
// path does not reference a repository (e.g. the /v2/ ping).
func extractRepo(path string) string {
	for _, re := range []*regexp.Regexp{manifestRe, blobRe, tagsRe, referrersRe} {
		if m := re.FindStringSubmatch(path); m != nil {
			return m[1]
		}
	}
	return ""
}

// parseBearerChallenge parses a WWW-Authenticate: Bearer realm="...",service="...",scope="..." header.
func parseBearerChallenge(header string) (realm, service, scope string) {
	header = strings.TrimSpace(header)
	if len(header) < 7 || !strings.EqualFold(header[:7], "bearer ") {
		return
	}
	rest := header[7:]
	var key, val strings.Builder
	inQuote := false
	expectVal := false
	commit := func() {
		k := strings.TrimSpace(key.String())
		v := strings.TrimSpace(val.String())
		switch strings.ToLower(k) {
		case "realm":
			realm = v
		case "service":
			service = v
		case "scope":
			scope = v
		}
		key.Reset()
		val.Reset()
		expectVal = false
	}
	for i := 0; i < len(rest); i++ {
		c := rest[i]
		if inQuote {
			if c == '"' {
				inQuote = false
			} else {
				val.WriteByte(c)
			}
			continue
		}
		switch c {
		case '"':
			inQuote = true
		case '=':
			expectVal = true
		case ',':
			if expectVal {
				commit()
			} else {
				key.WriteByte(c)
			}
		default:
			if expectVal {
				val.WriteByte(c)
			} else {
				key.WriteByte(c)
			}
		}
	}
	if expectVal {
		commit()
	}
	return
}

var hopHeaders = []string{
	"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate",
	"Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade",
}

func removeHopByHop(h http.Header) {
	for _, k := range hopHeaders {
		h.Del(k)
	}
	if c := h.Get("Connection"); c != "" {
		for _, f := range strings.Split(c, ",") {
			h.Del(strings.TrimSpace(f))
		}
	}
}

func copyHeaders(dst, src http.Header) {
	for k, vals := range src {
		for _, v := range vals {
			dst.Add(k, v)
		}
	}
}

func singleJoiningSlash(a, b string) string {
	aslash := strings.HasSuffix(a, "/")
	bslash := strings.HasPrefix(b, "/")
	switch {
	case aslash && bslash:
		return a + b[1:]
	case !aslash && !bslash:
		return a + "/" + b
	}
	return a + b
}

// aclMatcher holds the compiled IP rules. Entry parsing supports single
// addresses and CIDR networks for both IPv4 and IPv6; invalid entries are
// dropped and reported via Invalid so the operator can fix them.
type aclMatcher struct {
	mode    AccessControlMode
	whitelist []*net.IPNet
	blacklist []*net.IPNet
	Invalid  []string
}

// buildACL compiles an AccessControl into a matcher. An unknown/empty mode
// yields a disabled matcher (fail-open) so a typo never locks the proxy down.
func buildACL(ac *AccessControl) *aclMatcher {
	if ac == nil {
		return &aclMatcher{mode: ACLModeOff}
	}
	switch ac.Mode {
	case ACLModeWhitelist, ACLModeBlacklist:
		// ok
	case ACLModeOff, "":
		return &aclMatcher{mode: ACLModeOff}
	default:
		log.Printf("[WARN] access_control.mode %q 非法，已禁用 IP 控制", ac.Mode)
		return &aclMatcher{mode: ACLModeOff}
	}
	w, wi := parseIPRules(ac.Whitelist)
	b, bi := parseIPRules(ac.Blacklist)
	return &aclMatcher{
		mode:      ac.Mode,
		whitelist: w,
		blacklist: b,
		Invalid:   append(append([]string{}, wi...), bi...),
	}
}

// parseIPRules converts a list of "ip", "cidr" or "ip # comment" strings into
// net.IPNet entries. Unparseable entries are returned in invalid.
func parseIPRules(entries []string) ([]*net.IPNet, []string) {
	var nets []*net.IPNet
	var invalid []string
	for _, raw := range entries {
		e := strings.TrimSpace(raw)
		if e == "" {
			continue
		}
		// Allow an inline comment after '#'.
		if i := strings.IndexByte(e, '#'); i >= 0 {
			e = strings.TrimSpace(e[:i])
			if e == "" {
				continue
			}
		}
		var n *net.IPNet
		if _, ipnet, err := net.ParseCIDR(e); err == nil {
			n = ipnet
		} else if ip := net.ParseIP(e); ip != nil {
			if v4 := ip.To4(); v4 != nil {
				n = &net.IPNet{IP: v4, Mask: net.CIDRMask(32, 32)}
			} else {
				n = &net.IPNet{IP: ip, Mask: net.CIDRMask(128, 128)}
			}
		} else {
			invalid = append(invalid, raw)
			continue
		}
		nets = append(nets, n)
	}
	return nets, invalid
}

// allows reports whether the given client IP may access the registry.
// ip is normalized to its 4-byte form when possible so IPv4-vs-IPv4-in-IPv6
// mismatches do not cause false denials.
func (a *aclMatcher) allows(ipStr string) bool {
	raw := net.ParseIP(ipStr)
	if raw == nil {
		// Cannot determine the client IP. In blacklist mode we let it through;
		// in whitelist mode (deny-by-default) we deny, consistent with intent.
		return a.mode != ACLModeWhitelist
	}
	ip := raw
	if v4 := raw.To4(); v4 != nil {
		ip = v4
	}
	switch a.mode {
	case ACLModeWhitelist:
		for _, n := range a.whitelist {
			if n.Contains(ip) {
				return true
			}
		}
		return false
	case ACLModeBlacklist:
		for _, n := range a.blacklist {
			if n.Contains(ip) {
				return false
			}
		}
		return true
	default:
		return true
	}
}

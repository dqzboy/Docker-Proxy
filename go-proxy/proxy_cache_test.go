package main

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// TestProxyBlobCaching verifies the headline path: the first pull goes upstream
// and is cached, the second identical pull is served from cache without hitting
// upstream again.
func TestProxyBlobCaching(t *testing.T) {
	var upstreamHits int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits++
		if strings.Contains(r.URL.Path, "blobs") {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Docker-Content-Digest", "sha256:abc")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("BLOB-LAYER-BYTES"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer upstream.Close()

	dir := tempCacheDir(t)

	cfg := &Config{
		Default: "test",
		Cache: CacheConfig{
			Enabled:     true,
			Backend:     "disk",
			Dir:         dir,
			MaxSizeGB:   0,
			ManifestTTL: 3600,
			TagsTTL:     300,
		},
		Registries: []RegistryConfig{{
			Name:     "test",
			Hosts:    []string{"cache.test"},
			Upstream: upstream.URL,
			Auth:     AuthConfig{Type: AuthAnonymous},
		}},
	}
	normalizeConfig(cfg)
	proxy := NewProxy(cfg)
	defer proxy.cache.stop()

	doPull := func() string {
		req := httptest.NewRequest(http.MethodGet, "/v2/lib/nginx/blobs/sha256:abc", nil)
		req.Host = "cache.test"
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		return rec.Body.String()
	}

	first := doPull()
	if first != "BLOB-LAYER-BYTES" {
		t.Fatalf("first pull body = %q", first)
	}
	if upstreamHits != 1 {
		t.Fatalf("expected 1 upstream hit on first pull, got %d", upstreamHits)
	}

	second := doPull()
	if second != "BLOB-LAYER-BYTES" {
		t.Fatalf("second pull body = %q", second)
	}
	if upstreamHits != 1 {
		t.Fatalf("second pull must be served from cache (no extra upstream hit), got %d", upstreamHits)
	}

	stats := proxy.snapshotCacheStats()
	if stats["hits"].(int64) < 1 {
		t.Fatalf("expected at least 1 cache hit, got %v", stats["hits"])
	}
}

func TestProxyHeadDoesNotPoisonCache(t *testing.T) {
	const body = "nonempty-registry-blob"
	var getHits, headHits int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		if r.Method == http.MethodHead {
			headHits++
			return
		}
		getHits++
		_, _ = w.Write([]byte(body))
	}))
	defer upstream.Close()

	cfg := &Config{
		Default: "test",
		Cache:   CacheConfig{Enabled: true, Backend: "disk", Dir: tempCacheDir(t)},
		Registries: []RegistryConfig{{
			Name: "test", Hosts: []string{"cache.test"}, Upstream: upstream.URL,
			Auth: AuthConfig{Type: AuthAnonymous},
		}},
	}
	normalizeConfig(cfg)
	proxy := NewProxy(cfg)
	defer proxy.cache.stop()

	request := func(method string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, "/v2/library/nginx/blobs/sha256:abc", nil)
		req.Host = "cache.test"
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		return rec
	}

	// Docker can probe a descriptor with HEAD before downloading it.
	if rec := request(http.MethodHead); rec.Code != http.StatusOK || rec.Header().Get("Content-Length") != strconv.Itoa(len(body)) {
		t.Fatalf("uncached HEAD: status=%d length=%q", rec.Code, rec.Header().Get("Content-Length"))
	}
	if count, _ := proxy.cache.Stat(); count != 0 {
		t.Fatalf("HEAD created %d empty cache entries", count)
	}
	if rec := request(http.MethodGet); rec.Body.String() != body {
		t.Fatalf("GET after HEAD returned %q", rec.Body.String())
	}
	// A later HEAD must use the valid cached GET without replacing its body.
	if rec := request(http.MethodHead); rec.Code != http.StatusOK || rec.Header().Get("Content-Length") != strconv.Itoa(len(body)) {
		t.Fatalf("cached HEAD: status=%d length=%q", rec.Code, rec.Header().Get("Content-Length"))
	}
	if rec := request(http.MethodGet); rec.Body.String() != body || rec.Header().Get("Content-Length") != strconv.Itoa(len(body)) {
		t.Fatalf("cached GET: body=%q length=%q", rec.Body.String(), rec.Header().Get("Content-Length"))
	}
	if headHits != 1 || getHits != 1 {
		t.Fatalf("upstream HEAD=%d GET=%d, want one each", headHits, getHits)
	}
}

func TestProxyRepairsZeroByteCacheEntry(t *testing.T) {
	const body = "valid-manifest"
	var hits int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/vnd.oci.image.manifest.v1+json")
		_, _ = w.Write([]byte(body))
	}))
	defer upstream.Close()

	cfg := &Config{
		Default: "test",
		Cache:   CacheConfig{Enabled: true, Backend: "disk", Dir: tempCacheDir(t)},
		Registries: []RegistryConfig{{
			Name: "test", Hosts: []string{"cache.test"}, Upstream: upstream.URL,
			Auth: AuthConfig{Type: AuthAnonymous},
		}},
	}
	normalizeConfig(cfg)
	proxy := NewProxy(cfg)
	defer proxy.cache.stop()
	path := "/v2/library/nginx/manifests/sha256:abc"
	key, _, _, _, _ := proxy.classifyCache(path, "test", "library/nginx")
	wtr, err := proxy.cache.Writer(key, http.Header{}, "sha256:abc", "manifest", 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := wtr.Close(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Host = "cache.test"
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		if rec.Body.String() != body || rec.Header().Get("Content-Length") == "0" {
			t.Fatalf("pull %d: body=%q length=%q", i+1, rec.Body.String(), rec.Header().Get("Content-Length"))
		}
	}
	if hits != 1 {
		t.Fatalf("expected repaired cache after one upstream GET, got %d", hits)
	}
}

func TestProxyRangeRequestBypassesCache(t *testing.T) {
	var hits int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.Header.Get("Range") != "" {
			w.Header().Set("Content-Range", "bytes 0-3/8")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write([]byte("full"))
			return
		}
		_, _ = w.Write([]byte("fullblob"))
	}))
	defer upstream.Close()
	cfg := &Config{
		Default: "test",
		Cache:   CacheConfig{Enabled: true, Backend: "disk", Dir: tempCacheDir(t)},
		Registries: []RegistryConfig{{
			Name: "test", Hosts: []string{"cache.test"}, Upstream: upstream.URL,
			Auth: AuthConfig{Type: AuthAnonymous},
		}},
	}
	normalizeConfig(cfg)
	proxy := NewProxy(cfg)
	defer proxy.cache.stop()

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/v2/library/nginx/blobs/sha256:abc", nil)
		req.Host = "cache.test"
		if i == 1 {
			req.Header.Set("Range", "bytes=0-3")
		}
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
		if i == 1 && (rec.Code != http.StatusPartialContent || rec.Body.String() != "full" || rec.Header().Get("Content-Range") != "bytes 0-3/8") {
			t.Fatalf("range response: status=%d body=%q content-range=%q", rec.Code, rec.Body.String(), rec.Header().Get("Content-Range"))
		}
	}
	if hits != 2 {
		t.Fatalf("range request was not forwarded upstream: hits=%d", hits)
	}
}

// TestProxyCacheDisabled verifies that with caching off, every pull hits upstream
// (backward-compatible behaviour) and nothing is stored.
func TestProxyCacheDisabled(t *testing.T) {
	var upstreamHits int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits++
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("DATA"))
	}))
	defer upstream.Close()

	cfg := &Config{
		Default: "test",
		Registries: []RegistryConfig{{
			Name:     "test",
			Hosts:    []string{"cache.test"},
			Upstream: upstream.URL,
			Auth:     AuthConfig{Type: AuthAnonymous},
		}},
	}
	normalizeConfig(cfg)
	proxy := NewProxy(cfg)

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/v2/lib/nginx/blobs/sha256:abc", nil)
		req.Host = "cache.test"
		rec := httptest.NewRecorder()
		proxy.ServeHTTP(rec, req)
	}
	if upstreamHits != 3 {
		t.Fatalf("with cache disabled, every pull must hit upstream, got %d", upstreamHits)
	}
}

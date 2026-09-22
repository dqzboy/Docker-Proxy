package main

import (
	"net/http"
	"net/http/httptest"
	"os"
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

	dir, err := os.MkdirTemp("", "gp-proxy-cache-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

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

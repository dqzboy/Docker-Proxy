package main

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func tempCacheDir(t *testing.T) string {
	t.Helper()
	d, err := os.MkdirTemp("", "gpcache-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(d) })
	return d
}

func TestDiskCachePutAndOpen(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	hdr := http.Header{
		"Content-Type":          []string{"application/octet-stream"},
		"Docker-Content-Digest": []string{"sha256:abc"},
	}
	wtr, err := c.Writer("b/reg/lib/nginx/sha256:abc", hdr, "sha256:abc", "blob", 0)
	if err != nil {
		t.Fatal(err)
	}
	payload := []byte("hello-layer-bytes")
	if _, err := wtr.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := wtr.Close(); err != nil {
		t.Fatal(err)
	}

	obj, ok := c.Open("b/reg/lib/nginx/sha256:abc", 0)
	if !ok {
		t.Fatal("expected cache hit")
	}
	if obj.Size != int64(len(payload)) {
		t.Fatalf("size = %d, want %d", obj.Size, len(payload))
	}
	if obj.Digest != "sha256:abc" {
		t.Fatalf("digest = %q", obj.Digest)
	}
	got, _ := io.ReadAll(obj.Reader)
	obj.Reader.Close()
	if !bytes.Equal(got, payload) {
		t.Fatalf("content mismatch: %q", got)
	}
	if obj.Header.Get("Content-Type") != "application/octet-stream" {
		t.Fatal("header not replayed on serve")
	}
}

func TestDiskCacheMiss(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	if _, ok := c.Open("b/reg/x/y/sha256:missing", 0); ok {
		t.Fatal("expected cache miss for unknown key")
	}
}

func TestDiskCacheExpiredManifest(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	wtr, _ := c.Writer("t/reg/r/latest", http.Header{}, "sha256:abc", "manifest", 10*time.Millisecond)
	wtr.Write([]byte("manifest-bytes"))
	wtr.Close()
	if _, ok := c.Open("t/reg/r/latest", 10*time.Millisecond); !ok {
		t.Fatal("expected fresh hit")
	}
	time.Sleep(15 * time.Millisecond)
	if _, ok := c.Open("t/reg/r/latest", 10*time.Millisecond); ok {
		t.Fatal("expected expired miss for stale tag manifest")
	}
}

func TestDiskCacheClear(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	wtr, _ := c.Writer("b/reg/r/sha256:abc", http.Header{}, "sha256:abc", "blob", 0)
	wtr.Write([]byte("x"))
	wtr.Close()
	c.Clear()
	if _, ok := c.Open("b/reg/r/sha256:abc", 0); ok {
		t.Fatal("expected miss after Clear")
	}
	count, _ := c.Stat()
	if count != 0 {
		t.Fatalf("count = %d, want 0", count)
	}
}

func TestDiskCacheQuotaEviction(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, maxBytes: 100, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	for i := 0; i < 5; i++ {
		key := "b/reg/r/sha256:0" + string(rune('a'+i))
		wtr, err := c.Writer(key, http.Header{}, key, "blob", 0)
		if err != nil {
			t.Fatal(err)
		}
		wtr.Write(bytes.Repeat([]byte("z"), 30))
		if err := wtr.Close(); err != nil {
			t.Fatal(err)
		}
	}
	_, bytesTotal := c.Stat()
	if bytesTotal > 100 {
		t.Fatalf("quota not enforced: total = %d, want <= 100", bytesTotal)
	}
}

func TestDiskCacheQuotaKeepsJustWrittenEntry(t *testing.T) {
	c := &diskCache{root: tempCacheDir(t), maxBytes: 10, index: map[string]*cacheEntry{}}
	key := "b/reg/repo/new"
	w, err := c.Writer(key, http.Header{}, "sha256:new", "blob", 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(bytes.Repeat([]byte("x"), 11)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	obj, ok := c.Open(key, 0)
	if !ok {
		t.Fatal("new oversized entry evicted immediately")
	}
	obj.Reader.Close()
}

func TestDiskCachePathSafety(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	p := c.pathFor("b/reg/../../etc/passwd/sha256:abc")
	rel, err := filepath.Rel(dir, p)
	if err != nil {
		t.Fatal(err)
	}
	if !filepath.IsLocal(rel) {
		t.Fatalf("cache path escapes root: %s", p)
	}
}

func TestDiskCacheStopIsIdempotent(t *testing.T) {
	dir := tempCacheDir(t)
	c := &diskCache{root: dir, index: map[string]*cacheEntry{}, cancel: make(chan struct{})}
	go c.janitor(time.Hour) // spawn the goroutine that selects on c.cancel
	// The original bug double-stopped the same cache object (reload stopped it,
	// then initCache stopped it again) and panicked with "close of closed
	// channel". This must never panic.
	c.stop()
	c.stop()
	c.stop()
}

func TestSingleflightCoalesces(t *testing.T) {
	g := &singleflight{}
	var calls int
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, _ = g.Do("k", func() (interface{}, error) {
				calls++
				time.Sleep(10 * time.Millisecond)
				return nil, nil
			})
		}()
	}
	wg.Wait()
	if calls != 1 {
		t.Fatalf("expected singleflight fn called once, got %d", calls)
	}
}

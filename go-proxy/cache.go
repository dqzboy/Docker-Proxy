package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// cacheEntry is the in-memory index record for a single cached object. It is
// guarded by diskCache.mu together with the total byte count.
type cacheEntry struct {
	size  int64
	atime time.Time
	kind  string // "blob" | "manifest"
	ttl   time.Duration
}

// cacheMeta is the on-disk sidecar stored next to every cached object. It lets
// us replay the upstream response headers verbatim when serving from cache, and
// carries the bookkeeping needed for TTL + LRU.
type cacheMeta struct {
	Header   map[string][]string `json:"header"`
	Size     int64               `json:"size"`
	StoredAt time.Time           `json:"storedAt"`
	Digest   string              `json:"digest"`
	Kind     string              `json:"kind"`
	TTL      time.Duration       `json:"ttl"`
}

// cacheObject is returned by diskCache.Open and handed to the proxy so it can
// replay headers and stream the cached bytes to the client.
type cacheObject struct {
	Reader io.ReadCloser
	Header http.Header
	Size   int64
	Digest string
	Kind   string
}

// cacheWriterIface is the write-side handle returned by blobStore.Writer. The
// proxy streams the upstream body into it (via io.TeeReader) and calls Close to
// commit; Abort discards a partial write (e.g. upstream error mid-stream).
type cacheWriterIface interface {
	io.Writer
	Close() error
	Abort()
}

// blobStore is the storage contract for the pull-through cache. diskCache and
// s3Cache both implement it, so the proxy depends only on this interface and a
// new backend (e.g. a native cloud SDK) can be added without touching proxy.go.
type blobStore interface {
	// Open returns a cached object if present and (for tag manifests) not expired.
	Open(key string, ttl time.Duration) (*cacheObject, bool)
	// Writer returns a write handle for streaming the upstream body into the store.
	Writer(key string, hdr http.Header, digest, kind string, ttl time.Duration) (cacheWriterIface, error)
	// Stat returns the number of cached objects and their total size.
	Stat() (count, bytes int64)
	// Clear wipes every cached object.
	Clear()
	// setMaxBytes updates the quota without rebuilding the store.
	setMaxBytes(n int64)
	// stop tears down background workers (janitor).
	stop()
}

// diskCache is a content-addressed pull-through cache rooted at a local
// directory. Blob and digest-addressed manifest objects are immutable (TTL 0);
// tag-addressed manifest objects carry a TTL and are treated as stale once it
// elapses so the proxy can revalidate upstream.
type diskCache struct {
	root       string
	maxBytes   int64
	mu         sync.Mutex
	index      map[string]*cacheEntry
	totalBytes int64
	cancel     chan struct{}
	stopOnce   sync.Once
}

func newDiskCache(root string, maxGB int) *diskCache {
	root = resolveCacheDir(root)
	c := &diskCache{
		root:     root,
		maxBytes: int64(maxGB) * 1024 * 1024 * 1024,
		index:    map[string]*cacheEntry{},
		cancel:   make(chan struct{}),
	}
	c.loadIndex()
	go c.janitor(5 * time.Minute)
	return c
}

// resolveCacheDir returns a writable cache directory. The configured dir (in
// Docker, the mounted volume at /app/cache) is used verbatim when it can be
// created. Otherwise we fall back to a per-user cache directory, so local
// development on macOS/Windows — where /app is not writable — still gets a
// working cache instead of a silently-failing one.
func resolveCacheDir(dir string) string {
	if dir == "" {
		dir = "/app/cache"
	}
	if err := os.MkdirAll(dir, 0o755); err == nil {
		return dir
	}
	if cd, err := os.UserCacheDir(); err == nil {
		fallback := filepath.Join(cd, "docker-proxy-cache")
		if mkErr := os.MkdirAll(fallback, 0o755); mkErr == nil {
			log.Printf("[cache] 缓存目录 %s 不可写，已回退到本地目录 %s", dir, fallback)
			return fallback
		}
	}
	tmp := filepath.Join(os.TempDir(), "docker-proxy-cache")
	log.Printf("[cache] 缓存目录 %s 不可写，已回退到临时目录 %s", dir, tmp)
	_ = os.MkdirAll(tmp, 0o755)
	return tmp
}

// stop tears down the janitor goroutine. It is safe to call more than once: the
// cancel channel is closed exactly once. A previous bug double-stopped the same
// cache object (reload stopped it, then initCache stopped it again), which
// panicked with "close of closed channel" and dropped the admin HTTP connection.
func (c *diskCache) stop() {
	c.stopOnce.Do(func() {
		if c.cancel != nil {
			close(c.cancel)
		}
	})
}

// sanitize makes a path component filesystem-safe (no ":" which breaks some
// platforms, no ".." which would escape the root).
func sanitize(part string) string {
	part = strings.ReplaceAll(part, ":", "_")
	part = strings.ReplaceAll(part, "..", "_")
	return part
}

// pathFor turns a logical cache key ("b/<registry>/<repo>/<digest>") into an
// absolute file path strictly under root.
func (c *diskCache) pathFor(key string) string {
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = sanitize(p)
	}
	return filepath.Join(append([]string{c.root}, parts...)...)
}

// keyFromMetaPath recovers the logical key from a ".meta" file path.
func (c *diskCache) keyFromMetaPath(metaPath string) (string, bool) {
	rel, err := filepath.Rel(c.root, metaPath)
	if err != nil {
		return "", false
	}
	rel = strings.TrimSuffix(rel, ".meta")
	rel = filepath.ToSlash(rel)
	return rel, true
}

func (c *diskCache) loadIndex() {
	_ = filepath.Walk(c.root, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(p, ".meta") {
			return nil
		}
		mb, rerr := os.ReadFile(p)
		if rerr != nil {
			return nil
		}
		var m cacheMeta
		if jerr := json.Unmarshal(mb, &m); jerr != nil {
			return nil
		}
		key, ok := c.keyFromMetaPath(p)
		if !ok {
			return nil
		}
		c.index[key] = &cacheEntry{size: m.Size, atime: m.StoredAt, kind: m.Kind, ttl: m.TTL}
		c.totalBytes += m.Size
		return nil
	})
}

// Open returns a cached object if present and (for tag manifests) not expired.
func (c *diskCache) Open(key string, ttl time.Duration) (*cacheObject, bool) {
	p := c.pathFor(key)
	f, err := os.Open(p)
	if err != nil {
		return nil, false
	}
	mb, err := os.ReadFile(p + ".meta")
	if err != nil {
		f.Close()
		return nil, false
	}
	var m cacheMeta
	if err := json.Unmarshal(mb, &m); err != nil {
		f.Close()
		return nil, false
	}
	// Older versions could persist a HEAD response as an empty blob/manifest.
	// Treat it as a miss so the next GET can replace it with real content.
	if m.Size <= 0 {
		f.Close()
		return nil, false
	}
	if m.TTL > 0 && time.Since(m.StoredAt) > m.TTL {
		f.Close()
		return nil, false
	}
	c.mu.Lock()
	if e, ok := c.index[key]; ok {
		e.atime = time.Now()
	} else {
		c.index[key] = &cacheEntry{size: m.Size, atime: time.Now(), kind: m.Kind, ttl: m.TTL}
		c.totalBytes += m.Size
	}
	c.mu.Unlock()
	return &cacheObject{
		Reader: f,
		Header: http.Header(m.Header),
		Size:   m.Size,
		Digest: m.Digest,
		Kind:   m.Kind,
	}, true
}

// cacheWriter streams the upstream body to a temp file and commits it (plus a
// meta sidecar) on Close. Abort discards the temp file instead.
type cacheWriter struct {
	c      *diskCache
	key    string
	p      string
	tmp    string
	f      *os.File
	hdr    http.Header
	digest string
	kind   string
	ttl    time.Duration
}

func (c *diskCache) Writer(key string, hdr http.Header, digest, kind string, ttl time.Duration) (cacheWriterIface, error) {
	p := c.pathFor(key)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return nil, err
	}
	tmp := p + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return nil, err
	}
	return &cacheWriter{c: c, key: key, p: p, tmp: tmp, f: f, hdr: hdr, digest: digest, kind: kind, ttl: ttl}, nil
}

// setMaxBytes updates the disk quota; used on reload so an unrelated config edit
// does not force a full store rebuild.
func (c *diskCache) setMaxBytes(n int64) {
	c.mu.Lock()
	c.maxBytes = n
	c.mu.Unlock()
}

func (w *cacheWriter) Write(b []byte) (int, error) {
	return w.f.Write(b)
}

func (w *cacheWriter) Close() error {
	if err := w.f.Close(); err != nil {
		os.Remove(w.tmp)
		return err
	}
	info, err := os.Stat(w.tmp)
	if err != nil {
		return err
	}
	if err := os.Rename(w.tmp, w.p); err != nil {
		return err
	}
	meta := cacheMeta{
		Header:   map[string][]string(w.hdr),
		Size:     info.Size(),
		StoredAt: time.Now(),
		Digest:   w.digest,
		Kind:     w.kind,
		TTL:      w.ttl,
	}
	mb, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	if err := os.WriteFile(w.p+".meta.tmp", mb, 0o644); err != nil {
		return err
	}
	if err := os.Rename(w.p+".meta.tmp", w.p+".meta"); err != nil {
		return err
	}
	w.c.mu.Lock()
	if e, ok := w.c.index[w.key]; ok {
		w.c.totalBytes += info.Size() - e.size
		e.size = info.Size()
		e.atime = meta.StoredAt
		e.kind = w.kind
		e.ttl = w.ttl
	} else {
		w.c.index[w.key] = &cacheEntry{size: info.Size(), atime: meta.StoredAt, kind: w.kind, ttl: w.ttl}
		w.c.totalBytes += info.Size()
	}
	w.c.mu.Unlock()
	w.c.maybeEvict(w.key)
	return nil
}

func (w *cacheWriter) Abort() {
	w.f.Close()
	os.Remove(w.tmp)
}

// maybeEvict drops least-recently-used objects until under maxBytes.
func (c *diskCache) maybeEvict(justWritten string) {
	c.mu.Lock()
	if c.maxBytes <= 0 || c.totalBytes <= c.maxBytes {
		c.mu.Unlock()
		return
	}
	entries := make([]struct {
		key string
		e   *cacheEntry
	}, 0, len(c.index))
	for k, e := range c.index {
		entries = append(entries, struct {
			key string
			e   *cacheEntry
		}{k, e})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].e.atime.Before(entries[j].e.atime)
	})
	var toDelete []string
	for _, it := range entries {
		if c.totalBytes <= c.maxBytes {
			break
		}
		if it.key == justWritten {
			continue
		}
		c.totalBytes -= it.e.size
		delete(c.index, it.key)
		toDelete = append(toDelete, it.key)
	}
	c.mu.Unlock()
	for _, k := range toDelete {
		c.removeKey(k)
	}
}

func (c *diskCache) removeKey(key string) {
	p := c.pathFor(key)
	os.Remove(p)
	os.Remove(p + ".meta")
}

// Clear wipes every cached object and resets the index + counters' view.
func (c *diskCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = filepath.Walk(c.root, func(p string, info os.FileInfo, err error) error {
		if err != nil || p == c.root {
			return nil
		}
		os.Remove(p)
		return nil
	})
	c.index = map[string]*cacheEntry{}
	c.totalBytes = 0
}

// Stat returns the number of cached objects and their total size.
func (c *diskCache) Stat() (count int64, bytes int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return int64(len(c.index)), c.totalBytes
}

func (c *diskCache) janitor(interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-c.cancel:
			return
		case <-t.C:
			c.sweep()
		}
	}
}

func (c *diskCache) sweep() {
	c.mu.Lock()
	over := c.maxBytes > 0 && c.totalBytes > c.maxBytes
	var expired []string
	now := time.Now()
	for k, e := range c.index {
		if e.ttl > 0 && now.Sub(e.atime) > e.ttl {
			expired = append(expired, k)
			c.totalBytes -= e.size
			delete(c.index, k)
		}
	}
	c.mu.Unlock()
	for _, k := range expired {
		c.removeKey(k)
	}
	if over {
		c.mu.Lock()
		target := c.maxBytes
		entries := make([]*cacheEntry, 0, len(c.index))
		for _, e := range c.index {
			entries = append(entries, e)
		}
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].atime.Before(entries[j].atime)
		})
		var del []string
		for _, e := range entries {
			if c.totalBytes <= target {
				break
			}
			// find a key referencing this entry
			for k, ei := range c.index {
				if ei == e {
					c.totalBytes -= e.size
					delete(c.index, k)
					del = append(del, k)
					break
				}
			}
		}
		c.mu.Unlock()
		for _, k := range del {
			c.removeKey(k)
		}
	}
}

// singleflight coalesces concurrent fills of the same cache key so N clients
// pulling the same new blob trigger a single upstream fetch. The leader streams
// to its own client and writes to cache; followers wait, then read from cache.
type sgroupCall struct {
	wg  sync.WaitGroup
	val interface{}
	err error
}

type singleflight struct {
	mu sync.Mutex
	m  map[string]*sgroupCall
}

func (g *singleflight) Do(key string, fn func() (interface{}, error)) (interface{}, error, bool) {
	g.mu.Lock()
	if g.m == nil {
		g.m = map[string]*sgroupCall{}
	}
	if c, ok := g.m[key]; ok {
		g.mu.Unlock()
		c.wg.Wait()
		return c.val, c.err, true
	}
	c := &sgroupCall{}
	c.wg.Add(1)
	g.m[key] = c
	g.mu.Unlock()

	c.val, c.err = fn()
	c.wg.Done()
	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()
	return c.val, c.err, false
}

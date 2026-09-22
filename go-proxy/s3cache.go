package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// s3CachePrefix is prepended to every cache key so the proxy's objects live under
// a dedicated namespace inside the bucket (safe to share a bucket with other data).
const s3CachePrefix = "docker-proxy-cache/"

// s3VendorPreset captures the S3 addressing quirks of a known provider so the UI
// only has to pick a name and fill in the obvious fields (endpoint / region /
// bucket / keys). The single minio-go client covers all of them via S3 SigV4.
type s3VendorPreset struct {
	Label        string // 中文展示名
	Secure       bool   // 是否默认 HTTPS
	PathStyle    bool   // 路径风格寻址（自托管 MinIO/Ceph 为 true；云厂商虚拟主机风格为 false）
	Region       string // 示例/默认区域
	EndpointHint string // 占位示例域名
}

// s3VendorPresets is the canonical list of supported S3-compatible providers.
// "custom" lets operators point at any S3 endpoint minio-go can speak to.
var s3VendorPresets = map[string]s3VendorPreset{
	"minio":   {"MinIO", true, true, "", "minio.example.com:9000"},
	"ceph":    {"Ceph RADOSGW", true, true, "", "ceph.example.com"},
	"aliyun":  {"阿里云 OSS", true, false, "cn-hangzhou", "oss-cn-hangzhou.aliyuncs.com"},
	"tencent": {"腾讯云 COS", true, false, "ap-guangzhou", "cos.ap-guangzhou.myqcloud.com"},
	"huawei":  {"华为云 OBS", true, false, "cn-north-4", "obs.cn-north-4.myhuaweicloud.com"},
	"custom":  {"自定义 S3 服务", true, true, "", ""},
}

// S3VendorPresets returns the known vendor presets for the admin UI to render the
// provider dropdown and endpoint/region placeholders.
func S3VendorPresets() map[string]s3VendorPreset {
	return s3VendorPresets
}

// s3Cache is a blobStore backed by any S3-compatible service. Objects are written
// through a local staging file (so the upstream stream can be teed to the client
// while we capture the whole blob), then uploaded with per-object metadata that
// lets Open replay headers and enforce TTLs. An in-memory index mirrors diskCache
// for Stats/sweep without listing the bucket on every request.
type s3Cache struct {
	client     *minio.Client
	bucket     string
	prefix     string
	maxBytes   int64 // informational only; remote storage is not quota-bound
	mu         sync.Mutex
	index      map[string]*cacheEntry
	totalBytes int64
	cancel     chan struct{}
	stopOnce   sync.Once
	staging    string
}

func newS3Cache(c *CacheConfig) (*s3Cache, error) {
	preset := s3VendorPresets[c.Provider]
	if _, ok := s3VendorPresets[c.Provider]; !ok {
		preset = s3VendorPresets["custom"]
	}
	endpoint := c.Endpoint
	if endpoint == "" {
		return nil, fmt.Errorf("cache.s3.endpoint 不能为空")
	}
	bucketLookup := minio.BucketLookupAuto
	if preset.PathStyle {
		bucketLookup = minio.BucketLookupPath
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""),
		Secure:       preset.Secure,
		Region:       c.Region,
		BucketLookup: bucketLookup,
	})
	if err != nil {
		return nil, fmt.Errorf("初始化 S3 客户端失败: %w", err)
	}
	staging := filepath.Join(os.TempDir(), "docker-proxy-s3-staging")
	if err := os.MkdirAll(staging, 0o755); err != nil {
		return nil, fmt.Errorf("创建 S3 暂存目录失败: %w", err)
	}
	s := &s3Cache{
		client:  client,
		bucket:  c.Bucket,
		prefix:  s3CachePrefix,
		staging: staging,
		cancel:  make(chan struct{}),
		index:   map[string]*cacheEntry{},
	}
	// 预检桶是否可访问；不可达不致命（可能在首次写入时才真正校验），但给出日志。
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if exists, berr := client.BucketExists(ctx, c.Bucket); berr != nil {
		log.Printf("[cache] 无法访问 S3 桶 %s: %v（首次写入时再校验）", c.Bucket, berr)
	} else if !exists {
		log.Printf("[cache] S3 桶 %s 不存在，请先在控制台创建后再启用缓存", c.Bucket)
	}
	go s.warmIndex(60 * time.Second)
	go s.janitor(15 * time.Minute)
	return s, nil
}

// bucketKey maps a logical cache key to the full S3 object name.
func (s *s3Cache) bucketKey(key string) string {
	return s.prefix + key
}

// readMeta extracts our per-object metadata from a minio ObjectInfo. minio-go
// exposes user metadata either in ObjectInfo.UserMetadata (prefix already
// stripped, lower-cased) or in the full Metadata map under "x-amz-meta-*".
func (s *s3Cache) readMeta(info minio.ObjectInfo) cacheMeta {
	m := cacheMeta{Header: map[string][]string{}}
	get := func(k string) string {
		if v, ok := info.UserMetadata[k]; ok && v != "" {
			return v
		}
		if v, ok := info.UserMetadata["x-amz-meta-"+k]; ok && v != "" {
			return v
		}
		if vv, ok := info.Metadata[k]; ok && len(vv) > 0 {
			return vv[0]
		}
		if vv, ok := info.Metadata["X-Amz-Meta-"+k]; ok && len(vv) > 0 {
			return vv[0]
		}
		if vv, ok := info.Metadata["x-amz-meta-"+k]; ok && len(vv) > 0 {
			return vv[0]
		}
		return ""
	}
	if v := get("dp-stored-at"); v != "" {
		if t, e := time.Parse(time.RFC3339, v); e == nil {
			m.StoredAt = t
		}
	}
	if v := get("dp-ttl"); v != "" {
		if n, e := strconv.Atoi(v); e == nil {
			m.TTL = time.Duration(n) * time.Second
		}
	}
	m.Kind = get("dp-kind")
	m.Digest = get("dp-digest")
	if v := get("dp-header"); v != "" {
		var h map[string][]string
		if json.Unmarshal([]byte(v), &h) == nil {
			m.Header = h
		}
	}
	m.Size = info.Size
	return m
}

// Open returns a cached object if present and (for tag manifests) not expired.
func (s *s3Cache) Open(key string, ttl time.Duration) (*cacheObject, bool) {
	name := s.bucketKey(key)
	obj, err := s.client.GetObject(context.Background(), s.bucket, name, minio.GetObjectOptions{})
	if err != nil {
		return nil, false
	}
	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, false
	}
	meta := s.readMeta(info)
	if meta.TTL > 0 && time.Since(meta.StoredAt) > meta.TTL {
		obj.Close()
		s.removeKey(key)
		return nil, false
	}
	s.mu.Lock()
	if e, ok := s.index[key]; ok {
		e.atime = time.Now()
	} else {
		s.index[key] = &cacheEntry{size: info.Size, atime: time.Now(), kind: meta.Kind, ttl: meta.TTL}
		s.totalBytes += info.Size
	}
	s.mu.Unlock()
	return &cacheObject{
		Reader: obj,
		Header: http.Header(meta.Header),
		Size:   info.Size,
		Digest: meta.Digest,
		Kind:   meta.Kind,
	}, true
}

// Writer returns a write handle that stages the upstream body to a local temp
// file, then uploads it to S3 on Close. Abort discards the temp file.
func (s *s3Cache) Writer(key string, hdr http.Header, digest, kind string, ttl time.Duration) (cacheWriterIface, error) {
	tmp, err := os.CreateTemp(s.staging, "s3cache-*.tmp")
	if err != nil {
		return nil, err
	}
	return &s3CacheWriter{s: s, key: key, tmp: tmp, hdr: hdr, digest: digest, kind: kind, ttl: ttl}, nil
}

func (s *s3Cache) setMaxBytes(n int64) {
	s.mu.Lock()
	s.maxBytes = n
	s.mu.Unlock()
}

// stop tears down the background goroutines. Idempotent for the same reason as
// diskCache.stop (a double close would panic "close of closed channel").
func (s *s3Cache) stop() {
	s.stopOnce.Do(func() {
		if s.cancel != nil {
			close(s.cancel)
		}
	})
}

// Stat returns the number of cached objects and their total size.
func (s *s3Cache) Stat() (count, bytes int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return int64(len(s.index)), s.totalBytes
}

// Clear wipes every cached object in the bucket namespace and resets the index.
func (s *s3Cache) Clear() {
	ctx := context.Background()
	ch := make(chan minio.ObjectInfo)
	go func() {
		defer close(ch)
		for obj := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Prefix: s.prefix, Recursive: true}) {
			if obj.Err != nil {
				continue
			}
			ch <- obj
		}
	}()
	for rErr := range s.client.RemoveObjects(ctx, s.bucket, ch, minio.RemoveObjectsOptions{}) {
		if rErr.Err != nil {
			log.Printf("[cache] 删除 S3 对象失败 %s: %v", rErr.ObjectName, rErr.Err)
		}
	}
	s.mu.Lock()
	s.index = map[string]*cacheEntry{}
	s.totalBytes = 0
	s.mu.Unlock()
}

// removeKey deletes a single object from S3 and the index.
func (s *s3Cache) removeKey(key string) {
	name := s.bucketKey(key)
	_ = s.client.RemoveObject(context.Background(), s.bucket, name, minio.RemoveObjectOptions{})
	s.mu.Lock()
	if e, ok := s.index[key]; ok {
		s.totalBytes -= e.size
		delete(s.index, key)
	}
	s.mu.Unlock()
}

// warmIndex lists existing objects once at startup so Stat/sweep are accurate
// without a per-request bucket listing. Best effort; failures are ignored.
func (s *s3Cache) warmIndex(timeout time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	n := 0
	for obj := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Prefix: s.prefix, Recursive: true}) {
		if obj.Err != nil {
			continue
		}
		s.mu.Lock()
		if _, ok := s.index[obj.Key]; !ok {
			s.index[obj.Key] = &cacheEntry{size: obj.Size, atime: obj.LastModified, kind: "blob"}
			s.totalBytes += obj.Size
		}
		s.mu.Unlock()
		n++
	}
	log.Printf("[cache] S3 索引预热完成，载入 %d 个对象", n)
}

func (s *s3Cache) janitor(interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-s.cancel:
			return
		case <-t.C:
			s.sweep()
		}
	}
}

// sweep expires objects whose TTL has elapsed since last access.
func (s *s3Cache) sweep() {
	s.mu.Lock()
	var expired []string
	now := time.Now()
	for k, e := range s.index {
		if e.ttl > 0 && now.Sub(e.atime) > e.ttl {
			expired = append(expired, k)
			s.totalBytes -= e.size
			delete(s.index, k)
		}
	}
	s.mu.Unlock()
	for _, k := range expired {
		_ = s.client.RemoveObject(context.Background(), s.bucket, s.bucketKey(k), minio.RemoveObjectOptions{})
	}
}

// s3CacheWriter stages the upstream body to a temp file and uploads on Close.
type s3CacheWriter struct {
	s      *s3Cache
	key    string
	tmp    *os.File
	hdr    http.Header
	digest string
	kind   string
	ttl    time.Duration
}

func (w *s3CacheWriter) Write(b []byte) (int, error) {
	return w.tmp.Write(b)
}

func (w *s3CacheWriter) Abort() {
	w.tmp.Close()
	os.Remove(w.tmp.Name())
}

func (w *s3CacheWriter) Close() error {
	if err := w.tmp.Sync(); err != nil {
		w.Abort()
		return err
	}
	if _, err := w.tmp.Seek(0, io.SeekStart); err != nil {
		w.Abort()
		return err
	}
	info, err := w.tmp.Stat()
	if err != nil {
		w.Abort()
		return err
	}
	size := info.Size()
	meta := cacheMeta{
		Header:   map[string][]string(w.hdr),
		Size:     size,
		StoredAt: time.Now(),
		Digest:   w.digest,
		Kind:     w.kind,
		TTL:      w.ttl,
	}
	hb, _ := json.Marshal(meta.Header)
	userMeta := map[string]string{
		"dp-stored-at": meta.StoredAt.Format(time.RFC3339),
		"dp-ttl":       strconv.Itoa(int(w.ttl.Seconds())),
		"dp-kind":      w.kind,
		"dp-digest":    w.digest,
		"dp-header":    string(hb),
	}
	name := w.s.bucketKey(w.key)
	if _, err := w.s.client.PutObject(context.Background(), w.s.bucket, name, w.tmp, size, minio.PutObjectOptions{
		ContentType:  "application/octet-stream",
		UserMetadata: userMeta,
	}); err != nil {
		w.Abort()
		return err
	}
	w.tmp.Close()
	os.Remove(w.tmp.Name())
	w.s.mu.Lock()
	if e, ok := w.s.index[w.key]; ok {
		w.s.totalBytes += size - e.size
		e.size = size
		e.atime = meta.StoredAt
		e.kind = w.kind
		e.ttl = w.ttl
	} else {
		w.s.index[w.key] = &cacheEntry{size: size, atime: meta.StoredAt, kind: w.kind, ttl: w.ttl}
		w.s.totalBytes += size
	}
	w.s.mu.Unlock()
	return nil
}

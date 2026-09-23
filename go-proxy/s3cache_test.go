package main

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// TestS3VendorPresets 验证厂商预设覆盖完整且寻址风格正确：
// 自托管 MinIO/Ceph 走路径风格，国内云厂商走虚拟主机风格。
func TestS3VendorPresets(t *testing.T) {
	presets := S3VendorPresets()
	for _, name := range []string{"minio", "ceph", "aliyun", "tencent", "huawei", "custom"} {
		if _, ok := presets[name]; !ok {
			t.Fatalf("缺少厂商预设: %s", name)
		}
	}
	if !presets["minio"].PathStyle {
		t.Errorf("minio 应默认路径风格")
	}
	if presets["aliyun"].PathStyle {
		t.Errorf("aliyun OSS 应为虚拟主机风格（pathStyle=false）")
	}
	if presets["tencent"].PathStyle {
		t.Errorf("tencent COS 应为虚拟主机风格（pathStyle=false）")
	}
	if presets["huawei"].Region != "cn-north-4" {
		t.Errorf("huawei 默认区域应为 cn-north-4，实际 %s", presets["huawei"].Region)
	}
}

// TestS3CacheReadMeta 验证从 minio ObjectInfo 解析自定义元数据（含中文 header）。
func TestS3CacheReadMeta(t *testing.T) {
	c := &s3Cache{}
	stored := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	info := minio.ObjectInfo{
		Size: 12345,
		UserMetadata: map[string]string{
			"dp-stored-at": stored.Format(time.RFC3339),
			"dp-ttl":       "3600",
			"dp-kind":      "manifest",
			"dp-digest":    "sha256:abc",
			"dp-header":    `{"Content-Type":["application/vnd.docker.distribution.manifest.v2+json"],"Docker-Content-Digest":["sha256:abc"]}`,
		},
	}
	m := c.readMeta(info)
	if m.TTL != time.Hour {
		t.Errorf("TTL 解析错误: %v", m.TTL)
	}
	if m.Kind != "manifest" {
		t.Errorf("Kind 解析错误: %q", m.Kind)
	}
	if m.Digest != "sha256:abc" {
		t.Errorf("Digest 解析错误: %q", m.Digest)
	}
	if m.Size != 12345 {
		t.Errorf("Size 解析错误: %d", m.Size)
	}
	if got := m.Header["Docker-Content-Digest"]; len(got) == 0 || got[0] != "sha256:abc" {
		t.Errorf("Header 解析错误: %v", got)
	}
	if !m.StoredAt.Equal(stored) {
		t.Errorf("StoredAt 解析错误: %v", m.StoredAt)
	}
}

func TestS3CacheReadSDKMetadata(t *testing.T) {
	stored := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	h := http.Header{}
	h.Set("Content-Length", "12345")
	h.Set("Last-Modified", stored.Format(http.TimeFormat))
	h.Set("X-Amz-Meta-Dp-Stored-At", stored.Format(time.RFC3339))
	h.Set("X-Amz-Meta-Dp-Ttl", "3600")
	h.Set("X-Amz-Meta-Dp-Kind", "manifest")
	h.Set("X-Amz-Meta-Dp-Digest", "sha256:abc")
	h.Set("X-Amz-Meta-Dp-Header", `{"Content-Type":["application/vnd.docker.distribution.manifest.v2+json"]}`)
	info, err := minio.ToObjectInfo("bucket", "key", h)
	if err != nil {
		t.Fatal(err)
	}
	m := (&s3Cache{}).readMeta(info)
	if m.TTL != time.Hour || m.Kind != "manifest" || m.Digest != "sha256:abc" || m.Header["Content-Type"][0] == "" || !m.StoredAt.Equal(stored) {
		t.Fatalf("SDK metadata not decoded: %+v", m)
	}
}

func TestS3CacheWriteThenRead(t *testing.T) {
	var mu sync.Mutex
	var body []byte
	var metadata http.Header
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if r.URL.Path != "/bucket/"+s3CachePrefix+"t/docker/library/nginx/latest" {
			http.Error(w, "wrong key", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodPut:
			if strings.HasPrefix(r.Header.Get("X-Amz-Content-Sha256"), "STREAMING-") {
				reader := bufio.NewReader(r.Body)
				for {
					line, err := reader.ReadString('\n')
					if err != nil {
						t.Errorf("read signed chunk: %v", err)
						return
					}
					n, err := strconv.ParseInt(strings.Split(line, ";")[0], 16, 64)
					if err != nil {
						t.Errorf("parse signed chunk: %v", err)
						return
					}
					if n == 0 {
						break
					}
					chunk := make([]byte, n)
					if _, err := io.ReadFull(reader, chunk); err != nil {
						t.Errorf("read signed payload: %v", err)
						return
					}
					body = append(body, chunk...)
					_, _ = reader.Discard(2)
				}
			} else {
				body, _ = io.ReadAll(r.Body)
			}
			metadata = r.Header.Clone()
			w.Header().Set("ETag", `"abc"`)
		case http.MethodGet, http.MethodHead:
			if body == nil {
				http.NotFound(w, r)
				return
			}
			for k, vv := range metadata {
				if strings.HasPrefix(strings.ToLower(k), "x-amz-meta-") {
					w.Header()[k] = vv
				}
			}
			w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
			w.Header().Set("Content-Length", fmt.Sprint(len(body)))
			w.Header().Set("ETag", `"abc"`)
			if r.Method == http.MethodGet {
				_, _ = w.Write(body)
			}
		default:
			http.Error(w, "unexpected method", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	client, err := minio.New(strings.TrimPrefix(server.URL, "http://"), &minio.Options{Creds: credentials.NewStaticV4("ak", "sk", ""), Secure: false, Region: "us-east-1", BucketLookup: minio.BucketLookupPath})
	if err != nil {
		t.Fatal(err)
	}
	s := &s3Cache{client: client, bucket: "bucket", prefix: s3CachePrefix, staging: t.TempDir(), index: map[string]*cacheEntry{}}
	key := "t/docker/library/nginx/latest"
	hdr := http.Header{"Content-Type": {"application/vnd.docker.distribution.manifest.v2+json"}, "Docker-Content-Digest": {"sha256:abc"}}
	w, err := s.Writer(key, hdr, "sha256:abc", "manifest", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte("hello")); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	storedAt := s.index[key].atime
	for i := 0; i < 2; i++ {
		obj, ok := s.Open(key, time.Hour)
		if !ok {
			t.Fatal("S3 cache miss after successful upload")
		}
		got, err := io.ReadAll(obj.Reader)
		obj.Reader.Close()
		if err != nil || string(got) != "hello" || obj.Header.Get("Content-Type") != hdr.Get("Content-Type") || obj.Digest != "sha256:abc" {
			t.Fatalf("bad cached response: body=%q headers=%v digest=%q err=%v", got, obj.Header, obj.Digest, err)
		}
		if !s.index[key].atime.Equal(storedAt) {
			t.Fatal("cache hit extended tag TTL")
		}
	}
}

func TestS3CacheWarmIndexRestoresTagTTL(t *testing.T) {
	stored := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Second)
	key := s3CachePrefix + "t/docker/library/nginx/latest"
	deleted := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Query().Has("list-type"):
			w.Header().Set("Content-Type", "application/xml")
			fmt.Fprintf(w, `<ListBucketResult><Name>bucket</Name><Prefix>%s</Prefix><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>%s</Key><LastModified>%s</LastModified><ETag>"abc"</ETag><Size>5</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>`, s3CachePrefix, key, stored.Format(time.RFC3339))
		case r.Method == http.MethodHead && r.URL.Path == "/bucket/"+key:
			w.Header().Set("Content-Length", "5")
			w.Header().Set("Last-Modified", stored.Format(http.TimeFormat))
			w.Header().Set("X-Amz-Meta-Dp-Stored-At", stored.Format(time.RFC3339))
			w.Header().Set("X-Amz-Meta-Dp-Ttl", "60")
		case r.Method == http.MethodDelete:
			deleted <- r.URL.Path
		default:
			t.Errorf("unexpected S3 request: %s %s", r.Method, r.URL)
			http.Error(w, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	client, err := minio.New(strings.TrimPrefix(server.URL, "http://"), &minio.Options{Creds: credentials.NewStaticV4("ak", "sk", ""), Secure: false, Region: "us-east-1", BucketLookup: minio.BucketLookupPath})
	if err != nil {
		t.Fatal(err)
	}
	s := &s3Cache{client: client, bucket: "bucket", prefix: s3CachePrefix, index: map[string]*cacheEntry{}}
	s.warmIndex(5 * time.Second)
	count, size := s.Stat()
	if count != 1 || size != 5 || s.index[strings.TrimPrefix(key, s3CachePrefix)] == nil {
		t.Fatalf("incorrect warmed index: count=%d size=%d index=%v", count, size, s.index)
	}
	s.sweep()
	if count, _ := s.Stat(); count != 0 {
		t.Fatalf("expired tag still indexed: count=%d", count)
	}
	select {
	case path := <-deleted:
		if path != "/bucket/"+key {
			t.Fatalf("deleted wrong object: %s", path)
		}
	default:
		t.Fatal("expired tag not deleted")
	}
}

func TestS3CacheEndpointAndPathStyle(t *testing.T) {
	requests := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			requests <- r.URL.Path
		}
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`)
		}
	}))
	defer server.Close()
	c, err := newS3Cache(&CacheConfig{Provider: "aliyun", Endpoint: server.URL, Bucket: "bucket", Region: "us-east-1", AccessKey: "ak", SecretKey: "sk", PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	defer c.stop()
	if c.client.EndpointURL().Scheme != "http" {
		t.Fatalf("HTTP endpoint ignored: %s", c.client.EndpointURL())
	}
	select {
	case path := <-requests:
		if path != "/bucket/" {
			t.Fatalf("path-style endpoint ignored: %q", path)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("bucket check not sent")
	}
	_, err = newS3Cache(&CacheConfig{Endpoint: "ftp://example.com", Bucket: "bucket"})
	if err == nil {
		t.Fatal("invalid endpoint accepted")
	}
}

// TestCacheSigS3 验证 S3 连接参数变化会触发缓存重建（区分于单纯的启用开关）。
func TestCacheSigS3(t *testing.T) {
	a := &Config{Cache: CacheConfig{Enabled: true, Backend: "s3", Provider: "aliyun", Endpoint: "oss-cn-hangzhou.aliyuncs.com", Bucket: "b1", Region: "cn-hangzhou", AccessKey: "ak"}}
	b := &Config{Cache: CacheConfig{Enabled: true, Backend: "s3", Provider: "aliyun", Endpoint: "oss-cn-hangzhou.aliyuncs.com", Bucket: "b2", Region: "cn-hangzhou", AccessKey: "ak"}}
	if cacheSig(a) == cacheSig(b) {
		t.Errorf("不同 bucket 应产生不同 cacheSig")
	}
	// 仅切换启用开关也应变化
	c := &Config{Cache: CacheConfig{Enabled: false, Backend: "s3", Provider: "aliyun", Endpoint: "oss-cn-hangzhou.aliyuncs.com", Bucket: "b1", Region: "cn-hangzhou", AccessKey: "ak"}}
	if cacheSig(a) == cacheSig(c) {
		t.Errorf("启用开关变化应产生不同 cacheSig")
	}
	d := *a
	d.Cache.SecretKey = "rotated"
	if cacheSig(a) == cacheSig(&d) {
		t.Error("rotating credentials must rebuild S3 client")
	}
	d.Cache.SecretKey = a.Cache.SecretKey
	d.Cache.PathStyle = true
	if cacheSig(a) == cacheSig(&d) {
		t.Error("changing path style must rebuild S3 client")
	}
}

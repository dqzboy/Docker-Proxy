package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

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

// TestSplitMetaValue 验证元数据分块：每块不超过上限、不切断 UTF-8 多字节字符，
// 且拼接后与原文完全一致。
func TestSplitMetaValue(t *testing.T) {
	in := strings.Repeat("报文", 100) + "abc"
	chunks := splitMetaValue(in, 7)
	if strings.Join(chunks, "") != in {
		t.Fatal("chunked metadata does not reassemble to the original value")
	}
	for _, c := range chunks {
		if len(c) > 7 {
			t.Fatalf("chunk %q is %d bytes, want <= 7", c, len(c))
		}
		if !utf8.ValidString(c) {
			t.Fatalf("chunk %q splits a multi-byte rune", c)
		}
	}
	if got := splitMetaValue("", 7); got != nil {
		t.Fatalf("empty value should produce no chunks, got %v", got)
	}
}

// TestS3MetaHeaderRoundTrip 验证分块后的 dp-header-<n> 能被 readMeta 完整还原，
// 同时兼容旧版本写入的单个 dp-header。
func TestS3MetaHeaderRoundTrip(t *testing.T) {
	large := map[string][]string{
		"Content-Type":                 {"application/vnd.oci.image.index.v1+json"},
		"Docker-Content-Digest":        {"sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc"},
		"Ratelimit-Limit":              {"100;w=3600"},
		"Strict-Transport-Security":    {"max-age=31536000"},
		"X-Ratelimit-Remaining":        {"99;w=3600"},
		"X-Docker-Distribution-Header": {strings.Repeat("v", 400)},
	}
	raw, _ := json.Marshal(large)
	chunks := splitMetaValue(string(raw), maxS3MetaValue)
	if len(chunks) < 2 {
		t.Fatalf("expected several chunks for %d bytes of header JSON, got %d", len(raw), len(chunks))
	}
	um := map[string]string{"dp-kind": "manifest"}
	for i, c := range chunks {
		um[fmt.Sprintf("%s-%d", s3MetaHeaderKey, i)] = c
	}
	m := (&s3Cache{}).readMeta(minio.ObjectInfo{Size: 42, UserMetadata: um})
	for k, vv := range large {
		if got := m.Header[k]; len(got) == 0 || got[0] != vv[0] {
			t.Fatalf("header %s not restored: %v", k, got)
		}
	}
	if m.Kind != "manifest" || m.Size != 42 {
		t.Fatalf("metadata lost: kind=%q size=%d", m.Kind, m.Size)
	}
	// Legacy single-value format must keep working.
	legacy := (&s3Cache{}).readMeta(minio.ObjectInfo{UserMetadata: map[string]string{
		"dp-header": `{"Content-Type":["text/plain"]}`,
	}})
	if http.Header(legacy.Header).Get("Content-Type") != "text/plain" {
		t.Fatalf("legacy dp-header not parsed: %v", legacy.Header)
	}
}

// TestS3CacheHeaderIntegrity 验证分块头部写入了块数与 CRC 校验和，且读取端能在
// 分块缺失 / 校验和不符时判定为损坏（而非静默回放无头响应）；同时验证无块数标记
// 的老对象（PR#108 写入格式）仍能 best-effort 还原、不误判损坏。
func TestS3CacheHeaderIntegrity(t *testing.T) {
	large := map[string][]string{
		"Content-Type":          {"application/vnd.oci.image.index.v1+json"},
		"Docker-Content-Digest": {"sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc"},
		"X-Ratelimit-Remaining": {"99;w=3600"},
	}
	raw, _ := json.Marshal(large)
	chunks := splitMetaValue(string(raw), maxS3MetaValue)

	// build 构造一个分块对象；dropChunk 故意少写一个分块，corruptCRC 翻转校验和。
	build := func(dropChunk, corruptCRC bool) minio.ObjectInfo {
		um := map[string]string{"dp-kind": "manifest"}
		n := len(chunks)
		if dropChunk {
			n--
		}
		for i := 0; i < n; i++ {
			um[fmt.Sprintf("%s-%d", s3MetaHeaderKey, i)] = chunks[i]
		}
		um[s3MetaHeaderCount] = strconv.Itoa(len(chunks))
		crc := crc32.ChecksumIEEE(raw)
		if corruptCRC {
			crc ^= 0xffffffff
		}
		um[s3MetaHeaderCRC] = fmt.Sprintf("%08x", crc)
		return minio.ObjectInfo{Size: 42, UserMetadata: um}
	}

	// 1) 完整且校验通过 → 头被还原，无损坏标记。
	ok := (&s3Cache{}).readMeta(build(false, false))
	if ok.HeaderCorrupt {
		t.Fatal("完整分块不应被判为损坏")
	}
	if got := http.Header(ok.Header).Get("Docker-Content-Digest"); got != large["Docker-Content-Digest"][0] {
		t.Fatalf("头未还原: %v", ok.Header)
	}

	// 2) 分块缺失 → 判为损坏。
	if !(&s3Cache{}).readMeta(build(true, false)).HeaderCorrupt {
		t.Fatal("缺失分块应判为损坏")
	}

	// 3) 校验和不匹配 → 判为损坏。
	if !(&s3Cache{}).readMeta(build(false, true)).HeaderCorrupt {
		t.Fatal("CRC 不匹配应判为损坏")
	}

	// 4) 无 dp-header-n 的老对象（PR#108 写入格式）→ best-effort 还原，不判损坏。
	legacy := map[string]string{"dp-kind": "manifest"}
	for i, c := range chunks {
		legacy[fmt.Sprintf("%s-%d", s3MetaHeaderKey, i)] = c
	}
	lg := (&s3Cache{}).readMeta(minio.ObjectInfo{UserMetadata: legacy})
	if lg.HeaderCorrupt {
		t.Fatal("无块数标记的老分块对象不应判为损坏")
	}
	if got := http.Header(lg.Header).Get("Content-Type"); got != large["Content-Type"][0] {
		t.Fatalf("老分块对象头未还原: %v", lg.Header)
	}
}

// TestS3CacheLargeHeadersWithMetaLimit 复现真实故障：部分 S3 兼容服务（Ceph RGW +
// nginx）会拒绝长度超过 256 字节的单条 x-amz-meta-* 值并返回 400 InvalidURI。
// Docker Hub 的响应头 JSON 约 700 字节，修复前每次缓存写入都会失败，表现为
// "缓存已启用但对象永远写不进去、命中率恒为 0"。
func TestS3CacheLargeHeadersWithMetaLimit(t *testing.T) {
	const key = "t/docker/library/nginx/latest"
	var mu sync.Mutex
	var body []byte
	var metadata http.Header
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if r.URL.Path != "/bucket/"+s3CachePrefix+key {
			http.Error(w, "wrong key", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodPut:
			for k, vv := range r.Header {
				if !strings.HasPrefix(strings.ToLower(k), "x-amz-meta-") {
					continue
				}
				for _, v := range vv {
					if len(v) > 256 {
						w.Header().Set("Content-Type", "text/xml")
						w.WriteHeader(http.StatusBadRequest)
						_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?><Error><Code>InvalidURI</Code><Message>Could not parse the specified URI</Message></Error>`)
						return
					}
				}
			}
			body, _ = io.ReadAll(r.Body)
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
	// Realistic Docker Hub manifest response headers (~700 bytes as JSON).
	hdr := http.Header{
		"Content-Length":                  {"9226"},
		"Content-Type":                    {"application/vnd.oci.image.index.v1+json"},
		"Date":                            {"Sat, 17 Oct 2026 17:52:37 GMT"},
		"Docker-Content-Digest":           {"sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc"},
		"Docker-Distribution-Api-Version": {"registry/2.0"},
		"Docker-Ratelimit-Source":         {"211.75.210.66"},
		"Etag":                            {`"sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc"`},
		"Ratelimit-Limit":                 {"100;w=3600"},
		"Ratelimit-Remaining":             {"99;w=3600"},
		"Strict-Transport-Security":       {"max-age=31536000"},
		"X-Ratelimit-Limit":               {"100;w=3600"},
		"X-Ratelimit-Remaining":           {"99;w=3600"},
	}
	w, err := s.Writer(key, hdr, "sha256:abc", "manifest", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte(`{"schemaVersion":2}`)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("cache upload rejected by provider metadata limit: %v", err)
	}
	var chunkCount int
	for k, vv := range metadata {
		lk := strings.ToLower(k)
		// Skip the integrity-control keys added alongside the data chunks.
		if lk == "x-amz-meta-dp-header-n" || lk == "x-amz-meta-dp-header-crc" {
			continue
		}
		if strings.HasPrefix(lk, "x-amz-meta-dp-header-") {
			chunkCount++
			if len(vv[0]) > maxS3MetaValue {
				t.Fatalf("metadata chunk %s is %d bytes, limit %d", k, len(vv[0]), maxS3MetaValue)
			}
		}
	}
	if chunkCount < 2 {
		t.Fatalf("expected chunked header metadata, got %d chunks", chunkCount)
	}
	obj, ok := s.Open(key, time.Hour)
	if !ok {
		t.Fatal("S3 cache miss after successful upload")
	}
	defer obj.Reader.Close()
	if got := obj.Header.Get("Content-Type"); got != hdr.Get("Content-Type") {
		t.Fatalf("replayed Content-Type = %q, want %q", got, hdr.Get("Content-Type"))
	}
	if got := obj.Header.Get("Docker-Content-Digest"); got != hdr.Get("Docker-Content-Digest") {
		t.Fatalf("replayed Docker-Content-Digest = %q", got)
	}
}

// TestListObjectKey 验证列表返回的 URL 编码 key 会被还原。部分 S3 兼容网关在
// encoding-type=url 时编码对象名，却不在响应里回显 EncodingType，minio-go 因此
// 无法自动解码；若不还原，warmIndex 会把同一个对象记成两条、Clear 也会删错对象。
func TestListObjectKey(t *testing.T) {
	cases := map[string]string{
		"b/repo/sha256:abc":   "b/repo/sha256:abc",
		"b/repo/sha256%3Aabc": "b/repo/sha256:abc",
		"t/repo/latest":       "t/repo/latest",
		"weird%nothex":        "weird%nothex",
	}
	for in, want := range cases {
		if got := listObjectKey(in); got != want {
			t.Errorf("listObjectKey(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestS3CacheWarmIndexDecodesEncodedKeys 复现网关不回显 EncodingType 的情况：
// 列表里的 key 是 "sha256%3A..."，预热后索引必须使用解码后的 key，否则后续
// Open 会因为 key 不匹配而重复计数（entries/sizeBytes 翻倍）。
func TestS3CacheWarmIndexDecodesEncodedKeys(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !r.URL.Query().Has("list-type") {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/xml")
		// 故意不带 <EncodingType>url</EncodingType>，模拟该网关的响应。
		fmt.Fprintf(w, `<ListBucketResult><Name>bucket</Name><Prefix>%s</Prefix><KeyCount>1</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated><Contents><Key>%sb/dockerhub/library/alpine/sha256%%3Aabc</Key><LastModified>2026-10-17T00:00:00.000Z</LastModified><ETag>"abc"</ETag><Size>7</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>`, s3CachePrefix, s3CachePrefix)
	}))
	defer server.Close()
	client, err := minio.New(strings.TrimPrefix(server.URL, "http://"), &minio.Options{Creds: credentials.NewStaticV4("ak", "sk", ""), Secure: false, Region: "us-east-1", BucketLookup: minio.BucketLookupPath})
	if err != nil {
		t.Fatal(err)
	}
	s := &s3Cache{client: client, bucket: "bucket", prefix: s3CachePrefix, index: map[string]*cacheEntry{}}
	s.warmIndex(5 * time.Second)
	wantKey := "b/dockerhub/library/alpine/sha256:abc"
	if _, ok := s.index[wantKey]; !ok {
		t.Fatalf("warmIndex did not decode key, index=%v", s.index)
	}
	if count, size := s.Stat(); count != 1 || size != 7 {
		t.Fatalf("warmIndex counted encoded/duplicate entries: count=%d size=%d", count, size)
	}
}

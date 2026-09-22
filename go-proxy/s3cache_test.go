package main

import (
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
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
}

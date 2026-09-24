/**
 * 多 Registry 搜索服务模块
 * 支持 ghcr.io、k8s.gcr.io、quay.io、gcr.io、Elastic、mcr 等公共 Registry 平台
 */
const axios = require('axios');
const logger = require('../logger');
const crypto = require('crypto');

// HTTP 请求配置。出站代理由 server.js 的 Axios 请求拦截器统一处理，
// HTTPS 经 HTTP 代理时通过 CONNECT 隧道，NO_PROXY 目标直连。
const httpOptions = {
  timeout: 15000,
  headers: {
    'User-Agent': 'RegistrySearchClient/1.0',
    'Accept': 'application/json'
  }
};

const OCI_MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.v1+json'
].join(', ');

function parsePositiveIntEnv(name, fallback, minimum = 1) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

const OCI_TAG_LIST_PAGE_SIZE = parsePositiveIntEnv('REGISTRY_TAG_LIST_PAGE_SIZE', 100);
let MAX_OCI_TAGS = parsePositiveIntEnv('REGISTRY_TAGS_MAX', 5000);
let OCI_TAG_CACHE_TTL_MS = parsePositiveIntEnv(
  'REGISTRY_TAG_CACHE_TTL_MS',
  30 * 60 * 1000
);
let OCI_METADATA_CONCURRENCY = parsePositiveIntEnv(
  'REGISTRY_TAG_METADATA_CONCURRENCY',
  8
);
let REGISTRY_CACHE_MAX_ENTRIES = parsePositiveIntEnv(
  'REGISTRY_CACHE_MAX_ENTRIES',
  512
);
let REGISTRY_TOKEN_CACHE_MAX_ENTRIES = parsePositiveIntEnv(
  'REGISTRY_TOKEN_CACHE_MAX_ENTRIES',
  256
);
let REGISTRY_CACHE_CLEANUP_INTERVAL_MS = parsePositiveIntEnv(
  'REGISTRY_CACHE_CLEANUP_INTERVAL_MS',
  60 * 1000
);
const TOKEN_CACHE_SKEW_MS = 30 * 1000;
const FULL_METADATA_SORT_REGISTRIES = new Set(['ghcr']);
const INCLUDE_DIGEST_LIKE_TAGS = process.env.REGISTRY_INCLUDE_DIGEST_TAGS === 'true';
const INCLUDE_QUAY_ARTIFACT_TAGS = process.env.REGISTRY_INCLUDE_QUAY_ARTIFACT_TAGS === 'true';

/**
 * Small TTL-aware LRU cache.
 *
 * Map preserves insertion order, so deleting and re-inserting a hit moves it
 * to the MRU end. This gives us both bounded growth and cheap eviction without
 * adding another dependency to the UI image.
 */
class TtlLruCache {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Mark the entry as recently used.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key, value, ttlMs) {
    const ttl = Number(ttlMs);
    if (!Number.isFinite(ttl) || ttl <= 0) return value;

    // Re-inserting an existing key must also refresh its LRU position.
    this.store.delete(key);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
    this.evictOverflow();
    return value;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  resize(maxEntries) {
    this.maxEntries = maxEntries;
    this.evictOverflow();
  }

  cleanup(now = Date.now()) {
    for (const [key, hit] of this.store) {
      if (hit.expiresAt <= now) this.store.delete(key);
    }
    this.evictOverflow();
  }

  evictOverflow() {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  get size() {
    return this.store.size;
  }
}

const cacheStore = new TtlLruCache(REGISTRY_CACHE_MAX_ENTRIES);
const tokenCache = new TtlLruCache(REGISTRY_TOKEN_CACHE_MAX_ENTRIES);
const credentialRefreshThrottle = new TtlLruCache(REGISTRY_TOKEN_CACHE_MAX_ENTRIES);
const GITHUB_PACKAGE_CACHE_TTL_MS = parsePositiveIntEnv(
  'GITHUB_PACKAGE_CACHE_TTL_MS',
  30 * 60 * 1000
);
// 拉取 GitHub releases 时的分页上限，防止 Link 头异常导致无限翻页。
const GITHUB_RELEASE_MAX_PAGES = parsePositiveIntEnv('GITHUB_RELEASE_MAX_PAGES', 20);

function getCache(key) {
  const value = cacheStore.get(key);
  return value === undefined ? null : value;
}

function setCache(key, value, ttlMs = OCI_TAG_CACHE_TTL_MS) {
  return cacheStore.set(key, value, ttlMs);
}

// Expiry is normally checked lazily on reads, but a periodic sweep releases
// expired arrays/tokens even when a cache key is never requested again.
let cacheCleanupTimer = null;

function startCacheCleanupTimer() {
  if (cacheCleanupTimer) clearInterval(cacheCleanupTimer);
  cacheCleanupTimer = setInterval(() => {
    cacheStore.cleanup();
    tokenCache.cleanup();
    credentialRefreshThrottle.cleanup();
  }, REGISTRY_CACHE_CLEANUP_INTERVAL_MS);
  cacheCleanupTimer.unref?.();
}

function clearRegistryCaches() {
  cacheStore.clear();
  tokenCache.clear();
  credentialRefreshThrottle.clear();
}

function applyRuntimeSettings(settings = {}) {
  MAX_OCI_TAGS = settings.registryTagsMax || MAX_OCI_TAGS;
  OCI_TAG_CACHE_TTL_MS = settings.registryTagCacheTtlMs || OCI_TAG_CACHE_TTL_MS;
  OCI_METADATA_CONCURRENCY = settings.registryTagMetadataConcurrency || OCI_METADATA_CONCURRENCY;
  REGISTRY_CACHE_MAX_ENTRIES = settings.registryCacheMaxEntries || REGISTRY_CACHE_MAX_ENTRIES;
  REGISTRY_TOKEN_CACHE_MAX_ENTRIES = settings.registryTokenCacheMaxEntries || REGISTRY_TOKEN_CACHE_MAX_ENTRIES;
  REGISTRY_CACHE_CLEANUP_INTERVAL_MS = settings.registryCacheCleanupIntervalMs || REGISTRY_CACHE_CLEANUP_INTERVAL_MS;

  cacheStore.resize(REGISTRY_CACHE_MAX_ENTRIES);
  tokenCache.resize(REGISTRY_TOKEN_CACHE_MAX_ENTRIES);
  credentialRefreshThrottle.resize(REGISTRY_TOKEN_CACHE_MAX_ENTRIES);
  clearRegistryCaches();
  startCacheCleanupTimer();
}

function getRuntimeSettingsSnapshot() {
  return {
    registryTagsMax: MAX_OCI_TAGS,
    registryTagCacheTtlMs: OCI_TAG_CACHE_TTL_MS,
    registryTagMetadataConcurrency: OCI_METADATA_CONCURRENCY,
    registryCacheMaxEntries: REGISTRY_CACHE_MAX_ENTRIES,
    registryTokenCacheMaxEntries: REGISTRY_TOKEN_CACHE_MAX_ENTRIES,
    registryCacheCleanupIntervalMs: REGISTRY_CACHE_CLEANUP_INTERVAL_MS
  };
}

startCacheCleanupTimer();

/**
 * 将官方镜像（isOfficial === true）稳定地排到结果列表最前面，组内保持原有相对顺序。
 * 满足「官方镜像优先展示」的需求。
 * @param {Array} results
 * @returns {Array}
 */
function sortByOfficial(results) {
  if (!Array.isArray(results) || !results.length) return results;
  return results
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const ae = a.item.isExactMatch ? 1 : 0;
      const be = b.item.isExactMatch ? 1 : 0;
      if (be !== ae) return be - ae; // 用户输入的精确镜像优先
      const ao = a.item.isOfficial ? 1 : 0;
      const bo = b.item.isOfficial ? 1 : 0;
      if (bo !== ao) return bo - ao; // 官方(权重 1)排前面
      return a.idx - b.idx;          // 同组保持原顺序（稳定排序，不依赖引擎实现）
    })
    .map(x => x.item);
}

// Registry 平台配置
const REGISTRY_CONFIGS = {
  'docker-hub': {
    name: 'Docker Hub',
    icon: 'fab fa-docker',
    color: '#2496ED',
    searchUrl: 'https://hub.docker.com/v2/search/repositories/',
    tagsUrl: 'https://hub.docker.com/v2/repositories/{namespace}/{repo}/tags',
    prefix: '',
    description: 'Docker 官方镜像仓库'
  },
  'ghcr': {
    name: 'GitHub Container Registry',
    icon: 'fab fa-github',
    color: '#333',
    // GHCR 没有直接的搜索API，使用 GitHub API 搜索包含 container 的仓库
    searchUrl: 'https://api.github.com/search/repositories',
    tagsUrl: 'https://ghcr.io/v2/{namespace}/{repo}/tags/list',
    prefix: 'ghcr.io',
    description: 'GitHub 容器镜像仓库'
  },
  'quay': {
    name: 'Quay.io',
    icon: 'fas fa-cube',
    color: '#40B4E5',
    searchUrl: 'https://quay.io/api/v1/find/repositories',
    tagsUrl: 'https://quay.io/api/v1/repository/{namespace}/{repo}/tag/',
    prefix: 'quay.io',
    description: 'Red Hat Quay 容器镜像仓库'
  },
  'gcr': {
    name: 'Google Container Registry',
    icon: 'fab fa-google',
    color: '#4285F4',
    // GCR 没有公开的搜索 API，使用静态列表
    catalogUrl: 'https://gcr.io/v2/_catalog',
    tagsUrl: 'https://gcr.io/v2/{namespace}/{repo}/tags/list',
    prefix: 'gcr.io',
    description: 'Google 容器镜像仓库'
  },
  'k8s': {
    name: 'Kubernetes Registry',
    icon: 'fas fa-dharmachakra',
    color: '#326CE5',
    // K8s 镜像现在在 registry.k8s.io
    catalogUrl: 'https://registry.k8s.io/v2/_catalog',
    tagsUrl: 'https://registry.k8s.io/v2/{repo}/tags/list',
    prefix: 'registry.k8s.io',
    description: 'Kubernetes 官方镜像仓库'
  },
  'mcr': {
    name: 'Microsoft Container Registry',
    icon: 'fab fa-microsoft',
    color: '#00A4EF',
    // MCR 使用 Docker Hub 风格的 API
    catalogUrl: 'https://mcr.microsoft.com/v2/_catalog',
    tagsUrl: 'https://mcr.microsoft.com/v2/{repo}/tags/list',
    prefix: 'mcr.microsoft.com',
    description: 'Microsoft 容器镜像仓库'
  },
  'elastic': {
    name: 'Elastic Container Registry',
    icon: 'fas fa-bolt',
    color: '#FEC514',
    // Elastic 镜像托管在 docker.elastic.co
    catalogUrl: 'https://docker.elastic.co/v2/_catalog',
    tagsUrl: 'https://docker.elastic.co/v2/{repo}/tags/list',
    prefix: 'docker.elastic.co',
    description: 'Elastic 官方镜像仓库'
  },
  'nvcr': {
    name: 'NVIDIA Container Registry',
    icon: 'fas fa-microchip',
    color: '#76B900',
    catalogUrl: 'https://nvcr.io/v2/_catalog',
    tagsUrl: 'https://nvcr.io/v2/{namespace}/{repo}/tags/list',
    prefix: 'nvcr.io',
    description: 'NVIDIA GPU 容器镜像仓库'
  }
};

// 支持精确镜像探测的 Registry。对于没有公开「全文搜索」API 的平台，
// 用户输入 owner/repo、group/image 或带 registry/tag 的完整引用时，直接用
// OCI tags/list 验证镜像是否存在，比依赖静态列表更可靠。
const EXACT_LOOKUP_REGISTRIES = new Set(['ghcr', 'quay', 'gcr', 'k8s', 'mcr', 'elastic', 'nvcr']);

const REGISTRY_HOST_ALIASES = {
  'docker-hub': ['registry-1.docker.io', 'docker.io', 'index.docker.io'],
  'ghcr': ['ghcr.io'],
  'quay': ['quay.io'],
  'gcr': ['gcr.io'],
  'k8s': ['registry.k8s.io', 'k8s.gcr.io'],
  'mcr': ['mcr.microsoft.com'],
  'elastic': ['docker.elastic.co'],
  'nvcr': ['nvcr.io']
};

// registry.k8s.io 的 tags/list 会 307 跳转到 Google Artifact Registry。
// 在部分网络环境里该跳转目标不可达时，核心控制平面镜像可退回到
// Kubernetes GitHub release tags 作为兜底，避免整页标签视图报错。
const K8S_RELEASE_TAG_SOURCES = {
  'kube-apiserver': 'kubernetes/kubernetes',
  'kube-controller-manager': 'kubernetes/kubernetes',
  'kube-scheduler': 'kubernetes/kubernetes',
  'kube-proxy': 'kubernetes/kubernetes'
};

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

// registry.k8s.io 的 307 目标是一批完全不同的主机：tags/manifests 跳到
// us-west2-docker.pkg.dev，blobs 跳到 cdn.registry.k8s.io。Registry 的
// Authorization 只对原主机有效，转发过去既没有意义，也可能在部分代理环境下
// 引发 TLS/连接异常，更不该把凭证交给第三方主机——这一点在 fetchBlob 里已经
// 有明确约定，手工跟随的链路必须保持一致。
function stripCrossHostAuth(currentUrl, nextUrl, requestOptions) {
  let crossHost = false;
  try {
    crossHost = new URL(nextUrl, currentUrl).host !== new URL(currentUrl).host;
  } catch {
    crossHost = true;
  }
  if (!crossHost) return requestOptions;

  const headers = { ...(requestOptions.headers || {}) };
  delete headers.Authorization;
  delete headers.authorization;
  delete headers.Cookie;
  delete headers.cookie;
  return { ...requestOptions, headers };
}

async function requestWithManualRedirects(url, requestOptions, maxRedirects = 3) {
  let currentUrl = url;
  let currentOptions = { ...requestOptions, maxRedirects: 0 };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await axios.get(currentUrl, {
      ...currentOptions,
      validateStatus: status => (status >= 200 && status < 300) || isRedirectStatus(status)
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers?.location;
    if (!location) {
      // 重定向状态码不带 Location 属于协议错误，按成功返回会让调用方拿到空 data 却无从察觉。
      throw new Error(`registry 返回 ${response.status} 重定向但未携带 Location: ${currentUrl}`);
    }

    const nextUrl = new URL(location, currentUrl).toString();
    currentOptions = stripCrossHostAuth(currentUrl, nextUrl, currentOptions);
    currentUrl = nextUrl;
  }

  throw new Error(`registry.k8s.io 重定向次数过多，无法完成请求: ${url}`);
}

function getRegistryBaseUrl(registryId) {
  const prefix = REGISTRY_CONFIGS[registryId]?.prefix;
  if (!prefix) throw new Error(`Registry ${registryId} 缺少 prefix 配置`);
  return `https://${prefix}`;
}

function encodeImagePath(imageName) {
  return String(imageName || '')
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/');
}

function encodeRegistryReference(reference) {
  const ref = String(reference || '');
  if (/^[A-Za-z][A-Za-z0-9_+.-]*:[A-Za-z0-9=_+.-]+$/.test(ref)) {
    // digest（如 sha256:xxx）中的冒号需要原样保留
    return ref;
  }
  return encodeURIComponent(ref);
}

function isDigestLikeTag(tag) {
  return /^sha256[-:][0-9a-f]{64}$/i.test(String(tag || ''));
}

// Cosign 签名 / SLSA 证明会产生 sha256-xxx.sig、sha256-xxx.att 这类附属 tag。
// registry.k8s.io 的 tags/list 会把它们和正常版本 tag 混在一起返回（kube-proxy
// 实测 1421 个 tag 中有 295 个是 .sig），不过滤会虚高 count 并让尾部分页出现整屏签名。
function isSignatureArtifactTag(tag) {
  return /\.(att|sig)$/i.test(String(tag || '').trim());
}

// 这些 Registry 的 tags/list 会混出签名 tag，且没有像 Quay 那样的
// onlyActiveTags 参数可用，只能在客户端过滤。
const SIGNATURE_TAG_FILTERED_REGISTRIES = new Set(['k8s']);

function isQuayArtifactTag(tag) {
  return isSignatureArtifactTag(tag);
}

function isValidDate(value) {
  if (!value) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

function normalizeDate(value) {
  return isValidDate(value) ? new Date(value).toISOString() : null;
}

function formatPlatform(platform) {
  if (!platform || !platform.os || !platform.architecture) return null;
  const os = String(platform.os).toLowerCase();
  const architecture = String(platform.architecture).toLowerCase();
  if (os === 'unknown' || architecture === 'unknown') return null;
  return {
    os,
    architecture,
    variant: platform.variant ? String(platform.variant).toLowerCase() : ''
  };
}

function uniqPlatforms(platforms) {
  const seen = new Set();
  const result = [];
  for (const platform of platforms || []) {
    const p = formatPlatform(platform);
    if (!p) continue;
    const key = `${p.os}/${p.architecture}${p.variant ? `/${p.variant}` : ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

function getManifestAnnotationDate(manifest) {
  const annotations = manifest?.annotations || {};
  return normalizeDate(
    annotations['org.opencontainers.image.created'] ||
    annotations['org.label-schema.build-date'] ||
    annotations.created
  );
}

function getConfigCreated(config) {
  const labels = config?.config?.Labels || {};
  return normalizeDate(
    config?.created ||
    labels['org.opencontainers.image.created'] ||
    labels['org.label-schema.build-date'] ||
    labels.build_date
  );
}

function isImageIndex(manifest, contentType = '') {
  const mediaType = manifest?.mediaType || contentType || '';
  return mediaType.includes('image.index') || mediaType.includes('manifest.list') || Array.isArray(manifest?.manifests);
}

function isImageManifest(manifest, contentType = '') {
  const mediaType = manifest?.mediaType || contentType || '';
  return mediaType.includes('image.manifest') ||
    mediaType.includes('manifest.v2') ||
    Boolean(manifest?.config || manifest?.layers);
}

function selectPlatformManifest(manifests = []) {
  const usable = manifests.filter(item => formatPlatform(item.platform));
  if (!usable.length) return manifests[0] || null;
  return usable.find(item => {
    const p = formatPlatform(item.platform);
    return p && p.os === 'linux' && p.architecture === 'amd64';
  }) || usable[0];
}

function compareVersionTags(a, b) {
  const pa = parseVersionTag(a);
  const pb = parseVersionTag(b);
  if (pa && pb) {
    for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
      const av = pa.nums[i] ?? -1;
      const bv = pb.nums[i] ?? -1;
      if (av !== bv) return bv - av;
    }
    if (pa.pre !== pb.pre) {
      if (!pa.pre) return -1;
      if (!pb.pre) return 1;
      return pb.pre.localeCompare(pa.pre);
    }
  } else if (pa) {
    return -1;
  } else if (pb) {
    return 1;
  }
  return 0;
}

function parseVersionTag(tag) {
  const match = String(tag || '').match(/^v?(\d+(?:\.\d+){0,3})(?:[-_]([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    nums: match[1].split('.').map(n => Number(n)),
    pre: match[2] || ''
  };
}

function compareTagItems(a, b) {
  // GHCR 会暴露 sha256-xxx 这类 digest 辅助 tag；它们可保留但不应压过正常版本号。
  const ad = isDigestLikeTag(a.name) ? 1 : 0;
  const bd = isDigestLikeTag(b.name) ? 1 : 0;
  if (ad !== bd) return ad - bd;

  const aversion = parseVersionTag(a.name);
  const bversion = parseVersionTag(b.name);
  // 正式版本号优先于 latest/main/release、PR、commit 等流水线 tag。
  // 这样首屏先显示 v1.91.1 / 1.91.1，而不是最近更新的 main 或 pr-*。
  if (Boolean(aversion) !== Boolean(bversion)) {
    return aversion ? -1 : 1;
  }
  if (aversion && bversion) {
    // 生产版优先于预发布版。比如 v3.1.0 是当前稳定版时，
    // v3.2.0-rc.1 不应因为数字更大而压到稳定版前面。
    if (Boolean(aversion.pre) !== Boolean(bversion.pre)) {
      return aversion.pre ? 1 : -1;
    }
    const versionCmp = compareVersionTags(a.name, b.name);
    if (versionCmp !== 0) return versionCmp;
  }

  const at = a.lastUpdated ? Date.parse(a.lastUpdated) : 0;
  const bt = b.lastUpdated ? Date.parse(b.lastUpdated) : 0;
  if (at && bt && at !== bt) return bt - at;
  if (at && !bt) return -1;
  if (!at && bt) return 1;

  // 同一 manifest 常有 latest 与版本号两个 tag；版本号已在上面优先，
  // 对剩余非版本 tag 让 latest 靠前。
  const al = a.name === 'latest' ? 1 : 0;
  const bl = b.name === 'latest' ? 1 : 0;
  if (al !== bl) return bl - al;

  // tags/list 在 GHCR 中常见为创建顺序，兜底时反向显示更接近「最新优先」。
  return (b.originalIndex || 0) - (a.originalIndex || 0);
}

async function mapLimit(items, concurrency, iteratee) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), list.length) }, async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      results[idx] = await iteratee(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}


/**
 * 标准化用户输入的镜像引用：
 * - ghcr.io/tale/headplane:0.7.1 -> tale/headplane
 * - https://quay.io/prometheus/prometheus -> prometheus/prometheus
 * - dotnet/sdk@sha256:... -> dotnet/sdk
 *
 * 这里不把未知的「带点域名」强行剥掉，避免误伤合法命名空间；后台代理域名
 * 仍建议用户在对应平台 chip 下输入上游路径（如 tale/headplane）。
 */
function normalizeRegistrySearchTerm(registryId, term) {
  const raw = String(term || '').trim();
  let value = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];

  let hadExplicitHost = false;
  let hadTagOrDigest = false;
  const aliases = new Set(REGISTRY_HOST_ALIASES[registryId] || []);
  const configuredPrefix = REGISTRY_CONFIGS[registryId]?.prefix;
  if (configuredPrefix) aliases.add(configuredPrefix);

  for (const host of Array.from(aliases).filter(Boolean).sort((a, b) => b.length - a.length)) {
    const lower = value.toLowerCase();
    const hostLower = host.toLowerCase();
    if (lower === hostLower) {
      value = '';
      hadExplicitHost = true;
      break;
    }
    if (lower.startsWith(`${hostLower}/`)) {
      value = value.slice(host.length + 1);
      hadExplicitHost = true;
      break;
    }
  }

  // 兼容粘贴 Registry API URL 的路径片段：/v2/<name>/tags/list
  value = value.replace(/^v2\//i, '').replace(/\/tags\/list$/i, '');

  const digestIdx = value.indexOf('@');
  if (digestIdx >= 0) {
    value = value.slice(0, digestIdx);
    hadTagOrDigest = true;
  }

  const lastSlash = value.lastIndexOf('/');
  const lastColon = value.lastIndexOf(':');
  // 只剥离最后一个 path segment 上的 tag，避免把 host:port 当成 tag。
  if (lastColon > lastSlash) {
    value = value.slice(0, lastColon);
    hadTagOrDigest = true;
  }

  value = value.replace(/^\/+|\/+$/g, '');

  return {
    raw,
    imageName: value,
    hadExplicitHost,
    hadTagOrDigest
  };
}

function shouldAttemptExactLookup(registryId, normalized) {
  if (!EXACT_LOOKUP_REGISTRIES.has(registryId)) return false;
  if (!normalized || !normalized.imageName) return false;
  if (/\s/.test(normalized.imageName)) return false;
  return normalized.hadExplicitHost || normalized.hadTagOrDigest || normalized.imageName.includes('/');
}

function buildRegistryTagsUrl(registryId, imageName) {
  const config = REGISTRY_CONFIGS[registryId];
  if (!config || !config.tagsUrl) {
    throw new Error(`Registry ${registryId} 不支持获取标签`);
  }

  const normalized = normalizeRegistrySearchTerm(registryId, imageName).imageName;
  if (!normalized) {
    throw new Error(`镜像名称不能为空`);
  }

  // 形如 ghcr.io/v2/{namespace}/{repo}/tags/list 的模板需要拆出首段 namespace，
  // repo 允许保留剩余多级路径。此前这里无条件 split('/')，导致 mcr/dotnet/sdk
  // 这类 {repo} 模板被错误拼成 /v2/sdk/tags/list。
  if (config.tagsUrl.includes('{namespace}')) {
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`${config.name} 镜像名需包含命名空间，例如 namespace/repository`);
    }
    const namespace = encodeURIComponent(parts[0]);
    const repo = encodeImagePath(parts.slice(1).join('/'));
    return config.tagsUrl
      .replace('{namespace}', namespace)
      .replace('{repo}', repo);
  }

  return config.tagsUrl.replace('{repo}', encodeImagePath(normalized));
}

function withQueryParam(url, key, value) {
  const u = new URL(url);
  u.searchParams.set(key, String(value));
  return u.toString();
}

function parseNextLink(linkHeader, currentUrl) {
  if (!linkHeader) return '';
  const parts = String(linkHeader).split(',');
  for (const part of parts) {
    if (!/rel="?next"?/i.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    return new URL(match[1], currentUrl).toString();
  }
  return '';
}

async function fetchAllOCITagNames(registryId, imageName) {
  const filterSignatures = SIGNATURE_TAG_FILTERED_REGISTRIES.has(registryId) && !INCLUDE_DIGEST_LIKE_TAGS;
  const cacheKey = `oci-tags:names:${registryId}:${imageName}:${MAX_OCI_TAGS}:sig=${filterSignatures ? 'off' : 'on'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let url = withQueryParam(buildRegistryTagsUrl(registryId, imageName), 'n', OCI_TAG_LIST_PAGE_SIZE);
  const tags = [];
  const seen = new Set();

  while (url && tags.length < MAX_OCI_TAGS) {
    const response = await fetchWithRegistryAuth(url, registryId, imageName);
    const batch = Array.isArray(response.data?.tags) ? response.data.tags : [];
    for (const tag of batch) {
      const name = typeof tag === 'string' ? tag : tag?.name;
      if (!name || seen.has(name)) continue;
      if (filterSignatures && isSignatureArtifactTag(name)) continue;
      seen.add(name);
      tags.push(name);
      if (tags.length >= MAX_OCI_TAGS) break;
    }

    const next = parseNextLink(response.headers?.link, url);
    if (!next || !batch.length) break;
    url = next;
  }

  return setCache(cacheKey, tags);
}

function getKnownTokenChallenge(registryId, imageName) {
  const prefix = REGISTRY_CONFIGS[registryId]?.prefix;
  if (!prefix || !imageName) return null;

  switch (registryId) {
    case 'ghcr':
      return {
        realm: 'https://ghcr.io/token',
        service: 'ghcr.io',
        scope: `repository:${imageName}:pull`
      };
    case 'quay':
      return {
        realm: 'https://quay.io/v2/auth',
        service: 'quay.io',
        scope: `repository:${imageName}:pull`
      };
    case 'nvcr':
      return {
        realm: 'https://nvcr.io/proxy_auth',
        service: '',
        scope: `repository:${imageName}:pull`
      };
    default:
      return null;
  }
}

function tokenCacheKey(registryId, realm, service, scope, cred) {
  const credentialFingerprint = cred?.password
    ? crypto.createHash('sha256').update(String(cred.password)).digest('hex')
    : '';
  return [
    registryId,
    realm || '',
    service || '',
    scope || '',
    cred?.username || '',
    credentialFingerprint
  ].join('|');
}

function getCachedToken(key) {
  return tokenCache.get(key)?.token || '';
}

function setCachedToken(key, token, expiresInSeconds = 300) {
  if (!token) return;
  const ttl = Math.max(30, Number(expiresInSeconds) || 300) * 1000;
  // Keep the existing expiry skew so a token is refreshed before the
  // upstream invalidates it. The LRU cache still owns the actual expiration
  // timestamp and periodic cleanup.
  tokenCache.set(key, { token }, Math.max(1, ttl - TOKEN_CACHE_SKEW_MS));
}

async function requestBearerToken(registryId, challenge, opts, attempt = 0) {
  const { realm, service, scope } = challenge || {};
  if (!realm) return '';

  const cred = await getCredentialForAuth(registryId, { refresh: attempt > 0 });
  const key = tokenCacheKey(registryId, realm, service, scope, cred);
  const cached = getCachedToken(key);
  if (cached) return cached;

  const tokenUrl = new URL(realm);
  if (scope) tokenUrl.searchParams.set('scope', scope);
  if (service) tokenUrl.searchParams.set('service', service);

  const tokenOpts = {
    ...httpOptions,
    timeout: opts?.timeout || httpOptions.timeout,
    headers: { ...httpOptions.headers, Accept: 'application/json' }
  };
  if (cred) {
    tokenOpts.headers.Authorization =
      'Basic ' + Buffer.from(`${cred.username}:${cred.password}`).toString('base64');
  }

  const tokenResp = await axios.get(tokenUrl.toString(), tokenOpts);
  const token = tokenResp.data && (tokenResp.data.token || tokenResp.data.access_token);
  setCachedToken(key, token, tokenResp.data?.expires_in);
  return token;
}

async function fetchManifest(registryId, imageName, reference) {
  const url = `${getRegistryBaseUrl(registryId)}/v2/${encodeImagePath(imageName)}/manifests/${encodeRegistryReference(reference)}`;
  return await fetchWithRegistryAuth(url, registryId, imageName, {
    headers: { Accept: OCI_MANIFEST_ACCEPT }
  });
}

async function fetchBlob(registryId, imageName, digest) {
  const url = `${getRegistryBaseUrl(registryId)}/v2/${encodeImagePath(imageName)}/blobs/${digest}`;
  const response = await fetchWithRegistryAuth(url, registryId, imageName, {
    maxRedirects: 0,
    validateStatus: status => (status >= 200 && status < 300) || [301, 302, 303, 307, 308].includes(status),
    headers: { Accept: 'application/vnd.oci.image.config.v1+json, application/json, application/octet-stream' }
  });

  // GHCR blob 接口会 307 到 pkg-containers.githubusercontent.com 的签名 URL。
  // 手动跟随一次并去掉 Registry 的 Authorization，避免 follow-redirects 在部分代理
  // 环境中跨主机转发鉴权头导致 TLS/连接异常。
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers?.location) {
    const redirectUrl = new URL(response.headers.location, url).toString();
    return await axios.get(redirectUrl, {
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        Accept: 'application/vnd.oci.image.config.v1+json, application/json, application/octet-stream'
      }
    });
  }

  return response;
}

function getManifestDigest(response) {
  return response?.headers?.['docker-content-digest'] || response?.headers?.etag?.replace(/^"|"$/g, '') || '';
}

async function metadataFromImageManifest(registryId, imageName, manifest, fallbackPlatform = null) {
  const layers = Array.isArray(manifest?.layers) ? manifest.layers : [];
  const size = layers.reduce((sum, layer) => sum + (Number(layer.size) || 0), 0);
  let lastUpdated = getManifestAnnotationDate(manifest);
  let images = fallbackPlatform ? uniqPlatforms([fallbackPlatform]) : [];

  if (manifest?.config?.digest) {
    try {
      const cacheKey = `oci-blob:${registryId}:${imageName}:${manifest.config.digest}`;
      let config = getCache(cacheKey);
      if (!config) {
        const configResp = await fetchBlob(registryId, imageName, manifest.config.digest);
        config = configResp.data;
        setCache(cacheKey, config);
      }

      lastUpdated = getConfigCreated(config) || lastUpdated;
      const configPlatform = formatPlatform({
        os: config?.os,
        architecture: config?.architecture,
        variant: config?.variant
      });
      if (configPlatform && !images.length) images = [configPlatform];
    } catch (error) {
      logger.debug?.(`读取 ${registryId}/${imageName} config blob 失败: ${error.message}`);
    }
  }

  return {
    size: size || manifest?.config?.size || null,
    lastUpdated,
    images
  };
}

async function getOCITagMetadata(registryId, imageName, tagName, originalIndex = 0) {
  const cacheKey = `oci-tag-meta:v2:${registryId}:${imageName}:${tagName}`;
  const cached = getCache(cacheKey);
  if (cached) return { ...cached, originalIndex };

  const base = {
    name: tagName,
    digest: null,
    lastUpdated: null,
    size: null,
    images: [],
    originalIndex
  };

  try {
    const manifestResp = await fetchManifest(registryId, imageName, tagName);
    const manifest = manifestResp.data || {};
    base.digest = getManifestDigest(manifestResp) || null;

    let meta = {
      size: null,
      lastUpdated: getManifestAnnotationDate(manifest),
      images: []
    };

    if (isImageIndex(manifest, manifestResp.headers?.['content-type'])) {
      const manifests = Array.isArray(manifest.manifests) ? manifest.manifests : [];
      meta.images = uniqPlatforms(manifests.map(item => item.platform));

      const selected = selectPlatformManifest(manifests);
      if (selected?.digest && isImageManifest({ mediaType: selected.mediaType })) {
        const digestKey = `oci-manifest-meta:v2:${registryId}:${imageName}:${selected.digest}`;
        let childMeta = getCache(digestKey);
        if (!childMeta) {
          const childResp = await fetchManifest(registryId, imageName, selected.digest);
          childMeta = await metadataFromImageManifest(registryId, imageName, childResp.data || {}, selected.platform);
          setCache(digestKey, childMeta);
        }
        meta = {
          size: childMeta.size || selected.size || meta.size,
          lastUpdated: childMeta.lastUpdated || meta.lastUpdated,
          images: meta.images.length ? meta.images : childMeta.images
        };
      }
    } else if (isImageManifest(manifest, manifestResp.headers?.['content-type'])) {
      meta = await metadataFromImageManifest(registryId, imageName, manifest);
    }

    const enriched = { ...base, ...meta };
    setCache(cacheKey, enriched);
    return enriched;
  } catch (error) {
    logger.warn(`读取 ${registryId}/${imageName}:${tagName} 元数据失败: ${error.message}`);
    // metadataFailed 是给调用方统计「本页有多少条元数据没拿到」用的内部标记。
    // 单个 tag 失败不应该让整页标签视图报错，但也不能让调用方无从区分
    // 「确实没有元数据」和「请求失败了」——后者需要触发回退或降级提示。
    const failed = { ...base, metadataFailed: true };
    setCache(cacheKey, failed, 60 * 1000);
    return failed;
  }
}

async function getEnrichedOCITags(registryId, imageName) {
  const cacheKey = `oci-tags:enriched:v2:${registryId}:${imageName}:${MAX_OCI_TAGS}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const names = await fetchAllOCITagNames(registryId, imageName);
  const friendly = [];
  const digestLike = [];
  names.forEach((name, originalIndex) => {
    (isDigestLikeTag(name) ? digestLike : friendly).push({ name, originalIndex });
  });

  const friendlyItems = await mapLimit(friendly, OCI_METADATA_CONCURRENCY, item =>
    getOCITagMetadata(registryId, imageName, item.name, item.originalIndex)
  );
  const digestItems = INCLUDE_DIGEST_LIKE_TAGS
    ? digestLike.map(item => ({
      name: item.name,
      digest: null,
      lastUpdated: null,
      size: null,
      images: [],
      originalIndex: item.originalIndex
    }))
    : [];

  const items = [...friendlyItems, ...digestItems];

  items.sort(compareTagItems);
  return setCache(cacheKey, items);
}

async function getSortedOCITagNames(registryId, imageName, sourceRepository = '') {
  const normalizedSource = normalizeGitHubRepository(sourceRepository);
  const cacheKey = `oci-tags:sorted-names:v2:${registryId}:${imageName}:${normalizedSource}:${MAX_OCI_TAGS}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const names = await fetchAllOCITagNames(registryId, imageName);
  const releaseNames = registryId === 'ghcr' && normalizedSource
    ? await getGitHubReleaseTagNames(normalizedSource)
    : [];
  const mergedNames = mergeTagNames(names, releaseNames);
  const items = mergedNames
    .filter(name => INCLUDE_DIGEST_LIKE_TAGS || !isDigestLikeTag(name))
    .map((name, originalIndex) => ({
      name,
      originalIndex,
      lastUpdated: null,
      size: null,
      images: []
    }))
    .sort(compareTagItems);

  return setCache(cacheKey, items);
}

function makeRegistrySearchItem(registryId, imageName, extra = {}) {
  const config = REGISTRY_CONFIGS[registryId] || {};
  const parts = String(imageName || '').split('/').filter(Boolean);
  const name = parts.length ? parts[parts.length - 1] : imageName;
  const namespace = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  return {
    name,
    namespace,
    description: extra.description || config.description || '',
    stars: extra.stars || 0,
    pulls: extra.pulls || 0,
    isOfficial: Boolean(extra.isOfficial),
    isAutomated: false,
    isExactMatch: Boolean(extra.isExactMatch),
    fullName: imageName,
    registry: registryId,
    pullCommand: config.prefix ? `${config.prefix}/${imageName}` : imageName,
    url: extra.url
  };
}

function parseQuayImageName(imageName) {
  const normalized = normalizeRegistrySearchTerm('quay', imageName).imageName;
  const parts = normalized.includes('/')
    ? normalized.split('/').filter(Boolean)
    : ['library', normalized];
  const namespace = parts.shift();
  const repo = parts.join('/');
  return { normalized, namespace, repo };
}

async function fetchQuayActiveTagPage(imageName, page = 1, limit = OCI_TAG_LIST_PAGE_SIZE) {
  const { normalized, namespace, repo } = parseQuayImageName(imageName);
  const url = `https://quay.io/api/v1/repository/${encodeURIComponent(namespace)}/${encodeImagePath(repo)}/tag/?onlyActiveTags=true&limit=${limit}&page=${page}`;
  const response = await fetchWithRegistryAuth(url, 'quay', normalized, { skipKnownChallenge: true });
  return { normalized, data: response.data || {} };
}

async function fetchAllQuayActiveTags(imageName) {
  const { normalized } = parseQuayImageName(imageName);
  const cacheKey = `quay-tags:active:${normalized}:${MAX_OCI_TAGS}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const tags = [];
  const seen = new Set();
  let page = 1;

  while (tags.length < MAX_OCI_TAGS) {
    const { data } = await fetchQuayActiveTagPage(normalized, page, OCI_TAG_LIST_PAGE_SIZE);
    const batch = Array.isArray(data.tags) ? data.tags : [];

    for (const tag of batch) {
      const name = tag?.name;
      if (!name || seen.has(name)) continue;
      if (!INCLUDE_QUAY_ARTIFACT_TAGS && isQuayArtifactTag(name)) continue;
      seen.add(name);
      tags.push({
        name,
        digest: tag.manifest_digest || null,
        lastUpdated: tag.last_modified || null,
        size: tag.size ?? null,
        images: [],
        originalIndex: tags.length
      });
      if (tags.length >= MAX_OCI_TAGS) break;
    }

    if (!data.has_additional || !batch.length) break;
    page += 1;
  }

  tags.sort(compareTagItems);
  return setCache(cacheKey, tags);
}

// 标签数据的来源。返回体带上它，前端才能把「registry 真实标签」和
// 「GitHub release 版本号」区分开，避免把后者当成可直接拉取的镜像标签展示。
const REGISTRY_TAG_SOURCE = 'registry';
const K8S_FALLBACK_SOURCE = 'github-release';

async function getK8sReleaseFallbackTags(imageName, page = 1, pageSize = 100) {
  const normalized = normalizeRegistrySearchTerm('k8s', imageName).imageName;
  const sourceRepository = K8S_RELEASE_TAG_SOURCES[normalized];
  if (!sourceRepository) return null;

  const cacheKey = `k8s-release-tags:${normalized}`;
  let items = getCache(cacheKey);
  if (!items) {
    const releases = await getGitHubReleases(sourceRepository);
    if (!releases.length) return null;

    items = releases
      .filter(release => typeof release?.name === 'string' && release.name.trim())
      .map((release, originalIndex) => ({
        name: release.name,
        originalIndex,
        // release 的发布时间不能等同于镜像构建时间，但比整列空着有用得多。
        lastUpdated: release.publishedAt || null,
        size: null,
        images: []
      }))
      .sort(compareTagItems);
    setCache(cacheKey, items, GITHUB_PACKAGE_CACHE_TTL_MS);
  }

  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    registry: 'k8s',
    imageName: normalized,
    source: K8S_FALLBACK_SOURCE,
    degraded: true,
    count: items.length,
    results: pageItems.map(item => ({
      name: item.name,
      digest: null,
      lastUpdated: item.lastUpdated || null,
      size: item.size || null,
      images: item.images || []
    })),
    next: start + pageSize < items.length ? page + 1 : null,
    previous: page > 1 ? page - 1 : null
  };
}

// 回退自身失败（GitHub 不可达 / 限流 / 返回异常结构）时不能顶掉原始的
// registry 错误，否则用户会看到一个和真实问题毫无关系的报错。
async function tryK8sReleaseFallback(imageName, page, pageSize, context) {
  try {
    return await getK8sReleaseFallbackTags(imageName, page, pageSize);
  } catch (error) {
    logger.warn(`K8s 回退到 GitHub releases 失败（${context}），保留原始结果: ${error.message}`);
    return null;
  }
}

async function probeImageTags(registryId, imageName, requestOptions = {}) {
  if (registryId === 'quay') {
    const { normalized, data } = await fetchQuayActiveTagPage(imageName, 1, 1);
    const tags = data.tags || [];
    return {
      registry: registryId,
      imageName: normalized,
      count: Array.isArray(tags) ? tags.length : 0,
      results: Array.isArray(tags) ? tags.map(tag => ({ name: typeof tag === 'string' ? tag : tag.name })) : []
    };
  }

  const url = withQueryParam(buildRegistryTagsUrl(registryId, imageName), 'n', 1);
  const response = await fetchWithRegistryAuth(url, registryId, imageName, requestOptions);
  const tags = response.data?.tags || [];
  return {
    registry: registryId,
    imageName,
    count: Array.isArray(tags) ? tags.length : 0,
    results: Array.isArray(tags) ? tags.map(tag => ({ name: typeof tag === 'string' ? tag : tag.name })) : []
  };
}

async function searchExactImage(registryId, term, requestOptions = {}) {
  const normalized = normalizeRegistrySearchTerm(registryId, term);
  if (!shouldAttemptExactLookup(registryId, normalized)) return null;

  try {
    await probeImageTags(registryId, normalized.imageName, requestOptions);
    return makeRegistrySearchItem(registryId, normalized.imageName, {
      isExactMatch: true,
      description: `${REGISTRY_CONFIGS[registryId].name} 精确匹配镜像`
    });
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) return null;
    logger.warn(`精确验证 ${registryId} 镜像 ${normalized.imageName} 失败: ${error.message}`);
    return null;
  }
}

function mergeSearchItems(primaryItems, secondaryItems, limit = 25) {
  const merged = [];
  const byName = new Map();
  for (const item of [...(primaryItems || []), ...(secondaryItems || [])]) {
    if (!item || !item.fullName) continue;
    const key = item.fullName.toLowerCase();
    if (byName.has(key)) {
      const idx = byName.get(key);
      const oldItem = merged[idx];
      const oldDesc = oldItem.description || '';
      const shouldUseIncomingDesc =
        item.description && (!oldDesc || (oldItem.isExactMatch && oldDesc.includes('精确匹配镜像')));
      merged[idx] = {
        ...oldItem,
        description: shouldUseIncomingDesc ? item.description : oldDesc,
        stars: oldItem.stars || item.stars || 0,
        pulls: oldItem.pulls || item.pulls || 0,
        url: oldItem.url || item.url,
        isOfficial: oldItem.isOfficial || item.isOfficial,
        isExactMatch: oldItem.isExactMatch || item.isExactMatch
      };
      continue;
    }
    if (merged.length >= limit) continue;
    byName.set(key, merged.length);
    merged.push(item);
  }
  return sortByOfficial(merged);
}

async function searchStaticListWithExact(registryId, term, page = 1, pageSize = 25) {
  const staticResults = searchStaticList(registryId, term, page, pageSize);
  if (page !== 1) return staticResults;

  const exactItem = await searchExactImage(registryId, term);
  if (!exactItem) return staticResults;

  const merged = mergeSearchItems([exactItem], staticResults.results, pageSize);
  const exactAlreadyInStatic = staticResults.results.some(
    item => item.fullName && item.fullName.toLowerCase() === exactItem.fullName.toLowerCase()
  );
  return {
    ...staticResults,
    count: staticResults.count + (exactAlreadyInStatic ? 0 : 1),
    results: merged
  };
}

// 常用镜像的静态列表（用于不支持搜索 API 的 Registry）
const STATIC_IMAGE_LISTS = {
  'k8s': [
    { name: 'kube-apiserver', description: 'Kubernetes API Server' },
    { name: 'kube-controller-manager', description: 'Kubernetes Controller Manager' },
    { name: 'kube-scheduler', description: 'Kubernetes Scheduler' },
    { name: 'kube-proxy', description: 'Kubernetes Proxy' },
    { name: 'etcd', description: 'Etcd 分布式键值存储' },
    { name: 'coredns', description: 'CoreDNS - Kubernetes DNS 服务' },
    { name: 'pause', description: 'Kubernetes Pause 容器' },
    { name: 'ingress-nginx/controller', description: 'NGINX Ingress Controller' },
    { name: 'metrics-server', description: 'Kubernetes Metrics Server' },
    { name: 'dashboard', description: 'Kubernetes Dashboard' },
    { name: 'dns/k8s-dns-node-cache', description: 'NodeLocal DNSCache' },
    { name: 'sig-storage/csi-provisioner', description: 'CSI Provisioner' },
    { name: 'sig-storage/csi-attacher', description: 'CSI Attacher' },
    { name: 'sig-storage/csi-snapshotter', description: 'CSI Snapshotter' },
    { name: 'sig-storage/csi-resizer', description: 'CSI Resizer' },
    { name: 'sig-storage/csi-node-driver-registrar', description: 'CSI Node Driver Registrar' },
    { name: 'autoscaling/vpa-recommender', description: 'VPA Recommender' },
    { name: 'autoscaling/vpa-updater', description: 'VPA Updater' },
    { name: 'autoscaling/vpa-admission-controller', description: 'VPA Admission Controller' }
  ],
  'gcr': [
    { name: 'google-containers/pause', description: 'Google Pause 容器' },
    { name: 'google-containers/busybox', description: 'BusyBox 镜像' },
    { name: 'google-containers/kube-state-metrics', description: 'Kube State Metrics' },
    { name: 'google-containers/prometheus-to-sd', description: 'Prometheus to Stackdriver' },
    { name: 'google-containers/fluentd-gcp', description: 'Fluentd for GCP' },
    { name: 'google-containers/addon-resizer', description: 'Addon Resizer' },
    { name: 'google-containers/cluster-proportional-autoscaler-amd64', description: 'Cluster Proportional Autoscaler' },
    { name: 'distroless/base', description: 'Google Distroless Base 镜像' },
    { name: 'distroless/static', description: 'Google Distroless Static 镜像' },
    { name: 'distroless/java', description: 'Google Distroless Java 镜像' },
    { name: 'distroless/cc', description: 'Google Distroless CC 镜像' },
    { name: 'distroless/python3', description: 'Google Distroless Python3 镜像' },
    { name: 'distroless/nodejs', description: 'Google Distroless Node.js 镜像' },
    { name: 'cadvisor/cadvisor', description: 'Container Advisor' }
  ],
  'mcr': [
    { name: 'dotnet/aspnet', description: 'ASP.NET Core 运行时镜像' },
    { name: 'dotnet/runtime', description: '.NET 运行时镜像' },
    { name: 'dotnet/sdk', description: '.NET SDK 镜像' },
    { name: 'dotnet/runtime-deps', description: '.NET 运行时依赖镜像' },
    { name: 'mssql/server', description: 'Microsoft SQL Server 镜像' },
    { name: 'azure-cli', description: 'Azure CLI 镜像' },
    { name: 'powershell', description: 'PowerShell 镜像' },
    { name: 'windows/servercore', description: 'Windows Server Core 镜像' },
    { name: 'windows/nanoserver', description: 'Windows Nano Server 镜像' },
    { name: 'windows', description: 'Windows 基础镜像' },
    { name: 'oss/kubernetes/pause', description: 'Kubernetes Pause 镜像 (MCR)' },
    { name: 'oss/azure/aad-pod-identity/nmi', description: 'Azure AAD Pod Identity NMI' },
    { name: 'azure-cognitive-services/textanalytics/healthcare', description: 'Text Analytics for Health' },
    { name: 'playwright', description: 'Playwright 浏览器自动化镜像' },
    { name: 'vscode/devcontainers/base', description: 'VS Code Dev Containers 基础镜像' },
    { name: 'devcontainers/base', description: 'Dev Containers 基础镜像' },
    { name: 'devcontainers/python', description: 'Dev Containers Python 镜像' },
    { name: 'devcontainers/typescript-node', description: 'Dev Containers TypeScript Node 镜像' },
    { name: 'devcontainers/go', description: 'Dev Containers Go 镜像' },
    { name: 'devcontainers/java', description: 'Dev Containers Java 镜像' }
  ],
  'elastic': [
    { name: 'elasticsearch/elasticsearch', description: 'Elasticsearch 分布式搜索引擎' },
    { name: 'kibana/kibana', description: 'Kibana 数据可视化平台' },
    { name: 'logstash/logstash', description: 'Logstash 数据处理管道' },
    { name: 'beats/filebeat', description: 'Filebeat 日志采集器' },
    { name: 'beats/metricbeat', description: 'Metricbeat 指标采集器' },
    { name: 'beats/heartbeat', description: 'Heartbeat 可用性监控' },
    { name: 'beats/auditbeat', description: 'Auditbeat 审计数据采集' },
    { name: 'beats/packetbeat', description: 'Packetbeat 网络数据采集' },
    { name: 'apm/apm-server', description: 'APM Server 应用性能监控' },
    { name: 'enterprise-search/enterprise-search', description: 'Elastic Enterprise Search' },
    { name: 'observability/synthetics-runner', description: 'Synthetics Runner' },
    { name: 'eck/eck-operator', description: 'Elastic Cloud on Kubernetes Operator' }
  ],
  'ghcr': [
    // GHCR 使用 GitHub API 动态搜索，但这里列出一些常用镜像
    { name: 'actions/runner', namespace: 'actions', description: 'GitHub Actions Runner' },
    { name: 'dependabot/dependabot-core', namespace: 'dependabot', description: 'Dependabot Core' },
    { name: 'aquasecurity/trivy', namespace: 'aquasecurity', description: 'Trivy 容器安全扫描' },
    { name: 'fluxcd/flux2', namespace: 'fluxcd', description: 'Flux GitOps 工具' },
    { name: 'fluxcd/helm-controller', namespace: 'fluxcd', description: 'Flux Helm Controller' },
    { name: 'fluxcd/kustomize-controller', namespace: 'fluxcd', description: 'Flux Kustomize Controller' },
    { name: 'fluxcd/source-controller', namespace: 'fluxcd', description: 'Flux Source Controller' },
    { name: 'external-secrets/external-secrets', namespace: 'external-secrets', description: 'External Secrets Operator' },
    { name: 'cert-manager/cert-manager-controller', namespace: 'cert-manager', description: 'Cert Manager Controller' },
    { name: 'argoproj/argocd', namespace: 'argoproj', description: 'Argo CD GitOps' },
    { name: 'bitnami/kubectl', namespace: 'bitnami', description: 'Bitnami kubectl' },
    { name: 'bitnami/nginx', namespace: 'bitnami', description: 'Bitnami NGINX' }
  ],
  'quay': [
    { name: 'coreos/etcd', namespace: 'coreos', description: 'Etcd 分布式键值存储' },
    { name: 'coreos/flannel', namespace: 'coreos', description: 'Flannel 网络插件' },
    { name: 'coreos/prometheus-operator', namespace: 'coreos', description: 'Prometheus Operator' },
    { name: 'prometheus/prometheus', namespace: 'prometheus', description: 'Prometheus 监控系统' },
    { name: 'prometheus/alertmanager', namespace: 'prometheus', description: 'Alertmanager 告警管理' },
    { name: 'prometheus/node-exporter', namespace: 'prometheus', description: 'Node Exporter' },
    { name: 'prometheus/blackbox-exporter', namespace: 'prometheus', description: 'Blackbox Exporter' },
    { name: 'jetstack/cert-manager-controller', namespace: 'jetstack', description: 'Cert Manager Controller' },
    { name: 'jetstack/cert-manager-webhook', namespace: 'jetstack', description: 'Cert Manager Webhook' },
    { name: 'jetstack/cert-manager-cainjector', namespace: 'jetstack', description: 'Cert Manager CA Injector' },
    { name: 'metallb/controller', namespace: 'metallb', description: 'MetalLB Controller' },
    { name: 'metallb/speaker', namespace: 'metallb', description: 'MetalLB Speaker' },
    { name: 'calico/node', namespace: 'calico', description: 'Calico Node' },
    { name: 'calico/cni', namespace: 'calico', description: 'Calico CNI' },
    { name: 'calico/kube-controllers', namespace: 'calico', description: 'Calico Kube Controllers' },
    { name: 'cilium/cilium', namespace: 'cilium', description: 'Cilium 网络插件' },
    { name: 'cilium/operator', namespace: 'cilium', description: 'Cilium Operator' },
    { name: 'argoproj/argocd', namespace: 'argoproj', description: 'Argo CD GitOps' },
    { name: 'argoproj/argo-rollouts', namespace: 'argoproj', description: 'Argo Rollouts' },
    { name: 'argoproj/argo-workflows', namespace: 'argoproj', description: 'Argo Workflows' }
  ],
  'nvcr': [
    { name: 'nvidia/cuda', description: 'NVIDIA CUDA 基础镜像' },
    { name: 'nvidia/pytorch', description: 'NVIDIA PyTorch 容器' },
    { name: 'nvidia/tensorflow', description: 'NVIDIA TensorFlow 容器' },
    { name: 'nvidia/tensorrt', description: 'NVIDIA TensorRT 推理优化' },
    { name: 'nvidia/tritonserver', description: 'NVIDIA Triton 推理服务器' },
    { name: 'nvidia/cuda-quantum', description: 'NVIDIA CUDA Quantum' },
    { name: 'nvidia/nemo', description: 'NVIDIA NeMo 对话式 AI' },
    { name: 'nvidia/deepstream', description: 'NVIDIA DeepStream SDK' },
    { name: 'nvidia/k8s-device-plugin', description: 'NVIDIA Kubernetes Device Plugin' },
    { name: 'nvidia/gpu-operator', description: 'NVIDIA GPU Operator' },
    { name: 'nvidia/dcgm-exporter', description: 'NVIDIA DCGM Exporter' },
    { name: 'nvidia/driver', description: 'NVIDIA 驱动容器' }
  ]
};

/**
 * 获取所有支持的 Registry 平台列表
 */
function getRegistryList() {
  return Object.keys(REGISTRY_CONFIGS).map(key => ({
    id: key,
    ...REGISTRY_CONFIGS[key]
  }));
}

/**
 * 搜索 Docker Hub
 */
async function searchDockerHub(term, page = 1, pageSize = 25) {
  const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page=${page}&page_size=${pageSize}`;
  
  try {
    const response = await axios.get(url, httpOptions);
    const data = response.data;
    
    return {
      registry: 'docker-hub',
      registryName: REGISTRY_CONFIGS['docker-hub'].name,
      registryIcon: REGISTRY_CONFIGS['docker-hub'].icon,
      registryColor: REGISTRY_CONFIGS['docker-hub'].color,
      count: data.count || 0,
      results: sortByOfficial((data.results || []).map(item => {
        const repoName = item.repo_name || item.name;
        return {
          name: item.name || item.repo_name,
          namespace: item.namespace || (item.is_official ? 'library' : (repoName?.includes('/') ? repoName.split('/')[0] : '')),
          description: item.description || item.short_description || '',
          stars: item.star_count || 0,
          pulls: item.pull_count || 0,
          isOfficial: item.is_official || false,
          isAutomated: item.is_automated || false,
          fullName: repoName,
          registry: 'docker-hub',
          pullCommand: repoName
        };
      }))
    };
  } catch (error) {
    logger.error(`搜索 Docker Hub 失败: ${error.message}`);
    throw error;
  }
}

/**
 * 搜索 Quay.io
 */
async function searchQuay(term, page = 1, pageSize = 25) {
  const exactItem = page === 1 ? await searchExactImage('quay', term) : null;
  const normalized = normalizeRegistrySearchTerm('quay', term).imageName || term;
  const url = `https://quay.io/api/v1/find/repositories?query=${encodeURIComponent(normalized)}&page=${page}`;
  
  try {
    const response = await axios.get(url, {
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        'Accept': 'application/json'
      }
    });
    
    const results = response.data.results || [];
    const apiResults = results.map(item => ({
      name: item.name,
      namespace: item.namespace?.name || item.namespace,
      description: item.description || '',
      stars: item.popularity || 0,
      pulls: 0,
      isOfficial: item.is_public || false,
      isAutomated: false,
      fullName: `${item.namespace?.name || item.namespace}/${item.name}`,
      registry: 'quay',
      pullCommand: `quay.io/${item.namespace?.name || item.namespace}/${item.name}`
    }));
    const exactAlreadyInApi = Boolean(exactItem) && apiResults.some(
      item => item.fullName && item.fullName.toLowerCase() === exactItem.fullName.toLowerCase()
    );
    
    return {
      registry: 'quay',
      registryName: REGISTRY_CONFIGS['quay'].name,
      registryIcon: REGISTRY_CONFIGS['quay'].icon,
      registryColor: REGISTRY_CONFIGS['quay'].color,
      count: results.length + (exactItem && !exactAlreadyInApi ? 1 : 0),
      results: mergeSearchItems(exactItem ? [exactItem] : [], apiResults, pageSize)
    };
  } catch (error) {
    logger.error(`搜索 Quay.io 失败: ${error.message}`);
    // 如果 API 搜索失败，使用静态列表 + 精确镜像探测兜底
    return searchStaticListWithExact('quay', term, page, pageSize);
  }
}

function getGitHubApiRequestOptions(credential = null) {
  const options = {
    ...httpOptions,
    headers: {
      ...httpOptions.headers,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  // GitHub REST 的 Packages API 需要 PAT；这里复用 GHCR token 配置中的
  // password 字段（配置文件中的 token），而不是把 Basic 凭证发给 GitHub API。
  if (credential?.password) {
    options.headers.Authorization = `Bearer ${credential.password}`;
  }
  return options;
}

function normalizeGitHubRepository(sourceRepository) {
  const value = String(sourceRepository || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^\/+|\/+$/g, '');
  const match = value.match(/^([^/]+)\/([^/]+?)(?:\.git)?$/);
  return match ? `${match[1]}/${match[2]}` : '';
}

async function fetchGitHubReleasePage(repository, page, credential) {
  const url = `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`;
  const response = await axios.get(url, getGitHubApiRequestOptions(credential));
  const batch = Array.isArray(response.data) ? response.data : [];
  return { batch, hasNext: Boolean(parseNextLink(response.headers?.link, url)) };
}

async function fetchAllGitHubReleases(repository, credential) {
  const releases = [];
  const seen = new Set();
  let page = 1;

  while (page <= GITHUB_RELEASE_MAX_PAGES) {
    const { batch, hasNext } = await fetchGitHubReleasePage(repository, page, credential);
    for (const release of batch) {
      const name = release?.tag_name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      releases.push({ name, publishedAt: normalizeDate(release.published_at || release.created_at) });
    }
    if (!batch.length || !hasNext) break;
    page += 1;
  }

  return releases;
}

// GitHub releases 按创建时间倒序返回，活跃仓库很容易超过一页——
// kubernetes/kubernetes 实测有 9 页（约 850 条）。只取 page=1 会让回退数据
// 静默截断在最近 100 条，用户查历史版本时看到的是不完整的列表却毫不知情，
// 因此这里跟随 Link 头翻完全部页，并用 GITHUB_RELEASE_MAX_PAGES 兜底防死循环。
async function getGitHubReleases(sourceRepository) {
  const repository = normalizeGitHubRepository(sourceRepository);
  if (!repository) return [];
  const cacheKey = `github-releases:${repository.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const credential = await getCredentialForAuth('ghcr');
  try {
    const releases = await fetchAllGitHubReleases(repository, credential);
    return setCache(cacheKey, releases, GITHUB_PACKAGE_CACHE_TTL_MS);
  } catch (error) {
    // 失效 PAT 不应阻断 GHCR 自身的标签读取；匿名 release API 仍可能可用。
    if (error.response?.status === 401 && credential?.password) {
      try {
        const releases = await fetchAllGitHubReleases(repository, null);
        return setCache(cacheKey, releases, 60 * 1000);
      } catch (anonymousError) {
        logger.warn(`读取 GitHub 仓库 ${repository} releases 失败: ${anonymousError.message}`);
      }
    } else {
      logger.warn(`读取 GitHub 仓库 ${repository} releases 失败: ${error.message}`);
    }
    return setCache(cacheKey, [], 60 * 1000);
  }
}

async function getGitHubReleaseTagNames(sourceRepository) {
  const releases = await getGitHubReleases(sourceRepository);
  return releases.map(release => release.name);
}

function mergeTagNames(registryNames, releaseNames) {
  const names = [];
  const seen = new Set();
  for (const name of [...(registryNames || []), ...(releaseNames || [])]) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function packageNameMatchesRepository(packageName, repositoryName, query) {
  const pkg = String(packageName || '').toLowerCase();
  const repo = String(repositoryName || '').toLowerCase();
  const term = String(query || '').toLowerCase().replace(/^.*\//, '');

  // build-cache / 临时构建包不是用户通常希望浏览的运行时镜像。
  if (/(^|[-/])build-cache$/.test(pkg) || pkg.includes('build-cache/')) return false;
  if (!term) return pkg === repo || pkg.startsWith(`${repo}-`);
  return pkg === term ||
    pkg.startsWith(`${term}-`) ||
    pkg.includes(term) ||
    pkg === repo ||
    pkg.startsWith(`${repo}-`);
}

async function getGitHubContainerPackages(owner) {
  const normalizedOwner = String(owner || '').trim();
  if (!normalizedOwner) return [];
  const cacheKey = `github-container-packages:${normalizedOwner.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const credential = await getCredentialForAuth('ghcr');
  if (!credential?.password) {
    return setCache(cacheKey, [], 60 * 1000);
  }

  const packages = [];
  // /users/{owner}/packages 同时覆盖 GitHub 用户和组织，且实际部署环境已验证
  // 组织 owner（例如 immich-app）也可从该接口读取 container packages。
  for (let page = 1; page <= 3; page++) {
    const url = `https://api.github.com/users/${encodeURIComponent(normalizedOwner)}/packages?package_type=container&per_page=100&page=${page}`;
    try {
      const response = await axios.get(url, getGitHubApiRequestOptions(credential));
      const batch = Array.isArray(response.data) ? response.data : [];
      packages.push(...batch.filter(pkg => pkg && pkg.name));
      if (batch.length < 100) break;
    } catch (error) {
      if (error.response?.status === 404) break;
      logger.warn(`读取 GitHub owner ${normalizedOwner} 的 Container Packages 失败: ${error.message}`);
      break;
    }
  }

  return setCache(cacheKey, packages, GITHUB_PACKAGE_CACHE_TTL_MS);
}

function makeGHCRPackageItem(repositoryItem, packageName) {
  const owner = repositoryItem.owner?.login || repositoryItem.namespace || '';
  const fullName = `${owner}/${packageName}`;
  const sourceRepository = normalizeGitHubRepository(
    repositoryItem.sourceRepository || `${owner}/${repositoryItem.name || ''}`
  );
  return {
    name: packageName.includes('/') ? packageName.split('/').pop() : packageName,
    namespace: owner,
    description: repositoryItem.description || '',
    stars: repositoryItem.stargazers_count || repositoryItem.stars || 0,
    pulls: 0,
    isOfficial: repositoryItem.owner?.type === 'Organization' || Boolean(repositoryItem.isOfficial),
    isAutomated: false,
    fullName,
    registry: 'ghcr',
    pullCommand: `ghcr.io/${fullName}`,
    url: repositoryItem.html_url || repositoryItem.url,
    packageName,
    tagsAvailable: true,
    sourceRepository
  };
}

async function enrichGHCRRepositoryResults(items, query) {
  const repositories = Array.isArray(items) ? items : [];
  // 只查询前几个 owner，避免普通关键词搜索触发大量 Packages API 请求。
  const owners = [];
  const seenOwners = new Set();
  for (const item of repositories.slice(0, 8)) {
    const owner = item.owner?.login || item.namespace;
    if (!owner || seenOwners.has(owner.toLowerCase())) continue;
    seenOwners.add(owner.toLowerCase());
    owners.push(owner);
  }

  const ownerPackages = await mapLimit(owners, 3, async owner => ({
    owner,
    packages: await getGitHubContainerPackages(owner)
  }));
  const packageMap = new Map(ownerPackages.map(entry => [entry.owner.toLowerCase(), entry.packages]));
  // GitHub repository search is not a GHCR package search. Without a PAT the
  // Packages API may be unavailable, so verify owner/<searched package> via
  // the public OCI endpoint rather than guessing the repository's package name.
  const exactPackage = /^[a-z0-9][a-z0-9._-]*$/i.test(query) ? query : '';
  const verifiedPackages = new Map();
  if (exactPackage) {
    await mapLimit(owners.slice(0, 8), 3, async owner => {
      const known = packageMap.get(owner.toLowerCase()) || [];
      if (known.some(pkg => pkg.name.toLowerCase() === exactPackage.toLowerCase())) return;
      const item = await searchExactImage('ghcr', `${owner}/${exactPackage}`, { timeout: 5000 });
      if (item) verifiedPackages.set(owner.toLowerCase(), item);
    });
  }
  const enriched = [];

  for (const repositoryItem of repositories) {
    const owner = (repositoryItem.owner?.login || repositoryItem.namespace || '').toLowerCase();
    const repoName = repositoryItem.name || '';
    const packages = packageMap.get(owner) || [];
    const matchedPackages = packages
      .map(pkg => pkg.name)
      .filter(name => packageNameMatchesRepository(name, repoName, query));
    if (verifiedPackages.has(owner) && !matchedPackages.some(name => name.toLowerCase() === exactPackage.toLowerCase())) {
      matchedPackages.unshift(exactPackage);
    }

    if (matchedPackages.length) {
      for (const packageName of matchedPackages) {
        enriched.push(makeGHCRPackageItem(repositoryItem, packageName));
      }
    } else {
      // 没有权限读取 package 列表或该 owner 没有公开 package 时保留原仓库结果，
      // 但不伪装成已确认存在的 GHCR 镜像。
      enriched.push({
        ...makeGHCRPackageItem(repositoryItem, repoName),
        packageName: null,
        tagsAvailable: false
      });
    }
  }

  return enriched;
}

/**
 * 搜索 GitHub Container Registry (使用 GitHub API)
 */
async function searchGHCR(term, page = 1, pageSize = 25) {
  // 首先尝试使用静态列表搜索（按 page/pageSize 切片，避免与 API 结果合并后超过 pageSize）
  const staticResults = searchStaticList('ghcr', term, page, pageSize);
  const exactItem = page === 1 ? await searchExactImage('ghcr', term) : null;
  const normalized = normalizeRegistrySearchTerm('ghcr', term).imageName || term;
  
  try {
    // 然后尝试使用 GitHub API 搜索仓库。
    // 注意：GHCR 没有公开的通用包搜索 API；原实现把查询限定为
    // "topic:docker topic:container"，会漏掉 tale/headplane 这类没有打 topic
    // 但确实发布了 GHCR 镜像的项目。这里改成宽松仓库搜索，精确输入则已通过
    // tags/list 先做过真实镜像验证。
    const githubQuery = normalized.includes('/')
      ? normalized
      : `${normalized} in:name,description,readme`;
    const params = new URLSearchParams({
      q: githubQuery,
      per_page: String(pageSize),
      page: String(page)
    });
    const url = `https://api.github.com/search/repositories?${params.toString()}`;
    
    const response = await axios.get(url, {
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const data = response.data;
    const repositoryResults = (data.items || []).map(item => ({
      name: item.name,
      namespace: item.owner?.login || '',
      description: item.description || '',
      stars: item.stargazers_count || 0,
      pulls: 0,
      isOfficial: item.owner?.type === 'Organization',
      isAutomated: false,
      fullName: `${item.owner?.login}/${item.name}`,
      registry: 'ghcr',
      pullCommand: `ghcr.io/${item.owner?.login}/${item.name}`,
      url: item.html_url
    }));
    const apiResults = await enrichGHCRRepositoryResults(
      repositoryResults.map(item => ({
        ...item,
        owner: { login: item.namespace, type: item.isOfficial ? 'Organization' : 'User' },
        html_url: item.url
      })),
      normalized
    );
    
    // 合并静态列表和 API 结果，去重；总条数封顶 pageSize（聚合模式下这是每个 Registry 的配额）
    const allResults = mergeSearchItems(
      exactItem ? [exactItem] : [],
      [...staticResults.results, ...apiResults],
      pageSize
    );
    
    return {
      registry: 'ghcr',
      registryName: REGISTRY_CONFIGS['ghcr'].name,
      registryIcon: REGISTRY_CONFIGS['ghcr'].icon,
      registryColor: REGISTRY_CONFIGS['ghcr'].color,
      count: allResults.length,
      results: allResults
    };
  } catch (error) {
    logger.warn(`GitHub API 搜索失败，使用静态列表: ${error.message}`);
    if (!exactItem) return staticResults;
    const merged = mergeSearchItems([exactItem], staticResults.results, pageSize);
    return {
      ...staticResults,
      count: staticResults.count + (staticResults.results.some(
        item => item.fullName && item.fullName.toLowerCase() === exactItem.fullName.toLowerCase()
      ) ? 0 : 1),
      results: merged
    };
  }
}

/**
 * 在静态列表中搜索（按 page/pageSize 切片）
 */
function searchStaticList(registryId, term, page = 1, pageSize = 25) {
  const config = REGISTRY_CONFIGS[registryId];
  const staticList = STATIC_IMAGE_LISTS[registryId] || [];
  const normalized = normalizeRegistrySearchTerm(registryId, term).imageName || term;
  const lowerTerm = normalized.toLowerCase();
  
  const matched = staticList.filter(item => {
    const nameMatch = item.name.toLowerCase().includes(lowerTerm);
    const pullNameMatch = config.prefix
      ? `${config.prefix}/${item.name}`.toLowerCase().includes(String(term || '').toLowerCase())
      : false;
    const descMatch = item.description && item.description.toLowerCase().includes(lowerTerm);
    return nameMatch || pullNameMatch || descMatch;
  });
  
  const start = (page - 1) * pageSize;
  const slice = matched.slice(start, start + pageSize);
  
  return {
    registry: registryId,
    registryName: config.name,
    registryIcon: config.icon,
    registryColor: config.color,
    count: matched.length,
    results: sortByOfficial(slice.map(item => ({
      name: item.name.includes('/') ? item.name.split('/').pop() : item.name,
      namespace: item.namespace || (item.name.includes('/') ? item.name.split('/')[0] : ''),
      description: item.description || '',
      stars: 0,
      pulls: 0,
      isOfficial: true,
      isAutomated: false,
      fullName: item.name,
      registry: registryId,
      pullCommand: config.prefix ? `${config.prefix}/${item.name}` : item.name
    })))
  };
}

/**
 * 搜索 Kubernetes Registry
 */
async function searchK8s(term, page = 1, pageSize = 25) {
  return searchStaticListWithExact('k8s', term, page, pageSize);
}

/**
 * 搜索 Google Container Registry
 */
async function searchGCR(term, page = 1, pageSize = 25) {
  return searchStaticListWithExact('gcr', term, page, pageSize);
}

/**
 * 搜索 Microsoft Container Registry
 */
async function searchMCR(term, page = 1, pageSize = 25) {
  return searchStaticListWithExact('mcr', term, page, pageSize);
}

/**
 * 搜索 Elastic Container Registry
 */
async function searchElastic(term, page = 1, pageSize = 25) {
  return searchStaticListWithExact('elastic', term, page, pageSize);
}

/**
 * 搜索 NVIDIA Container Registry
 */
async function searchNVCR(term, page = 1, pageSize = 25) {
  return searchStaticListWithExact('nvcr', term, page, pageSize);
}

/**
 * 统一搜索接口 - 搜索指定的 Registry
 */
async function searchRegistry(registryId, term, page = 1, pageSize = 25) {
  logger.info(`搜索 ${registryId}: ${term} (页码: ${page})`);
  
  switch (registryId) {
    case 'docker-hub':
      return await searchDockerHub(term, page, pageSize);
    case 'quay':
      return await searchQuay(term, page, pageSize);
    case 'ghcr':
      return await searchGHCR(term, page, pageSize);
    case 'k8s':
      return await searchK8s(term, page, pageSize);
    case 'gcr':
      return await searchGCR(term, page, pageSize);
    case 'mcr':
      return await searchMCR(term, page, pageSize);
    case 'elastic':
      return await searchElastic(term, page, pageSize);
    case 'nvcr':
      return await searchNVCR(term, page, pageSize);
    default:
      throw new Error(`不支持的 Registry: ${registryId}`);
  }
}

/**
 * 搜索所有支持的 Registry
 * @param {string} term 关键词
 * @param {number} page 页码
 * @param {number} pageSize 每页总数量（聚合后上限）
 * @param {string[]} [enabledIds] 仅搜索这些已启用的 Registry（不传则搜索全部）
 * @returns 聚合结果：每个 Registry 拉 perRegistryLimit 条，合计接近 pageSize；
 *          前端 totalPages 仍按 max(count) / pageSize 算 → 与单 Registry 翻页体验一致。
 */
async function searchAllRegistries(term, page = 1, pageSize = 20, enabledIds = null) {
  let registries = ['docker-hub', 'quay', 'ghcr', 'k8s', 'gcr', 'mcr', 'elastic', 'nvcr'];
  if (Array.isArray(enabledIds) && enabledIds.length) {
    const set = new Set(enabledIds);
    registries = registries.filter(id => set.has(id));
  }
  if (!registries.length) {
    return { term, page, pageSize, registries: [] };
  }
  
  // 将 pageSize 在多个 Registry 间分配：每个 Registry 至少 1 条，
  // 不足则向上取整（最后一个 Registry 取剩余，避免溢出太多）
  const perRegistryLimit = Math.max(1, Math.ceil(pageSize / registries.length));
  
  const searchPromises = registries.map(registryId => 
    searchRegistry(registryId, term, page, perRegistryLimit)
      .catch(error => {
        logger.warn(`搜索 ${registryId} 失败: ${error.message}`);
        return {
          registry: registryId,
          registryName: REGISTRY_CONFIGS[registryId]?.name || registryId,
          count: 0,
          results: [],
          error: error.message
        };
      })
  );
  
  const results = await Promise.all(searchPromises);
  
  return {
    term,
    page,
    pageSize,
    perRegistryLimit,
    registries: results
  };
}

/**
 * 获取镜像标签 - 根据 Registry 类型选择不同的 API
 */
async function getImageTags(registryId, imageName, page = 1, pageSize = 100, sourceRepository = '') {
  const config = REGISTRY_CONFIGS[registryId];
  if (!config) {
    throw new Error(`不支持的 Registry: ${registryId}`);
  }
  
  logger.info(`获取 ${registryId} 镜像标签: ${imageName}`);
  
  switch (registryId) {
    case 'docker-hub':
      return await getDockerHubTags(imageName, page, pageSize);
    case 'quay':
      return await getQuayTags(imageName, page, pageSize);
    default:
      return await getOCITags(registryId, imageName, page, pageSize, sourceRepository);
  }
}

/**
 * 获取 Docker Hub 镜像标签
 */
async function getDockerHubTags(imageName, page = 1, pageSize = 100) {
  const isOfficial = !imageName.includes('/');
  const fullImageName = isOfficial ? `library/${imageName}` : imageName;
  const url = `https://hub.docker.com/v2/repositories/${fullImageName}/tags?page=${page}&page_size=${pageSize}`;
  
  try {
    const response = await axios.get(url, httpOptions);
    const data = response.data;
    
    return {
      registry: 'docker-hub',
      imageName,
      count: data.count || 0,
      results: (data.results || []).map(tag => ({
        name: tag.name,
        digest: tag.digest,
        lastUpdated: tag.last_updated,
        size: tag.full_size || tag.images?.[0]?.size,
        images: tag.images || []
      })),
      next: data.next,
      previous: data.previous
    };
  } catch (error) {
    logger.error(`获取 Docker Hub 标签失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取 Quay.io 镜像标签
 */
async function getQuayTags(imageName, page = 1, pageSize = 100) {
  try {
    const { normalized } = parseQuayImageName(imageName);
    const tags = await fetchAllQuayActiveTags(normalized);
    const start = (page - 1) * pageSize;
    const pageItems = tags.slice(start, start + pageSize);
    const enrichedPage = await mapLimit(
      pageItems,
      Math.min(OCI_METADATA_CONCURRENCY, pageItems.length || 1),
      item => getOCITagMetadata('quay', normalized, item.name, item.originalIndex)
    );
    
    return {
      registry: 'quay',
      imageName: normalized,
      count: tags.length,
      results: enrichedPage,
      next: start + pageSize < tags.length ? page + 1 : null,
      previous: page > 1 ? page - 1 : null
    };
  } catch (error) {
    logger.error(`获取 Quay 标签失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取 OCI Registry 镜像标签（适用于 GCR, MCR, K8s 等）
 */
async function getOCITags(registryId, imageName, page = 1, pageSize = 100, sourceRepository = '') {
  const config = REGISTRY_CONFIGS[registryId];
  if (!config || !config.tagsUrl) {
    throw new Error(`Registry ${registryId} 不支持获取标签`);
  }
  
  const normalized = normalizeRegistrySearchTerm(registryId, imageName).imageName;

  try {
    let tags;
    if (FULL_METADATA_SORT_REGISTRIES.has(registryId)) {
      // GHCR 的 tags/list 可能包含 main/release/pr/commit 等流水线 tag。
      // 先按正式版本号倒序排列，再只读取当前页的 manifest/config 元数据，
      // 避免为了打开第一页而读取全部 tag 的几十/几百个 blob。
      const sorted = await getSortedOCITagNames(registryId, normalized, sourceRepository);
      const start = (page - 1) * pageSize;
      const pageItems = sorted.slice(start, start + pageSize);
      const enrichedPage = await mapLimit(
        pageItems,
        Math.min(OCI_METADATA_CONCURRENCY, pageItems.length || 1),
        item => getOCITagMetadata(registryId, normalized, item.name, item.originalIndex)
      );
      tags = sorted;
      tags.splice(start, enrichedPage.length, ...enrichedPage);
    } else {
      // 其他 OCI Registry（尤其 MCR）可能拥有数千个 tag。全量读取每个 tag 的
      // manifest/config 会非常慢，因此先按 tag 名做语义化排序，再只补齐当前页元数据。
      const names = await fetchAllOCITagNames(registryId, normalized);
      const sorted = names
        .map((name, originalIndex) => ({ name, originalIndex, lastUpdated: null, size: null, images: [] }))
        .sort(compareTagItems);
      const start = (page - 1) * pageSize;
      const pageItems = sorted.slice(start, start + pageSize);
      const enrichedPage = await mapLimit(pageItems, Math.min(OCI_METADATA_CONCURRENCY, pageItems.length || 1), item =>
        getOCITagMetadata(registryId, normalized, item.name, item.originalIndex)
      );
      tags = sorted;
      tags.splice(start, enrichedPage.length, ...enrichedPage);
    }

    const start = (page - 1) * pageSize;
    const slice = tags.slice(start, start + pageSize);

    // getOCITagMetadata 会吞掉单个 tag 的错误并返回空元数据，所以必须在这里
    // 显式统计。否则「tags/list 命中缓存、manifest/blob 链路故障」——这是网络
    // 抖动最常见的形态——会让页面显示一整屏空列，既不报错也不回退。
    const failedCount = slice.filter(tag => tag && tag.metadataFailed).length;
    if (slice.length && failedCount === slice.length && registryId === 'k8s') {
      const fallback = await tryK8sReleaseFallback(
        normalized,
        page,
        pageSize,
        '当前页元数据全部读取失败'
      );
      if (fallback) {
        logger.warn(`K8s 标签元数据读取失败，回退到 GitHub releases: ${normalized}`);
        return fallback;
      }
    }

    return {
      registry: registryId,
      imageName: normalized,
      source: REGISTRY_TAG_SOURCE,
      degraded: failedCount > 0,
      metadataFailed: failedCount,
      count: tags.length,
      results: slice.map(tag => ({
        name: tag.name,
        digest: tag.digest || null,
        lastUpdated: tag.lastUpdated || null,
        size: tag.size || null,
        images: tag.images || []
      })),
      next: start + pageSize < tags.length ? page + 1 : null,
      previous: page > 1 ? page - 1 : null
    };
  } catch (error) {
    logger.error(`获取 ${registryId} 标签失败: ${error.message}`);
    const registryErrorCode = error.response?.data?.errors?.[0]?.code;
    if (error.response?.status === 404 && registryErrorCode === 'NAME_UNKNOWN') {
      // NAME_UNKNOWN 是所有 OCI registry 通用的错误码，提示文案必须按平台区分，
      // 否则查 k8s 镜像时会看到一段讲 GHCR 命名规则的说明。
      const hint = registryId === 'ghcr'
        ? 'GitHub 仓库名与 GHCR 容器包名可能不同，请使用实际包名（例如 immich-app/immich-server）。'
        : '请检查镜像路径是否完整（例如 namespace/repository 或 registry.k8s.io 下的实际路径）。';
      const notFound = new Error(
        `${REGISTRY_CONFIGS[registryId].name} 中不存在容器镜像「${normalized}」。` + hint
      );
      notFound.statusCode = 404;
      notFound.cause = error;
      throw notFound;
    }

    if (registryId === 'k8s') {
      const fallback = await tryK8sReleaseFallback(
        normalized,
        page,
        pageSize,
        `registry 请求失败: ${error.message}`
      );
      if (fallback) {
        logger.warn(`K8s 标签请求失败，回退到 GitHub releases: ${error.message}`);
        return fallback;
      }
    }

    throw error;
  }
}

/**
 * 解析 OCI Registry 返回的 401 WWW-Authenticate Bearer 挑战头。
 * 形如：Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:foo/bar:pull"
 * nvcr 的 realm 不携带 service 参数，故 service 可能为空。
 */
function parseBearerChallenge(header) {
  const result = { realm: '', service: '', scope: '' };
  const realm = header.match(/realm="([^"]+)"/);
  const service = header.match(/service="([^"]+)"/);
  const scope = header.match(/scope="([^"]+)"/);
  if (realm) result.realm = realm[1];
  if (service) result.service = service[1];
  if (scope) result.scope = scope[1];
  return result;
}

/**
 * 向 OCI Registry V2 接口发起 GET，自动处理 Bearer Token 挑战。
 * 多数公共 Registry（mcr / k8s / gcr / elastic）对公开仓库允许匿名拉取，
 * 不会返回 401；ghcr / nvcr 等会返回 401 + WWW-Authenticate 挑战，
 * 此时按 Docker Registry 标准流程：向 realm 申请匿名 token 后重试。
 */
async function fetchWithRegistryAuth(url, registryId, imageName, extraOptions = {}) {
  const { skipKnownChallenge = false, ...requestOptions } = extraOptions || {};
  const opts = {
    ...httpOptions,
    ...requestOptions,
    headers: {
      ...httpOptions.headers,
      Accept: 'application/json',
      ...(requestOptions.headers || {})
    }
  };

  const shouldFollowK8sRedirects = registryId === 'k8s';
  const doRequest = (requestUrl, requestOpts = opts) => {
    if (shouldFollowK8sRedirects) {
      return requestWithManualRedirects(requestUrl, requestOpts);
    }
    return axios.get(requestUrl, requestOpts);
  };

  // 对 GHCR/NVCR 这类必定 Bearer challenge 的 Registry，若已有缓存 token，
  // 或能按标准 scope 直接换 token，则首个请求就带 Authorization，避免每个 tag
  // 都先 401 一次。
  const knownChallenge = skipKnownChallenge ? null : getKnownTokenChallenge(registryId, imageName);
  if (knownChallenge) {
    try {
      const token = await requestBearerToken(registryId, knownChallenge, opts);
      if (token) opts.headers.Authorization = `Bearer ${token}`;
    } catch (tokenErr) {
      logger.debug?.(`预取 ${registryId} Bearer token 失败，回退到 401 challenge: ${tokenErr.message}`);
    }
  }

  try {
    return await doRequest(url);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      const authHeader = err.response.headers['www-authenticate'] || '';
      const { realm, service, scope } = parseBearerChallenge(authHeader);
      if (realm) {
        try {
          // 若该 Registry 配置了访问凭证，requestBearerToken 会在 token 端点附带 Basic 鉴权，
          // 使 GitHub 等「要求登录」的仓库（如 bitnami 组织的镜像）能换取带 read:packages 权限的 token。
          const token = await requestBearerToken(registryId, { realm, service, scope }, opts, 1);
          if (token) {
            return await doRequest(url, {
              ...opts,
              headers: { ...opts.headers, Authorization: `Bearer ${token}` }
            });
          }
        } catch (tokenErr) {
          // token 端点返回 403：该仓库要求登录认证（如 GitHub 上 bitnami 等组织的镜像）
          // 匿名 pull token 被拒绝，需带 read:packages 权限的凭证才能拉取。
          if (tokenErr.response && [401, 403].includes(tokenErr.response.status)) {
            throw new Error(`仓库「${imageName}」需要登录 ${registryId} 才能查看标签（该平台对该仓库要求认证，请为其配置访问凭证）`);
          }
          logger.error(`获取 ${realm} 匿名 token 失败: ${tokenErr.message}`);
        }
      }
    }
    throw err;
  }
}

/**
 * 懒加载该 Registry 的明文凭证（供 token 端点 Basic 鉴权使用）。
 * 延迟 require 以避免模块加载期潜在的循环依赖；无凭证时返回 null。
 */
async function getCredentialForAuth(registryId, options = {}) {
  try {
    const credService = require('./registryCredentialService');
    const cached = await credService.getPlainCredential(registryId);
    if (cached && !options.refresh) {
      return cached;
    }

    const now = Date.now();
    const throttleKey = registryId;
    const last = credentialRefreshThrottle.get(throttleKey) || 0;
    if (options.refresh || !cached) {
      if (options.refresh || now - last > 60 * 1000) {
        credentialRefreshThrottle.set(throttleKey, now, 5 * 60 * 1000);
        try {
          const synced = await credService.syncFromLiveGoProxyConfig();
          if (synced > 0 || options.refresh) {
            const refreshed = await credService.getPlainCredential(registryId);
            if (refreshed) return refreshed;
          }
        } catch (e) {
          logger.warn(`刷新 ${registryId} Registry 凭证失败: ${e.message}`);
        }
      }
    }
    return cached;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getRegistryList,
  searchRegistry,
  searchAllRegistries,
  getImageTags,
  searchDockerHub,
  searchQuay,
  searchGHCR,
  searchK8s,
  searchGCR,
  searchMCR,
  searchElastic,
  searchNVCR,
  normalizeRegistrySearchTerm,
  buildRegistryTagsUrl,
  applyRuntimeSettings,
  getRuntimeSettingsSnapshot,
  clearRegistryCaches,
  REGISTRY_CONFIGS,
  STATIC_IMAGE_LISTS
};

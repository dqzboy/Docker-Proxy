'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/registrySearchService.js');

function loadServiceWithAxios(axiosStub) {
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (request === 'axios') return axiosStub;
    if (request === '../logger' && parent && parent.filename === servicePath) {
      return {
        info() {},
        warn() {},
        error() {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[servicePath];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('Docker Hub 搜索不禁用 Axios 的环境代理支持', async () => {
  let requestOptions;
  const service = loadServiceWithAxios({
    async get(url, options) {
      requestOptions = options;
      return { data: { count: 0, results: [] } };
    }
  });

  await service.searchDockerHub('nginx');

  assert.ok(requestOptions);
  assert.equal(
    Object.prototype.hasOwnProperty.call(requestOptions, 'proxy'),
    false,
    'proxy 配置应留给 Axios 根据 HTTP_PROXY/HTTPS_PROXY/NO_PROXY 环境变量解析'
  );
});

test('Registry 运行参数可热更新并提供当前快照', () => {
  const service = loadServiceWithAxios({ async get() { return { data: {} }; } });
  const original = service.getRuntimeSettingsSnapshot();

  try {
    service.applyRuntimeSettings({
      registryTagCacheTtlMs: 120000,
      registryTagMetadataConcurrency: 4,
      registryTagsMax: 1200,
      registryCacheMaxEntries: 64,
      registryTokenCacheMaxEntries: 32,
      registryCacheCleanupIntervalMs: 15000
    });

    assert.deepEqual(service.getRuntimeSettingsSnapshot(), {
      registryTagCacheTtlMs: 120000,
      registryTagMetadataConcurrency: 4,
      registryTagsMax: 1200,
      registryCacheMaxEntries: 64,
      registryTokenCacheMaxEntries: 32,
      registryCacheCleanupIntervalMs: 15000
    });
  } finally {
    service.applyRuntimeSettings(original);
  }
});

test('GHCR 精确镜像输入先通过 tags/list 验证，GitHub 搜索不再强制 topic 过滤', async () => {
  const urls = [];
  let tagAttempts = 0;
  const service = loadServiceWithAxios({
    async get(url) {
      urls.push(url);
      if (url === 'https://ghcr.io/v2/tale/headplane/tags/list?n=1') {
        tagAttempts += 1;
        if (tagAttempts > 1) {
          return { data: { name: 'tale/headplane', tags: ['0.7.1'] } };
        }
        const err = new Error('Request failed with status code 401');
        err.response = {
          status: 401,
          headers: {
            'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:tale/headplane:pull"'
          }
        };
        throw err;
      }
      if (String(url).startsWith('https://ghcr.io/token?')) {
        return { data: { token: 'token-for-tale-headplane' } };
      }
      if (String(url).startsWith('https://api.github.com/search/repositories?')) {
        return {
          data: {
            total_count: 1,
            items: [{
              name: 'headplane',
              owner: { login: 'tale', type: 'User' },
              description: 'Headscale UI',
              stargazers_count: 123,
              html_url: 'https://github.com/tale/headplane'
            }]
          }
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.searchGHCR('tale/headplane', 1, 10);

  assert.equal(result.results[0].fullName, 'tale/headplane');
  assert.equal(result.results[0].isExactMatch, true);
  const githubSearchUrl = urls.find(url => String(url).startsWith('https://api.github.com/search/repositories?'));
  assert.ok(githubSearchUrl);
  assert.match(githubSearchUrl, /q=tale%2Fheadplane/);
  assert.doesNotMatch(githubSearchUrl, /topic%3Adocker|topic:docker/);
  assert.doesNotMatch(githubSearchUrl, /topic%3Acontainer|topic:container/);
});

test('GHCR 关键词搜索可发现 GitHub 仓库名不同的公开容器包', async () => {
  const urls = [];
  const service = loadServiceWithAxios({
    async get(url) {
      urls.push(url);
      if (String(url).startsWith('https://api.github.com/search/repositories?')) {
        return { data: { items: [{
          name: 'immich', owner: { login: 'immich-app', type: 'Organization' },
          description: 'Self-hosted photos', stargazers_count: 42
        }] } };
      }
      if (String(url).startsWith('https://ghcr.io/token?')) {
        return { data: { token: 'public-token', expires_in: 300 } };
      }
      if (url === 'https://ghcr.io/v2/immich-app/immich-server/tags/list?n=1') {
        return { data: { name: 'immich-app/immich-server', tags: ['v3.2.2'] } };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.searchGHCR('immich-server', 1, 10);
  const item = result.results.find(entry => entry.fullName === 'immich-app/immich-server');
  assert.ok(item, '应返回验证过的 GHCR 容器包，而不是仅猜测 GitHub 仓库名');
  assert.equal(item.pullCommand, 'ghcr.io/immich-app/immich-server');
  assert.equal(item.tagsAvailable, true);
  assert.ok(urls.includes('https://ghcr.io/v2/immich-app/immich-server/tags/list?n=1'));
});

test('多级 OCI 镜像路径按完整 repo 构造 tags/list URL', async () => {
  const requestedUrls = [];
  const service = loadServiceWithAxios({
    async get(url) {
      requestedUrls.push(url);
      if (url === 'https://mcr.microsoft.com/v2/dotnet/sdk/tags/list?n=100') {
        return { headers: {}, data: { name: 'dotnet/sdk', tags: ['8.0'] } };
      }
      if (url === 'https://mcr.microsoft.com/v2/dotnet/sdk/manifests/8.0') {
        return {
          headers: {
            'content-type': 'application/vnd.oci.image.manifest.v1+json',
            'docker-content-digest': 'sha256:manifest'
          },
          data: {
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            config: { digest: 'sha256:config', size: 123 },
            layers: [{ size: 1024 }, { size: 2048 }]
          }
        };
      }
      if (url === 'https://mcr.microsoft.com/v2/dotnet/sdk/blobs/sha256:config') {
        return {
          headers: {},
          data: {
            created: '2026-08-30T01:02:03Z',
            os: 'linux',
            architecture: 'amd64'
          }
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.getImageTags('mcr', 'mcr.microsoft.com/dotnet/sdk:8.0');

  assert.equal(requestedUrls[0], 'https://mcr.microsoft.com/v2/dotnet/sdk/tags/list?n=100');
  assert.ok(requestedUrls.includes('https://mcr.microsoft.com/v2/dotnet/sdk/manifests/8.0'));
  assert.equal(result.results[0].size, 3072);
  assert.equal(result.results[0].lastUpdated, '2026-08-30T01:02:03.000Z');
  assert.deepEqual(result.results[0].images, [{ os: 'linux', architecture: 'amd64', variant: '' }]);
});

test('静态列表搜索会标准化完整 registry 前缀和 tag', async () => {
  const service = loadServiceWithAxios({
    async get(url) {
      if (url === 'https://mcr.microsoft.com/v2/dotnet/sdk/tags/list?n=1') {
        return { data: { name: 'dotnet/sdk', tags: ['8.0'] } };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.searchMCR('mcr.microsoft.com/dotnet/sdk:8.0', 1, 10);

  assert.ok(result.results.some(item => item.fullName === 'dotnet/sdk'));
});

test('Quay 精确镜像探测只拉取单页 active tags，而不是全量标签', async () => {
  const requestedUrls = [];
  const service = loadServiceWithAxios({
    async get(url) {
      requestedUrls.push(url);
      if (String(url).startsWith('https://quay.io/v2/auth?')) {
        return { data: { token: 'quay-token', expires_in: 300 } };
      }
      if (url === 'https://quay.io/api/v1/repository/argoproj/argocd/tag/?onlyActiveTags=true&limit=1&page=1') {
        return {
          data: {
            page: 1,
            has_additional: true,
            tags: [
              {
                name: 'latest',
                manifest_digest: 'sha256:latest',
                last_modified: 'Fri, 28 Aug 2026 13:38:14 -0000'
              }
            ]
          }
        };
      }
      if (String(url).startsWith('https://quay.io/api/v1/find/repositories?')) {
        return { data: { results: [] } };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  await service.searchQuay('argoproj/argocd', 1, 10);

  assert.ok(
    requestedUrls.includes('https://quay.io/api/v1/repository/argoproj/argocd/tag/?onlyActiveTags=true&limit=1&page=1')
  );
  assert.equal(
    requestedUrls.filter(url => String(url).includes('/tag/?onlyActiveTags=true')).length,
    1
  );
});

test('Quay 标签会去重 active tags，并补齐 OS/ARCH、大小和更新时间', async () => {
  const requestedUrls = [];
  const service = loadServiceWithAxios({
    async get(url) {
      requestedUrls.push(url);
      if (String(url).startsWith('https://quay.io/v2/auth?')) {
        return { data: { token: 'quay-token', expires_in: 300 } };
      }
      if (url === 'https://quay.io/api/v1/repository/argoproj/argocd/tag/?onlyActiveTags=true&limit=100&page=1') {
        return {
          data: {
            page: 1,
            has_additional: false,
            tags: [
              {
                name: 'latest',
                manifest_digest: 'sha256:latest',
                last_modified: 'Fri, 28 Aug 2026 13:38:14 -0000',
                is_manifest_list: true,
                size: null
              },
              {
                name: 'latest',
                manifest_digest: 'sha256:older-latest',
                last_modified: 'Fri, 28 Aug 2026 08:27:08 -0000',
                is_manifest_list: true,
                size: null
              },
              {
                name: 'v3.5.2',
                manifest_digest: 'sha256:v352',
                last_modified: 'Thu, 27 Aug 2026 09:32:12 -0000',
                is_manifest_list: true,
                size: null
              },
              {
                name: 'sha256-e2aadfae709d904e87f46ba4aa49601d827b3022db22cd4d03aae816a2e7097b.att',
                manifest_digest: 'sha256:att-1',
                last_modified: 'Thu, 27 Aug 2026 09:33:21 -0000',
                is_manifest_list: false,
                size: 13920
              },
              {
                name: 'sha256-527df4ae3f60662a06334d4f3ada018bea056f29f53639fc618a4bf5bfb6c585.sig',
                manifest_digest: 'sha256:sig-1',
                last_modified: 'Thu, 27 Aug 2026 09:32:01 -0000',
                is_manifest_list: false,
                size: 13792
              }
            ]
          }
        };
      }
      if (url === 'https://quay.io/v2/argoproj/argocd/manifests/latest') {
        return {
          headers: {
            'content-type': 'application/vnd.docker.distribution.manifest.list.v2+json',
            'docker-content-digest': 'sha256:latest'
          },
          data: {
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
            manifests: [
              {
                mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
                digest: 'sha256:latest-amd64',
                size: 3436,
                platform: { os: 'linux', architecture: 'amd64' }
              },
              {
                mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
                digest: 'sha256:latest-arm64',
                size: 3436,
                platform: { os: 'linux', architecture: 'arm64' }
              }
            ]
          }
        };
      }
      if (url === 'https://quay.io/v2/argoproj/argocd/manifests/v3.5.2') {
        return {
          headers: {
            'content-type': 'application/vnd.docker.distribution.manifest.list.v2+json',
            'docker-content-digest': 'sha256:v352'
          },
          data: {
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
            manifests: [
              {
                mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
                digest: 'sha256:v352-amd64',
                size: 1111,
                platform: { os: 'linux', architecture: 'amd64' }
              }
            ]
          }
        };
      }
      if (url === 'https://quay.io/v2/argoproj/argocd/manifests/sha256:latest-amd64') {
        return {
          headers: { 'content-type': 'application/vnd.docker.distribution.manifest.v2+json' },
          data: {
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:latest-config', size: 10 },
            layers: [{ size: 100 }, { size: 200 }]
          }
        };
      }
      if (url === 'https://quay.io/v2/argoproj/argocd/manifests/sha256:v352-amd64') {
        return {
          headers: { 'content-type': 'application/vnd.docker.distribution.manifest.v2+json' },
          data: {
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:v352-config', size: 10 },
            layers: [{ size: 1024 }, { size: 2048 }]
          }
        };
      }
      if (url === 'https://quay.io/v2/argoproj/argocd/blobs/sha256:latest-config') {
        return {
          headers: {},
          data: {
            created: '2026-08-30T00:00:00Z',
            os: 'linux',
            architecture: 'amd64'
          }
        };
      }
      if (url === 'https://quay.io/v2/argoproj/argocd/blobs/sha256:v352-config') {
        return {
          headers: {},
          data: {
            created: '2026-08-27T00:00:00Z',
            os: 'linux',
            architecture: 'amd64'
          }
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.getImageTags('quay', 'argoproj/argocd', 1, 20);

  assert.ok(
    requestedUrls.includes('https://quay.io/api/v1/repository/argoproj/argocd/tag/?onlyActiveTags=true&limit=100&page=1')
  );
  assert.equal(result.count, 2);
  assert.deepEqual(result.results.map(t => t.name), ['v3.5.2', 'latest']);
  assert.ok(result.results.every(t => !/\\.(att|sig)$/i.test(t.name)));
  assert.equal(result.results[0].size, 3072);
  assert.equal(result.results[0].lastUpdated, '2026-08-27T00:00:00.000Z');
  assert.deepEqual(result.results[0].images, [
    { os: 'linux', architecture: 'amd64', variant: '' }
  ]);
  assert.equal(result.results[1].size, 300);
  assert.equal(result.results[1].lastUpdated, '2026-08-30T00:00:00.000Z');
  assert.deepEqual(result.results[1].images, [
    { os: 'linux', architecture: 'amd64', variant: '' },
    { os: 'linux', architecture: 'arm64', variant: '' }
  ]);
});

test('GHCR 标签补齐 OS/ARCH、大小、更新时间，并按最新优先排序', async () => {
  const service = loadServiceWithAxios({
    async get(url) {
      if (String(url).startsWith('https://ghcr.io/token?')) {
        return { headers: {}, data: { token: 'ghcr-token', expires_in: 300 } };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/tags/list?n=100') {
        return {
          headers: {},
          data: { name: 'tale/headplane', tags: ['0.6.0', 'sha256-' + 'a'.repeat(64), 'latest', '0.7.1'] }
        };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/manifests/0.6.0') {
        return {
          headers: {
            'content-type': 'application/vnd.oci.image.index.v1+json',
            'docker-content-digest': 'sha256:old-index'
          },
          data: {
            mediaType: 'application/vnd.oci.image.index.v1+json',
            manifests: [
              { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: 'sha256:old-amd64', size: 100, platform: { os: 'linux', architecture: 'amd64' } }
            ]
          }
        };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/manifests/latest' ||
          url === 'https://ghcr.io/v2/tale/headplane/manifests/0.7.1') {
        return {
          headers: {
            'content-type': 'application/vnd.oci.image.index.v1+json',
            'docker-content-digest': 'sha256:new-index'
          },
          data: {
            mediaType: 'application/vnd.oci.image.index.v1+json',
            manifests: [
              { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: 'sha256:new-amd64', size: 100, platform: { os: 'linux', architecture: 'amd64' } },
              { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: 'sha256:new-arm64', size: 100, platform: { os: 'linux', architecture: 'arm64' } },
              { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: 'sha256:attest', size: 50, platform: { os: 'unknown', architecture: 'unknown' } }
            ]
          }
        };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/manifests/sha256:old-amd64') {
        return {
          headers: { 'content-type': 'application/vnd.oci.image.manifest.v1+json' },
          data: {
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            config: { digest: 'sha256:old-config', size: 10 },
            layers: [{ size: 10 }, { size: 20 }]
          }
        };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/manifests/sha256:new-amd64') {
        return {
          headers: { 'content-type': 'application/vnd.oci.image.manifest.v1+json' },
          data: {
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            config: { digest: 'sha256:new-config', size: 10 },
            layers: [{ size: 1000 }, { size: 2000 }]
          }
        };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/blobs/sha256:old-config') {
        return { headers: {}, data: { created: '2026-01-01T00:00:00Z', os: 'linux', architecture: 'amd64' } };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/blobs/sha256:new-config') {
        return { headers: {}, data: { created: '2026-08-30T00:00:00Z', os: 'linux', architecture: 'amd64' } };
      }
      if (url === 'https://ghcr.io/v2/tale/headplane/manifests/sha256-' + 'a'.repeat(64)) {
        return {
          headers: { 'content-type': 'application/vnd.oci.image.manifest.v1+json' },
          data: {
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            config: { digest: 'sha256:new-config', size: 10 },
            layers: [{ size: 1000 }]
          }
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.getImageTags('ghcr', 'tale/headplane', 1, 2);

  assert.deepEqual(result.results.map(t => t.name), ['0.7.1', '0.6.0']);
  assert.equal(result.count, 3);
  assert.equal(result.results[0].size, 3000);
  assert.equal(result.results[0].lastUpdated, '2026-08-30T00:00:00.000Z');
  assert.deepEqual(result.results[0].images, [
    { os: 'linux', architecture: 'amd64', variant: '' },
    { os: 'linux', architecture: 'arm64', variant: '' }
  ]);
});

test('GHCR 可合并源 GitHub 仓库 release 标签，避免大量 PR/commit 标签截断正式版本', async () => {
  const service = loadServiceWithAxios({
    async get(url) {
      if (String(url).startsWith('https://api.github.com/repos/immich-app/immich/releases?')) {
        return {
          headers: {},
          data: [{ tag_name: 'v3.2.0-rc.1' }, { tag_name: 'v3.1.0' }, { tag_name: 'v3.0.0' }]
        };
      }
      if (url === 'https://ghcr.io/v2/immich-app/immich-server/tags/list?n=100') {
        return {
          headers: {},
          data: { name: 'immich-app/immich-server', tags: ['main', 'v1.132.3'] }
        };
      }
      return {
        headers: {},
        data: {}
      };
    }
  });

  const result = await service.getImageTags(
    'ghcr',
    'immich-app/immich-server',
    1,
    4,
    'immich-app/immich'
  );

  assert.deepEqual(result.results.map(t => t.name), ['v3.1.0', 'v3.0.0', 'v1.132.3', 'v3.2.0-rc.1']);
});

test('K8s 标签请求会手动跟随 registry.k8s.io 的 307 重定向', async () => {
  const requestedUrls = [];
  const service = loadServiceWithAxios({
    async get(url) {
      requestedUrls.push(url);
      if (url === 'https://registry.k8s.io/v2/kube-proxy/tags/list?n=100') {
        return {
          status: 307,
          headers: {
            location: 'https://us-west2-docker.pkg.dev/v2/k8s-artifacts-prod/images/kube-proxy/tags/list?rid=manual-redirect'
          },
          data: ''
        };
      }
      if (url === 'https://us-west2-docker.pkg.dev/v2/k8s-artifacts-prod/images/kube-proxy/tags/list?rid=manual-redirect') {
        return {
          status: 200,
          headers: {},
          data: {
            name: 'kube-proxy',
            tags: ['v1.36.4', 'v1.37.0']
          }
        };
      }
      if (url === 'https://registry.k8s.io/v2/kube-proxy/manifests/v1.37.0') {
        return {
          status: 307,
          headers: {
            location: 'https://us-west2-docker.pkg.dev/v2/k8s-artifacts-prod/images/kube-proxy/manifests/v1.37.0?rid=manifest-redirect'
          },
          data: ''
        };
      }
      if (url === 'https://us-west2-docker.pkg.dev/v2/k8s-artifacts-prod/images/kube-proxy/manifests/v1.37.0?rid=manifest-redirect') {
        return {
          status: 200,
          headers: {
            'content-type': 'application/vnd.oci.image.manifest.v1+json',
            'docker-content-digest': 'sha256:kube-proxy-v1370'
          },
          data: {
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            layers: [{ size: 111 }]
          }
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.getImageTags('k8s', 'kube-proxy', 1, 1);

  assert.equal(result.count, 2);
  assert.equal(result.results[0].name, 'v1.37.0');
  assert.equal(result.results[0].size, 111);
  assert.ok(requestedUrls.includes('https://registry.k8s.io/v2/kube-proxy/tags/list?n=100'));
  assert.ok(requestedUrls.includes('https://us-west2-docker.pkg.dev/v2/k8s-artifacts-prod/images/kube-proxy/tags/list?rid=manual-redirect'));
  assert.ok(requestedUrls.includes('https://registry.k8s.io/v2/kube-proxy/manifests/v1.37.0'));
  assert.ok(requestedUrls.includes('https://us-west2-docker.pkg.dev/v2/k8s-artifacts-prod/images/kube-proxy/manifests/v1.37.0?rid=manifest-redirect'));
});

test('K8s registry 网络失败时，核心控制平面镜像回退到 GitHub releases', async () => {
  const requestedUrls = [];
  const service = loadServiceWithAxios({
    async get(url) {
      requestedUrls.push(url);
      if (url === 'https://registry.k8s.io/v2/kube-proxy/tags/list?n=100') {
        throw new Error('Client network socket disconnected before secure TLS connection was established');
      }
      if (String(url).startsWith('https://api.github.com/repos/kubernetes/kubernetes/releases?')) {
        return {
          headers: {},
          data: [
            { tag_name: 'v1.37.0' },
            { tag_name: 'v1.36.4' },
            { tag_name: 'v1.36.3' }
          ]
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await service.getImageTags('k8s', 'kube-proxy', 1, 2);

  assert.equal(result.count, 3);
  assert.deepEqual(result.results.map(t => t.name), ['v1.37.0', 'v1.36.4']);
  assert.ok(requestedUrls.includes('https://api.github.com/repos/kubernetes/kubernetes/releases?per_page=100&page=1'));
});

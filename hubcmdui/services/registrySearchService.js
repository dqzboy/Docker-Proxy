/**
 * 多 Registry 搜索服务模块
 * 支持 ghcr.io、k8s.gcr.io、quay.io、gcr.io、Elastic、mcr 等公共 Registry 平台
 */
const axios = require('axios');
const logger = require('../logger');

// HTTP 请求配置
const httpOptions = {
  timeout: 15000,
  headers: {
    'User-Agent': 'RegistrySearchClient/1.0',
    'Accept': 'application/json'
  }
};

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
    prefix: 'nvcr.io',
    description: 'NVIDIA GPU 容器镜像仓库'
  }
};

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
      results: (data.results || []).map(item => ({
        name: item.name || item.repo_name,
        namespace: item.namespace || (item.is_official ? 'library' : item.name?.split('/')[0]),
        description: item.description || item.short_description || '',
        stars: item.star_count || 0,
        pulls: item.pull_count || 0,
        isOfficial: item.is_official || false,
        isAutomated: item.is_automated || false,
        fullName: item.is_official ? item.name : (item.repo_name || item.name),
        registry: 'docker-hub',
        pullCommand: item.is_official ? item.name : (item.repo_name || item.name)
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
  const url = `https://quay.io/api/v1/find/repositories?query=${encodeURIComponent(term)}&page=${page}`;
  
  try {
    const response = await axios.get(url, {
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        'Accept': 'application/json'
      }
    });
    
    const results = response.data.results || [];
    
    return {
      registry: 'quay',
      registryName: REGISTRY_CONFIGS['quay'].name,
      registryIcon: REGISTRY_CONFIGS['quay'].icon,
      registryColor: REGISTRY_CONFIGS['quay'].color,
      count: results.length,
      results: results.map(item => ({
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
      }))
    };
  } catch (error) {
    logger.error(`搜索 Quay.io 失败: ${error.message}`);
    // 如果 API 搜索失败，使用静态列表进行本地搜索
    return searchStaticList('quay', term);
  }
}

/**
 * 搜索 GitHub Container Registry (使用 GitHub API)
 */
async function searchGHCR(term, page = 1, pageSize = 25) {
  // 首先尝试使用静态列表搜索
  const staticResults = searchStaticList('ghcr', term);
  
  try {
    // 然后尝试使用 GitHub API 搜索仓库
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(term)}+topic:docker+topic:container&per_page=${pageSize}&page=${page}`;
    
    const response = await axios.get(url, {
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const data = response.data;
    const apiResults = (data.items || []).map(item => ({
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
    
    // 合并静态列表和 API 结果，去重
    const allResults = [...staticResults.results];
    const existingNames = new Set(allResults.map(r => r.fullName.toLowerCase()));
    
    apiResults.forEach(item => {
      if (!existingNames.has(item.fullName.toLowerCase())) {
        allResults.push(item);
      }
    });
    
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
    return staticResults;
  }
}

/**
 * 在静态列表中搜索
 */
function searchStaticList(registryId, term) {
  const config = REGISTRY_CONFIGS[registryId];
  const staticList = STATIC_IMAGE_LISTS[registryId] || [];
  const lowerTerm = term.toLowerCase();
  
  const matchedResults = staticList.filter(item => {
    const nameMatch = item.name.toLowerCase().includes(lowerTerm);
    const descMatch = item.description && item.description.toLowerCase().includes(lowerTerm);
    return nameMatch || descMatch;
  });
  
  return {
    registry: registryId,
    registryName: config.name,
    registryIcon: config.icon,
    registryColor: config.color,
    count: matchedResults.length,
    results: matchedResults.map(item => ({
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
    }))
  };
}

/**
 * 搜索 Kubernetes Registry
 */
async function searchK8s(term, page = 1, pageSize = 25) {
  return searchStaticList('k8s', term);
}

/**
 * 搜索 Google Container Registry
 */
async function searchGCR(term, page = 1, pageSize = 25) {
  return searchStaticList('gcr', term);
}

/**
 * 搜索 Microsoft Container Registry
 */
async function searchMCR(term, page = 1, pageSize = 25) {
  return searchStaticList('mcr', term);
}

/**
 * 搜索 Elastic Container Registry
 */
async function searchElastic(term, page = 1, pageSize = 25) {
  return searchStaticList('elastic', term);
}

/**
 * 搜索 NVIDIA Container Registry
 */
async function searchNVCR(term, page = 1, pageSize = 25) {
  return searchStaticList('nvcr', term);
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
 */
async function searchAllRegistries(term, page = 1, pageSize = 10) {
  const registries = ['docker-hub', 'quay', 'ghcr', 'k8s', 'gcr', 'mcr', 'elastic', 'nvcr'];
  
  const searchPromises = registries.map(registryId => 
    searchRegistry(registryId, term, page, pageSize)
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
    registries: results
  };
}

/**
 * 获取镜像标签 - 根据 Registry 类型选择不同的 API
 */
async function getImageTags(registryId, imageName, page = 1, pageSize = 100) {
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
      return await getOCITags(registryId, imageName);
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
  const [namespace, repo] = imageName.includes('/') 
    ? imageName.split('/')
    : ['library', imageName];
  
  const url = `https://quay.io/api/v1/repository/${namespace}/${repo}/tag/?limit=${pageSize}&page=${page}`;
  
  try {
    const response = await axios.get(url, httpOptions);
    const data = response.data;
    
    return {
      registry: 'quay',
      imageName,
      count: data.tags?.length || 0,
      results: (data.tags || []).map(tag => ({
        name: tag.name,
        digest: tag.manifest_digest,
        lastUpdated: tag.last_modified,
        size: tag.size,
        images: []
      }))
    };
  } catch (error) {
    logger.error(`获取 Quay 标签失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取 OCI Registry 镜像标签（适用于 GCR, MCR, K8s 等）
 */
async function getOCITags(registryId, imageName) {
  const config = REGISTRY_CONFIGS[registryId];
  if (!config || !config.tagsUrl) {
    throw new Error(`Registry ${registryId} 不支持获取标签`);
  }
  
  // 构建 URL
  let url;
  if (imageName.includes('/')) {
    const [namespace, repo] = imageName.split('/');
    url = config.tagsUrl
      .replace('{namespace}', namespace)
      .replace('{repo}', repo);
  } else {
    url = config.tagsUrl.replace('{repo}', imageName);
  }
  
  try {
    const response = await axios.get(url, {
      ...httpOptions,
      headers: {
        ...httpOptions.headers,
        'Accept': 'application/json'
      }
    });
    
    const data = response.data;
    const tags = data.tags || [];
    
    return {
      registry: registryId,
      imageName,
      count: tags.length,
      results: tags.map(tag => ({
        name: typeof tag === 'string' ? tag : tag.name,
        digest: typeof tag === 'object' ? tag.digest : null,
        lastUpdated: null,
        size: null,
        images: []
      }))
    };
  } catch (error) {
    logger.error(`获取 ${registryId} 标签失败: ${error.message}`);
    throw error;
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
  REGISTRY_CONFIGS,
  STATIC_IMAGE_LISTS
};

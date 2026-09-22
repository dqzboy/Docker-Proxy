/**
 * Go 代理管理服务对象
 * 通过 Go 代理的管理端口（默认 :5001）读写配置 / 热重载。
 * 与 Go 端通过 JSON 通信，Go 端负责 YAML 序列化，避免前端引入 yaml 依赖。
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logger');

// 占位符集合：来自历史默认值、示例值或明显弱口令，必须在启动时强制覆盖。
// 这是为了防止生产部署因 .env.example 漏改、docker-compose 模板复制粘贴
// 等常见误操作导致 GO_PROXY_ADMIN_TOKEN 实际为空或可猜测，管理端点完全裸奔。
const ADMIN_TOKEN_PLACEHOLDERS = new Set([
  '',
  'change-me',
  'changeme',
  'please-change-me',
  'admin',
  'admin-token',
  'token',
  'your-strong-token',
  'YOUR_STRONG_TOKEN'
]);
const ADMIN_TOKEN_MIN_LENGTH = 16;

function validateAdminTokenAtStartup() {
  const token = process.env.GO_PROXY_ADMIN_TOKEN || '';
  if (ADMIN_TOKEN_PLACEHOLDERS.has(token)) {
    logger.fatal('【安全】GO_PROXY_ADMIN_TOKEN 未设置或仍为占位符。所有 /-/* 管理端点将退化为裸奔。请立即在环境变量/Compose/Helm 中注入至少 16 位强随机值并重启。');
    // 不直接 process.exit：运维可能希望先看到日志再决定如何处置；
    // 但继续运行等于带病上线，所以给出 fatal 后抛错中断启动。
    throw new Error('GO_PROXY_ADMIN_TOKEN missing or weak; refusing to start in production mode');
  }
  if (token.length < ADMIN_TOKEN_MIN_LENGTH) {
    logger.fatal(`【安全】GO_PROXY_ADMIN_TOKEN 长度 ${token.length} < ${ADMIN_TOKEN_MIN_LENGTH}，拒绝启动以避免管理端点被暴力枚举。请生成一个更长随机值。`);
    throw new Error('GO_PROXY_ADMIN_TOKEN too short; refusing to start in production mode');
  }
  // 仅警告，开发/测试环境短密钥是常见情况
  if (/^[a-z]+$/.test(token) || /^\d+$/.test(token) || /^(.)\1+$/.test(token)) {
    logger.warn('【安全】GO_PROXY_ADMIN_TOKEN 形态过于简单（纯字母 / 纯数字 / 全相同字符），强烈建议替换为高熵随机值。');
  }
  logger.success('GO_PROXY_ADMIN_TOKEN 校验通过（长度 OK，非占位符）');
}

// 必须在所有 axios 调用之前完成校验；导出供 server.js 启动钩子调用。
// （合并到文件末尾最终 module.exports）

// Go 代理管理接口地址（默认指向 go-proxy:5001，docker 网络内可达）
// 优先级：
//   1. GO_PROXY_ADMIN_URL（环境变量；docker-compose 已设置成 http://go-proxy:5001）
//   2. localhost:5001（本机直接 node server.js 开发时最常见）
//   3. go-proxy:5001（最终兜底，docker 网络内可用）
function resolveAdminBase() {
  if (process.env.GO_PROXY_ADMIN_URL) return process.env.GO_PROXY_ADMIN_URL
  // 开发模式提示：本机有 5001 就走本机
  return process.env.NODE_ENV === 'production' ? 'http://go-proxy:5001' : 'http://localhost:5001';
}
const ADMIN_BASE = resolveAdminBase();
// 管理接口鉴权令牌（与 Go 端 GO_PROXY_ADMIN_TOKEN 保持一致）
const ADMIN_TOKEN = process.env.GO_PROXY_ADMIN_TOKEN || '';

// 这是 Docker 网络内的服务间通信，必须直连，不能受 HTTP_PROXY/HTTPS_PROXY 影响。
// NO_PROXY 仍应正确配置，但这里显式禁用代理可避免用户漏配时管理接口不可用。
function adminRequestOptions(options = {}) {
  return { ...options, proxy: false };
}

function adminHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (ADMIN_TOKEN) {
    h['X-Admin-Token'] = ADMIN_TOKEN;
  }
  return h;
}

class GoProxyService {
  /**
   * 获取当前代理配置（密码始终由 Go 端脱敏为 ********）。
   */
  async getConfig() {
    const { data } = await axios.get(`${ADMIN_BASE}/-/config`, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
  }

  /**
   * 获取供内部凭证同步使用的配置。
   *
   * Go 端不会通过 HTTP 返回明文密码，而是使用同一个管理令牌派生
   * AES-256-GCM 密钥后返回加密 payload。明文只在本进程解密并立即交给
   * registryCredentialService 加密落库。
   */
  async getCredentialSyncConfig() {
    const { data } = await axios.get(`${ADMIN_BASE}/-/credentials`, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return decryptCredentialSyncPayload(data);
  }

  /**
   * 全量替换代理配置（写盘 + 热重载）
   */
  async putConfig(cfg) {
    const { data } = await axios.put(`${ADMIN_BASE}/-/config`, cfg, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
  }

  /**
   * 从磁盘重新加载配置
   */
  async reload() {
    const { data } = await axios.post(`${ADMIN_BASE}/-/reload`, {}, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
  }

  /**
   * 健康检查（公开端点，不需要 token）
   */
  async status() {
    try {
      const r = await axios.get(`${ADMIN_BASE}/-/healthz`, adminRequestOptions({ timeout: 5000 }));
      return { reachable: r.status === 200 };
    } catch (e) {
      return { reachable: false, error: e.message };
    }
  }

  /**
   * 获取按客户端 IP 的流量统计（聚合自 go-proxy 内存计数）
   * 返回 { clients: [{ ip, bytesTotal, requests, lastSeen, byRegistry }] }
   */
  async getStats() {
    const { data } = await axios.get(`${ADMIN_BASE}/-/stats`, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
  }

  /**
   * 获取缓存配置与实时统计（缓存开关 / TTL / 配额 / LRU-GC + 命中率 / 已省带宽）。
   * 返回 { config: CacheConfig, stats: { hits, misses, hitRate, bytesServed, entries, sizeBytes, enabled } }
   */
  async getCache() {
    const { data } = await axios.get(`${ADMIN_BASE}/-/cache`, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
  }

  /**
   * 替换缓存配置（写盘 + 热重载）。body 即 CacheConfig。
   */
  async putCache(cacheCfg) {
    const { data } = await axios.put(`${ADMIN_BASE}/-/cache`, cacheCfg, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
  }

  /**
   * 清空磁盘缓存并重置命中计数器。
   */
  async clearCache() {
    const { data } = await axios.post(`${ADMIN_BASE}/-/cache?clear=1`, {}, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 15000
    }));
    return data;
  }
}

function decryptCredentialSyncPayload(response) {
  if (!response || response.algorithm !== 'AES-256-GCM' || !response.payload) {
    throw new Error('Go 代理返回的凭证同步数据格式无效');
  }
  if (!ADMIN_TOKEN) {
    throw new Error('GO_PROXY_ADMIN_TOKEN 未配置，无法解密凭证同步数据');
  }

  const encoded = Buffer.from(String(response.payload), 'base64');
  const nonceLength = 12;
  const authTagLength = 16;
  if (encoded.length <= nonceLength + authTagLength) {
    throw new Error('Go 代理返回的凭证同步数据不完整');
  }

  const nonce = encoded.subarray(0, nonceLength);
  const encrypted = encoded.subarray(nonceLength, -authTagLength);
  const authTag = encoded.subarray(-authTagLength);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    crypto.createHash('sha256').update(ADMIN_TOKEN, 'utf8').digest(),
    nonce
  );
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
  const config = JSON.parse(plaintext);
  if (!config || !Array.isArray(config.registries)) {
    throw new Error('Go 代理返回的凭证同步配置格式无效');
  }
  return config;
}

// 把 axios 错误转换成可返回给前端的错误体，并附带当前 admin 地址
function upstreamError(e) {
  const adminUrl = ADMIN_BASE;
  if (e.response && e.response.data) {
    return {
      status: e.response.status,
      body: typeof e.response.data === 'string'
        ? { error: e.response.data, adminUrl }
        : { ...e.response.data, adminUrl }
    };
  }
  // 无响应（连接被拒 / DNS 失败 / 超时）— 统一 502
  const code = e.code || (e.message || '').split('\n')[0];
  return {
    status: 502,
    body: {
      error: `无法连接 Go 代理管理端口 (${adminUrl}): ${e.message || code || 'unknown'}`,
      adminUrl,
      code: code || undefined
    }
  };
}

// 暴露给 status 端点用，让 UI 能展示当前尝试地址
module.exports = {
  goProxyService: new GoProxyService(),
  upstreamError,
  ADMIN_BASE,
  decryptCredentialSyncPayload,
  // 启动期强校验入口，由 server.js 在 listen 之前调用
  validateAdminTokenAtStartup,
  ADMIN_TOKEN_PLACEHOLDERS,
  ADMIN_TOKEN_MIN_LENGTH
};

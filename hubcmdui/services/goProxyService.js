/**
 * Go 代理管理服务对象
 * 通过 Go 代理的管理端口（默认 :5001）读写配置 / 热重载。
 * 与 Go 端通过 JSON 通信，Go 端负责 YAML 序列化，避免前端引入 yaml 依赖。
 */

const axios = require('axios');
const logger = require('../logger');

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
   * 获取当前代理配置（密码已被 Go 端脱敏为 ********）
   */
  async getConfig() {
    const { data } = await axios.get(`${ADMIN_BASE}/-/config`, adminRequestOptions({
      headers: adminHeaders(),
      timeout: 8000
    }));
    return data;
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
  ADMIN_BASE
};

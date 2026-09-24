'use strict';

const configServiceDB = require('./configServiceDB');
const { goProxyService } = require('./goProxyService');
const logger = require('../logger');

// The basic settings page uses public registry IDs; the Go proxy uses these names.
const REGISTRY_NAMES = Object.freeze({
  'docker-hub': 'dockerhub',
  ghcr: 'ghcr', quay: 'quay', gcr: 'gcr', k8s: 'k8s',
  mcr: 'mcr', elastic: 'elastic', nvcr: 'nvcr'
});

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseProxyHost(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalid('代理地址不能为空');
  }
  const input = value.trim();
  if (/[\/@?#\s]/.test(input)) {
    throw invalid('代理地址只能填写域名或域名:端口，不能包含协议和路径');
  }
  let url;
  try {
    url = new URL(`http://${input}`);
  } catch {
    throw invalid('代理地址不是有效的域名或域名:端口');
  }
  if (!url.hostname || !/^[a-z0-9.-]+$/i.test(url.hostname) ||
      url.hostname.startsWith('.') || url.hostname.endsWith('.') || url.hostname.includes('..')) {
    throw invalid('代理地址不是有效的域名');
  }
  return { value: input, host: url.hostname.toLowerCase() };
}

async function callGo(action) {
  try { return await action(); } catch (error) {
    error.isGoProxyError = true;
    throw error;
  }
}

function hostOf(value) {
  try { return parseProxyHost(value).host; } catch { return String(value || '').toLowerCase(); }
}

async function applyUpdates(configs) {
  if (!Array.isArray(configs) || !configs.length) throw invalid('配置必须是非空数组');
  const stored = await configServiceDB.getRegistryConfigs();
  const known = new Map(stored.map(r => [r.registryId, r]));
  const changes = configs.map(c => {
    if (!c || !Object.hasOwn(REGISTRY_NAMES, c.registryId) || !known.has(c.registryId)) {
      throw invalid(`未知的 Registry: ${c?.registryId || ''}`);
    }
    if (typeof c.enabled !== 'boolean') throw invalid('启用状态必须为布尔值');
    return { ...c, ...parseProxyHost(c.proxyUrl) };
  });
  if (new Set(changes.map(c => c.registryId)).size !== changes.length) {
    throw invalid('Registry 配置不能重复');
  }

  // GET is masked by Go; PUT understands the password sentinel and preserves it.
  const current = await callGo(() => goProxyService.getConfig());
  if (!Array.isArray(current.registries)) throw new Error('Go 代理配置缺少 registries');
  const next = { ...current, registries: current.registries.map(r => ({ ...r, hosts: [...(r.hosts || [])] })) };
  for (const change of changes) {
    const name = REGISTRY_NAMES[change.registryId];
    const reg = next.registries.find(r => r.name === name);
    if (!reg) throw invalid(`Go 代理配置中不存在 Registry: ${name}`);
    const previous = known.get(change.registryId);
    const upstreamHost = new URL(reg.upstream).hostname.toLowerCase();
    const oldHost = previous.proxyUrl ? hostOf(previous.proxyUrl) : '';
    reg.hosts = [change.host, ...reg.hosts.filter(h => {
      const normalized = hostOf(h);
      return normalized !== change.host && (normalized !== oldHost || normalized === upstreamHost) &&
        normalized !== `${name === 'dockerhub' ? 'hub' : name}.your_domain_name`;
    })];
    reg.enabled = change.enabled;
  }
  const seen = new Map();
  for (const reg of next.registries) {
    if (reg.enabled === false) continue;
    for (const host of reg.hosts) {
      const normalized = hostOf(host);
      if (seen.has(normalized) && seen.get(normalized) !== reg.name) {
        throw invalid(`域名 ${normalized} 已被 Registry ${seen.get(normalized)} 使用`);
      }
      seen.set(normalized, reg.name);
    }
  }
  await callGo(() => goProxyService.putConfig(next));
  try {
    await configServiceDB.updateRegistryConfigs(changes.map(c => ({
      registryId: c.registryId, enabled: c.enabled, proxyUrl: c.value
    })));
  } catch (error) {
    // The SQLite write failed after Go saved: restore both stores before reporting failure.
    try { await goProxyService.putConfig(current); } catch (e) {
      logger.error('回滚 Go 代理配置失败:', e);
    }
    try { await configServiceDB.updateRegistryConfigs(changes.map(c => known.get(c.registryId))); } catch (e) {
      logger.error('回滚 Registry 数据库配置失败:', e);
    }
    throw error;
  }
}

// Serialize basic-page writes so two independent Save clicks do not overwrite one another.
let pending = Promise.resolve();
function saveBasicRegistryConfigs(configs) {
  const result = pending.then(() => applyUpdates(configs));
  pending = result.catch(() => {});
  return result;
}

module.exports = { saveBasicRegistryConfigs };

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/basicRegistrySyncService.js');

function loadService({ failGo = false, failDatabase = false } = {}) {
  const calls = { writes: [], db: [] };
  const stored = [
    { registryId: 'docker-hub', proxyUrl: 'registry-1.docker.io', enabled: true },
    { registryId: 'gcr', proxyUrl: 'old.example', enabled: true },
    { registryId: 'k8s', proxyUrl: 'old-k8s.example', enabled: false }
  ];
  const current = {
    default: 'dockerhub', server: { listen: ':5000' }, cache: { enabled: true },
    registries: [
      { name: 'dockerhub', hosts: ['hub.your_domain_name', 'registry-1.docker.io'], upstream: 'https://registry-1.docker.io', enabled: true },
      { name: 'gcr', hosts: ['gcr.your_domain_name', 'old.example', 'gcr.io'], upstream: 'https://gcr.io', enabled: true, auth: { type: 'basic', password: '********' } },
      { name: 'k8s', hosts: ['k8s.your_domain_name'], upstream: 'https://registry.k8s.io', enabled: false }
    ]
  };
  const database = {
    getRegistryConfigs: async () => stored,
    updateRegistryConfigs: async configs => {
      calls.db.push(configs);
      if (failDatabase && calls.db.length === 1) throw new Error('SQLite write failed');
    }
  };
  const proxy = {
    getConfig: async () => current,
    putConfig: async cfg => {
      calls.writes.push(cfg);
      if (failGo && calls.writes.length === 1) throw new Error('Go unavailable');
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === servicePath) {
      if (request === './configServiceDB') return database;
      if (request === './goProxyService') return { goProxyService: proxy };
      if (request === '../logger') return { error() {} };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[servicePath];
    return { save: require(servicePath).saveBasicRegistryConfigs, calls, current };
  } finally {
    Module._load = originalLoad;
    delete require.cache[servicePath];
  }
}

test('basic settings save updates Go routing and preserves unrelated settings', async () => {
  const { save, calls, current } = loadService();
  await save([{ registryId: 'gcr', proxyUrl: 'gcr.docker.srv', enabled: true }]);
  assert.equal(calls.writes.length, 1);
  const config = calls.writes[0];
  assert.equal(config.cache.enabled, true);
  assert.equal(config.default, 'dockerhub');
  assert.deepEqual(config.registries[0], current.registries[0]);
  assert.deepEqual(config.registries[1].hosts, ['gcr.docker.srv', 'gcr.io']);
  assert.equal(config.registries[1].auth.password, '********');
  assert.equal(config.registries[2].enabled, false);
  assert.deepEqual(calls.db[0], [{ registryId: 'gcr', proxyUrl: 'gcr.docker.srv', enabled: true }]);
});

test('a failed Go write does not report a saved basic setting or update SQLite', async () => {
  const { save, calls } = loadService({ failGo: true });
  await assert.rejects(save([{ registryId: 'k8s', proxyUrl: 'k8s.docker.srv', enabled: true }]), /Go unavailable/);
  assert.equal(calls.db.length, 0);
});

test('SQLite failure restores the previous Go configuration', async () => {
  const { save, calls, current } = loadService({ failDatabase: true });
  await assert.rejects(save([{ registryId: 'gcr', proxyUrl: 'gcr.docker.srv', enabled: true }]), /SQLite write failed/);
  assert.equal(calls.writes.length, 2);
  assert.deepEqual(calls.writes[1], current);
});

test('unknown registry and duplicate host are rejected before writing', async () => {
  const { save, calls } = loadService();
  await assert.rejects(save([{ registryId: 'other', proxyUrl: 'other.example', enabled: true }]), /未知的 Registry/);
  await assert.rejects(save([{ registryId: 'gcr', proxyUrl: 'registry-1.docker.io', enabled: true }]), /已被 Registry/);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.db.length, 0);
});

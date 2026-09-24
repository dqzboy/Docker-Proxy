'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const { installOutboundProxy } = require('../lib/outboundProxy');

const keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'];

async function capture(url, options = {}) {
  const client = axios.create();
  installOutboundProxy(client);
  return (await client.get(url, {
    ...options,
    adapter: config => Promise.resolve({ data: config, status: 200, config })
  })).data;
}

function withoutInheritedProxy() {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  return () => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

test('HTTPS through an HTTP proxy uses a CONNECT agent and disables Axios absolute-form proxying', async () => {
  const restore = withoutInheritedProxy();
  try {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:10101';
    const config = await capture('https://hub.docker.com/v2/search/repositories/?query=x');
    assert.equal(config.proxy, false);
    assert.equal(config.httpsAgent.constructor.name, 'HttpsProxyAgent');
    assert.equal(config.httpsAgent.proxy.host, '127.0.0.1');
    assert.equal(config.httpsAgent.proxy.port, 10101);
    assert.equal(config.httpAgent, undefined);
  } finally { restore(); }
});

test('NO_PROXY bypasses the proxy for DNS/SNI destinations, including port and suffix rules', async () => {
  const restore = withoutInheritedProxy();
  try {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:10101';
    process.env.NO_PROXY = 'hub.docker.com, .docker.io, example.com:8443';
    for (const url of ['https://hub.docker.com/v2/', 'https://auth.docker.io/token', 'https://example.com:8443/']) {
      const config = await capture(url);
      assert.equal(config.proxy, false);
      assert.equal(config.httpsAgent, undefined);
    }
    assert.equal((await capture('https://example.com/')).httpsAgent.constructor.name, 'HttpsProxyAgent');
    process.env.NO_PROXY += ',::1';
    assert.equal((await capture('https://[::1]/')).httpsAgent, undefined);
  } finally { restore(); }
});

test('HTTP and SOCKS proxy URLs get matching agents; explicit direct and explicit proxy settings are preserved', async () => {
  const restore = withoutInheritedProxy();
  try {
    process.env.HTTP_PROXY = 'http://127.0.0.1:7890';
    process.env.HTTPS_PROXY = 'socks5h://127.0.0.1:1080';
    assert.equal((await capture('http://example.com')).httpAgent.constructor.name, 'HttpProxyAgent');
    assert.equal((await capture('https://example.com')).httpsAgent.constructor.name, 'SocksProxyAgent');
    assert.equal((await capture('https://example.com', { proxy: false })).httpsAgent, undefined);
    assert.deepEqual((await capture('https://example.com', { proxy: { host: 'proxy', port: 80 } })).proxy, { host: 'proxy', port: 80 });
  } finally { restore(); }
});

test('redirect switches agents using the redirected destination and NO_PROXY', async () => {
  const restore = withoutInheritedProxy();
  try {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:10101';
    process.env.NO_PROXY = 'hub.docker.com';
    const config = await capture('https://quay.io/api/v1');
    const options = { protocol: 'https:', hostname: 'hub.docker.com', path: '/v2/', agents: { https: config.httpsAgent } };
    config.beforeRedirect(options);
    assert.equal(options.agents.https, undefined);
  } finally { restore(); }
});

'use strict';

const axios = require('axios');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const installed = new WeakSet();
const agents = new Map();

function envValue(name) {
  return process.env[name.toLowerCase()] || process.env[name] || '';
}

function bypassProxy(target) {
  const exclusions = envValue('NO_PROXY').split(/[\s,]+/);
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = target.port || (target.protocol === 'https:' ? '443' : '80');

  return exclusions.some(entry => {
    if (!entry) return false;
    if (entry === '*') return true;
    let rule = entry.toLowerCase();
    // Unbracketed IPv6 literals (e.g. ::1) have no explicit port.
    const portMatch = rule.startsWith('[') || rule.indexOf(':') === rule.lastIndexOf(':')
      ? rule.match(/:(\d+)$/) : null;
    if (portMatch) {
      if (portMatch[1] !== port) return false;
      rule = rule.slice(0, -portMatch[0].length);
    }
    rule = rule.replace(/^\[|\]$/g, '');
    if (rule.startsWith('*')) rule = rule.slice(1);
    if (rule.startsWith('.')) return host.endsWith(rule) || host === rule.slice(1);
    return host === rule;
  });
}

function proxyFor(target) {
  if (bypassProxy(target)) return '';
  const protocol = target.protocol.slice(0, -1).toUpperCase();
  return envValue(`${protocol}_PROXY`) || envValue('ALL_PROXY');
}

function agentFor(target) {
  const proxy = proxyFor(target);
  if (!proxy) return undefined;
  const scheme = new URL(proxy).protocol;
  const cacheKey = `${target.protocol}:${proxy}`;
  if (agents.has(cacheKey)) return agents.get(cacheKey);

  let agent;
  if (scheme === 'http:' || scheme === 'https:') {
    agent = target.protocol === 'https:' ? new HttpsProxyAgent(proxy) : new HttpProxyAgent(proxy);
  } else if (['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(scheme)) {
    agent = new SocksProxyAgent(proxy);
  } else {
    throw new Error(`Unsupported outbound proxy protocol: ${scheme}`);
  }
  agents.set(cacheKey, agent);
  return agent;
}

// Apply to every server-side Axios call, including the legacy Docker Hub endpoints.
// Axios 0.27 sends absolute-form GET to an HTTP proxy for HTTPS URLs; an agent
// establishes the CONNECT tunnel required by ordinary HTTP proxies instead.
function installOutboundProxy(client = axios) {
  if (installed.has(client)) return;
  installed.add(client);
  client.interceptors.request.use(config => {
    // The Go admin endpoint must stay direct; /proxy/test chooses its own proxy.
    if (config.proxy === false || (config.proxy && typeof config.proxy === 'object') ||
        config.httpAgent || config.httpsAgent) return config;

    const target = new URL(config.url, config.baseURL);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return config;
    const agent = agentFor(target);
    // Disable Axios's own env proxy handling even for NO_PROXY destinations.
    config.proxy = false;
    config[target.protocol === 'https:' ? 'httpsAgent' : 'httpAgent'] = agent;

    const originalBeforeRedirect = config.beforeRedirect;
    config.beforeRedirect = (options, response, request) => {
      if (originalBeforeRedirect) originalBeforeRedirect(options, response, request);
      const redirected = new URL(`${options.protocol}//${options.hostname}${options.port ? `:${options.port}` : ''}${options.path}`);
      options.agents[redirected.protocol.slice(0, -1)] = agentFor(redirected);
    };
    return config;
  });
}

module.exports = { installOutboundProxy };

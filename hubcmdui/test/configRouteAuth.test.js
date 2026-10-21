/**
 * 回归测试：/api/config 全量读写必须受鉴权保护（issue #109）。
 *
 * 未登录：
 *  - GET 只返回公开子集（theme/language/logo/proxyDomain），不得下发 monitoringConfig。
 *  - POST 返回 401，且不得写入数据库。
 * 已登录：
 *  - GET 返回完整配置。
 *  - POST 允许保存。
 */
const express = require('express');

jest.mock('../services/configServiceDB', () => ({
  getConfig: jest.fn(),
  getDefaultConfig: jest.fn(),
  saveConfigs: jest.fn(),
  saveMenuItems: jest.fn(),
  getMenuItems: jest.fn(),
  getRegistryConfigs: jest.fn(),
  getEnabledRegistryConfigs: jest.fn(),
}));
jest.mock('../services/basicRegistrySyncService', () => ({
  saveBasicRegistryConfigs: jest.fn(),
}));
jest.mock('../services/goProxyService', () => ({
  upstreamError: jest.fn(),
}));
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  request: jest.fn(),
}));

const configServiceDB = require('../services/configServiceDB');
const configRouter = require('../routes/config');

const SECRET = 'TOKEN-SECRET-SHOULD-NOT-LEAK';
const SENSITIVE = {
  notificationType: 'telegram',
  webhookUrl: 'https://hook.example/robot',
  telegramToken: SECRET,
  telegramChatId: '123456',
  isEnabled: true,
};

let server;
let base;

beforeAll(async () => {
  configServiceDB.getConfig.mockResolvedValue({
    logo: 'https://cdn.example/logo.png',
    proxyDomain: 'proxy.example.com',
    monitoringConfig: SENSITIVE,
  });
  configServiceDB.getDefaultConfig.mockReturnValue({
    theme: 'light',
    language: 'zh_CN',
    logo: '',
    proxyDomain: 'registry-1.docker.io',
    monitoringConfig: SENSITIVE,
  });
  configServiceDB.saveConfigs.mockResolvedValue();

  const app = express();
  app.use(express.json());
  // 模拟 session：带 x-test-auth 头即视为已登录（requireLogin 依赖 req.session.user）
  app.use((req, res, next) => {
    req.session = req.headers['x-test-auth']
      ? { user: { username: 'admin' }, touch() {} }
      : { touch() {} };
    next();
  });
  app.use('/api/config', configRouter);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  configServiceDB.saveConfigs.mockClear();
});

test('匿名 GET /api/config/ 只返回公开子集，不泄露监控密钥', async () => {
  const res = await fetch(`${base}/api/config/`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.logo).toBe('https://cdn.example/logo.png');
  expect(body.proxyDomain).toBe('proxy.example.com');
  expect(body.monitoringConfig).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain(SECRET);
});

test('匿名 GET /api/config/config 同样不泄露监控密钥', async () => {
  const res = await fetch(`${base}/api/config/config`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.monitoringConfig).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain(SECRET);
});

test('已登录 GET /api/config/ 返回完整配置（含 monitoringConfig）', async () => {
  const res = await fetch(`${base}/api/config/`, {
    headers: { 'x-test-auth': '1' },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.monitoringConfig).toEqual(SENSITIVE);
});

test('匿名 POST /api/config/ 被拒绝且不写库', async () => {
  const res = await fetch(`${base}/api/config/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ monitoringConfig: { isEnabled: false } }),
  });
  expect(res.status).toBe(401);
  expect(configServiceDB.saveConfigs).not.toHaveBeenCalled();
});

test('匿名 POST /api/config/config 被拒绝且不写库', async () => {
  const res = await fetch(`${base}/api/config/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ logo: 'evil' }),
  });
  expect(res.status).toBe(401);
  expect(configServiceDB.saveConfigs).not.toHaveBeenCalled();
});

test('已登录 POST /api/config/ 允许保存', async () => {
  const payload = { logo: 'https://cdn.example/new.png' };
  const res = await fetch(`${base}/api/config/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-auth': '1' },
    body: JSON.stringify(payload),
  });
  expect(res.status).toBe(200);
  expect(configServiceDB.saveConfigs).toHaveBeenCalledWith(payload);
});

/**
 * 回归测试：requireLogin 白名单不得放行含敏感数据 / 可执行动作的接口。
 * 关联 issue #109 —— /api/monitoring-config 会返回 webhookUrl / telegramToken，
 * /api/toggle-monitoring 可开关告警，二者都必须登录。
 */
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  request: jest.fn(),
}));

const { requireLogin } = require('../middleware/auth');

function run(url, session) {
  const req = { originalUrl: url, url, session };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  requireLogin(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, res };
}

const anonymous = () => ({ touch() {} });
const loggedIn = () => ({ user: { username: 'admin' }, touch() {} });

test('匿名访问 /api/monitoring-config 返回 401', () => {
  const { nextCalled, res } = run('/api/monitoring-config', anonymous());
  expect(nextCalled).toBe(false);
  expect(res.statusCode).toBe(401);
});

test('匿名访问 /api/toggle-monitoring 返回 401', () => {
  const { nextCalled, res } = run('/api/toggle-monitoring', anonymous());
  expect(nextCalled).toBe(false);
  expect(res.statusCode).toBe(401);
});

test('已登录访问 /api/monitoring-config 放行', () => {
  const { nextCalled } = run('/api/monitoring-config', loggedIn());
  expect(nextCalled).toBe(true);
});

test('已登录访问 /api/toggle-monitoring 放行', () => {
  const { nextCalled } = run('/api/toggle-monitoring', loggedIn());
  expect(nextCalled).toBe(true);
});

test('公开只读接口仍放行（未误伤）', () => {
  expect(run('/api/docker/status', anonymous()).nextCalled).toBe(true);
  expect(run('/api/system-resources', anonymous()).nextCalled).toBe(true);
  expect(run('/api/metrics/history', anonymous()).nextCalled).toBe(true);
});

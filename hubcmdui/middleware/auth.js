/**
 * 认证相关中间件
 */
const logger = require('../logger');

/**
 * 需要登录拦截，但允许"仍在使用出厂默认密码"的用户访问 password/username 修改入口。
 * 用法：`app.use('/api/xxx', requireLogin, requireFreshPassword, handler)`
 * 行为：
 *  - 入口必须先经过 requireLogin（确保 req.session.user 存在）。
 *  - 若 req.session.passwordIsDefault === true，则只放行 change-password / change-username / logout / check-session / user-info。
 *  - 其它 API 一律 403 + NEED_CHANGE_PASSWORD，引导前端弹出强制改密弹窗。
 */
const PASSWORD_CHANGE_WHITELIST = [
  '/api/change-password',
  '/api/change-username',
  '/api/logout',
  '/api/check-session',
  '/api/user-info'
];

function requireFreshPassword(req, res, next) {
  // 未登录场景不应触发此中间件；调用顺序保证 requireLogin 在前，这里只是兜底
  if (!req.session || !req.session.user) return next();
  if (!req.session.passwordIsDefault) return next();
  const url = (req.originalUrl || req.url || '').split('?')[0];
  if (PASSWORD_CHANGE_WHITELIST.some(p => url === p || url.startsWith(p + '/'))) {
    return next();
  }
  logger.warn(`拒绝默认密码会话访问 ${req.method} ${url}`);
  return res.status(403).json({
    error: '当前会话仍使用出厂默认密码，请先修改密码后再使用',
    code: 'NEED_CHANGE_PASSWORD',
    requireChangePassword: true
  });
}

/**
 * 检查是否已登录的中间件
 */
function requireLogin(req, res, next) {
    // 使用 originalUrl（完整路径）：挂载子路由中 req.url 为相对路径，直接用 '/api/' 前缀匹配不到
    const url = req.originalUrl || req.url;
    // 放开session检查，不强制要求登录（仅限只读、无敏感的接口）
    // 注意：/api/monitoring-config 与 /api/toggle-monitoring 已移出白名单——
    // 前者会下发 webhookUrl / telegramToken，后者可开关告警，匿名访问属于越权
    // （与 issue #109 同类）；二者仅由后台监控页使用，登录后可正常调用。
    if (        url.startsWith('/api/documentation') ||
        url.startsWith('/api/system-resources') ||
        url.startsWith('/api/metrics/history') ||
        url.includes('/docker/status')) {
        return next(); // 这些API路径不需要登录
    }
    // 注意：/api/test-notification 已不再白名单——它会主动外发请求到用户的
    // webhook / Telegram，必须登录后才会触发，避免被未登录爬虫利用为 SSRF。
    
    // 检查用户是否登录
    if (req.session && req.session.user) {
        // 刷新会话
        req.session.touch();
        return next();
    }
    
    // 未登录返回401错误
    res.status(401).json({ error: '未登录或会话已过期', code: 'SESSION_EXPIRED' });
}

// 修改登录逻辑
async function login(req, res) {
  try {
    const { username, password } = req.body;
    
    // 简单验证
    if (username === 'admin' && password === 'admin123') {
      req.session.user = { username };
      return res.json({ success: true });
    }
    
    res.status(401).json({ error: '用户名或密码错误' });
  } catch (error) {
    logger.error('登录失败:', error);
    res.status(500).json({ error: '登录失败' });
  }
}

/**
 * 记录会话活动的中间件
 */
function sessionActivity(req, res, next) {
    if (req.session && req.session.user) {
        req.session.lastActivity = Date.now();
        req.session.touch(); // 确保会话刷新
    }
    next();
}

// 过滤敏感信息中间件
function sanitizeRequestBody(req, res, next) {
  if (req.body) {
    const sanitizedBody = {...req.body};
    
    // 过滤敏感字段
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '[REDACTED]';
    if (sanitizedBody.newPassword) sanitizedBody.newPassword = '[REDACTED]';
    // 出站代理 URL 可能内嵌 username/password，错误请求日志中不得记录原值。
    if (sanitizedBody.httpProxy) sanitizedBody.httpProxy = '[REDACTED]';
    if (sanitizedBody.httpsProxy) sanitizedBody.httpsProxy = '[REDACTED]';
    if (sanitizedBody.settings && typeof sanitizedBody.settings === 'object') {
      sanitizedBody.settings = { ...sanitizedBody.settings };
      if (sanitizedBody.settings.httpProxy) sanitizedBody.settings.httpProxy = '[REDACTED]';
      if (sanitizedBody.settings.httpsProxy) sanitizedBody.settings.httpsProxy = '[REDACTED]';
    }
    
    // 保存清理后的请求体供日志使用
    req.sanitizedBody = sanitizedBody;
  }
  next();
}

// 安全头部中间件
function securityHeaders(req, res, next) {
  // 添加安全头部
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
}

module.exports = {
  requireLogin,
  requireFreshPassword,
  sessionActivity,
  sanitizeRequestBody,
  securityHeaders
};

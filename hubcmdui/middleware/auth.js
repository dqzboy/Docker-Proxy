/**
 * 认证相关中间件
 */
const logger = require('../logger');

/**
 * 检查是否已登录的中间件
 */
function requireLogin(req, res, next) {
    // 放开session检查，不强制要求登录
    if (req.url.startsWith('/api/documentation') || 
        req.url.startsWith('/api/system-resources') || 
        req.url.startsWith('/api/monitoring-config') || 
        req.url.startsWith('/api/toggle-monitoring') || 
        req.url.startsWith('/api/test-notification') ||
        req.url.includes('/docker/status')) {
        return next(); // 这些API路径不需要登录
    }
    
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
  sessionActivity,
  sanitizeRequestBody,
  securityHeaders
};

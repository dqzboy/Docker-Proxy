#!/usr/bin/env node

/**
 * 应用主入口文件 - 启动服务器并初始化所有组件
 */

// 记录服务器启动时间 - 最先执行这行代码，确保第一时间记录
global.serverStartTime = Date.now();

const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const logger = require('./logger');
const { ensureDirectoriesExist } = require('./init-dirs');
const registerRoutes = require('./routes');
const { requireLogin, sessionActivity, sanitizeRequestBody, securityHeaders } = require('./middleware/auth');

// 记录服务器启动时间到日志
console.log(`服务器启动，时间戳: ${global.serverStartTime}`);
logger.warn(`服务器启动，时间戳: ${global.serverStartTime}`);

// 添加 session 文件存储模块 - 先导入session-file-store并创建对象
const FileStore = require('session-file-store')(session);

// 确保目录结构存在
ensureDirectoriesExist().catch(err => {
  logger.error('创建必要目录失败:', err);
  process.exit(1);
});

// 初始化Express应用 - 确保正确初始化
const app = express();
const server = http.createServer(app);

// 基本中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web')));
// 添加对documentation目录的静态访问
app.use('/documentation', express.static(path.join(__dirname, 'documentation')));
app.use(sessionActivity);
app.use(sanitizeRequestBody);
app.use(securityHeaders);

// 会话配置
app.use(session({
  secret: process.env.SESSION_SECRET || 'hubcmdui-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  },
  store: new FileStore({
    path: path.join(__dirname, 'data', 'sessions'),
    ttl: 86400
  })
}));

// 添加一个中间件来检查API请求的会话状态
app.use('/api', (req, res, next) => {
  // 这些API端点不需要登录
  const publicEndpoints = [
    '/api/login', 
    '/api/logout', 
    '/api/check-session', 
    '/api/health',
    '/api/system-status',
    '/api/system-resource-details',
    '/api/menu-items',
    '/api/config',
    '/api/monitoring-config',
    '/api/documentation',
    '/api/documentation/file'
  ];
  
  // 如果是公共API或用户已登录，则继续
  if (publicEndpoints.includes(req.path) || 
      publicEndpoints.some(endpoint => req.path.startsWith(endpoint)) || 
      (req.session && req.session.user)) {
    return next();
  }
  
  // 否则返回401未授权
  logger.warn(`未授权访问: ${req.path}`);
  return res.status(401).json({ error: 'Unauthorized' });
});

// 导入并注册所有路由
registerRoutes(app);

// 默认路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'admin.html'));
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('应用错误:', err);
  res.status(500).json({ error: '服务器内部错误', details: err.message });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  logger.info(`服务器已启动并监听端口 ${PORT}`);
  
  try {
    // 确保目录存在
    await ensureDirectoriesExist();
    logger.success('系统初始化完成');
  } catch (error) {
    logger.error('系统初始化失败:', error);
  }
});

// 注册进程事件处理
process.on('SIGINT', () => {
  logger.info('接收到中断信号，正在关闭服务...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('接收到终止信号，正在关闭服务...');
  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

module.exports = { app, server };

// 路由注册函数
function registerRoutes(app) {
  try {
    logger.info('开始注册路由...');
    
    // API端点
    app.use('/api', [
      require('./routes/index'),
      require('./routes/docker'),
      require('./routes/docs'),
      require('./routes/users'),
      require('./routes/menu'),
      require('./routes/server')
    ]);
    logger.info('基本API路由已注册');
    
    // 系统路由 - 函数式注册
    const systemRouter = require('./routes/system');
    app.use('/api/system', systemRouter);
    logger.info('系统路由已注册');
    
    // 认证路由 - 直接使用Router实例
    const authRouter = require('./routes/auth');
    app.use('/api', authRouter);
    logger.info('认证路由已注册');
    
    // 配置路由 - 函数式注册
    const configRouter = require('./routes/config');
    if (typeof configRouter === 'function') {
      logger.info('配置路由是一个函数，正在注册...');
      configRouter(app);
      logger.info('配置路由已注册');
    } else {
      logger.error('配置路由不是一个函数，无法注册', typeof configRouter);
    }
    
    logger.success('✓ 所有路由已注册');
  } catch (error) {
    logger.error('路由注册失败:', error);
  }
}

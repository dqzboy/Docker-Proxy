/**
 * Docker 镜像代理加速系统 - 服务器入口点
 */
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const http = require('http');
const logger = require('./logger');
const { ensureDirectoriesExist } = require('./init-dirs');
const { downloadImages } = require('./download-images');
const { gracefulShutdown } = require('./cleanup');
const os = require('os');
const { requireLogin } = require('./middleware/auth');
const compatibilityLayer = require('./compatibility-layer');
const initSystem = require('./scripts/init-system');

// 设置日志级别 (默认INFO, 可通过环境变量设置)
const logLevel = process.env.LOG_LEVEL || 'INFO';
logger.setLogLevel(logLevel);
logger.info(`日志级别已设置为: ${logLevel}`);

// 导入配置
const config = require('./config');

// 导入中间件
const { sessionActivity, sanitizeRequestBody, securityHeaders } = require('./middleware/auth');

// 导入初始化调度器
const { executeOnce } = require('./lib/initScheduler');

// 初始化Express应用
const app = express();
const server = http.createServer(app);

// 配置中间件
app.use(cors());
app.use(express.json());
app.use(express.static('web'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: config.sessionSecret || 'OhTq3faqSKoxbV%NJV',
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: config.secureSession || false,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7天(一周)
  }
}));

// 自定义中间件
app.use(sessionActivity);
app.use(sanitizeRequestBody);
app.use(securityHeaders);

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  
  // 在响应完成后记录日志
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // 增强过滤条件
    const isSuccessfulGet = req.method === 'GET' && (res.statusCode === 200 || res.statusCode === 304);
    const isStaticResource = req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i);
    const isCommonApiRequest = req.url.startsWith('/api/') && 
                              (req.url.includes('/check-session') || 
                               req.url.includes('/system-resources') ||
                               req.url.includes('/docker/status'));
    const isErrorResponse = res.statusCode >= 400;
    
    // 只记录关键API请求和错误响应，过滤普通的API请求和静态资源
    if ((isErrorResponse || 
        (req.url.startsWith('/api/') && !isCommonApiRequest)) && 
        !isStaticResource && 
        !(isSuccessfulGet && isCommonApiRequest)) {
      
      // 记录简化的请求信息
      req.skipDetailedLogging = !isErrorResponse; // 非错误请求跳过详细日志
      logger.request(req, res, duration);
    }
  });
  
  next();
});

// 使用我们的路由注册函数加载所有路由
logger.info('注册所有应用路由...');
const registerRoutes = require('./routes');
registerRoutes(app);

// 提供兼容层以确保旧接口继续工作
require('./compatibility-layer')(app);

// 确保登录路由可用
try {
  const loginRouter = require('./routes/login');
  app.use('/api', loginRouter);
  logger.success('✓ 已添加备用登录路由');
} catch (loginError) {
  logger.error('无法加载备用登录路由:', loginError);
}

// 页面路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'admin.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'docs.html'));
});

// 废弃的登录页面路由 - 该路由未使用且导致404错误，现已移除
// app.get('/login', (req, res) => {
//   // 检查用户是否已登录
//   if (req.session && req.session.user) {
//     return res.redirect('/admin'); // 已登录用户重定向到管理页面
//   }
//   
//   res.sendFile(path.join(__dirname, 'web', 'login.html'));
// });

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '请求的资源不存在' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('应用错误:', err);
  res.status(500).json({ error: '服务器内部错误', details: err.message });
});

// 启动服务器
const PORT = process.env.PORT || 3000;

async function startServer() {
  server.listen(PORT, async () => {
    logger.info(`服务器已启动并监听端口 ${PORT}`);
    
    try {
      // 确保目录存在
      await ensureDirectoriesExist();
      logger.success('系统目录初始化完成');
      
      // 下载必要资源
      await downloadImages();
      logger.success('资源下载完成');
      
      // 初始化系统
      try {
        const { initialize } = require('./scripts/init-system');
        await initialize();
        logger.success('系统初始化完成');
      } catch (initError) {
        logger.warn('系统初始化遇到问题:', initError.message);
        logger.warn('某些功能可能无法正常工作');
      }
      
      // 尝试启动监控
      try {
        const monitoringService = require('./services/monitoringService');
        await monitoringService.startMonitoring();
        logger.success('监控服务已启动');
      } catch (monitoringError) {
        logger.warn('监控服务启动失败:', monitoringError.message);
        logger.warn('监控功能可能不可用');
      }
      
      // 尝试设置WebSocket
      try {
        const dockerRouter = require('./routes/docker');
        if (typeof dockerRouter.setupLogWebsocket === 'function') {
          dockerRouter.setupLogWebsocket(server);
          logger.success('WebSocket服务已启动');
        }
      } catch (wsError) {
        logger.warn('WebSocket服务启动失败:', wsError.message);
        logger.warn('容器日志实时流可能不可用');
      }
      
      logger.success('服务器初始化完成，系统已准备就绪');
    } catch (error) {
      logger.error('系统初始化失败，但服务仍将继续运行:', error);
    }
  });
}

startServer();

// 处理进程终止信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 捕获未处理的Promise拒绝和未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason);
  if (reason instanceof Error) {
    logger.debug('拒绝原因堆栈:', reason.stack);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  logger.error('错误堆栈:', error.stack);
  // 给日志一些时间写入后退出
  setTimeout(() => {
    logger.fatal('由于未捕获的异常，系统将在3秒后退出');
    setTimeout(() => process.exit(1), 3000);
  }, 1000);
});

// 导出服务器对象以供测试使用
module.exports = server;
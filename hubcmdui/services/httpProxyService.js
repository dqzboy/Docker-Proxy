/**
 * HTTP代理服务模块
 */
const http = require('http');
const https = require('https');
const url = require('url');
const net = require('net');
const logger = require('../logger');
const configServiceDB = require('./configServiceDB');

class HttpProxyService {
  constructor() {
    this.proxyServer = null;
    this.isRunning = false;
    this.config = {
      port: 8080,
      host: '0.0.0.0',
      enableHttps: true,
      enableAuth: false,
      username: '',
      password: '',
      allowedHosts: [],
      blockedHosts: [],
      logRequests: true
    };
  }

  /**
   * 启动代理服务器
   */
  async start(config = {}) {
    try {
      this.config = { ...this.config, ...config };
      
      if (this.isRunning) {
        logger.warn('HTTP代理服务器已在运行');
        return;
      }

      this.proxyServer = http.createServer();
      
      // 处理HTTP请求
      this.proxyServer.on('request', this.handleHttpRequest.bind(this));
      
      // 处理HTTPS CONNECT请求
      this.proxyServer.on('connect', this.handleHttpsConnect.bind(this));
      
      // 错误处理
      this.proxyServer.on('error', this.handleServerError.bind(this));

      return new Promise((resolve, reject) => {
        this.proxyServer.listen(this.config.port, this.config.host, (err) => {
          if (err) {
            reject(err);
          } else {
            this.isRunning = true;
            logger.info(`HTTP代理服务器已启动，监听 ${this.config.host}:${this.config.port}`);
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error('启动HTTP代理服务器失败:', error);
      throw error;
    }
  }

  /**
   * 停止代理服务器
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.proxyServer && this.isRunning) {
        this.proxyServer.close(() => {
          this.isRunning = false;
          logger.info('HTTP代理服务器已停止');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理HTTP请求
   */
  handleHttpRequest(clientReq, clientRes) {
    try {
      const targetUrl = clientReq.url;
      const parsedUrl = url.parse(targetUrl);
      
      // 记录请求日志
      if (this.config.logRequests) {
        logger.info(`HTTP代理请求: ${clientReq.method} ${targetUrl}`);
      }

      // 认证检查
      if (this.config.enableAuth && !this.checkAuth(clientReq)) {
        this.sendAuthRequired(clientRes);
        return;
      }

      // 主机检查
      if (!this.isHostAllowed(parsedUrl.hostname)) {
        this.sendForbidden(clientRes, '主机不在允许列表中');
        return;
      }

      if (this.isHostBlocked(parsedUrl.hostname)) {
        this.sendForbidden(clientRes, '主机已被阻止');
        return;
      }

      // 创建目标请求选项
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.path,
        method: clientReq.method,
        headers: { ...clientReq.headers }
      };

      // 移除代理相关的头部
      delete options.headers['proxy-connection'];
      delete options.headers['proxy-authorization'];

      // 选择HTTP或HTTPS
      const httpModule = parsedUrl.protocol === 'https:' ? https : http;

      // 发送请求到目标服务器
      const proxyReq = httpModule.request(options, (proxyRes) => {
        // 复制响应头
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        // 管道传输响应数据
        proxyRes.pipe(clientRes);
      });

      // 错误处理
      proxyReq.on('error', (err) => {
        logger.error('代理请求错误:', err);
        if (!clientRes.headersSent) {
          clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
          clientRes.end('代理服务器错误');
        }
      });

      // 管道传输请求数据
      clientReq.pipe(proxyReq);

    } catch (error) {
      logger.error('处理HTTP请求失败:', error);
      if (!clientRes.headersSent) {
        clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
        clientRes.end('内部服务器错误');
      }
    }
  }

  /**
   * 处理HTTPS CONNECT请求
   */
  handleHttpsConnect(clientReq, clientSocket, head) {
    try {
      const { hostname, port } = this.parseConnectUrl(clientReq.url);
      
      // 记录请求日志
      if (this.config.logRequests) {
        logger.info(`HTTPS代理请求: CONNECT ${hostname}:${port}`);
      }

      // 认证检查
      if (this.config.enableAuth && !this.checkAuth(clientReq)) {
        clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
        clientSocket.end();
        return;
      }

      // 主机检查
      if (!this.isHostAllowed(hostname)) {
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
        return;
      }

      if (this.isHostBlocked(hostname)) {
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
        return;
      }

      // 连接到目标服务器
      const serverSocket = net.connect(port, hostname, () => {
        // 发送连接成功响应
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        
        // 建立隧道
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      // 错误处理
      serverSocket.on('error', (err) => {
        logger.error('服务器连接错误:', err);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      });

      clientSocket.on('error', (err) => {
        logger.error('客户端连接错误:', err);
        serverSocket.end();
      });

    } catch (error) {
      logger.error('处理HTTPS CONNECT请求失败:', error);
      clientSocket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      clientSocket.end();
    }
  }

  /**
   * 解析CONNECT请求URL
   */
  parseConnectUrl(connectUrl) {
    const [hostname, port] = connectUrl.split(':');
    return {
      hostname,
      port: parseInt(port) || 443
    };
  }

  /**
   * 检查认证
   */
  checkAuth(req) {
    if (!this.config.enableAuth) {
      return true;
    }

    const auth = req.headers['proxy-authorization'];
    if (!auth) {
      return false;
    }

    const [type, credentials] = auth.split(' ');
    if (type !== 'Basic') {
      return false;
    }

    const decoded = Buffer.from(credentials, 'base64').toString();
    const [username, password] = decoded.split(':');

    return username === this.config.username && password === this.config.password;
  }

  /**
   * 检查主机是否允许
   */
  isHostAllowed(hostname) {
    if (this.config.allowedHosts.length === 0) {
      return true; // 如果没有设置允许列表，则允许所有
    }
    
    return this.config.allowedHosts.some(allowed => {
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return hostname.endsWith(domain);
      }
      return hostname === allowed;
    });
  }

  /**
   * 检查主机是否被阻止
   */
  isHostBlocked(hostname) {
    return this.config.blockedHosts.some(blocked => {
      if (blocked.startsWith('*.')) {
        const domain = blocked.substring(2);
        return hostname.endsWith(domain);
      }
      return hostname === blocked;
    });
  }

  /**
   * 发送认证要求响应
   */
  sendAuthRequired(res) {
    res.writeHead(407, {
      'Proxy-Authenticate': 'Basic realm="Proxy"',
      'Content-Type': 'text/plain'
    });
    res.end('需要代理认证');
  }

  /**
   * 发送禁止访问响应
   */
  sendForbidden(res, message) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end(message || '禁止访问');
  }

  /**
   * 处理服务器错误
   */
  handleServerError(error) {
    logger.error('HTTP代理服务器错误:', error);
  }

  /**
   * 获取代理状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      port: this.config.port,
      host: this.config.host
    };
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig) {
    try {
      const needRestart = this.isRunning && (
        newConfig.port !== this.config.port ||
        newConfig.host !== this.config.host
      );

      this.config = { ...this.config, ...newConfig };

      if (needRestart) {
        await this.stop();
        await this.start();
        logger.info('HTTP代理服务器配置已更新并重启');
      } else {
        logger.info('HTTP代理服务器配置已更新');
      }

      // 保存配置到数据库
      await configServiceDB.saveConfig('httpProxyConfig', this.config);
    } catch (error) {
      logger.error('更新HTTP代理配置失败:', error);
      throw error;
    }
  }

  /**
   * 从数据库加载配置
   */
  async loadConfig() {
    try {
      const savedConfig = await configServiceDB.getConfig('httpProxyConfig');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
        logger.info('HTTP代理配置已从数据库加载');
      } else {
        // 从环境变量加载默认配置
        this.config = {
          ...this.config,
          port: parseInt(process.env.PROXY_PORT) || this.config.port,
          host: process.env.PROXY_HOST || this.config.host
        };
        logger.info('使用默认HTTP代理配置');
      }
    } catch (error) {
      logger.error('加载HTTP代理配置失败:', error);
      // 使用默认配置
      logger.info('使用默认HTTP代理配置');
    }
  }

  /**
   * 检查环境变量并自动启动代理
   */
  async checkEnvironmentAndAutoStart() {
    const autoStart = process.env.PROXY_AUTO_START;
    const proxyPort = process.env.PROXY_PORT;
    const proxyHost = process.env.PROXY_HOST;
    const enableAuth = process.env.PROXY_ENABLE_AUTH;
    const username = process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASSWORD;

    // 检查是否应该自动启动代理
    if (autoStart === 'true' || proxyPort || proxyHost) {
      logger.info('检测到代理环境变量，尝试自动启动HTTP代理服务...');
      
      const envConfig = {};
      if (proxyPort) envConfig.port = parseInt(proxyPort);
      if (proxyHost) envConfig.host = proxyHost;
      if (enableAuth === 'true') {
        envConfig.enableAuth = true;
        if (username) envConfig.username = username;
        if (password) envConfig.password = password;
      }

      try {
        await this.start(envConfig);
        logger.info(`HTTP代理服务已自动启动 - ${envConfig.host || '0.0.0.0'}:${envConfig.port || 8080}`);
      } catch (error) {
        logger.warn('自动启动HTTP代理服务失败:', error.message);
      }
    } else {
      logger.info('未检测到代理自动启动环境变量');
    }
  }
}

// 创建单例实例
const httpProxyService = new HttpProxyService();

module.exports = httpProxyService;

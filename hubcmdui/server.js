const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const axios = require('axios'); // 用于发送 HTTP 请求
const Docker = require('dockerode');
const app = express();
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const { exec } = require('child_process'); // 网络测试
const validator = require('validator');
const logger = require('./logger');

let docker = null;

async function initDocker() {
  if (docker === null) {
    docker = new Docker();
    try {
      await docker.ping();
      logger.success('成功连接到 Docker 守护进程');
    } catch (err) {
      logger.error(`无法连接到 Docker 守护进程: ${err.message}`);
      docker = null;
    }
  }
  return docker;
}

app.use(cors());
app.use(express.json());
app.use(express.static('web'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'OhTq3faqSKoxbV%NJV',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // 设置为true如果使用HTTPS
}));
app.use(require('morgan')('dev'));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'admin.html'));
});

// 新增：Docker Hub 搜索 API
app.get('/api/search', async (req, res) => {
  const searchTerm = req.query.term;
  if (!searchTerm) {
    return res.status(400).json({ error: 'Search term is required' });
  }

  try {
    const response = await axios.get(`https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(searchTerm)}`);
    res.json(response.data);
  } catch (error) {
    logger.error('Error searching Docker Hub:', error);
    res.status(500).json({ error: 'Failed to search Docker Hub' });
  }
});

const CONFIG_FILE = path.join(__dirname, 'config.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const DOCUMENTATION_DIR = path.join(__dirname, 'documentation');
const DOCUMENTATION_FILE = path.join(__dirname, 'documentation.md');

// 读取配置
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    let config;
    if (!data.trim()) {
      config = {
        logo: '',
        menuItems: [],
        adImages: []
      };
    } else {
      config = JSON.parse(data);
    }
    
    // 确保 monitoringConfig 存在，如果不存在则添加默认值
    if (!config.monitoringConfig) {
      config.monitoringConfig = {
        webhookUrl: '',
        monitorInterval: 60,
        isEnabled: false
      };
    }
    
    return config;
  } catch (error) {
    logger.error('Failed to read config:', error);
    if (error.code === 'ENOENT') {
      return {
        logo: '',
        menuItems: [],
        adImages: [],
        monitoringConfig: {
          webhookUrl: '',
          monitorInterval: 60,
          isEnabled: false
        }
      };
    }
    throw error;
  }
}

// 写入配置
async function writeConfig(config) {
  try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
      logger.success('Config saved successfully');
  } catch (error) {
      logger.error('Failed to save config:', error);
      throw error;
  }
}

// 读取用户
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn('Users file does not exist, creating default user');
      const defaultUser = { username: 'root', password: bcrypt.hashSync('admin', 10) };
      await writeUsers([defaultUser]);
      return { users: [defaultUser] };
    }
    throw error;
  }
}

// 写入用户
async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

// 确保 documentation 目录存在
async function ensureDocumentationDir() {
  try {
      await fs.access(DOCUMENTATION_DIR);
  } catch (error) {
      if (error.code === 'ENOENT') {
          await fs.mkdir(DOCUMENTATION_DIR);
      } else {
          throw error;
      }
  }
}

// 读取文档
async function readDocumentation() {
  try {
    await ensureDocumentationDir();
    const files = await fs.readdir(DOCUMENTATION_DIR);

    const documents = await Promise.all(files.map(async file => {
      const filePath = path.join(DOCUMENTATION_DIR, file);
      const content = await fs.readFile(filePath, 'utf8');
      const doc = JSON.parse(content);
      return {
        id: path.parse(file).name,
        title: doc.title,
        content: doc.content,
        published: doc.published
      };
    }));

    const publishedDocuments = documents.filter(doc => doc.published);
    return publishedDocuments;
  } catch (error) {
    logger.error('Error reading documentation:', error);
    throw error;
  }
}

// 写入文档
async function writeDocumentation(content) {
  await fs.writeFile(DOCUMENTATION_FILE, content, 'utf8');
}

// 登录验证
app.post('/api/login', async (req, res) => {
  const { username, captcha } = req.body;

  if (req.session.captcha !== parseInt(captcha)) {
    logger.warn(`Captcha verification failed for user: ${username}`);
    return res.status(401).json({ error: '验证码错误' });
  }

  const users = await readUsers();
  const user = users.users.find(u => u.username === username);

  if (!user) {
    logger.warn(`User ${username} not found`);
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (bcrypt.compareSync(req.body.password, user.password)) {
    req.session.user = { username: user.username };
    logger.info(`User ${username} logged in successfully`);
    res.json({ success: true });
  } else {
    logger.warn(`Login failed for user: ${username}`);
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// 修改密码
app.post('/api/change-password', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const { currentPassword, newPassword } = req.body;
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be 8-16 characters long and contain at least one letter, one number, and one special character' });
  }
  const users = await readUsers();
  const user = users.users.find(u => u.username === req.session.user.username);
  if (user && bcrypt.compareSync(currentPassword, user.password)) {
    user.password = bcrypt.hashSync(newPassword, 10);
    await writeUsers(users.users);
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid current password' });
  }
});

// 需要登录验证的中间件
function requireLogin(req, res, next) {
  // 创建一个新的对象，只包含非敏感信息
  const sanitizedSession = {
    cookie: req.session.cookie,
    captcha: req.session.captcha,
    user: req.session.user ? { username: req.session.user.username } : undefined
  };

  logger.info('Session:', JSON.stringify(sanitizedSession, null, 2));

  if (req.session.user) {
    next();
  } else {
    logger.warn('用户未登录');
    res.status(401).json({ error: 'Not logged in' });
  }
}

// API 端点：获取配置
app.get('/api/config', async (req, res) => {
  try {
    const config = await readConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// API 端点：保存配置
app.post('/api/config', requireLogin, async (req, res) => {
    try {
        const currentConfig = await readConfig();
        const newConfig = { ...currentConfig, ...req.body };
        await writeConfig(newConfig);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save config' });
    }
});

// API 端点：检查会话状态
app.get('/api/check-session', (req, res) => {
  if (req.session.user) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// API 端点：生成验证码
app.get('/api/captcha', (req, res) => {
  const num1 = Math.floor(Math.random() * 10);
  const num2 = Math.floor(Math.random() * 10);
  const captcha = `${num1} + ${num2} = ?`;
  req.session.captcha = num1 + num2;
  res.json({ captcha });
});

// API端点：获取文档列表
app.get('/api/documentation-list', requireLogin, async (req, res) => {
  try {
      const files = await fs.readdir(DOCUMENTATION_DIR);
      const documents = await Promise.all(files.map(async file => {
          const content = await fs.readFile(path.join(DOCUMENTATION_DIR, file), 'utf8');
          const doc = JSON.parse(content);
          return { id: path.parse(file).name, ...doc };
      }));
      res.json(documents);
  } catch (error) {
      res.status(500).json({ error: '读取文档列表失败' });
  }
});

// API端点：保存文档
app.post('/api/documentation', requireLogin, async (req, res) => {
  try {
      const { id, title, content } = req.body;
      const docId = id || Date.now().toString();
      const docPath = path.join(DOCUMENTATION_DIR, `${docId}.json`);
      await fs.writeFile(docPath, JSON.stringify({ title, content, published: false }));
      res.json({ success: true });
  } catch (error) {
      res.status(500).json({ error: '保存文档失败' });
  }
});

// API端点：删除文档
app.delete('/api/documentation/:id', requireLogin, async (req, res) => {
  try {
      const docPath = path.join(DOCUMENTATION_DIR, `${req.params.id}.json`);
      await fs.unlink(docPath);
      res.json({ success: true });
  } catch (error) {
      res.status(500).json({ error: '删除文档失败' });
  }
});

// API端点：切换文档发布状态
app.post('/api/documentation/:id/toggle-publish', requireLogin, async (req, res) => {
  try {
      const docPath = path.join(DOCUMENTATION_DIR, `${req.params.id}.json`);
      const content = await fs.readFile(docPath, 'utf8');
      const doc = JSON.parse(content);
      doc.published = !doc.published;
      await fs.writeFile(docPath, JSON.stringify(doc));
      res.json({ success: true });
  } catch (error) {
      res.status(500).json({ error: '更改发布状态失败' });
  }
});

// API端点：获取文档
app.get('/api/documentation', async (req, res) => {
  try {
    const documents = await readDocumentation();
    res.json(documents);
  } catch (error) {
    logger.error('Error in /api/documentation:', error);
    res.status(500).json({ error: '读取文档失败', details: error.message });
  }
});

// API端点：保存文档
app.post('/api/documentation', requireLogin, async (req, res) => {
  try {
    const { content } = req.body;
    await writeDocumentation(content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '保存文档失败' });
  }
});

// 获取文档列表函数
async function getDocumentList() {
  try {
    await ensureDocumentationDir();
    const files = await fs.readdir(DOCUMENTATION_DIR);
    logger.info('Files in documentation directory:', files);

    const documents = await Promise.all(files.map(async file => {
      try {
        const filePath = path.join(DOCUMENTATION_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        return {
          id: path.parse(file).name,
          title: path.parse(file).name, // 使用文件名作为标题
          content: content,
          published: true // 假设所有文档都是已发布的
        };
      } catch (fileError) {
        logger.error(`Error reading file ${file}:`, fileError);
        return null;
      }
    }));

    const validDocuments = documents.filter(doc => doc !== null);
    logger.info('Valid documents:', validDocuments);

    return validDocuments;
  } catch (error) {
    logger.error('Error reading document list:', error);
    throw error; // 重新抛出错误，让上层函数处理
  }
}

app.get('/api/documentation-list', async (req, res) => {
  try {
    const documents = await getDocumentList();
    res.json(documents);
  } catch (error) {
    logger.error('Error in /api/documentation-list:', error);
    res.status(500).json({ 
      error: '读取文档列表失败', 
      details: error.message,
      stack: error.stack
    });
  }
});

app.get('/api/documentation/:id', async (req, res) => {
  try {
    const docId = req.params.id;
    const docPath = path.join(DOCUMENTATION_DIR, `${docId}.json`);
    const content = await fs.readFile(docPath, 'utf8');
    const doc = JSON.parse(content);
    res.json(doc);
  } catch (error) {
    logger.error('Error reading document:', error);
    res.status(500).json({ error: '读取文档失败', details: error.message });
  }
});

// API端点来获取Docker容器状态
app.get('/api/docker-status', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const containers = await docker.listContainers({ all: true });
    const containerStatus = await Promise.all(containers.map(async (container) => {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      const stats = await docker.getContainer(container.Id).stats({ stream: false });
      
      // 计算 CPU 使用率
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuUsage = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
      
      // 计算内存使用率
      const memoryUsage = stats.memory_stats.usage / stats.memory_stats.limit * 100;

      return {
        id: container.Id.slice(0, 12),
        name: container.Names[0].replace(/^\//, ''),
        image: container.Image,
        state: containerInfo.State.Status,
        status: container.Status,
        cpu: cpuUsage.toFixed(2) + '%',
        memory: memoryUsage.toFixed(2) + '%',
        created: new Date(container.Created * 1000).toLocaleString()
      };
    }));
    res.json(containerStatus);
  } catch (error) {
    logger.error('获取 Docker 状态时出错:', error);
    res.status(500).json({ error: '获取 Docker 状态失败', details: error.message });
  }
});

// API端点：重启容器
app.post('/api/docker/restart/:id', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ success: true });
  } catch (error) {
    logger.error('重启容器失败:', error);
    res.status(500).json({ error: '重启容器失败', details: error.message });
  }
});

// API端点：停止容器
app.post('/api/docker/stop/:id', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true });
  } catch (error) {
    logger.error('停止容器失败:', error);
    res.status(500).json({ error: '停止容器失败', details: error.message });
  }
});

// API端点：获取单个容器的状态
app.get('/api/docker/status/:id', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const container = docker.getContainer(req.params.id);
    const containerInfo = await container.inspect();
    res.json({ state: containerInfo.State.Status });
  } catch (error) {
    logger.error('获取容器状态失败:', error);
    res.status(500).json({ error: '获取容器状态失败', details: error.message });
  }
});

// API端点：更新容器
app.post('/api/docker/update/:id', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const container = docker.getContainer(req.params.id);
    const containerInfo = await container.inspect();
    const currentImage = containerInfo.Config.Image;
    const [imageName] = currentImage.split(':');
    const newImage = `${imageName}:${req.body.tag}`;
    const containerName = containerInfo.Name.slice(1);  // 去掉开头的 '/'

    logger.info(`Updating container ${req.params.id} from ${currentImage} to ${newImage}`);

    // 拉取新镜像
    logger.info(`Pulling new image: ${newImage}`);
    await new Promise((resolve, reject) => {
      docker.pull(newImage, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, output) => err ? reject(err) : resolve(output));
      });
    });

    // 停止旧容器
    logger.info('Stopping old container');
    await container.stop();

    // 删除旧容器
    logger.info('Removing old container');
    await container.remove();

    // 创建新容器
    logger.info('Creating new container');
    const newContainerConfig = {
      ...containerInfo.Config,
      Image: newImage,
      HostConfig: containerInfo.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: containerInfo.NetworkSettings.Networks
      }
    };
    const newContainer = await docker.createContainer({
      ...newContainerConfig,
      name: containerName
    });

    // 启动新容器
    logger.info('Starting new container');
    await newContainer.start();

    logger.success('Container update completed successfully');
    res.json({ success: true, message: '容器更新成功' });
  } catch (error) {
    logger.error('更新容器失败:', error);
    res.status(500).json({ error: '更新容器失败', details: error.message, stack: error.stack });
  }
});

// API端点：获取容器日志
app.get('/api/docker/logs/:id', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const container = docker.getContainer(req.params.id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,  // 获取最后100行日志
      follow: false
    });
    res.send(logs);
  } catch (error) {
    logger.error('获取容器日志失败:', error);
    res.status(500).json({ error: '获取容器日志失败', details: error.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const containerId = req.url.split('/').pop();
  const docker = new Docker();
  const container = docker.getContainer(containerId);

  container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100
  }, (err, stream) => {
    if (err) {
      ws.send('Error: ' + err.message);
      return;
    }

    stream.on('data', (chunk) => {
      // 移除 ANSI 转义序列
      const cleanedChunk = chunk.toString('utf8').replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
      // 移除不可打印字符
      const printableChunk = cleanedChunk.replace(/[^\x20-\x7E\x0A\x0D]/g, '');
      ws.send(printableChunk);
    });

    ws.on('close', () => {
      stream.destroy();
    });
  });
});

// API端点：删除容器
app.post('/api/docker/delete/:id', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const container = docker.getContainer(req.params.id);
    
    // 首先停止容器（如果正在运行）
    try {
      await container.stop();
    } catch (stopError) {
      logger.info('Container may already be stopped:', stopError.message);
    }

    // 然后删除容器
    await container.remove();
    
    res.json({ success: true, message: '容器已成功删除' });
  } catch (error) {
    logger.error('删除容器失败:', error);
    res.status(500).json({ error: '删除容器失败', details: error.message });
  }
});

app.get('/api/docker/logs-poll/:id', async (req, res) => {
  const { id } = req.params;
  try {
      const container = docker.getContainer(id);
      const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 100,
          follow: false
      });
      res.send(logs);
  } catch (error) {
      res.status(500).send('获取日志失败');
  }
});


// 网络测试
const { execSync } = require('child_process');

// 在应用启动时执行
const pingPath = execSync('which ping').toString().trim();
const traceroutePath = execSync('which traceroute').toString().trim();

app.post('/api/network-test', requireLogin, (req, res) => {
  const { domain, testType } = req.body;

  let command;
  switch (testType) {
      case 'ping':
          command = `${pingPath} -c 4 ${domain}`;
          break;
      case 'traceroute':
          command = `${traceroutePath}  -m 10 ${domain}`;
          break;
      default:
          return res.status(400).send('无效的测试类型');
  }

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
          logger.error(`执行出错: ${error}`);
          return res.status(500).send('测试执行失败');
      }
      res.send(stdout || stderr);
  });
});

// docker 监控
app.get('/api/monitoring-config', requireLogin, async (req, res) => {
  try {
    const config = await readConfig();
    res.json({
      notificationType: config.monitoringConfig.notificationType || 'wechat',
      webhookUrl: config.monitoringConfig.webhookUrl,
      telegramToken: config.monitoringConfig.telegramToken,
      telegramChatId: config.monitoringConfig.telegramChatId,
      monitorInterval: config.monitoringConfig.monitorInterval,
      isEnabled: config.monitoringConfig.isEnabled
    });
  } catch (error) {
    logger.error('Failed to get monitoring config:', error);
    res.status(500).json({ error: 'Failed to get monitoring config', details: error.message });
  }
});

app.post('/api/monitoring-config', requireLogin, async (req, res) => {
  try {
    const { notificationType, webhookUrl, telegramToken, telegramChatId, monitorInterval, isEnabled } = req.body;
    const config = await readConfig();
    config.monitoringConfig = { 
      notificationType,
      webhookUrl,
      telegramToken,
      telegramChatId,
      monitorInterval: parseInt(monitorInterval), 
      isEnabled 
    };
    await writeConfig(config);

    // 重新启动监控
    await startMonitoring();

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to save monitoring config:', error);
    res.status(500).json({ error: 'Failed to save monitoring config', details: error.message });
  }
});

let monitoringInterval;
// 用于跟踪已发送的告警
let sentAlerts = new Set();

// 发送告警的函数，包含重试逻辑
async function sendAlertWithRetry(containerName, status, monitoringConfig, maxRetries = 6) {
  const { notificationType, webhookUrl, telegramToken, telegramChatId } = monitoringConfig;

  const cleanContainerName = containerName.replace(/^\//, '');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (notificationType === 'wechat') {
        await sendWechatAlert(webhookUrl, cleanContainerName, status);
      } else if (notificationType === 'telegram') {
        await sendTelegramAlert(telegramToken, telegramChatId, cleanContainerName, status);
      }
      logger.success(`告警发送成功: ${cleanContainerName} ${status}`);
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(`达到最大重试次数，放弃发送告警: ${cleanContainerName} ${status}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

async function sendWechatAlert(webhookUrl, containerName, status) {
  const response = await axios.post(webhookUrl, {
    msgtype: 'text',
    text: {
      content: `通知: 容器 ${containerName} ${status}`
    }
  }, {
    timeout: 5000
  });

  if (response.status !== 200 || response.data.errcode !== 0) {
    throw new Error(`请求成功但返回错误：${response.data.errmsg}`);
  }
}

async function sendTelegramAlert(token, chatId, containerName, status) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await axios.post(url, {
    chat_id: chatId,
    text: `通知: 容器 ${containerName} ${status}`
  }, {
    timeout: 5000
  });

  if (response.status !== 200 || !response.data.ok) {
    throw new Error(`发送Telegram消息失败：${JSON.stringify(response.data)}`);
  }
}

app.post('/api/test-notification', requireLogin, async (req, res) => {
  try {
    const { notificationType, webhookUrl, telegramToken, telegramChatId } = req.body;
    
    if (notificationType === 'wechat') {
      await sendWechatAlert(webhookUrl, 'Test Container', 'This is a test notification');
    } else if (notificationType === 'telegram') {
      await sendTelegramAlert(telegramToken, telegramChatId, 'Test Container', 'This is a test notification');
    } else {
      throw new Error('Unsupported notification type');
    }

    res.json({ success: true, message: 'Test notification sent successfully' });
  } catch (error) {
    logger.error('Failed to send test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification', details: error.message });
  }
});

let containerStates = new Map();
let lastStopAlertTime = new Map();
let secondAlertSent = new Set();
let lastAlertTime = new Map();

async function startMonitoring() {
  const config = await readConfig();
  const { notificationType, webhookUrl, telegramToken, telegramChatId, monitorInterval, isEnabled } = config.monitoringConfig || {};

  if (isEnabled) {
    const docker = await initDocker();
    if (docker) {
      await initializeContainerStates(docker);

      if (monitoringInterval) {
        clearInterval(monitoringInterval);
      }

      const dockerEventStream = await docker.getEvents();

      dockerEventStream.on('data', async (chunk) => {
        const event = JSON.parse(chunk.toString());
        if (event.Type === 'container' && (event.Action === 'start' || event.Action === 'die')) {
          await handleContainerEvent(docker, event, config.monitoringConfig);
        }
      });

      monitoringInterval = setInterval(async () => {
        await checkContainerStates(docker, config.monitoringConfig);
      }, (monitorInterval || 60) * 1000);
    }
  } else if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}


async function initializeContainerStates(docker) {
  const containers = await docker.listContainers({ all: true });
  for (const container of containers) {
    const containerInfo = await docker.getContainer(container.Id).inspect();
    containerStates.set(container.Id, containerInfo.State.Status);
  }
}


async function handleContainerEvent(docker, event, monitoringConfig) {
  const containerId = event.Actor.ID;
  const container = docker.getContainer(containerId);
  const containerInfo = await container.inspect();
  const newStatus = containerInfo.State.Status;
  const oldStatus = containerStates.get(containerId);

  if (oldStatus && oldStatus !== newStatus) {
    if (newStatus === 'running') {
      await sendAlertWithRetry(containerInfo.Name, `恢复运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, monitoringConfig);
      lastStopAlertTime.delete(containerInfo.Name);
      secondAlertSent.delete(containerInfo.Name);
    } else if (oldStatus === 'running') {
      await sendAlertWithRetry(containerInfo.Name, `停止运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, monitoringConfig);
      lastStopAlertTime.set(containerInfo.Name, Date.now());
      secondAlertSent.delete(containerInfo.Name);
    }
    containerStates.set(containerId, newStatus);
  }
}

async function checkContainerStates(docker, monitoringConfig) {
  const containers = await docker.listContainers({ all: true });
  for (const container of containers) {
    const containerInfo = await docker.getContainer(container.Id).inspect();
    const newStatus = containerInfo.State.Status;
    const oldStatus = containerStates.get(container.Id);
    
    if (oldStatus && oldStatus !== newStatus) {
      if (newStatus === 'running') {
        await sendAlertWithRetry(containerInfo.Name, `恢复运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, monitoringConfig);
        lastStopAlertTime.delete(containerInfo.Name);
        secondAlertSent.delete(containerInfo.Name);
      } else if (oldStatus === 'running') {
        await sendAlertWithRetry(containerInfo.Name, `停止运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, monitoringConfig);
        lastStopAlertTime.set(containerInfo.Name, Date.now());
        secondAlertSent.delete(containerInfo.Name);
      }
      containerStates.set(container.Id, newStatus);
    } else if (newStatus !== 'running') {
      await checkSecondStopAlert(containerInfo.Name, newStatus, monitoringConfig);
    }
  }
}


async function checkRepeatStopAlert(webhookUrl, containerName, currentStatus) {
  const now = Date.now();
  const lastStopAlert = lastStopAlertTime.get(containerName) || 0;

  // 如果距离上次停止告警超过1小时，再次发送告警
  if (now - lastStopAlert >= 60 * 60 * 1000) {
    await sendAlertWithRetry(webhookUrl, containerName, `仍未恢复 (当前状态: ${currentStatus})`);
    lastStopAlertTime.set(containerName, now); // 更新停止告警时间
  }
}

async function checkSecondStopAlert(webhookUrl, containerName, currentStatus) {
  const now = Date.now();
  const lastStopAlert = lastStopAlertTime.get(containerName) || 0;

  // 如果距离上次停止告警超过1小时，且还没有发送过第二次告警，则发送第二次告警
  if (now - lastStopAlert >= 60 * 60 * 1000 && !secondAlertSent.has(containerName)) {
    await sendAlertWithRetry(webhookUrl, containerName, `仍未恢复 (当前状态: ${currentStatus})`);
    secondAlertSent.add(containerName); // 标记已发送第二次告警
  }
}

async function sendAlert(webhookUrl, containerName, status) {
  try {
    await axios.post(webhookUrl, {
      msgtype: 'text',
      text: {
        content: `告警通知: 容器 ${containerName} 当前状态为 ${status}`
      }
    });
  } catch (error) {
    logger.error('发送告警失败:', error);
  }
}

// API端点：切换监控状态
app.post('/api/toggle-monitoring', requireLogin, async (req, res) => {
  try {
    const { isEnabled } = req.body;
    const config = await readConfig();
    config.monitoringConfig.isEnabled = isEnabled;
    await writeConfig(config);

    if (isEnabled) {
      await startMonitoring();
    } else {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }

    res.json({ success: true, message: `Monitoring ${isEnabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    logger.error('Failed to toggle monitoring:', error);
    res.status(500).json({ error: 'Failed to toggle monitoring', details: error.message });
  }
});

app.get('/api/stopped-containers', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const containers = await docker.listContainers({ all: true });
    const stoppedContainers = containers
      .filter(container => container.State !== 'running')
      .map(container => ({
        id: container.Id.slice(0, 12),
        name: container.Names[0].replace(/^\//, ''),
        status: container.State
      }));
    res.json(stoppedContainers);
  } catch (error) {
    logger.error('获取已停止容器列表失败:', error);
    res.status(500).json({ error: '获取已停止容器列表失败', details: error.message });
  }
});


async function loadMonitoringConfig() {
  try {
    const response = await fetch('/api/monitoring-config');
    const config = await response.json();
    document.getElementById('webhookUrl').value = config.webhookUrl || '';
    document.getElementById('monitorInterval').value = config.monitorInterval || 60;
    updateMonitoringStatus(config.isEnabled);
    
    // 添加实时状态检查
    const statusResponse = await fetch('/api/monitoring-status');
    const statusData = await statusResponse.json();
    updateMonitoringStatus(statusData.isRunning);
  } catch (error) {
    showMessage('加载监控配置失败: ' + error.message, true);
  }
}

app.get('/api/monitoring-status', requireLogin, (req, res) => {
  res.json({ isRunning: !!monitoringInterval });
});

app.get('/api/refresh-stopped-containers', requireLogin, async (req, res) => {
  try {
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    const containers = await docker.listContainers({ all: true });
    const stoppedContainers = containers
      .filter(container => container.State !== 'running')
      .map(container => ({
        id: container.Id.slice(0, 12),
        name: container.Names[0].replace(/^\//, ''),
        status: container.State
      }));
    res.json(stoppedContainers);
  } catch (error) {
    logger.error('刷新已停止容器列表失败:', error);
    res.status(500).json({ error: '刷新已停止容器列表失败', details: error.message });
  }
});

async function refreshStoppedContainers() {
  try {
      const response = await fetch('/api/refresh-stopped-containers');
      if (!response.ok) {
          throw new Error('Failed to fetch stopped containers');
      }
      const containers = await response.json();
      renderStoppedContainers(containers);
      showMessage('已停止的容器状态已刷新', false);
  } catch (error) {
      console.error('Error refreshing stopped containers:', error);
      showMessage('刷新已停止的容器状态失败: ' + error.message, true);
  }
}

// 导出函数以供其他模块使用
module.exports = {
  startMonitoring,
  sendAlertWithRetry
};

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
  try {
    await startMonitoring();
  } catch (error) {
    logger.error('Failed to start monitoring:', error);
  }
});
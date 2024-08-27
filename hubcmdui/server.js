const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const logger = require('morgan'); // 引入 morgan 作为日志工具
const axios = require('axios'); // 用于发送 HTTP 请求
const Docker = require('dockerode');
const app = express();
const cors = require('cors');

let docker = null;

async function initDocker() {
  if (docker === null) {
    docker = new Docker();
    try {
      await docker.ping();
      console.log('成功连接到 Docker 守护进程');
    } catch (err) {
      console.error('无法连接到 Docker 守护进程:', err);
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
app.use(logger('dev')); // 使用 morgan 记录请求日志

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
    console.error('Error searching Docker Hub:', error);
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
    // 确保 data 不为空或不完整
    if (!data.trim()) {
      console.warn('Config file is empty, returning default config');
      return {
        logo: '',
        menuItems: [],
        adImages: []
      };
    }
    console.log('Config read successfully');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read config:', error);
    if (error.code === 'ENOENT') {
      return {
        logo: '',
        menuItems: [],
        adImages: []
      };
    }
    throw error;
  }
}

// 写入配置
async function writeConfig(config) {
  try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
      console.log('Config saved successfully');
  } catch (error) {
      console.error('Failed to save config:', error);
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
      console.warn('Users file does not exist, creating default user');
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
    console.error('Error reading documentation:', error);
    throw error;
  }
}

// 写入文档
async function writeDocumentation(content) {
  await fs.writeFile(DOCUMENTATION_FILE, content, 'utf8');
}


// 登录验证
app.post('/api/login', async (req, res) => {
  const { username, password, captcha } = req.body;
  console.log(`Received login request for user: ${username}`); // 打印登录请求的用户名

  if (req.session.captcha !== parseInt(captcha)) {
    console.log(`Captcha verification failed for user: ${username}`); // 打印验证码验证失败
    return res.status(401).json({ error: '验证码错误' });
  }

  const users = await readUsers();
  const user = users.users.find(u => u.username === username);

  if (!user) {
    console.log(`User ${username} not found`); // 打印用户未找到
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  console.log(`User ${username} found, comparing passwords`); // 打印用户找到，开始比较密码
  if (bcrypt.compareSync(password, user.password)) {
    console.log(`User ${username} logged in successfully`); // 打印登录成功
    req.session.user = user;
    res.json({ success: true });
  } else {
    console.log(`Login failed for user: ${username}, password mismatch`); // 打印密码不匹配
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
  console.log('Session:', req.session); // 添加这行
  if (req.session.user) {
    next();
  } else {
    console.log('用户未登录'); // 添加这行
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
    console.error('Error in /api/documentation:', error);
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
    console.log('Files in documentation directory:', files);

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
        console.error(`Error reading file ${file}:`, fileError);
        return null;
      }
    }));

    const validDocuments = documents.filter(doc => doc !== null);
    console.log('Valid documents:', validDocuments);

    return validDocuments;
  } catch (error) {
    console.error('Error reading document list:', error);
    throw error; // 重新抛出错误，让上层函数处理
  }
}

app.get('/api/documentation-list', async (req, res) => {
  try {
    const documents = await getDocumentList();
    res.json(documents);
  } catch (error) {
    console.error('Error in /api/documentation-list:', error);
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
    console.error('Error reading document:', error);
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
    console.error('获取 Docker 状态时出错:', error);
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
    console.error('重启容器失败:', error);
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
    console.error('停止容器失败:', error);
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
    console.error('获取容器状态失败:', error);
    res.status(500).json({ error: '获取容器状态失败', details: error.message });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
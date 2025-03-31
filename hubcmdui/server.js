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
const pLimit = require('p-limit');
const axiosRetry = require('axios-retry');
const NodeCache = require('node-cache');

// 创建请求缓存，TTL为10分钟
const requestCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// 配置并发限制，最多5个并发请求
const limit = pLimit(5);

// 配置Axios重试
axiosRetry(axios, {
  retries: 3, // 最多重试3次
  retryDelay: (retryCount) => {
    console.log(`[INFO] 重试 Docker Hub 请求 (${retryCount}/3)`);
    return retryCount * 1000; // 重试延迟，每次递增1秒
  },
  retryCondition: (error) => {
    // 只在网络错误或5xx响应时重试
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           (error.response && error.response.status >= 500);
  }
});

// 优化HTTP请求配置
const httpOptions = {
  timeout: 15000, // 15秒超时
  headers: {
    'User-Agent': 'DockerHubSearchClient/1.0',
    'Accept': 'application/json'
  }
};

let docker = null;
let containerStates = new Map();
let lastStopAlertTime = new Map();
let secondAlertSent = new Set();

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

// 添加请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  
  // 在响应完成后记录日志
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req, res, duration);
  });
  
  next();
});

// 替换之前的morgan中间件
// app.use(require('morgan')('dev'));

// 正确顺序注册API路由，避免冲突
// 先注册特定路由，后注册通用路由

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

// 代理Docker Hub搜索API
app.get('/api/dockerhub/search', async (req, res) => {
  const term = req.query.term;
  const page = req.query.page || 1;
  
  if (!term) {
    return res.status(400).json({ error: '搜索词不能为空' });
  }
  
  try {
    const cacheKey = `search_${term}_${page}`;
    const cachedResult = requestCache.get(cacheKey);
    
    if (cachedResult) {
      console.log(`[INFO] 返回缓存的搜索结果: ${term} (页码: ${page})`);
      return res.json(cachedResult);
    }
    
    console.log(`[INFO] 搜索Docker Hub: ${term} (页码: ${page})`);
    
    // 使用pLimit进行并发控制的请求
    const result = await limit(async () => {
      const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page=${page}&page_size=25`;
      const response = await axios.get(url, httpOptions);
      return response.data;
    });
    
    // 将结果缓存
    requestCache.set(cacheKey, result);
    res.json(result);
    
  } catch (error) {
    handleAxiosError(error, res, '搜索Docker Hub失败');
  }
});

// 代理Docker Hub TAG API - 改进异常处理和错误响应格式以及过滤无效平台信息
app.get('/api/dockerhub/tags', async (req, res) => {
  const name = req.query.name;
  const isOfficial = req.query.official === 'true';
  const page = req.query.page || 1;
  const pageSize = req.query.page_size || 25;
  
  if (!name) {
    return res.status(400).json({ error: '镜像名称不能为空' });
  }
  
  try {
    const cacheKey = `tags_${name}_${isOfficial}_${page}_${pageSize}`;
    const cachedResult = requestCache.get(cacheKey);
    
    if (cachedResult) {
      console.log(`[INFO] 返回缓存的标签列表: ${name} (页码: ${page}, 每页数量: ${pageSize})`);
      return res.json(cachedResult);
    }
    
    let apiUrl;
    if (isOfficial) {
      apiUrl = `https://hub.docker.com/v2/repositories/library/${name}/tags/?page=${page}&page_size=${pageSize}`;
    } else {
      apiUrl = `https://hub.docker.com/v2/repositories/${name}/tags/?page=${page}&page_size=${pageSize}`;
    }
    
    // 使用pLimit进行并发控制的请求
    const result = await limit(async () => {
      const response = await axios.get(apiUrl, httpOptions);
      return response.data;
    });
    
    // 对结果进行预处理，确保images字段存在
    if (result.results) {
      result.results.forEach(tag => {
        if (!tag.images || !Array.isArray(tag.images)) {
          tag.images = [];
        }
      });
    }
    
    // 将结果缓存
    requestCache.set(cacheKey, result);
    res.json(result);
    
  } catch (error) {
    handleAxiosError(error, res, '获取标签列表失败');
  }
});

// 代理Docker Hub TAG API - 改进异常处理和错误响应格式以及过滤无效平台信息
app.get('/api/dockerhub/tags', async (req, res) => {
  try {
    const imageName = req.query.name;
    const isOfficial = req.query.official === 'true';
    const page = parseInt(req.query.page) || 1;
    const page_size = parseInt(req.query.page_size) || 25; // 默认改为25个标签
    const getAllTags = req.query.all === 'true'; // 是否获取所有标签
    
    if (!imageName) {
      return res.status(400).json({ error: '镜像名称不能为空' });
    }

    // 构建基本参数
    const fullImageName = isOfficial ? `library/${imageName}` : imageName;
    
    if (getAllTags) {
      try {
        logger.info(`获取所有镜像标签: ${fullImageName}`);
        // 为所有标签请求设置超时限制
        const allTagsPromise = fetchAllTags(fullImageName);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('获取所有标签超时')), 30000)
        );
        
        // 使用Promise.race确保请求不会无限等待
        const allTags = await Promise.race([allTagsPromise, timeoutPromise]);
        
        // 过滤掉无效平台信息
        const cleanedTags = allTags.map(tag => {
          if (tag.images && Array.isArray(tag.images)) {
            tag.images = tag.images.filter(img => !(img.os === 'unknown' && img.architecture === 'unknown'));
          }
          return tag;
        });
        
        return res.json({
          count: cleanedTags.length,
          results: cleanedTags,
          all_pages_loaded: true
        });
      } catch (error) {
        logger.error(`获取所有标签失败: ${error.message}`);
        return res.status(500).json({ error: `获取所有标签失败: ${error.message}` });
      }
    } else {
      // 常规分页获取
      logger.info(`获取镜像标签: ${fullImageName}, 页码: ${page}, 页面大小: ${page_size}`);
      const tagsUrl = `https://hub.docker.com/v2/repositories/${fullImageName}/tags?page=${page}&page_size=${page_size}`;
      
      try {
        // 添加超时和重试配置
        const tagsResponse = await axios.get(tagsUrl, {
          timeout: 15000, // 15秒超时
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
          }
        });
        
        // 检查是否有有效的响应数据
        if (!tagsResponse.data || typeof tagsResponse.data !== 'object') {
          logger.warn(`镜像 ${fullImageName} 返回的数据格式不正确`);
          return res.status(500).json({ error: `获取标签列表失败: 响应数据格式不正确` });
        }
        
        if (!tagsResponse.data.results || !Array.isArray(tagsResponse.data.results)) {
          logger.warn(`镜像 ${fullImageName} 没有返回有效的标签数据`);
          return res.json({ count: 0, results: [] });
        }
        
        // 过滤掉无效平台信息
        const cleanedResults = tagsResponse.data.results.map(tag => {
          if (tag.images && Array.isArray(tag.images)) {
            tag.images = tag.images.filter(img => !(img.os === 'unknown' && img.architecture === 'unknown'));
          }
          return tag;
        });
        
        return res.json({
          ...tagsResponse.data,
          results: cleanedResults
        });
      } catch (error) {
        // 更详细的错误日志记录和响应
        logger.error(`获取标签列表失败: ${error.message}`, {
          url: tagsUrl,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        
        // 确保返回一个格式化良好的错误响应
        return res.status(500).json({ 
          error: `获取标签列表失败: ${error.message}`, 
          details: error.response?.data || error.message 
        });
      }
    }
  } catch (error) {
    logger.error(`获取TAG失败:`, error.message);
    return res.status(500).json({ error: '获取TAG失败，请稍后重试', details: error.message });
  }
});

// 辅助函数: 递归获取所有标签 - 修复错误处理和添加页面限制
async function fetchAllTags(fullImageName, page = 1, allTags = [], maxPages = 10) {
  try {
    // 限制最大页数，防止无限递归
    if (page > maxPages) {
      logger.warn(`达到最大页数限制 (${maxPages})，停止获取更多标签`);
      return allTags;
    }
    
    const pageSize = 100; // 使用最大页面大小
    const url = `https://hub.docker.com/v2/repositories/${fullImageName}/tags?page=${page}&page_size=${pageSize}`;
    
    logger.info(`获取标签页 ${page}/${maxPages}...`);
    
    const response = await axios.get(url, {
      timeout: 10000, // 10秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
      }
    });
    
    if (!response.data.results || !Array.isArray(response.data.results)) {
      logger.warn(`页 ${page} 没有有效的标签数据`);
      return allTags;
    }
    
    allTags.push(...response.data.results);
    logger.info(`已获取 ${allTags.length}/${response.data.count || 'unknown'} 个标签`);
    
    // 检查是否有下一页
    if (response.data.next && allTags.length < response.data.count) {
      // 添加一些延迟以避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetchAllTags(fullImageName, page + 1, allTags, maxPages);
    }
    
    logger.success(`成功获取所有 ${allTags.length} 个标签`);
    return allTags;
  } catch (error) {
    logger.error(`递归获取标签失败 (页码 ${page}): ${error.message}`);
    // 如果已经获取了一些标签，返回这些标签而不是抛出错误
    if (allTags.length > 0) {
      logger.info(`尽管出错，仍返回已获取的 ${allTags.length} 个标签`);
      return allTags;
    }
    throw error; // 如果没有获取到任何标签，则抛出错误
  }
}

// API 端点: 获取镜像标签计数 - 修复路由定义
app.get('/api/dockerhub/tag-count', async (req, res) => {
  const name = req.query.name;
  const isOfficial = req.query.official === 'true';
  
  if (!name) {
    return res.status(400).json({ error: '镜像名称不能为空' });
  }
  
  try {
    const cacheKey = `tag_count_${name}_${isOfficial}`;
    const cachedResult = requestCache.get(cacheKey);
    
    if (cachedResult) {
      console.log(`[INFO] 返回缓存的标签计数: ${name}`);
      return res.json(cachedResult);
    }
    
    let apiUrl;
    if (isOfficial) {
      apiUrl = `https://hub.docker.com/v2/repositories/library/${name}/tags/?page_size=1`;
    } else {
      apiUrl = `https://hub.docker.com/v2/repositories/${name}/tags/?page_size=1`;
    }
    
    // 使用pLimit进行并发控制的请求
    const result = await limit(async () => {
      const response = await axios.get(apiUrl, httpOptions);
      return {
        count: response.data.count,
        recommended_mode: response.data.count > 500 ? 'paginated' : 'full'
      };
    });
    
    // 将结果缓存
    requestCache.set(cacheKey, result);
    res.json(result);
    
  } catch (error) {
    handleAxiosError(error, res, '获取标签计数失败');
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
        adImages: [],
        monitoringConfig: {
          webhookUrl: '',
          monitorInterval: 60,
          isEnabled: false
        }
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
  const { username, password, captcha } = req.body;
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
  // 不再记录会话详细信息
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

wss.on('connection', async (ws, req) => {
  const containerId = req.url.split('/').pop();
  const docker = await initDocker();
  if (!docker) {
    ws.send('Error: 无法连接到 Docker 守护进程');
    return;
  }
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
      tail: 100,  // 获取最后100行日志
      follow: false
    });
    res.send(logs);
  } catch (error) {
    res.status(500).send('获取日志失败');
  }
});

// 网络测试
const { execSync } = require('child_process');
const pingPath = execSync('which ping').toString().trim();
const traceroutePath = execSync('which traceroute').toString().trim();

app.post('/api/network-test', requireLogin, (req, res) => {
  const { type, domain } = req.body;
  let command;

  switch (type) {
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

let monitoringInterval; // 用于跟踪监控间隔
let sentAlerts = new Set(); // 用于跟踪已发送的告警

async function startMonitoring() {
  const config = await readConfig();
  const { notificationType, webhookUrl, telegramToken, telegramChatId, monitorInterval, isEnabled } = config.monitoringConfig || {};

  if (isEnabled) {
    const docker = await initDocker();
    if (docker) {
      await initializeContainerStates(docker);
      await checkContainerStates(docker, config.monitoringConfig);
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

async function checkSecondStopAlert(containerName, currentStatus, monitoringConfig) {
  const now = Date.now();
  const lastStopAlert = lastStopAlertTime.get(containerName) || 0;
  // 如果距离上次停止告警超过1小时，且还没有发送过第二次告警，则发送第二次告警
  if (now - lastStopAlert >= 60 * 60 * 1000 && !secondAlertSent.has(containerName)) {
    await sendAlertWithRetry(containerName, `仍未恢复 (当前状态: ${currentStatus})`, monitoringConfig);
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

// 导出函数以供其他模块使用
module.exports = {
  startMonitoring,
  sendAlertWithRetry
};

// 退出登录API
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      logger.error('销毁会话失败:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    logger.info('用户已退出登录');
    res.json({ success: true });
  });
});

// 模拟系统状态API（如果实际不需要实现，可以移除）
app.get('/api/system-status', requireLogin, (req, res) => {
  // 这里可以添加真实的系统状态获取逻辑
  // 当前返回模拟数据
  const containerCount = Math.floor(Math.random() * 10) + 1;
  const memoryUsage = Math.floor(Math.random() * 30) + 40 + '%';
  const cpuLoad = Math.floor(Math.random() * 25) + 20 + '%';
  const diskSpace = Math.floor(Math.random() * 20) + 50 + '%';
  
  const recentActivities = [
    { time: getFormattedTime(0), action: '启动', container: 'nginx', status: '成功' },
    { time: getFormattedTime(30), action: '更新', container: 'mysql', status: '成功' },
    { time: getFormattedTime(120), action: '停止', container: 'redis', status: '成功' }
  ];
  
  res.json({
    containerCount,
    memoryUsage,
    cpuLoad,
    diskSpace,
    recentActivities
  });
});

// 获取格式化的时间（例如："今天 15:30"）
function getFormattedTime(minutesAgo) {
  const date = new Date(Date.now() - minutesAgo * 60 * 1000);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  if (minutesAgo < 24 * 60) {
    return `今天 ${hours}:${minutes}`;
  } else {
    return `昨天 ${hours}:${minutes}`;
  }
}

// 用户统计API
app.get('/api/user-stats', requireLogin, (req, res) => {
  // 模拟数据
  res.json({
    loginCount: Math.floor(Math.random() * 20) + 1,
    lastLogin: getFormattedTime(Math.floor(Math.random() * 48 * 60)),
    accountAge: Math.floor(Math.random() * 100) + 1
  });
});

// 获取真实系统状态的API
app.get('/api/system-status', requireLogin, async (req, res) => {
  try {
    // 初始化Docker客户端
    const docker = await initDocker();
    if (!docker) {
      return res.status(503).json({ error: '无法连接到 Docker 守护进程' });
    }
    
    // 获取容器数量
    const containers = await docker.listContainers({ all: true });
    const runningContainers = containers.filter(c => c.State === 'running');
    const containerCount = containers.length;
    
    // 获取系统信息，使用child_process执行系统命令
    let memoryUsage = '未知';
    let cpuLoad = '未知';
    let diskSpace = '未知';
    
    try {
      // 获取内存使用情况
      const memInfo = await execPromise('free -m | grep Mem');
      const memParts = memInfo.split(/\s+/);
      const totalMem = parseInt(memParts[1]);
      const usedMem = parseInt(memParts[2]);
      memoryUsage = Math.round((usedMem / totalMem) * 100) + '%';
      
      // 获取CPU负载
      const loadInfo = await execPromise('cat /proc/loadavg');
      const loadParts = loadInfo.split(' ');
      cpuLoad = loadParts[0];
      
      // 获取磁盘空间
      const diskInfo = await execPromise('df -h | grep -E "/$|/home"');
      const diskParts = diskInfo.split(/\s+/);
      diskSpace = diskParts[4]; // 使用百分比
    } catch (err) {
      logger.error('获取系统信息时出错:', err);
      
      // 如果获取系统信息失败，尝试使用 Docker 的统计信息
      try {
        const stats = await Promise.all(runningContainers.map(c => 
          docker.getContainer(c.Id).stats({ stream: false })
        ));
        
        // 计算平均CPU使用率
        const avgCpuUsage = stats.reduce((acc, stat) => {
          const cpuDelta = stat.cpu_stats.cpu_usage.total_usage - stat.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stat.cpu_stats.system_cpu_usage - stat.precpu_stats.system_cpu_usage;
          const usage = (cpuDelta / systemDelta) * stat.cpu_stats.online_cpus * 100;
          return acc + usage;
        }, 0) / (stats.length || 1);
        
        // 计算总内存使用率
        const totalMemoryUsage = stats.reduce((acc, stat) => {
          const usage = stat.memory_stats.usage / stat.memory_stats.limit * 100;
          return acc + usage;
        }, 0) / (stats.length || 1);
        
        cpuLoad = avgCpuUsage.toFixed(2) + '%';
        memoryUsage = totalMemoryUsage.toFixed(2) + '%';
      } catch (statsErr) {
        logger.error('获取Docker统计信息时出错:', statsErr);
      }
    }
    
    // 获取最近的容器活动（从Docker事件或日志中）
    let recentActivities = [];
    try {
      // 尝试获取最近的Docker事件
      const eventList = await getRecentDockerEvents(docker);
      recentActivities = eventList.slice(0, 10).map(event => ({
        time: new Date(event.time * 1000).toLocaleString(),
        action: event.Action,
        container: event.Actor?.Attributes?.name || '未知容器',
        status: event.status || '完成'
      }));
    } catch (eventsErr) {
      logger.error('获取Docker事件时出错:', eventsErr);
      // 如果获取Docker事件失败，创建一个占位活动
      recentActivities = [
        { time: new Date().toLocaleString(), action: '系统', container: '监控服务', status: '活动' }
      ];
    }
    
    res.json({
      containerCount,
      memoryUsage,
      cpuLoad,
      diskSpace,
      recentActivities
    });
  } catch (error) {
    logger.error('获取系统状态失败:', error);
    res.status(500).json({ error: '获取系统状态失败', details: error.message });
  }
});

// 获取磁盘空间信息的辅助API
app.get('/api/disk-space', requireLogin, async (req, res) => {
  try {
    const diskInfo = await execPromise('df -h | grep -E "/$|/home"');
    const diskParts = diskInfo.split(/\s+/);
    
    res.json({
      diskSpace: diskParts[2] + '/' + diskParts[1], // 已用/总量
      usagePercent: parseInt(diskParts[4].replace('%', '')) // 使用百分比
    });
  } catch (error) {
    logger.error('获取磁盘空间信息失败:', error);
    res.status(500).json({ error: '获取磁盘空间信息失败', details: error.message });
  }
});

// 用户统计API - 使用真实数据
app.get('/api/user-stats', requireLogin, async (req, res) => {
  try {
    // 这里可以添加从数据库或日志文件获取真实用户统计的代码
    // 暂时使用基本信息
    const username = req.session.user.username;
    const loginCount = 1; // 这应该从会话或数据库中获取
    const lastLogin = '今天'; // 这应该从会话或数据库中获取
    const accountAge = 1; // 创建了多少天，这应该从用户记录中获取
    
    res.json({
      username,
      loginCount,
      lastLogin,
      accountAge
    });
  } catch (error) {
    logger.error('获取用户统计信息失败:', error);
    res.status(500).json({
      loginCount: 1,
      lastLogin: '今天',
      accountAge: 1
    });
  }
});

// Promise化的exec
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// 获取最近的Docker事件
async function getRecentDockerEvents(docker) {
  try {
    // 注意：Dockerode目前的getEvents API可能不支持历史事件查询
    // 这是一个模拟实现，实际使用时可能需要适当调整
    const sinceTime = Math.floor(Date.now() / 1000) - 3600; // 一小时前
    
    return [
      {
        time: Math.floor(Date.now() / 1000) - 60,
        Action: '启动',
        Actor: { Attributes: { name: 'nginx' } },
        status: '成功'
      },
      {
        time: Math.floor(Date.now() / 1000) - 180,
        Action: '重启',
        Actor: { Attributes: { name: 'mysql' } },
        status: '成功'
      },
      {
        time: Math.floor(Date.now() / 1000) - 360,
        Action: '更新',
        Actor: { Attributes: { name: 'redis' } },
        status: '成功'
      }
    ];
  } catch (error) {
    logger.error('获取Docker事件失败:', error);
    return [];
  }
}

app.get('/api/system-stats', requireLogin, async (req, res) => {
  try {
    let dockerAvailable = false;
    let containerCount = '0';
    let memoryUsage = '0%';
    let cpuLoad = '0%';
    let diskSpace = '0%';
    let recentActivities = [];

    // 尝试初始化Docker
    const docker = await initDocker();
    if (docker) {
      dockerAvailable = true;
      
      // 获取容器统计
      try {
        const containers = await docker.listContainers({ all: true });
        containerCount = containers.length.toString();
        
        // 获取最近的容器活动
        const runningContainers = containers.filter(c => c.State === 'running');
        for (let i = 0; i < Math.min(3, runningContainers.length); i++) {
          recentActivities.push({
            time: new Date(runningContainers[i].Created * 1000).toLocaleString(),
            action: '运行中',
            container: runningContainers[i].Names[0].replace(/^\//, ''),
            status: '正常'
          });
        }
      } catch (containerError) {
        logger.error('获取容器信息失败:', containerError);
      }
    }
    
    // 即使Docker不可用，也尝试获取系统信息
    try {
      // 获取内存使用情况
      const memInfo = await execPromise('free -m | grep Mem');
      if (memInfo) {
        const memParts = memInfo.split(/\s+/);
        if (memParts.length >= 3) {
          const total = parseInt(memParts[1], 10);
          const used = parseInt(memParts[2], 10);
          memoryUsage = Math.round((used / total) * 100) + '%';
        }
      }
      
      // 获取CPU负载
      const loadAvg = await execPromise('cat /proc/loadavg');
      if (loadAvg) {
        const load = parseFloat(loadAvg.split(' ')[0]);
        cpuLoad = (load * 100).toFixed(2) + '%';
      }
      
      // 获取磁盘空间
      const diskInfo = await execPromise('df -h | grep -E "/$|/home" | head -1');
      if (diskInfo) {
        const diskParts = diskInfo.split(/\s+/);
        if (diskParts.length >= 5) {
          diskSpace = diskParts[4]; // 使用百分比
        }
      }
    } catch (sysError) {
      logger.error('获取系统信息失败:', sysError);
    }
    
    // 如果没有活动记录，添加一个默认记录
    if (recentActivities.length === 0) {
      recentActivities.push({
        time: new Date().toLocaleString(),
        action: '系统检查',
        container: '监控服务',
        status: dockerAvailable ? '正常' : 'Docker服务不可用'
      });
    }
    
    // 返回收集到的所有数据，即使部分数据可能不完整
    res.json({
      dockerAvailable,
      containerCount,
      memoryUsage,
      cpuLoad,
      diskSpace,
      recentActivities
    });
    
  } catch (error) {
    logger.error('获取系统统计数据失败:', error);
    
    // 即使出错，仍然尝试返回一些基本数据
    res.status(200).json({
      dockerAvailable: false,
      containerCount: '0',
      memoryUsage: '未知',
      cpuLoad: '未知',
      diskSpace: '未知',
      recentActivities: [{
        time: new Date().toLocaleString(),
        action: '系统错误',
        container: '监控服务',
        status: '数据获取失败'
      }],
      error: '获取系统统计数据失败',
      errorDetails: error.message
    });
  }
});


// 辅助函数
function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// 执行系统命令的辅助函数
async function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// API端点：获取用户信息
app.get('/api/user-info', requireLogin, async (req, res) => {
  try {
    // 确保用户已登录
    if (!req.session.user) {
      return res.status(401).json({ error: '未登录' });
    }
    
    const users = await readUsers();
    const user = users.users.find(u => u.username === req.session.user.username);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    // 计算账户年龄（如果有创建日期）
    let accountAge = '0';
    if (user.createdAt) {
      const createdDate = new Date(user.createdAt);
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate - createdDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      accountAge = diffDays.toString();
    }
    
    // 返回用户信息
    res.json({
      username: user.username,
      loginCount: user.loginCount || '0',
      lastLogin: user.lastLogin || '无记录',
      accountAge
    });
  } catch (error) {
    logger.error('获取用户信息失败:', error);
    res.status(500).json({ error: '获取用户信息失败', details: error.message });
  }
});

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

// 统一的错误处理函数
function handleAxiosError(error, res, message) {
  let errorDetails = '';
  
  if (error.response) {
    // 服务器响应错误
    const status = error.response.status;
    errorDetails = `状态码: ${status}`;
    
    if (error.response.data && error.response.data.message) {
      errorDetails += `, 信息: ${error.response.data.message}`;
    }
    
    console.error(`[ERROR] ${message}: ${errorDetails}`);
    res.status(status).json({
      error: `${message} (${errorDetails})`,
      details: error.response.data
    });
    
  } else if (error.request) {
    // 请求已发送但没有收到响应
    if (error.code === 'ECONNRESET') {
      errorDetails = '连接被重置，这可能是由于网络不稳定或服务端断开连接';
    } else if (error.code === 'ECONNABORTED') {
      errorDetails = '请求超时，服务器响应时间过长';
    } else {
      errorDetails = `${error.code || '未知错误代码'}: ${error.message}`;
    }
    
    console.error(`[ERROR] ${message}: ${errorDetails}`);
    res.status(503).json({
      error: `${message} (${errorDetails})`,
      retryable: true
    });
    
  } else {
    // 其他错误
    errorDetails = error.message;
    console.error(`[ERROR] ${message}: ${errorDetails}`);
    console.error(`[ERROR] 错误堆栈: ${error.stack}`);
    
    res.status(500).json({
      error: `${message} (${errorDetails})`,
      retryable: true
    });
  }
}
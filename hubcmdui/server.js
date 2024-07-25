const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const logger = require('morgan'); // 引入 morgan 作为日志工具

const app = express();
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

const CONFIG_FILE = path.join(__dirname, 'config.json');
const USERS_FILE = path.join(__dirname, 'users.json');

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
  if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,16}$/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be 8-16 characters long and contain at least one letter and one number' });
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
  if (req.session.user) {
    next();
  } else {
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

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
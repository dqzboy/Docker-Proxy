const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

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

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'admin.html'));
});

const CONFIG_FILE = path.join(__dirname, 'config.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// 读取配置
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        logo: '',
        menuItems: [],
        adImage: { url: '', link: '' }
      };
    }
    throw error;
  }
}

// 写入配置
async function writeConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// 读取用户
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        users: [{ username: 'root', password: 'admin' }]
      };
    }
    throw error;
  }
}

// 写入用户
async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// 登录验证
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await readUsers();
  const user = users.users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = user;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// 修改密码
app.post('/api/change-password', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const { currentPassword, newPassword } = req.body;
  const users = await readUsers();
  const user = users.users.find(u => u.username === req.session.user.username);
  if (user && user.password === currentPassword) {
    user.password = newPassword;
    await writeUsers(users);
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
    await writeConfig(req.body);
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

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
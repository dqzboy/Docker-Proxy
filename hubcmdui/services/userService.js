/**
 * 用户服务模块
 */
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const logger = require('../logger');

const USERS_FILE = path.join(__dirname, '..', 'users.json');

// 获取所有用户
async function getUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn('Users file does not exist, creating default user');
      const defaultUser = { 
        username: 'root', 
        password: bcrypt.hashSync('admin', 10),
        createdAt: new Date().toISOString(),
        loginCount: 0,
        lastLogin: null
      };
      await saveUsers([defaultUser]);
      return { users: [defaultUser] };
    }
    throw error;
  }
}

// 保存用户
async function saveUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

// 更新用户登录信息
async function updateUserLoginInfo(username) {
  try {
    const { users } = await getUsers();
    const user = users.find(u => u.username === username);
    
    if (user) {
      user.loginCount = (user.loginCount || 0) + 1;
      user.lastLogin = new Date().toISOString();
      await saveUsers(users);
    }
  } catch (error) {
    logger.error('更新用户登录信息失败:', error);
  }
}

// 获取用户统计信息
async function getUserStats(username) {
  try {
    const { users } = await getUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return { loginCount: '0', lastLogin: '未知', accountAge: '0' };
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
    
    // 格式化最后登录时间
    let lastLogin = '未知';
    if (user.lastLogin) {
      const lastLoginDate = new Date(user.lastLogin);
      const now = new Date();
      const isToday = lastLoginDate.toDateString() === now.toDateString();
      
      if (isToday) {
        lastLogin = '今天 ' + lastLoginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        lastLogin = lastLoginDate.toLocaleDateString() + ' ' + lastLoginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    
    return {
      username: user.username,
      loginCount: (user.loginCount || 0).toString(),
      lastLogin,
      accountAge
    };
  } catch (error) {
    logger.error('获取用户统计信息失败:', error);
    return { loginCount: '0', lastLogin: '未知', accountAge: '0' };
  }
}

// 创建新用户
async function createUser(username, password) {
  try {
    const { users } = await getUsers();
    
    // 检查用户是否已存在
    if (users.some(u => u.username === username)) {
      throw new Error('用户名已存在');
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = {
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      loginCount: 0,
      lastLogin: null
    };
    
    users.push(newUser);
    await saveUsers(users);
    
    return { success: true, username };
  } catch (error) {
    logger.error('创建用户失败:', error);
    throw error;
  }
}

// 修改用户密码
async function changePassword(username, currentPassword, newPassword) {
  try {
    const { users } = await getUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      throw new Error('用户不存在');
    }
    
    // 验证当前密码
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error('当前密码不正确');
    }
    
    // 验证新密码复杂度（虽然前端做了，后端再做一层保险）
    if (!isPasswordComplex(newPassword)) {
         throw new Error('新密码不符合复杂度要求');
    }
    
    // 更新密码
    user.password = await bcrypt.hash(newPassword, 10);
    await saveUsers(users);
    
    logger.info(`用户 ${username} 密码已成功修改`);
  } catch (error) {
    logger.error('修改密码失败:', error);
    throw error;
  }
}

// 验证密码复杂度 (从 userCenter.js 复制过来并调整)
function isPasswordComplex(password) {
    // 至少包含1个字母、1个数字和1个特殊字符，长度在8-16位之间
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
    return passwordRegex.test(password);
}

module.exports = {
  getUsers,
  saveUsers,
  updateUserLoginInfo,
  getUserStats,
  createUser,
  changePassword
};

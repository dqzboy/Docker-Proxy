/**
 * 认证相关路由 - 使用SQLite数据库
 */
const express = require('express');
const router = express.Router();
const userServiceDB = require('../services/userServiceDB');
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const { generateCaptchaCode, verifyCaptcha, storeCaptcha, consumeCaptcha } = require('../lib/captcha');
const { DEFAULT_USERNAME, DEFAULT_PASSWORD, isDefaultUsername, isDefaultPassword, isWeakPassword, isCommonUsername, isReservedUsername } = require('../lib/security');

// 登录验证
router.post('/login', async (req, res) => {
  const { username, password, captcha, captchaId } = req.body;

  // 验证码检查（基于服务端 captchaId，与 session 解耦，避免并发请求抢走
  // session cookie 导致校验失败）
  if (!verifyCaptcha(consumeCaptcha(captchaId), captcha)) {
    logger.warn(`Captcha verification failed for user: ${username}`);
    return res.status(401).json({ error: '验证码错误' });
  }

  try {
    // 使用数据库认证
    const user = await userServiceDB.validateUser(username, password);
    
    if (!user) {
      logger.warn(`Login failed for user: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新登录信息
    await userServiceDB.updateUserLoginInfo(username);
    logger.info(`用户 ${username} 登录成功`);

    // 登录成功后更换 Session ID，避免固定会话攻击，也隔离登录前仍在执行的旧请求。
    await new Promise((resolve, reject) => {
      req.session.regenerate(err => err ? reject(err) : resolve());
    });
    req.session.user = { username: user.username };

    // 确保服务器启动时间已设置
    if (!global.serverStartTime) {
      global.serverStartTime = Date.now();
      logger.warn(`登录时设置服务器启动时间: ${global.serverStartTime}`);
    }

    // 明确等待 Session 持久化后再向前端报告成功，保证随后的会话检查可见登录态。
    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    res.json({
      success: true,
      authenticated: true,
      requireChangePassword: isDefaultPassword(password),
      serverStartTime: global.serverStartTime
    });
  } catch (error) {
    logger.error('登录失败:', error);
    res.status(500).json({ error: '登录处理失败', details: error.message });
  }
});

// 注销
router.post('/logout', (req, res) => {
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

// 修改密码
router.post('/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // 密码复杂度校验
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ error: 'Password must be 8-16 characters long and contain at least one letter, one number, and one special character' });
  }

  // 不允许修改为系统默认密码（初始化凭据）
  if (isDefaultPassword(newPassword)) {
    return res.status(400).json({ error: `不允许修改为系统默认密码（${DEFAULT_PASSWORD}）` });
  }

  // 弱口令检测：允许修改，但标记 warning，由前端弹窗提醒用户
  const weakPassword = isWeakPassword(newPassword);

  try {
    // 使用SQLite数据库服务修改密码
    await userServiceDB.changePassword(req.session.user.username, currentPassword, newPassword);
    logger.info(`用户 ${req.session.user.username} 密码修改成功，强制销毁会话以要求重新登录`);
    // 密码已变更，旧会话存在安全风险，强制重新登录
    res.clearCookie('connect.sid');
    req.session.destroy(err => {
      if (err) logger.error('销毁会话失败:', err);
      res.json({ success: true, requireReLogin: true, warning: weakPassword, warningType: weakPassword ? 'weak_password' : null });
    });
  } catch (error) {
    logger.error('修改密码失败:', error);
    res.status(500).json({ error: '修改密码失败', details: error.message });
  }
});

// 修改用户名
router.post('/change-username', requireLogin, async (req, res) => {
  const { newUsername, password } = req.body;
  
  // 用户名格式校验
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!usernameRegex.test(newUsername)) {
    return res.status(400).json({ error: '用户名格式不正确（3-20位，只能包含字母、数字和下划线）' });
  }

  // 不允许修改为系统默认用户名（如 root）
  if (isDefaultUsername(newUsername)) {
    return res.status(400).json({ error: `不允许修改为系统默认用户名（${DEFAULT_USERNAME}）` });
  }

  // 不允许修改为系统保留用户名（如 admin）：保留名不可被任何用户注册/占用
  if (isReservedUsername(newUsername)) {
    return res.status(400).json({ error: `「${newUsername}」为系统保留用户名，不可使用` });
  }

  // 常见用户名检测：允许修改，但标记 warning，由前端弹窗提醒用户
  const commonUsername = isCommonUsername(newUsername);

  try {
    const currentUsername = req.session.user.username;
    const result = await userServiceDB.changeUsername(currentUsername, newUsername, password);

    logger.info(`用户 ${currentUsername} 已修改用户名为 ${newUsername}，强制销毁会话以要求重新登录`);
    // 用户名已变更，旧会话中记录的身份已失效，强制重新登录
    res.clearCookie('connect.sid');
    req.session.destroy(err => {
      if (err) logger.error('销毁会话失败:', err);
      res.json({ success: true, requireReLogin: true, newUsername, warning: commonUsername, warningType: commonUsername ? 'common_username' : null });
    });
  } catch (error) {
    logger.error('修改用户名失败:', error);
    res.status(400).json({ error: error.message || '修改用户名失败' });
  }
});

// 获取用户信息
router.get('/user-info', requireLogin, async (req, res) => {
  try {
    const userStats = await userServiceDB.getUserStats(req.session.user.username);
    
    res.json(userStats);
  } catch (error) {
    logger.error('获取用户信息失败:', error);
    res.status(500).json({ error: '获取用户信息失败', details: error.message });
  }
});

// 生成验证码
router.get('/captcha', (req, res) => {
  const captcha = generateCaptchaCode(4);
  const captchaId = storeCaptcha(captcha); // 与 session 解耦存储
  
  // 确保serverStartTime已初始化
  if (!global.serverStartTime) {
    global.serverStartTime = Date.now();
    logger.warn(`初始化服务器启动时间: ${global.serverStartTime}`);
  }
  
  res.json({ 
    captcha,
    captchaId,
    serverStartTime: global.serverStartTime
  });
});

// 检查会话状态
router.get('/check-session', (req, res) => {
  // 会话状态不能被浏览器或反向代理缓存，否则登录后可能读到旧的未登录结果。
  res.set('Cache-Control', 'no-store');

  // 如果global.serverStartTime不存在，创建一个
  if (!global.serverStartTime) {
    global.serverStartTime = Date.now();
    logger.warn(`设置服务器启动时间: ${global.serverStartTime}`);
  }

  if (req.session && req.session.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: {
        username: req.session.user.username,
        role: req.session.user.role,
      },
      serverStartTime: global.serverStartTime // 返回服务器启动时间
    });
  }
  return res.status(401).json({
    success: false,
    authenticated: false,
    message: '未登录',
    serverStartTime: global.serverStartTime // 即使未登录也返回服务器时间
  });
});

// 请求密码重置令牌（需要用户名验证）
router.post('/request-reset-token', async (req, res) => {
  const { username, captcha, captchaId } = req.body;
  
  // 验证码检查（基于服务端 captchaId，与 session 解耦）
  if (!verifyCaptcha(consumeCaptcha(captchaId), captcha)) {
    logger.warn(`重置密码验证码验证失败: ${username}`);
    return res.status(401).json({ error: '验证码错误' });
  }

  try {
    // 验证用户是否存在
    const user = await userServiceDB.getUserByUsername(username);
    if (!user) {
      logger.warn(`密码重置请求失败，用户不存在: ${username}`);
      return res.status(404).json({ error: '用户不存在' });
    }

    // 生成重置令牌
    const token = userServiceDB.generateResetToken(username);
    
    logger.info(`用户 ${username} 请求了密码重置令牌`);
    
    // 返回令牌（在生产环境中，这应该通过邮件发送）
    res.json({ 
      success: true, 
      token,
      message: '重置令牌已生成，有效期10分钟',
      expiresIn: '10分钟'
    });
  } catch (error) {
    logger.error('生成重置令牌失败:', error);
    res.status(500).json({ error: '生成重置令牌失败', details: error.message });
  }
});

// 使用令牌重置密码
router.post('/reset-password', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;
  
  // 验证密码是否匹配
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: '两次输入的密码不一致' });
  }
  
  // 密码复杂度校验
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({ error: '密码需要8-16位，包含至少一个字母、一个数字和一个特殊字符' });
  }
  
  try {
    const result = await userServiceDB.resetPasswordWithToken(token, newPassword);
    logger.info(`用户 ${result.username} 通过重置令牌成功修改了密码`);
    res.json({ success: true, message: '密码重置成功，请使用新密码登录' });
  } catch (error) {
    logger.error('重置密码失败:', error);
    res.status(400).json({ error: error.message || '重置密码失败' });
  }
});

// 验证重置令牌是否有效
router.post('/validate-reset-token', (req, res) => {
  const { token } = req.body;
  
  const username = userServiceDB.validateResetToken(token);
  if (username) {
    res.json({ valid: true, username });
  } else {
    res.status(400).json({ valid: false, error: '令牌无效或已过期' });
  }
});

logger.success('✓ 认证路由已加载');

// 导出路由
module.exports = router;

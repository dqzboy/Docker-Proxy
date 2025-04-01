/**
 * 登录路由
 */
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../logger');

// 生成随机验证码
function generateCaptcha() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// 获取验证码
router.get('/captcha', (req, res) => {
    const captcha = generateCaptcha();
    req.session.captcha = captcha;
    res.json({ captcha });
});

// 处理登录
router.post('/login', async (req, res) => {
    try {
        const { username, password, captcha } = req.body;
        
        // 验证码检查
        if (!req.session.captcha || req.session.captcha !== captcha) {
            return res.status(401).json({ error: '验证码错误' });
        }
        
        // 读取用户文件
        const userFilePath = path.join(__dirname, '../config/users.json');
        let users;
        
        try {
            const data = await fs.readFile(userFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (err) {
            logger.error('读取用户文件失败:', err);
            return res.status(500).json({ error: '内部服务器错误' });
        }
        
        // 查找用户
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 验证密码
        const hashedPassword = crypto
            .createHash('sha256')
            .update(password + user.salt)
            .digest('hex');
            
        if (hashedPassword !== user.password) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 登录成功
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            loginCount: (user.loginCount || 0) + 1,
            lastLogin: new Date().toISOString()
        };
        
        // 更新登录信息
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLogin = new Date().toISOString();
        
        await fs.writeFile(userFilePath, JSON.stringify(users, null, 2), 'utf8');
        
        res.json({ 
            success: true, 
            user: {
                username: user.username,
                role: user.role
            }
        });
    } catch (err) {
        logger.error('登录处理错误:', err);
        res.status(500).json({ error: '登录处理失败' });
    }
});

logger.success('✓ 登录路由已加载');

// 导出路由
module.exports = router;

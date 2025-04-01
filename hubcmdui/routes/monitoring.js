/**
 * 监控配置路由
 */
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { requireLogin } = require('../middleware/auth');
const logger = require('../logger');

// 监控配置文件路径
const CONFIG_FILE = path.join(__dirname, '../config/monitoring.json');

// 确保配置文件存在
async function ensureConfigFile() {
    try {
        await fs.access(CONFIG_FILE);
    } catch (err) {
        // 文件不存在，创建默认配置
        const defaultConfig = {
            isEnabled: false,
            notificationType: 'wechat',
            webhookUrl: '',
            telegramToken: '',
            telegramChatId: '',
            monitorInterval: 60
        };
        
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
        await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
        return defaultConfig;
    }
    
    // 文件存在，读取配置
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
}

// 获取监控配置
router.get('/monitoring-config', requireLogin, async (req, res) => {
    try {
        const config = await ensureConfigFile();
        res.json(config);
    } catch (err) {
        logger.error('获取监控配置失败:', err);
        res.status(500).json({ error: '获取监控配置失败' });
    }
});

// 保存监控配置
router.post('/monitoring-config', requireLogin, async (req, res) => {
    try {
        const { 
            notificationType, 
            webhookUrl, 
            telegramToken, 
            telegramChatId, 
            monitorInterval,
            isEnabled
        } = req.body;
        
        // 简单验证
        if (notificationType === 'wechat' && !webhookUrl) {
            return res.status(400).json({ error: '企业微信通知需要设置 webhook URL' });
        }
        
        if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
            return res.status(400).json({ error: 'Telegram 通知需要设置 Token 和 Chat ID' });
        }
        
        const config = await ensureConfigFile();
        
        // 更新配置
        const updatedConfig = {
            ...config,
            notificationType,
            webhookUrl: webhookUrl || '',
            telegramToken: telegramToken || '',
            telegramChatId: telegramChatId || '',
            monitorInterval: parseInt(monitorInterval, 10) || 60,
            isEnabled: isEnabled !== undefined ? isEnabled : config.isEnabled
        };
        
        await fs.writeFile(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2), 'utf8');
        
        res.json({ success: true, message: '监控配置已保存' });
        
        // 通知监控服务重新加载配置
        if (global.monitoringService && typeof global.monitoringService.reload === 'function') {
            global.monitoringService.reload();
        }
    } catch (err) {
        logger.error('保存监控配置失败:', err);
        res.status(500).json({ error: '保存监控配置失败' });
    }
});

// 切换监控状态
router.post('/toggle-monitoring', requireLogin, async (req, res) => {
    try {
        const { isEnabled } = req.body;
        const config = await ensureConfigFile();
        
        config.isEnabled = !!isEnabled;
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        
        res.json({ 
            success: true, 
            message: `监控已${isEnabled ? '启用' : '禁用'}`
        });
        
        // 通知监控服务重新加载配置
        if (global.monitoringService && typeof global.monitoringService.reload === 'function') {
            global.monitoringService.reload();
        }
    } catch (err) {
        logger.error('切换监控状态失败:', err);
        res.status(500).json({ error: '切换监控状态失败' });
    }
});

// 测试通知
router.post('/test-notification', requireLogin, async (req, res) => {
    try {
        const { 
            notificationType, 
            webhookUrl, 
            telegramToken, 
            telegramChatId
        } = req.body;
        
        // 简单验证
        if (notificationType === 'wechat' && !webhookUrl) {
            return res.status(400).json({ error: '企业微信通知需要设置 webhook URL' });
        }
        
        if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
            return res.status(400).json({ error: 'Telegram 通知需要设置 Token 和 Chat ID' });
        }
        
        // 发送测试通知
        const notifier = require('../services/notificationService');
        const testMessage = {
            title: '测试通知',
            content: '这是一条测试通知，如果您收到这条消息，说明您的通知配置工作正常。',
            time: new Date().toLocaleString()
        };
        
        await notifier.sendNotification(testMessage, {
            type: notificationType,
            webhookUrl,
            telegramToken,
            telegramChatId
        });
        
        res.json({ success: true, message: '测试通知已发送' });
    } catch (err) {
        logger.error('发送测试通知失败:', err);
        res.status(500).json({ error: '发送测试通知失败: ' + err.message });
    }
});

// 获取已停止的容器
router.get('/stopped-containers', async (req, res) => {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        const { stdout } = await execPromise('docker ps -f "status=exited" --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}"');
        
        const containers = stdout.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [id, name, ...statusParts] = line.split('\t');
                return {
                    id: id.substring(0, 12),
                    name,
                    status: statusParts.join(' ')
                };
            });
        
        res.json(containers);
    } catch (err) {
        logger.error('获取已停止容器失败:', err);
        res.status(500).json({ error: '获取已停止容器失败', details: err.message });
    }
});

logger.success('✓ 监控配置路由已加载');

// 导出路由
module.exports = router;

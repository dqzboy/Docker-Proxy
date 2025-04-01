/**
 * 配置路由模块
 */
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const configService = require('../services/configService');

// 修改配置文件路径，使用独立的配置文件
const configFilePath = path.join(__dirname, '../data/config.json');

// 默认配置
const DEFAULT_CONFIG = {
    proxyDomain: 'registry-1.docker.io',
    logo: '',
    theme: 'light'
};

// 确保配置文件存在
async function ensureConfigFile() {
    try {
        // 确保目录存在
        const dir = path.dirname(configFilePath);
        try {
            await fs.access(dir);
        } catch (error) {
            await fs.mkdir(dir, { recursive: true });
            logger.info(`创建目录: ${dir}`);
        }
        
        // 检查文件是否存在
        try {
            await fs.access(configFilePath);
            const data = await fs.readFile(configFilePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // 文件不存在或JSON解析错误，创建默认配置
            await fs.writeFile(configFilePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
            logger.info(`创建默认配置文件: ${configFilePath}`);
            return DEFAULT_CONFIG;
        }
    } catch (error) {
        logger.error(`配置文件操作失败: ${error.message}`);
        // 出错时返回默认配置以确保API不会失败
        return DEFAULT_CONFIG;
    }
}

// 获取配置
router.get('/config', async (req, res) => {
    try {
        const config = await ensureConfigFile();
        res.json(config);
    } catch (error) {
        logger.error('获取配置失败:', error);
        // 即使失败也返回默认配置
        res.json(DEFAULT_CONFIG);
    }
});

// 保存配置
router.post('/config', async (req, res) => {
    try {
        const newConfig = req.body;
        
        // 验证请求数据
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({
                error: '无效的配置数据',
                details: '配置必须是一个对象'
            });
        }
        
        // 读取现有配置
        let existingConfig;
        try {
            existingConfig = await ensureConfigFile();
        } catch (error) {
            existingConfig = DEFAULT_CONFIG;
        }
        
        // 合并配置
        const mergedConfig = { ...existingConfig, ...newConfig };
        
        // 保存到文件
        await fs.writeFile(configFilePath, JSON.stringify(mergedConfig, null, 2));
        
        res.json({ success: true, message: '配置已保存' });
    } catch (error) {
        logger.error('保存配置失败:', error);
        res.status(500).json({ 
            error: '保存配置失败',
            details: error.message 
        });
    }
});

// 获取监控配置
router.get('/monitoring-config', async (req, res) => {
  logger.info('收到监控配置请求');
  
  try {
    logger.info('读取监控配置...');
    const config = await configService.getConfig();
    
    if (!config.monitoringConfig) {
      logger.info('监控配置不存在，创建默认配置');
      config.monitoringConfig = {
        notificationType: 'wechat',
        webhookUrl: '',
        telegramToken: '',
        telegramChatId: '',
        monitorInterval: 60,
        isEnabled: false
      };
      await configService.saveConfig(config);
    }
    
    logger.info('返回监控配置');
    res.json({
      notificationType: config.monitoringConfig.notificationType || 'wechat',
      webhookUrl: config.monitoringConfig.webhookUrl || '',
      telegramToken: config.monitoringConfig.telegramToken || '',
      telegramChatId: config.monitoringConfig.telegramChatId || '',
      monitorInterval: config.monitoringConfig.monitorInterval || 60,
      isEnabled: config.monitoringConfig.isEnabled || false
    });
  } catch (error) {
    logger.error('获取监控配置失败:', error);
    res.status(500).json({ error: '获取监控配置失败', details: error.message });
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
    
    // 验证必填字段
    if (!notificationType) {
      return res.status(400).json({ error: '通知类型不能为空' });
    }
    
    // 根据通知类型验证对应的字段
    if (notificationType === 'wechat' && !webhookUrl) {
      return res.status(400).json({ error: '企业微信 Webhook URL 不能为空' });
    }
    
    if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
      return res.status(400).json({ error: 'Telegram Token 和 Chat ID 不能为空' });
    }
    
    // 保存配置
    const config = await configService.getConfig();
    config.monitoringConfig = {
      notificationType,
      webhookUrl: webhookUrl || '',
      telegramToken: telegramToken || '',
      telegramChatId: telegramChatId || '',
      monitorInterval: parseInt(monitorInterval) || 60,
      isEnabled: !!isEnabled
    };
    
    await configService.saveConfig(config);
    logger.info('监控配置已更新');
    
    res.json({ success: true, message: '监控配置已保存' });
  } catch (error) {
    logger.error('保存监控配置失败:', error);
    res.status(500).json({ error: '保存监控配置失败', details: error.message });
  }
});

// 测试通知
router.post('/test-notification', requireLogin, async (req, res) => {
  try {
    const { notificationType, webhookUrl, telegramToken, telegramChatId } = req.body;
    
    // 验证参数
    if (!notificationType) {
      return res.status(400).json({ error: '通知类型不能为空' });
    }
    
    if (notificationType === 'wechat' && !webhookUrl) {
      return res.status(400).json({ error: '企业微信 Webhook URL 不能为空' });
    }
    
    if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
      return res.status(400).json({ error: 'Telegram Token 和 Chat ID 不能为空' });
    }
    
    // 构造测试消息
    const testMessage = {
      title: '测试通知',
      content: `这是一条测试通知消息，发送时间: ${new Date().toLocaleString('zh-CN')}`,
      type: 'info'
    };
    
    // 模拟发送通知
    logger.info('发送测试通知:', testMessage);
    
    // TODO: 实际发送通知的逻辑
    // 这里仅做模拟，实际应用中需要实现真正的通知发送逻辑
    
    // 返回成功
    res.json({ success: true, message: '测试通知已发送' });
  } catch (error) {
    logger.error('发送测试通知失败:', error);
    res.status(500).json({ error: '发送测试通知失败', details: error.message });
  }
});

// 导出路由
module.exports = router;
/**
 * HTTP代理管理路由
 */
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const httpProxyService = require('../services/httpProxyService');

// 获取代理状态
router.get('/proxy/status', requireLogin, async (req, res) => {
  try {
    const status = httpProxyService.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('获取代理状态失败:', error);
    res.status(500).json({ 
      error: '获取代理状态失败', 
      details: error.message 
    });
  }
});

// 启动代理服务
router.post('/proxy/start', requireLogin, async (req, res) => {
  try {
    const config = req.body;
    await httpProxyService.start(config);
    res.json({ 
      success: true, 
      message: '代理服务已启动',
      status: httpProxyService.getStatus()
    });
  } catch (error) {
    logger.error('启动代理服务失败:', error);
    res.status(500).json({ 
      error: '启动代理服务失败', 
      details: error.message 
    });
  }
});

// 停止代理服务
router.post('/proxy/stop', requireLogin, async (req, res) => {
  try {
    await httpProxyService.stop();
    res.json({ 
      success: true, 
      message: '代理服务已停止',
      status: httpProxyService.getStatus()
    });
  } catch (error) {
    logger.error('停止代理服务失败:', error);
    res.status(500).json({ 
      error: '停止代理服务失败', 
      details: error.message 
    });
  }
});

// 重启代理服务
router.post('/proxy/restart', requireLogin, async (req, res) => {
  try {
    await httpProxyService.stop();
    await httpProxyService.start(req.body);
    res.json({ 
      success: true, 
      message: '代理服务已重启',
      status: httpProxyService.getStatus()
    });
  } catch (error) {
    logger.error('重启代理服务失败:', error);
    res.status(500).json({ 
      error: '重启代理服务失败', 
      details: error.message 
    });
  }
});

// 更新代理配置
router.put('/proxy/config', requireLogin, async (req, res) => {
  try {
    const config = req.body;
    
    // 验证配置
    if (config.port && (config.port < 1 || config.port > 65535)) {
      return res.status(400).json({ error: '端口号必须在1-65535之间' });
    }
    
    if (config.enableAuth && (!config.username || !config.password)) {
      return res.status(400).json({ error: '启用认证时必须提供用户名和密码' });
    }

    await httpProxyService.updateConfig(config);
    res.json({ 
      success: true, 
      message: '代理配置已更新',
      status: httpProxyService.getStatus()
    });
  } catch (error) {
    logger.error('更新代理配置失败:', error);
    res.status(500).json({ 
      error: '更新代理配置失败', 
      details: error.message 
    });
  }
});

// 获取代理配置
router.get('/proxy/config', requireLogin, async (req, res) => {
  try {
    const status = httpProxyService.getStatus();
    res.json({
      success: true,
      config: status.config
    });
  } catch (error) {
    logger.error('获取代理配置失败:', error);
    res.status(500).json({ 
      error: '获取代理配置失败', 
      details: error.message 
    });
  }
});

// 测试代理连接
router.post('/proxy/test', requireLogin, async (req, res) => {
  try {
    const { testUrl = 'http://httpbin.org/ip' } = req.body;
    const axios = require('axios');
    const status = httpProxyService.getStatus();
    
    if (!status.isRunning) {
      return res.status(400).json({ error: '代理服务未运行' });
    }

    // 通过代理测试连接
    const proxyConfig = {
      host: status.config.host === '0.0.0.0' ? 'localhost' : status.config.host,
      port: status.config.port
    };

    const startTime = Date.now();
    const response = await axios.get(testUrl, {
      proxy: proxyConfig,
      timeout: 10000
    });
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      message: '代理连接测试成功',
      testUrl,
      responseTime: `${responseTime}ms`,
      statusCode: response.status,
      proxyConfig
    });
  } catch (error) {
    logger.error('代理连接测试失败:', error);
    res.status(500).json({ 
      error: '代理连接测试失败', 
      details: error.message 
    });
  }
});

module.exports = router;

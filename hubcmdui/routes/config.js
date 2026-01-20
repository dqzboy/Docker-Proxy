/**
 * 配置路由模块 - 使用SQLite数据库
 */
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const configServiceDB = require('../services/configServiceDB');

// 获取配置
router.get('/config', async (req, res) => {
    try {
        const config = await configServiceDB.getConfig();
        
        // 如果配置为空，使用默认配置
        if (!config || Object.keys(config).length === 0) {
            const defaultConfig = configServiceDB.getDefaultConfig();
            res.json(defaultConfig);
        } else {
            // 合并默认配置和数据库配置，数据库配置优先
            const defaultConfig = configServiceDB.getDefaultConfig();
            const mergedConfig = { ...defaultConfig, ...config };
            res.json(mergedConfig);
        }
    } catch (error) {
        logger.error('获取配置失败:', error);
        // 只在真正出错时返回默认配置
        const defaultConfig = configServiceDB.getDefaultConfig();
        res.json(defaultConfig);
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
        
        // 保存配置到数据库
        await configServiceDB.saveConfigs(newConfig);
        
        res.json({ success: true, message: '配置已保存' });
    } catch (error) {
        logger.error('保存配置失败:', error);
        res.status(500).json({ 
            error: '保存配置失败',
            details: error.message 
        });
    }
});

// 获取配置 - 兼容旧路由
router.get('/', async (req, res) => {
  try {
    const config = await configServiceDB.getConfig();
    res.json(config);
  } catch (error) {
    logger.error('读取配置失败:', error);
    const defaultConfig = configServiceDB.getDefaultConfig();
    res.json(defaultConfig);
  }
});

// 保存配置 - 兼容旧路由
router.post('/', async (req, res) => {
  try {
    const newConfig = req.body;
    
    if (!newConfig || typeof newConfig !== 'object') {
        return res.status(400).json({
            error: '无效的配置数据',
            details: '配置必须是一个对象'
        });
    }
    
    await configServiceDB.saveConfigs(newConfig);
    res.json({ success: true, message: '配置已保存' });
  } catch (error) {
    logger.error('保存配置失败:', error);
    res.status(500).json({ 
      error: '保存配置失败', 
      details: error.message 
    });
  }
});

// 获取菜单项配置
router.get('/menu-items', async (req, res) => {
    try {
        const menuItems = await configServiceDB.getMenuItems();
        res.json(menuItems);
    } catch (error) {
        logger.error('获取菜单项失败:', error);
        res.status(500).json({ error: '获取菜单项失败', details: error.message });
    }
});

// 保存菜单项配置
router.post('/menu-items', requireLogin, async (req, res) => {
    try {
        const { menuItems } = req.body;
        
        if (!Array.isArray(menuItems)) {
            return res.status(400).json({
                error: '无效的菜单项数据',
                details: '菜单项必须是一个数组'
            });
        }
        
        await configServiceDB.saveMenuItems(menuItems);
        res.json({ success: true, message: '菜单项配置已保存' });
    } catch (error) {
        logger.error('保存菜单项失败:', error);
        res.status(500).json({ error: '保存菜单项失败', details: error.message });
    }
});

// 获取所有 Registry 配置
router.get('/registry-configs', async (req, res) => {
    try {
        const configs = await configServiceDB.getRegistryConfigs();
        res.json(configs);
    } catch (error) {
        logger.error('获取 Registry 配置失败:', error);
        res.status(500).json({ error: '获取 Registry 配置失败', details: error.message });
    }
});

// 获取启用的 Registry 配置
router.get('/registry-configs/enabled', async (req, res) => {
    try {
        const configs = await configServiceDB.getEnabledRegistryConfigs();
        res.json(configs);
    } catch (error) {
        logger.error('获取启用的 Registry 配置失败:', error);
        res.status(500).json({ error: '获取启用的 Registry 配置失败', details: error.message });
    }
});

// 更新单个 Registry 配置
router.put('/registry-configs/:registryId', requireLogin, async (req, res) => {
    try {
        const { registryId } = req.params;
        const config = req.body;
        
        if (!config || typeof config !== 'object') {
            return res.status(400).json({
                error: '无效的配置数据',
                details: '配置必须是一个对象'
            });
        }
        
        await configServiceDB.updateRegistryConfig(registryId, config);
        res.json({ success: true, message: `Registry ${registryId} 配置已更新` });
    } catch (error) {
        logger.error('更新 Registry 配置失败:', error);
        res.status(500).json({ error: '更新 Registry 配置失败', details: error.message });
    }
});

// 批量更新 Registry 配置
router.post('/registry-configs', requireLogin, async (req, res) => {
    try {
        const { configs } = req.body;
        
        if (!Array.isArray(configs)) {
            return res.status(400).json({
                error: '无效的配置数据',
                details: '配置必须是一个数组'
            });
        }
        
        await configServiceDB.updateRegistryConfigs(configs);
        res.json({ success: true, message: 'Registry 配置已保存' });
    } catch (error) {
        logger.error('保存 Registry 配置失败:', error);
        res.status(500).json({ error: '保存 Registry 配置失败', details: error.message });
    }
});

module.exports = router;

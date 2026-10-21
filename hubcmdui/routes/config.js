/**
 * 配置路由模块 - 使用SQLite数据库
 */
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const configServiceDB = require('../services/configServiceDB');
const { saveBasicRegistryConfigs } = require('../services/basicRegistrySyncService');
const { upstreamError } = require('../services/goProxyService');

// 过滤掉锁定（_lock_ 前缀）的配置键，避免将加密密文随公开配置下发
function stripLocked(config) {
  if (!config || typeof config !== 'object') return config;
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof k === 'string' && k.startsWith('_lock_')) continue;
    out[k] = v;
  }
  return out;
}

// 匿名用户（如公共落地页）可读的配置白名单。
// 落地页仅需要 logo / proxyDomain 等非敏感字段；monitoringConfig 里的
// webhookUrl / telegramToken 等凭据绝不能在未登录时下发。
const PUBLIC_CONFIG_KEYS = ['theme', 'language', 'logo', 'proxyDomain'];

function publicConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const out = {};
  for (const k of PUBLIC_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config, k)) out[k] = config[k];
  }
  return out;
}

function isLoggedIn(req) {
  return !!(req.session && req.session.user);
}

// 获取配置
// 已登录：返回完整配置（减去 _lock_ 键）；匿名：只返回公开子集，避免泄露
// monitoringConfig(webhookUrl/telegramToken) 等敏感配置。
router.get('/config', async (req, res) => {
    try {
        const config = await configServiceDB.getConfig();
        const defaultConfig = configServiceDB.getDefaultConfig();
        // 如果配置为空，使用默认配置；否则合并默认配置和数据库配置，数据库配置优先
        const mergedConfig = stripLocked(
            (!config || Object.keys(config).length === 0) ? defaultConfig : { ...defaultConfig, ...config }
        );
        res.json(isLoggedIn(req) ? mergedConfig : publicConfig(mergedConfig));
    } catch (error) {
        logger.error('获取配置失败:', error);
        // 只在真正出错时返回默认配置
        const defaultConfig = configServiceDB.getDefaultConfig();
        res.json(isLoggedIn(req) ? defaultConfig : publicConfig(defaultConfig));
    }
});

// 保存配置（需登录）
router.post('/config', requireLogin, async (req, res) => {
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
    const safeConfig = stripLocked(config);
    res.json(isLoggedIn(req) ? safeConfig : publicConfig(safeConfig));
  } catch (error) {
    logger.error('读取配置失败:', error);
    const defaultConfig = configServiceDB.getDefaultConfig();
    res.json(isLoggedIn(req) ? defaultConfig : publicConfig(defaultConfig));
  }
});

// 保存配置 - 兼容旧路由（需登录）
router.post('/', requireLogin, async (req, res) => {
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
        
        await saveBasicRegistryConfigs([{ ...config, registryId }]);
        res.json({ success: true, message: `Registry ${registryId} 配置已更新` });
    } catch (error) {
        logger.error('更新 Registry 配置失败:', error);
        const upstream = error.isGoProxyError ? upstreamError(error) : null;
        res.status(error.status || upstream?.status || 500).json(upstream?.body || { error: error.message });
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
        
        await saveBasicRegistryConfigs(configs);
        res.json({ success: true, message: 'Registry 配置已保存' });
    } catch (error) {
        logger.error('保存 Registry 配置失败:', error);
        const upstream = error.isGoProxyError ? upstreamError(error) : null;
        res.status(error.status || upstream?.status || 500).json(upstream?.body || { error: error.message });
    }
});

module.exports = router;

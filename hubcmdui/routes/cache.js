/**
 * 缓存管理路由
 * 提供前端"缓存管理"页面所需的后端接口，所有写操作需登录。
 * 实际配置读写由 Go 代理的管理端口完成（见 services/goProxyService.js）。
 */

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const { goProxyService, upstreamError } = require('../services/goProxyService');

// 获取缓存配置 + 实时统计
router.get('/', async (req, res) => {
  try {
    const data = await goProxyService.getCache();
    res.json(data);
  } catch (e) {
    logger.error('获取缓存配置失败:', e.message);
    const err = upstreamError(e);
    res.status(err.status || 502).json(err.body);
  }
});

// 保存缓存配置（写盘 + 热重载）
router.put('/', requireLogin, async (req, res) => {
  try {
    const cfg = req.body;
    if (!cfg || typeof cfg !== 'object') {
      return res.status(400).json({ error: '缓存配置格式错误' });
    }
    const result = await goProxyService.putCache(cfg);
    res.json(result);
  } catch (e) {
    logger.error('保存缓存配置失败:', e.message);
    const err = upstreamError(e);
    res.status(err.status || 502).json(err.body);
  }
});

// 一键清空磁盘缓存
router.post('/clear', requireLogin, async (req, res) => {
  try {
    const result = await goProxyService.clearCache();
    res.json(result);
  } catch (e) {
    logger.error('清空缓存失败:', e.message);
    const err = upstreamError(e);
    res.status(err.status || 502).json(err.body);
  }
});

module.exports = router;

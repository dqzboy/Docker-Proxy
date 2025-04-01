/**
 * 健康检查路由
 */
const express = require('express');
const router = express.Router();
const os = require('os');
const path = require('path');
const { version } = require('../package.json');

// 简单健康检查
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        version
    });
});

// 详细系统信息
router.get('/system', (req, res) => {
    try {
        res.json({
            status: 'ok',
            system: {
                platform: os.platform(),
                release: os.release(),
                hostname: os.hostname(),
                uptime: os.uptime(),
                totalMem: os.totalmem(),
                freeMem: os.freemem(),
                cpus: os.cpus().length,
                loadavg: os.loadavg()
            },
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                nodeVersion: process.version,
                env: process.env.NODE_ENV || 'development'
            }
        });
    } catch (err) {
        res.status(500).json({ error: '获取系统信息失败', details: err.message });
    }
});

module.exports = router;

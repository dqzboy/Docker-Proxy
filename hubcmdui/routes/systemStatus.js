const express = require('express');
const router = express.Router();
const os = require('os');
const logger = require('../logger');

// 获取系统状态
router.get('/', (req, res) => {
    try {
        // 收集系统信息
        const cpuLoad = os.loadavg()[0] / os.cpus().length * 100;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsage = `${Math.round(usedMem / totalMem * 100)}%`;
        
        // 组合结果
        const systemStatus = {
            dockerAvailable: true,
            containerCount: 0,
            cpuLoad: `${cpuLoad.toFixed(1)}%`,
            memoryUsage: memoryUsage,
            diskSpace: '未知',
            recentActivities: []
        };
        
        res.json(systemStatus);
    } catch (error) {
        logger.error('获取系统状态失败:', error);
        res.status(500).json({ 
            error: '获取系统状态失败',
            details: error.message 
        });
    }
});

// 获取系统资源详情
router.get('/system-resource-details', (req, res) => {
    try {
        const { type } = req.query;
        let data = {};
        
        switch(type) {
            case 'memory':
                const totalMem = os.totalmem();
                const freeMem = os.freemem();
                const usedMem = totalMem - freeMem;
                
                data = {
                    totalMemory: formatBytes(totalMem),
                    usedMemory: formatBytes(usedMem),
                    freeMemory: formatBytes(freeMem),
                    memoryUsage: `${Math.round(usedMem / totalMem * 100)}%`
                };
                break;
                
            case 'cpu':
                const cpus = os.cpus();
                const loadAvg = os.loadavg();
                
                data = {
                    cpuCores: cpus.length,
                    cpuModel: cpus[0].model,
                    cpuLoad: `${(loadAvg[0] / cpus.length * 100).toFixed(1)}%`,
                    loadAvg1: loadAvg[0].toFixed(2),
                    loadAvg5: loadAvg[1].toFixed(2),
                    loadAvg15: loadAvg[2].toFixed(2)
                };
                break;
                
            case 'disk':
                // 简单的硬编码数据，在实际环境中应该调用系统命令获取
                data = {
                    totalSpace: '100 GB',
                    usedSpace: '30 GB',
                    freeSpace: '70 GB',
                    diskUsage: '30%'
                };
                break;
                
            default:
                return res.status(400).json({ error: '无效的资源类型' });
        }
        
        res.json(data);
    } catch (error) {
        logger.error('获取系统资源详情失败:', error);
        res.status(500).json({ error: '获取系统资源详情失败', details: error.message });
    }
});

// 格式化字节数为可读格式
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = router;

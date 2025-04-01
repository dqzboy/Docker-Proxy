/**
 * 系统相关路由
 */
const express = require('express');
const router = express.Router();
const os = require('os'); // 确保导入 os 模块
const util = require('util'); // 导入 util 模块
const { exec } = require('child_process');
const execPromise = util.promisify(exec); // 只在这里定义一次
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const configService = require('../services/configService');
const { execCommand, getSystemInfo } = require('../server-utils');
const dockerService = require('../services/dockerService');
const path = require('path');
const fs = require('fs').promises;

// 获取系统状态
async function getSystemStats(req, res) {
  try {
    let dockerAvailable = false;
    let containerCount = '0';
    let memoryUsage = '0%';
    let cpuLoad = '0%';
    let diskSpace = '0%';
    let recentActivities = [];

    // 尝试获取系统信息
    try {
      const systemInfo = await getSystemInfo();
      memoryUsage = `${systemInfo.memory.percent}%`;
      cpuLoad = systemInfo.cpu.load1;
      diskSpace = systemInfo.disk.percent;
    } catch (sysError) {
      logger.error('获取系统信息失败:', sysError);
    }

    // 尝试从Docker获取状态信息
    try {
      const docker = await dockerService.getDockerConnection();
      if (docker) {
        dockerAvailable = true;
        
        // 获取容器统计
        const containers = await docker.listContainers({ all: true });
        containerCount = containers.length.toString();
        
        // 获取最近的容器活动
        const runningContainers = containers.filter(c => c.State === 'running');
        for (let i = 0; i < Math.min(3, runningContainers.length); i++) {
          recentActivities.push({
            time: new Date(runningContainers[i].Created * 1000).toLocaleString(),
            action: '运行中',
            container: runningContainers[i].Names[0].replace(/^\//, ''),
            status: '正常'
          });
        }

        // 获取最近的Docker事件
        const events = await dockerService.getRecentEvents();
        if (events && events.length > 0) {
          recentActivities = [...events.map(event => ({
            time: new Date(event.time * 1000).toLocaleString(),
            action: event.Action,
            container: event.Actor?.Attributes?.name || '未知容器',
            status: event.status || '完成'
          })), ...recentActivities].slice(0, 10);
        }
      }
    } catch (containerError) {
      logger.error('获取容器信息失败:', containerError);
    }

    // 如果没有活动记录，添加一个默认记录
    if (recentActivities.length === 0) {
      recentActivities.push({
        time: new Date().toLocaleString(),
        action: '系统检查',
        container: '监控服务',
        status: dockerAvailable ? '正常' : 'Docker服务不可用'
      });
    }

    // 返回收集到的所有数据，即使部分数据可能不完整
    res.json({
      dockerAvailable,
      containerCount,
      memoryUsage,
      cpuLoad,
      diskSpace,
      recentActivities
    });
  } catch (error) {
    logger.error('获取系统统计数据失败:', error);
    
    // 即使出错，仍然尝试返回一些基本数据
    res.status(200).json({
      dockerAvailable: false,
      containerCount: '0',
      memoryUsage: '未知',
      cpuLoad: '未知',
      diskSpace: '未知',
      recentActivities: [{
        time: new Date().toLocaleString(),
        action: '系统错误',
        container: '监控服务',
        status: '数据获取失败'
      }],
      error: '获取系统统计数据失败',
      errorDetails: error.message
    });
  }
}

// 获取系统配置 - 修改版本，避免与其他路由冲突
router.get('/system-config', async (req, res) => {
  try {
    const config = await configService.getConfig();
    res.json(config);
  } catch (error) {
    logger.error('读取配置失败:', error);
    res.status(500).json({ 
      error: '读取配置失败', 
      details: error.message 
    });
  }
});

// 保存系统配置 - 修改版本，避免与其他路由冲突
router.post('/system-config', requireLogin, async (req, res) => {
  try {
    const currentConfig = await configService.getConfig();
    const newConfig = { ...currentConfig, ...req.body };
    await configService.saveConfig(newConfig);
    logger.info('系统配置已更新');
    res.json({ success: true });
  } catch (error) {
    logger.error('保存配置失败:', error);
    res.status(500).json({ 
      error: '保存配置失败', 
      details: error.message 
    });
  }
});

// 获取系统状态
router.get('/stats', requireLogin, async (req, res) => {
  return await getSystemStats(req, res);
});

// 获取磁盘空间信息
router.get('/disk-space', requireLogin, async (req, res) => {
  try {
    const systemInfo = await getSystemInfo();
    res.json({
      diskSpace: `${systemInfo.disk.used}/${systemInfo.disk.size}`,
      usagePercent: parseInt(systemInfo.disk.percent)
    });
  } catch (error) {
    logger.error('获取磁盘空间信息失败:', error);
    res.status(500).json({ error: '获取磁盘空间信息失败', details: error.message });
  }
});

// 网络测试
router.post('/network-test', requireLogin, async (req, res) => {
  const { type, domain } = req.body;
  
  // 验证输入
  function validateInput(input, type) {
    if (type === 'domain') {
      return /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(input);
    }
    return false;
  }
  
  if (!validateInput(domain, 'domain')) {
    return res.status(400).json({ error: '无效的域名格式' });
  }
  
  try {
    const result = await execCommand(`${type === 'ping' ? 'ping -c 4' : 'traceroute -m 10'} ${domain}`, { timeout: 30000 });
    res.send(result);
  } catch (error) {
    if (error.killed) {
      return res.status(408).send('测试超时');
    }
    logger.error(`执行网络测试命令错误:`, error);
    res.status(500).send('测试执行失败: ' + error.message);
  }
});

// 获取用户统计信息
router.get('/user-stats', requireLogin, async (req, res) => {
  try {
    const userService = require('../services/userService');
    const username = req.session.user.username;
    const userStats = await userService.getUserStats(username);
    
    res.json(userStats);
  } catch (error) {
    logger.error('获取用户统计信息失败:', error);
    res.status(500).json({
      loginCount: '0',
      lastLogin: '未知',
      accountAge: '0'
    });
  }
});

// 获取系统状态信息 (旧版，可能与 getSystemStats 重复，可以考虑移除)
router.get('/system-status', requireLogin, async (req, res) => {
    logger.warn('Accessing potentially deprecated /api/system-status route.');
    try {
        // 检查 Docker 可用性
        let dockerAvailable = true;
        let containerCount = 0;
        try {
            // 避免直接执行命令计算，依赖 dockerService
            const docker = await dockerService.getDockerConnection();
            if (docker) {
                 const containers = await docker.listContainers({ all: true });
                 containerCount = containers.length;
            } else {
                 dockerAvailable = false;
            }
        } catch (dockerError) {
            dockerAvailable = false;
            containerCount = 0;
            logger.warn('Docker可能未运行或无法访问 (in /system-status):', dockerError.message);
        }
        
        // 获取内存使用信息
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsage = `${Math.round(usedMem / totalMem * 100)}%`;
        
        // 获取CPU负载
        const [load1] = os.loadavg();
        const cpuCount = os.cpus().length || 1; // 避免除以0
        const cpuLoad = `${(load1 / cpuCount * 100).toFixed(1)}%`;
        
        // 获取磁盘空间 - 简单版
        let diskSpace = '未知';
        try {
            if (os.platform() === 'darwin' || os.platform() === 'linux') {
                 const { stdout } = await execPromise('df -h / | tail -n 1'); // 使用 -n 1
                 const parts = stdout.trim().split(/\s+/);
                 if (parts.length >= 5) diskSpace = parts[4];
            } else if (os.platform() === 'win32') {
                 const { stdout } = await execPromise('wmic logicaldisk get size,freespace,caption | findstr /B /L /V "Caption" ');
                 const lines = stdout.trim().split(/\r?\n/);
                 if (lines.length > 0) {
                      const parts = lines[0].trim().split(/\s+/);
                      if (parts.length >= 2) {
                           const free = parseInt(parts[0], 10);
                           const total = parseInt(parts[1], 10);
                           if (!isNaN(total) && !isNaN(free) && total > 0) {
                                diskSpace = `${Math.round(((total - free) / total) * 100)}%`;
                           }
                      }
                 }
            }
        } catch (diskError) {
            logger.warn('获取磁盘空间失败 (in /system-status):', diskError.message);
            diskSpace = '未知';
        }

        // 格式化系统运行时间
        const uptime = formatUptime(os.uptime());

        res.json({
            dockerAvailable,
            containerCount,
            memoryUsage,
            cpuLoad,
            diskSpace,
            systemUptime: uptime
        });
    } catch (error) {
        logger.error('获取系统状态失败 (in /system-status):', error);
        res.status(500).json({ 
            error: '获取系统状态失败', 
            message: error.message
        });
    }
});

// 添加新的API端点，提供完整系统资源信息
router.get('/system-resources', requireLogin, async (req, res) => {
    logger.info('Received request for /api/system-resources');
    let cpuInfoData = null, memoryData = null, diskInfoData = null, systemData = null;
    
    // --- 获取 CPU 信息 (独立 try...catch) ---
    try {
         const cpuInfo = os.cpus();
         const [load1, load5, load15] = os.loadavg();
         const cpuCount = cpuInfo.length || 1;
         const cpuUsage = (load1 / cpuCount * 100).toFixed(1);
         cpuInfoData = {
             cores: cpuCount,
             model: cpuInfo[0]?.model || '未知',
             speed: `${cpuInfo[0]?.speed || '未知'} MHz`,
             loadAvg: {
                 '1min': load1.toFixed(2),
                 '5min': load5.toFixed(2),
                 '15min': load15.toFixed(2)
             },
             usage: parseFloat(cpuUsage)
         };
         logger.info('Successfully retrieved CPU info.');
    } catch (cpuError) {
         logger.error('Error getting CPU info:', cpuError.message);
         cpuInfoData = { error: '获取 CPU 信息失败', message: cpuError.message }; // 返回错误信息
    }
    
    // --- 获取内存信息 (独立 try...catch) ---
    try {
         const totalMem = os.totalmem();
         const freeMem = os.freemem();
         const usedMem = totalMem - freeMem;
         const memoryUsagePercent = totalMem > 0 ? Math.round(usedMem / totalMem * 100) : 0;
         memoryData = {
             total: formatBytes(totalMem), // 可能出错
             free: formatBytes(freeMem), // 可能出错
             used: formatBytes(usedMem), // 可能出错
             usedPercentage: memoryUsagePercent
         };
          logger.info('Successfully retrieved Memory info.');
    } catch (memError) {
         logger.error('Error getting Memory info:', memError.message);
         memoryData = { error: '获取内存信息失败', message: memError.message }; // 返回错误信息
    }
    
    // --- 获取磁盘信息 (独立 try...catch) ---
    try {
        let diskResult = { total: '未知', free: '未知', used: '未知', usedPercentage: '未知' }; 
        logger.info(`Getting disk info for platform: ${os.platform()}`);
        if (os.platform() === 'darwin' || os.platform() === 'linux') {
            try {
                 // 使用 -k 获取 KB 单位，方便计算
                 const { stdout } = await execPromise('df -k / | tail -n 1', { timeout: 5000 }); 
                 logger.info(`'df -k' command output: ${stdout}`);
                 const parts = stdout.trim().split(/\s+/);
                 // 索引通常是 1=Total, 2=Used, 3=Available, 4=Use%
                 if (parts.length >= 4) { 
                     const total = parseInt(parts[1], 10) * 1024; // KB to Bytes
                     const used = parseInt(parts[2], 10) * 1024;  // KB to Bytes
                     const free = parseInt(parts[3], 10) * 1024;  // KB to Bytes
                     // 优先使用命令输出的百分比，更准确
                     let usedPercentage = parseInt(parts[4].replace('%', ''), 10);
                     
                     // 如果解析失败或百分比无效，则尝试计算
                     if (isNaN(usedPercentage) && !isNaN(total) && !isNaN(used) && total > 0) {
                         usedPercentage = Math.round((used / total) * 100);
                     }

                     if (!isNaN(total) && !isNaN(used) && !isNaN(free) && !isNaN(usedPercentage)) {
                          diskResult = {
                              total: formatBytes(total), // 可能出错
                              free: formatBytes(free), // 可能出错
                              used: formatBytes(used), // 可能出错
                              usedPercentage: usedPercentage
                          };
                          logger.info('Successfully parsed disk info (Linux/Darwin).');
                     } else {
                          logger.warn('Failed to parse numbers from df output:', parts);
                          diskResult = { ...diskResult, error: '解析 df 输出失败' }; // 添加错误标记
                     }
                 } else {
                      logger.warn('Unexpected output format from df:', stdout);
                      diskResult = { ...diskResult, error: 'df 输出格式不符合预期' }; // 添加错误标记
                 }
            } catch (dfError) {
                logger.error(`Error executing or parsing 'df -k': ${dfError.message}`);
                if (dfError.killed) logger.error("'df -k' command timed out."); 
                diskResult = { error: '获取磁盘信息失败 (df)', message: dfError.message }; // 标记错误
            }
        } else if (os.platform() === 'win32') {
            try {
                 // 获取 C 盘信息 (可以修改为获取所有盘符或特定盘符)
                 const { stdout } = await execPromise(`wmic logicaldisk where "DeviceID='C:'" get size,freespace /value`, { timeout: 5000 });
                 logger.info(`'wmic' command output: ${stdout}`);
                 const lines = stdout.trim().split(/\r?\n/);
                 let free = NaN, total = NaN;
                 lines.forEach(line => {
                     if (line.startsWith('FreeSpace=')) {
                         free = parseInt(line.split('=')[1], 10);
                     } else if (line.startsWith('Size=')) {
                         total = parseInt(line.split('=')[1], 10);
                     }
                 });

                 if (!isNaN(total) && !isNaN(free) && total > 0) {
                     const used = total - free;
                     const usedPercentage = Math.round((used / total) * 100);
                     diskResult = {
                         total: formatBytes(total), // 可能出错
                         free: formatBytes(free), // 可能出错
                         used: formatBytes(used), // 可能出错
                         usedPercentage: usedPercentage
                     };
                     logger.info('Successfully parsed disk info (Windows - C:).');
                 } else {
                      logger.warn('Failed to parse numbers from wmic output:', stdout);
                      diskResult = { ...diskResult, error: '解析 wmic 输出失败' }; // 添加错误标记
                 }
            } catch (wmicError) {
                 logger.error(`Error executing or parsing 'wmic': ${wmicError.message}`);
                 if (wmicError.killed) logger.error("'wmic' command timed out.");
                 diskResult = { error: '获取磁盘信息失败 (wmic)', message: wmicError.message }; // 标记错误
            }
        }
        diskInfoData = diskResult; 
    } catch (diskErrorOuter) {
        logger.error('Unexpected error during disk info gathering:', diskErrorOuter.message);
        diskInfoData = { error: '获取磁盘信息时发生意外错误', message: diskErrorOuter.message }; // 返回错误信息
    }
    
    // --- 获取其他系统信息 (独立 try...catch) ---
     try {
          systemData = {
              platform: os.platform(),
              release: os.release(),
              hostname: os.hostname(),
              uptime: formatUptime(os.uptime()) // 可能出错
          };
          logger.info('Successfully retrieved general system info.');
     } catch (sysInfoError) {
          logger.error('Error getting general system info:', sysInfoError.message);
          systemData = { error: '获取常规系统信息失败', message: sysInfoError.message }; // 返回错误信息
     }

    // --- 包装 Helper 函数调用以捕获潜在错误 ---
    const safeFormatBytes = (bytes) => {
        try {
            return formatBytes(bytes);
        } catch (e) {
            logger.error(`formatBytes failed for value ${bytes}:`, e.message);
            return '格式化错误';
        }
    };
    const safeFormatUptime = (seconds) => {
        try {
            return formatUptime(seconds);
        } catch (e) {
            logger.error(`formatUptime failed for value ${seconds}:`, e.message);
            return '格式化错误';
        }
    };

    // --- 构建最终响应数据，使用安全的 Helper 函数 --- 
    const finalCpuData = cpuInfoData?.error ? cpuInfoData : {
        ...cpuInfoData
        // CPU 不需要格式化
    };
    const finalMemoryData = memoryData?.error ? memoryData : {
        ...memoryData,
        total: safeFormatBytes(os.totalmem()),
        free: safeFormatBytes(os.freemem()),
        used: safeFormatBytes(os.totalmem() - os.freemem())
    };
    const finalDiskData = diskInfoData?.error ? diskInfoData : {
        ...diskInfoData,
        // 如果 diskInfoData 内部有 total/free/used (字节数)，则格式化
        // 否则保持 '未知' 或已格式化的字符串
        total: (diskInfoData?.total && typeof diskInfoData.total === 'number') ? safeFormatBytes(diskInfoData.total) : diskInfoData?.total || '未知',
        free: (diskInfoData?.free && typeof diskInfoData.free === 'number') ? safeFormatBytes(diskInfoData.free) : diskInfoData?.free || '未知',
        used: (diskInfoData?.used && typeof diskInfoData.used === 'number') ? safeFormatBytes(diskInfoData.used) : diskInfoData?.used || '未知'
    };
    const finalSystemData = systemData?.error ? systemData : {
        ...systemData,
        uptime: safeFormatUptime(os.uptime())
    };

    const responseData = {
        cpu: finalCpuData,
        memory: finalMemoryData,
        diskSpace: finalDiskData,
        system: finalSystemData
    };
    
    logger.info('Sending response for /api/system-resources:', JSON.stringify(responseData));
    res.status(200).json(responseData); 
});

// 格式化系统运行时间
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    
    let result = '';
    if (days > 0) result += `${days}天 `;
    if (hours > 0 || days > 0) result += `${hours}小时 `;
    if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}分钟 `;
    result += `${seconds}秒`;
    
    return result;
}

// 获取系统资源详情
router.get('/system-resource-details', requireLogin, async (req, res) => {
    try {
        const { type } = req.query;
        
        let data = {};
        
        switch (type) {
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
                const cpuInfo = os.cpus();
                const [load1, load5, load15] = os.loadavg();
                
                data = {
                    cpuCores: cpuInfo.length,
                    cpuModel: cpuInfo[0].model,
                    cpuSpeed: `${cpuInfo[0].speed} MHz`,
                    loadAvg1: load1.toFixed(2),
                    loadAvg5: load5.toFixed(2),
                    loadAvg15: load15.toFixed(2),
                    cpuLoad: `${(load1 / cpuInfo.length * 100).toFixed(1)}%`
                };
                break;
                
            case 'disk':
                try {
                    const { stdout: dfOutput } = await execPromise('df -h / | tail -n 1');
                    const parts = dfOutput.trim().split(/\s+/);
                    
                    if (parts.length >= 5) {
                        data = {
                            totalSpace: parts[1],
                            usedSpace: parts[2],
                            freeSpace: parts[3],
                            diskUsage: parts[4]
                        };
                    } else {
                        throw new Error('解析磁盘信息失败');
                    }
                } catch (diskError) {
                    logger.warn('获取磁盘信息失败:', diskError.message);
                    data = {
                        error: '获取磁盘信息失败',
                        message: diskError.message
                    };
                }
                break;
                
            default:
                return res.status(400).json({ error: '无效的资源类型' });
        }
        
        res.json(data);
    } catch (error) {
        logger.error('获取系统资源详情失败:', error);
        res.status(500).json({ error: '获取系统资源详情失败', message: error.message });
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

module.exports = router; // 只导出 router

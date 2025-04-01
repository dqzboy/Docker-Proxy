/**
 * 服务器实用工具函数
 */

const { exec } = require('child_process');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * 安全执行系统命令
 * @param {string} command - 要执行的命令
 * @param {object} options - 执行选项
 * @returns {Promise<string>} 命令输出结果
 */
function execCommand(command, options = { timeout: 30000 }) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          reject(new Error('执行命令超时'));
        } else {
          reject(error);
        }
        return;
      }
      resolve(stdout.trim() || stderr.trim());
    });
  });
}

/**
 * 获取系统信息
 * @returns {Promise<object>} 系统信息对象
 */
async function getSystemInfo() {
  const platform = os.platform();
  let memoryInfo = {};
  let cpuInfo = {};
  let diskInfo = {};
  
  try {
    // 内存信息 - 使用OS模块，适用于所有平台
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);
    
    memoryInfo = {
      total: formatBytes(totalMem),
      free: formatBytes(freeMem),
      used: formatBytes(usedMem),
      percent: memPercent
    };
    
    // CPU信息 - 使用不同平台的方法
    await getCpuInfo(platform).then(info => {
      cpuInfo = info;
    }).catch(err => {
      logger.warn('获取CPU信息失败:', err);
      // 降级方案：使用OS模块
      const cpuLoad = os.loadavg();
      const cpuCores = os.cpus().length;
      
      cpuInfo = {
        model: os.cpus()[0].model,
        cores: cpuCores,
        load1: cpuLoad[0].toFixed(2),
        load5: cpuLoad[1].toFixed(2),
        load15: cpuLoad[2].toFixed(2),
        percent: Math.round((cpuLoad[0] / cpuCores) * 100)
      };
    });
    
    // 磁盘信息 - 根据平台调用不同方法
    await getDiskInfo(platform).then(info => {
      diskInfo = info;
    }).catch(err => {
      logger.warn('获取磁盘信息失败:', err);
      diskInfo = {
        filesystem: 'unknown',
        size: 'unknown',
        used: 'unknown',
        available: 'unknown',
        percent: '0%'
      };
    });
    
    return {
      platform,
      hostname: os.hostname(),
      memory: memoryInfo,
      cpu: cpuInfo,
      disk: diskInfo,
      uptime: formatUptime(os.uptime())
    };
  } catch (error) {
    logger.error('获取系统信息失败:', error);
    throw error;
  }
}

/**
 * 根据平台获取CPU信息
 * @param {string} platform - 操作系统平台
 * @returns {Promise<object>} CPU信息
 */
async function getCpuInfo(platform) {
  if (platform === 'linux') {
    try {
      // Linux平台使用/proc/stat和/proc/cpuinfo
      const [loadData, cpuData] = await Promise.all([
        execCommand("cat /proc/loadavg"),
        execCommand("cat /proc/cpuinfo | grep 'model name' | head -1")
      ]);
      
      const cpuLoad = loadData.split(' ').slice(0, 3).map(parseFloat);
      const cpuCores = os.cpus().length;
      const modelMatch = cpuData.match(/model name\s*:\s*(.*)/);
      const model = modelMatch ? modelMatch[1].trim() : os.cpus()[0].model;
      const percent = Math.round((cpuLoad[0] / cpuCores) * 100);
      
      return {
        model,
        cores: cpuCores,
        load1: cpuLoad[0].toFixed(2),
        load5: cpuLoad[1].toFixed(2), 
        load15: cpuLoad[2].toFixed(2),
        percent: percent > 100 ? 100 : percent
      };
    } catch (error) {
      throw error;
    }
  } else if (platform === 'darwin') {
    // macOS平台
    try {
      const cpuLoad = os.loadavg();
      const cpuCores = os.cpus().length;
      const model = os.cpus()[0].model;
      const systemProfilerData = await execCommand("system_profiler SPHardwareDataType | grep 'Processor Name'");
      const cpuMatch = systemProfilerData.match(/Processor Name:\s*(.*)/);
      const cpuModel = cpuMatch ? cpuMatch[1].trim() : model;
      
      return {
        model: cpuModel,
        cores: cpuCores,
        load1: cpuLoad[0].toFixed(2),
        load5: cpuLoad[1].toFixed(2),
        load15: cpuLoad[2].toFixed(2),
        percent: Math.round((cpuLoad[0] / cpuCores) * 100)
      };
    } catch (error) {
      throw error;
    }
  } else if (platform === 'win32') {
    // Windows平台
    try {
      // 使用wmic获取CPU信息
      const cpuData = await execCommand('wmic cpu get Name,NumberOfCores /value');
      const cpuLines = cpuData.split('\r\n');
      
      let model = os.cpus()[0].model;
      let cores = os.cpus().length;
      
      cpuLines.forEach(line => {
        if (line.startsWith('Name=')) {
          model = line.substring(5).trim();
        } else if (line.startsWith('NumberOfCores=')) {
          cores = parseInt(line.substring(14).trim()) || cores;
        }
      });
      
      // Windows没有直接的负载平均值，使用CPU使用率作为替代
      const perfData = await execCommand('wmic cpu get LoadPercentage /value');
      const loadMatch = perfData.match(/LoadPercentage=(\d+)/);
      const loadPercent = loadMatch ? parseInt(loadMatch[1]) : 0;
      
      return {
        model,
        cores,
        load1: '不适用',
        load5: '不适用',
        load15: '不适用',
        percent: loadPercent
      };
    } catch (error) {
      throw error;
    }
  }
  
  // 默认返回OS模块的信息
  const cpuLoad = os.loadavg();
  const cpuCores = os.cpus().length;
  
  return {
    model: os.cpus()[0].model,
    cores: cpuCores,
    load1: cpuLoad[0].toFixed(2),
    load5: cpuLoad[1].toFixed(2),
    load15: cpuLoad[2].toFixed(2),
    percent: Math.round((cpuLoad[0] / cpuCores) * 100)
  };
}

/**
 * 根据平台获取磁盘信息
 * @param {string} platform - 操作系统平台
 * @returns {Promise<object>} 磁盘信息
 */
async function getDiskInfo(platform) {
  if (platform === 'linux' || platform === 'darwin') {
    try {
      // Linux/macOS使用df命令
      const diskCommand = platform === 'linux' 
        ? 'df -h / | tail -1' 
        : 'df -h / | tail -1';
      
      const diskData = await execCommand(diskCommand);
      const parts = diskData.trim().split(/\s+/);
      
      if (parts.length >= 5) {
        return {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          percent: parts[4]
        };
      } else {
        throw new Error('磁盘信息格式不正确');
      }
    } catch (error) {
      throw error;
    }
  } else if (platform === 'win32') {
    // Windows平台
    try {
      // 使用wmic获取C盘信息
      const diskData = await execCommand('wmic logicaldisk where DeviceID="C:" get Size,FreeSpace /value');
      const lines = diskData.split(/\r\n|\n/);
      let freeSpace, totalSize;
      
      lines.forEach(line => {
        if (line.startsWith('FreeSpace=')) {
          freeSpace = parseInt(line.split('=')[1]);
        } else if (line.startsWith('Size=')) {
          totalSize = parseInt(line.split('=')[1]);
        }
      });
      
      if (freeSpace !== undefined && totalSize !== undefined) {
        const usedSpace = totalSize - freeSpace;
        const usedPercent = Math.round((usedSpace / totalSize) * 100);
        
        return {
          filesystem: 'C:',
          size: formatBytes(totalSize),
          used: formatBytes(usedSpace),
          available: formatBytes(freeSpace),
          percent: `${usedPercent}%`
        };
      } else {
        throw new Error('无法解析Windows磁盘信息');
      }
    } catch (error) {
      throw error;
    }
  }
  
  // 默认尝试df命令
  try {
    const diskData = await execCommand('df -h / | tail -1');
    const parts = diskData.trim().split(/\s+/);
    
    if (parts.length >= 5) {
      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        percent: parts[4]
      };
    } else {
      throw new Error('磁盘信息格式不正确');
    }
  } catch (error) {
    throw error;
  }
}

/**
 * 将字节格式化为可读大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的字符串
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化运行时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的运行时间
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds}秒`);
  
  return parts.join(' ');
}

module.exports = {
  execCommand,
  getSystemInfo,
  formatBytes,
  formatUptime
};

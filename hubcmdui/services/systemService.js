/**
 * 系统服务模块 - 处理系统级信息获取
 */
const { exec } = require('child_process');
const os = require('os');
const logger = require('../logger');

// 获取磁盘空间信息
async function getDiskSpace() {
  try {
    // 根据操作系统不同有不同的命令
    const isWindows = os.platform() === 'win32';
    
    if (isWindows) {
      // Windows实现(需要更复杂的逻辑)
      return {
        diskSpace: '未实现',
        usagePercent: 0
      };
    } else {
      // Linux/Mac实现
      const diskInfo = await execPromise('df -h | grep -E "/$|/home" | head -1');
      const diskParts = diskInfo.split(/\s+/);
      
      if (diskParts.length >= 5) {
        return {
          diskSpace: `${diskParts[2]}/${diskParts[1]}`,
          usagePercent: parseInt(diskParts[4].replace('%', ''))
        };
      } else {
        throw new Error('磁盘信息格式不正确');
      }
    }
  } catch (error) {
    logger.error('获取磁盘空间失败:', error);
    throw error;
  }
}

// 辅助函数: 执行命令
function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

module.exports = {
  getDiskSpace
};

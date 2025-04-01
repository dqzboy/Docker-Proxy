/**
 * 网络服务 - 提供网络诊断功能
 */
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../logger');

const execAsync = promisify(exec);

/**
 * 执行网络测试
 * @param {string} type 测试类型 ('ping' 或 'traceroute')
 * @param {string} domain 目标域名
 * @returns {Promise<string>} 测试结果
 */
async function performNetworkTest(type, domain) {
  // 验证输入
  if (!domain || !domain.match(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    throw new Error('无效的域名格式');
  }
  
  if (!type || !['ping', 'traceroute'].includes(type)) {
    throw new Error('无效的测试类型');
  }
  
  try {
    // 根据测试类型构建命令
    const command = type === 'ping' 
      ? `ping -c 4 ${domain}` 
      : `traceroute -m 10 ${domain}`;
      
    logger.info(`执行网络测试: ${command}`);
    
    // 执行命令并获取结果
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    return stdout || stderr;
  } catch (error) {
    logger.error(`网络测试失败: ${error.message}`);
    
    // 如果命令被终止，表示超时
    if (error.killed) {
      throw new Error('测试超时');
    }
    
    // 其他错误
    throw error;
  }
}

module.exports = {
  performNetworkTest
};

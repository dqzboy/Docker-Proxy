/**
 * 诊断启动脚本 - 运行诊断并安全启动服务器
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { runDiagnostics } = require('./scripts/diagnostics');

// 确保必要的模块存在
try {
  require('./logger');
} catch (error) {
  console.error('无法加载logger模块，请确保该模块存在:', error.message);
  process.exit(1);
}

const logger = require('./logger');

async function startWithDiagnostics() {
  logger.info('正在运行系统诊断...');
  
  try {
    // 运行诊断
    const { criticalErrors } = await runDiagnostics();
    
    if (criticalErrors.length > 0) {
      logger.error('发现严重问题，无法启动系统。请修复问题后重试。');
      process.exit(1);
    }
    
    logger.success('诊断通过，正在启动系统...');
    
    // 启动服务器
    const serverProcess = spawn('node', ['server.js'], {
      stdio: 'inherit',
      cwd: __dirname
    });
    
    serverProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`服务器进程异常退出，退出码: ${code}`);
        process.exit(code);
      }
    });
    
    serverProcess.on('error', (err) => {
      logger.error('启动服务器进程时出错:', err);
      process.exit(1);
    });
    
  } catch (error) {
    logger.fatal('诊断过程中发生错误:', error);
    process.exit(1);
  }
}

// 启动服务
startWithDiagnostics();

const logger = require('./logger');

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  // 打印完整的堆栈跟踪以便调试
  console.error('错误堆栈:', error.stack);
  // 不立即退出，以便日志能够被写入
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason);
  // 打印堆栈跟踪（如果可用）
  if (reason instanceof Error) {
    console.error('Promise拒绝堆栈:', reason.stack);
  }
});

// 处理退出信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 优雅退出函数
function gracefulShutdown() {
  logger.info('接收到退出信号，正在关闭...');
  
  // 这里可以添加清理代码，如关闭数据库连接等
  try {
    // 关闭任何可能的资源
    try {
      const docker = require('./services/dockerService').getDockerConnection();
      if (docker) {
        logger.info('正在关闭Docker连接...');
        // 如果有活动的Docker连接，可能需要执行一些清理
      }
    } catch (err) {
      // 忽略错误，可能服务未初始化
      logger.debug('Docker服务未初始化，跳过清理');
    }
    
    // 清理监控间隔
    try {
      const monitoringService = require('./services/monitoringService');
      if (monitoringService.stopMonitoring) {
        logger.info('正在停止容器监控...');
        monitoringService.stopMonitoring();
      }
    } catch (err) {
      // 忽略错误，可能服务未初始化
      logger.debug('监控服务未初始化，跳过清理');
    }
    
    logger.info('所有资源已清理完毕，正在退出...');
  } catch (error) {
    logger.error('退出过程中出现错误:', error);
  }
  
  setTimeout(() => {
    logger.info('干净退出完成');
    process.exit(0);
  }, 1000);
}

logger.info('错误处理和清理脚本已加载');

module.exports = {
  gracefulShutdown
};

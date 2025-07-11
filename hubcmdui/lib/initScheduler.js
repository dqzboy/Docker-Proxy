/**
 * 初始化调度器 - 确保某些操作只执行一次
 */
const logger = require('../logger');

// 用于跟踪已执行的任务
const executedTasks = new Set();

async function executeOnce(taskId, taskFunction, context = null) {
  try {
    // 检查任务是否已经执行过
    if (executedTasks.has(taskId)) {
      logger.debug(`任务 "${taskId}" 已经执行过，跳过执行`);
      return null;
    }

    logger.info(`开始执行一次性任务: ${taskId}`);
    
    // 执行任务
    let result;
    if (typeof taskFunction === 'function') {
      result = await taskFunction(context);
    } else {
      throw new Error('提供的任务不是一个函数');
    }
    
    // 标记任务为已执行
    executedTasks.add(taskId);
    logger.success(`任务 "${taskId}" 执行完成`);
    
    return result;
  } catch (error) {
    logger.error(`任务 "${taskId}" 执行失败:`, error);
    throw error;
  }
}

/**
 * 检查任务是否已执行
 * @param {string} taskId - 任务唯一标识符
 * @returns {boolean} 是否已执行
 */
function isTaskExecuted(taskId) {
  return executedTasks.has(taskId);
}

/**
 * 重置任务执行状态（主要用于测试）
 * @param {string} taskId - 任务唯一标识符，如果不提供则重置所有任务
 */
function resetTaskStatus(taskId = null) {
  if (taskId) {
    executedTasks.delete(taskId);
    logger.debug(`重置任务 "${taskId}" 的执行状态`);
  } else {
    executedTasks.clear();
    logger.debug('重置所有任务的执行状态');
  }
}

/**
 * 获取已执行的任务列表
 * @returns {Array<string>} 已执行的任务ID列表
 */
function getExecutedTasks() {
  return Array.from(executedTasks);
}

module.exports = {
  executeOnce,
  isTaskExecuted,
  resetTaskStatus,
  getExecutedTasks
};

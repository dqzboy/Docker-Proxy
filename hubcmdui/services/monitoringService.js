/**
 * 监控服务模块 - 处理容器状态监控和通知
 */
const axios = require('axios');
const logger = require('../logger');
const configService = require('./configService');
const dockerService = require('./dockerService');

// 监控相关状态映射
let containerStates = new Map();
let lastStopAlertTime = new Map();
let secondAlertSent = new Set();
let monitoringInterval = null;

// 更新监控配置
async function updateMonitoringConfig(config) {
  try {
    const currentConfig = await configService.getConfig();
    currentConfig.monitoringConfig = {
      ...currentConfig.monitoringConfig,
      ...config
    };
    
    await configService.saveConfig(currentConfig);
    
    // 重新启动监控
    await startMonitoring();
    
    return { success: true };
  } catch (error) {
    logger.error('更新监控配置失败:', error);
    throw error;
  }
}

// 启动监控
async function startMonitoring() {
  try {
    const config = await configService.getConfig();
    const { isEnabled, monitorInterval } = config.monitoringConfig || {};
    
    // 如果监控已启用
    if (isEnabled) {
      const docker = await dockerService.getDockerConnection();
      
      if (docker) {
        // 初始化容器状态
        await initializeContainerStates(docker);
        
        // 如果已存在监控间隔，清除它
        if (monitoringInterval) {
          clearInterval(monitoringInterval);
        }
        
        // 启动监控间隔
        monitoringInterval = setInterval(async () => {
          await checkContainerStates(docker, config.monitoringConfig);
        }, (monitorInterval || 60) * 1000);
        
        // 监听Docker事件流
        try {
          const dockerEventStream = await docker.getEvents();
          
          dockerEventStream.on('data', async (chunk) => {
            try {
              const event = JSON.parse(chunk.toString());
              
              // 处理容器状态变化事件
              if (event.Type === 'container' && 
                 (event.Action === 'start' || event.Action === 'die' || 
                  event.Action === 'stop' || event.Action === 'kill')) {
                await handleContainerEvent(docker, event, config.monitoringConfig);
              }
            } catch (eventError) {
              logger.error('处理Docker事件出错:', eventError);
            }
          });
          
          dockerEventStream.on('error', (err) => {
            logger.error('Docker事件流错误:', err);
          });
        } catch (streamError) {
          logger.error('无法获取Docker事件流:', streamError);
        }
        
        return true;
      }
    } else if (monitoringInterval) {
      // 如果监控已禁用但间隔仍在运行，停止它
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    
    return false;
  } catch (error) {
    logger.error('启动监控失败:', error);
    return false;
  }
}

// 停止监控
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('容器监控已停止');
  }
  return true;
}

// 初始化容器状态
async function initializeContainerStates(docker) {
  try {
    const containers = await docker.listContainers({ all: true });
    
    for (const container of containers) {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      containerStates.set(container.Id, containerInfo.State.Status);
    }
  } catch (error) {
    logger.error('初始化容器状态失败:', error);
  }
}

// 处理容器事件
async function handleContainerEvent(docker, event, monitoringConfig) {
  try {
    const containerId = event.Actor.ID;
    const container = docker.getContainer(containerId);
    const containerInfo = await container.inspect();
    
    const newStatus = containerInfo.State.Status;
    const oldStatus = containerStates.get(containerId);
    
    if (oldStatus && oldStatus !== newStatus) {
      // 如果容器从停止状态变为运行状态
      if (newStatus === 'running' && oldStatus !== 'running') {
        await sendAlertWithRetry(
          containerInfo.Name, 
          `恢复运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, 
          monitoringConfig
        );
        
        // 清除告警状态
        lastStopAlertTime.delete(containerInfo.Name);
        secondAlertSent.delete(containerInfo.Name);
      } 
      // 如果容器从运行状态变为停止状态
      else if (oldStatus === 'running' && newStatus !== 'running') {
        await sendAlertWithRetry(
          containerInfo.Name, 
          `停止运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, 
          monitoringConfig
        );
        
        // 记录停止时间，用于后续检查
        lastStopAlertTime.set(containerInfo.Name, Date.now());
        secondAlertSent.delete(containerInfo.Name);
      }
      
      // 更新状态记录
      containerStates.set(containerId, newStatus);
    }
  } catch (error) {
    logger.error('处理容器事件失败:', error);
  }
}

// 检查容器状态
async function checkContainerStates(docker, monitoringConfig) {
  try {
    const containers = await docker.listContainers({ all: true });
    
    for (const container of containers) {
      const containerInfo = await docker.getContainer(container.Id).inspect();
      const newStatus = containerInfo.State.Status;
      const oldStatus = containerStates.get(container.Id);
      
      // 如果状态发生变化
      if (oldStatus && oldStatus !== newStatus) {
        // 处理状态变化，与handleContainerEvent相同的逻辑
        if (newStatus === 'running' && oldStatus !== 'running') {
          await sendAlertWithRetry(
            containerInfo.Name, 
            `恢复运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, 
            monitoringConfig
          );
          
          lastStopAlertTime.delete(containerInfo.Name);
          secondAlertSent.delete(containerInfo.Name);
        } 
        else if (oldStatus === 'running' && newStatus !== 'running') {
          await sendAlertWithRetry(
            containerInfo.Name, 
            `停止运行 (之前状态: ${oldStatus}, 当前状态: ${newStatus})`, 
            monitoringConfig
          );
          
          lastStopAlertTime.set(containerInfo.Name, Date.now());
          secondAlertSent.delete(containerInfo.Name);
        }
        
        containerStates.set(container.Id, newStatus);
      } 
      // 如果容器仍处于非运行状态，检查是否需要发送二次告警
      else if (newStatus !== 'running') {
        await checkSecondStopAlert(containerInfo.Name, newStatus, monitoringConfig);
      }
    }
  } catch (error) {
    logger.error('检查容器状态失败:', error);
  }
}

// 检查是否需要发送二次停止告警
async function checkSecondStopAlert(containerName, currentStatus, monitoringConfig) {
  const now = Date.now();
  const lastStopAlert = lastStopAlertTime.get(containerName) || 0;
  
  // 如果距离上次停止告警超过1小时，且还没有发送过第二次告警，则发送第二次告警
  if (now - lastStopAlert >= 60 * 60 * 1000 && !secondAlertSent.has(containerName)) {
    await sendAlertWithRetry(containerName, `仍未恢复 (当前状态: ${currentStatus})`, monitoringConfig);
    secondAlertSent.add(containerName); // 标记已发送第二次告警
  }
}

// 发送告警（带重试）
async function sendAlertWithRetry(containerName, status, monitoringConfig, maxRetries = 6) {
  const { notificationType, webhookUrl, telegramToken, telegramChatId } = monitoringConfig;
  const cleanContainerName = containerName.replace(/^\//, '');
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (notificationType === 'wechat') {
        await sendWechatAlert(webhookUrl, cleanContainerName, status);
      } else if (notificationType === 'telegram') {
        await sendTelegramAlert(telegramToken, telegramChatId, cleanContainerName, status);
      }
      
      logger.success(`告警发送成功: ${cleanContainerName} ${status}`);
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(`达到最大重试次数，放弃发送告警: ${cleanContainerName} ${status}`);
        logger.error('最后一次错误:', error);
        return;
      }
      
      logger.warn(`告警发送失败，尝试重试 (${attempt}/${maxRetries}): ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

// 发送企业微信告警
async function sendWechatAlert(webhookUrl, containerName, status) {
  if (!webhookUrl) {
    throw new Error('企业微信 Webhook URL 未设置');
  }
  
  const response = await axios.post(webhookUrl, {
    msgtype: 'text',
    text: {
      content: `Docker 容器告警: 容器 ${containerName} ${status}`
    }
  }, {
    timeout: 5000
  });
  
  if (response.status !== 200 || response.data.errcode !== 0) {
    throw new Error(`请求成功但返回错误：${response.data.errmsg || JSON.stringify(response.data)}`);
  }
}

// 发送Telegram告警
async function sendTelegramAlert(token, chatId, containerName, status) {
  if (!token || !chatId) {
    throw new Error('Telegram Bot Token 或 Chat ID 未设置');
  }
  
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await axios.post(url, {
    chat_id: chatId,
    text: `Docker 容器告警: 容器 ${containerName} ${status}`
  }, {
    timeout: 5000
  });
  
  if (response.status !== 200 || !response.data.ok) {
    throw new Error(`发送Telegram消息失败：${JSON.stringify(response.data)}`);
  }
}

// 测试通知
async function testNotification(config) {
  const { notificationType, webhookUrl, telegramToken, telegramChatId } = config;
  
  if (notificationType === 'wechat') {
    await sendWechatAlert(webhookUrl, 'Test Container', 'This is a test notification');
  } else if (notificationType === 'telegram') {
    await sendTelegramAlert(telegramToken, telegramChatId, 'Test Container', 'This is a test notification');
  } else {
    throw new Error('不支持的通知类型');
  }
  
  return { success: true };
}

// 切换监控状态
async function toggleMonitoring(isEnabled) {
  const config = await configService.getConfig();
  config.monitoringConfig.isEnabled = isEnabled;
  await configService.saveConfig(config);
  
  return startMonitoring();
}

// 获取已停止的容器
async function getStoppedContainers(forceRefresh = false) {
  return await dockerService.getStoppedContainers();
}

module.exports = {
  updateMonitoringConfig,
  startMonitoring,
  stopMonitoring,
  testNotification,
  toggleMonitoring,
  getStoppedContainers,
  sendAlertWithRetry
};

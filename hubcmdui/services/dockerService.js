/**
 * Docker服务模块 - 处理Docker容器管理
 */
const Docker = require('dockerode');
const logger = require('../logger');

let docker = null;

async function initDockerConnection() {
  if (docker) return docker;
  
  try {
    // 兼容MacOS的Docker socket路径
    const options = process.platform === 'darwin' 
      ? { socketPath: '/var/run/docker.sock' }
      : null;
    
    docker = new Docker(options);
    await docker.ping();
    logger.success('成功连接到Docker守护进程');
    return docker;
  } catch (error) {
    logger.error('Docker连接失败:', error.message);
    return null; // 返回null而不是抛出错误
  }
}

// 获取Docker连接
async function getDockerConnection() {
  if (!docker) {
    docker = await initDockerConnection();
  }
  return docker;
}

// 修改其他Docker相关方法，添加更友好的错误处理
async function getContainersStatus() {
  const docker = await initDockerConnection();
  if (!docker) {
    logger.warn('[getContainersStatus] Cannot connect to Docker daemon, returning error indicator.');
    // 返回带有特殊错误标记的数组，前端可以通过这个标记识别 Docker 不可用
    return [{ 
      id: 'n/a',
      name: 'Docker 服务不可用',
      image: 'n/a',
      state: 'error',
      status: 'Docker 服务未运行或无法连接',
      error: 'DOCKER_UNAVAILABLE', // 特殊错误标记
      cpu: 'N/A',
      memory: 'N/A',
      created: new Date().toLocaleString()
    }];
  }
  
  let containers = [];
  try {
      containers = await docker.listContainers({ all: true });
      logger.info(`[getContainersStatus] Found ${containers.length} containers.`);
  } catch (listError) {
      logger.error('[getContainersStatus] Error listing containers:', listError.message || listError);
      // 使用同样的错误标记模式
      return [{ 
        id: 'n/a',
        name: '容器列表获取失败',
        image: 'n/a',
        state: 'error',
        status: `获取容器列表失败: ${listError.message}`,
        error: 'CONTAINER_LIST_ERROR',
        cpu: 'N/A',
        memory: 'N/A',
        created: new Date().toLocaleString()
      }];
  }

  const containerPromises = containers.map(async (container) => {
    try { 
        const containerInspectInfo = await docker.getContainer(container.Id).inspect();
        
        let stats = {};
        let cpuUsage = 'N/A';
        let memoryUsage = 'N/A';

        // 仅在容器运行时尝试获取 stats
        if (containerInspectInfo.State.Running) {
            try {
                 stats = await docker.getContainer(container.Id).stats({ stream: false });
                 
                 // Safely calculate CPU usage
                 if (stats.precpu_stats && stats.cpu_stats && stats.cpu_stats.cpu_usage && stats.precpu_stats.cpu_usage && stats.cpu_stats.system_cpu_usage && stats.precpu_stats.system_cpu_usage) {
                     const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
                     const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
                     if (systemDelta > 0 && stats.cpu_stats.online_cpus > 0) {
                         cpuUsage = ((cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0).toFixed(2) + '%';
                     } else {
                         cpuUsage = '0.00%'; // Handle division by zero or no change
                     }
                 } else {
                      logger.warn(`[getContainersStatus] Incomplete CPU stats for container ${container.Id}`);
                 }

                 // Safely calculate Memory usage
                 if (stats.memory_stats && stats.memory_stats.usage && stats.memory_stats.limit) {
                     const memoryLimit = stats.memory_stats.limit;
                     if (memoryLimit > 0) {
                         memoryUsage = ((stats.memory_stats.usage / memoryLimit) * 100.0).toFixed(2) + '%';
                     } else {
                         memoryUsage = '0.00%'; // Handle division by zero (unlikely)
                     }
                 } else {
                      logger.warn(`[getContainersStatus] Incomplete Memory stats for container ${container.Id}`);
                 }
                 
            } catch (statsError) {
                 logger.warn(`[getContainersStatus] Failed to get stats for running container ${container.Id}: ${statsError.message}`);
                 // 保留 N/A 值
            }
        }
        
        return {
          id: container.Id.slice(0, 12),
          name: container.Names && container.Names.length > 0 ? container.Names[0].replace(/^\//, '') : (containerInspectInfo.Name ? containerInspectInfo.Name.replace(/^\//, '') : 'N/A'),
          image: container.Image || 'N/A',
          state: containerInspectInfo.State.Status || container.State || 'N/A',
          status: container.Status || 'N/A',
          cpu: cpuUsage,
          memory: memoryUsage,
          created: container.Created ? new Date(container.Created * 1000).toLocaleString() : 'N/A'
        };
    } catch(err) {
        logger.warn(`[getContainersStatus] Failed to get inspect info for container ${container.Id}: ${err.message}`);
        // 返回一个包含错误信息的对象，而不是让 Promise.all 失败
        return {
            id: container.Id ? container.Id.slice(0, 12) : 'Unknown ID',
            name: container.Names && container.Names.length > 0 ? container.Names[0].replace(/^\//, '') : 'Unknown Name',
            image: container.Image || 'Unknown Image',
            state: 'error',
            status: `Error: ${err.message}`,
            cpu: 'N/A',
            memory: 'N/A',
            created: container.Created ? new Date(container.Created * 1000).toLocaleString() : 'N/A'
        };
    }
  });
  
  // 等待所有容器信息处理完成
  const results = await Promise.all(containerPromises);
  // 可以选择过滤掉完全失败的结果（虽然上面已经处理了）
  // return results.filter(r => r.state !== 'error'); 
  return results; // 返回所有结果，包括有错误的
}

// 获取单个容器状态
async function getContainerStatus(id) {
  const docker = await getDockerConnection();
  if (!docker) {
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  const container = docker.getContainer(id);
  const containerInfo = await container.inspect();
  return { state: containerInfo.State.Status };
}

// 重启容器
async function restartContainer(id) {
  logger.info(`Attempting to restart container ${id}`);
  const docker = await getDockerConnection();
  if (!docker) {
    logger.error(`[restartContainer ${id}] Cannot connect to Docker daemon.`);
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  try {
    const container = docker.getContainer(id);
    await container.restart();
    logger.success(`Container ${id} restarted successfully.`);
    return { success: true };
  } catch (error) {
    logger.error(`[restartContainer ${id}] Error restarting container:`, error.message || error);
    // 检查是否是容器不存在的错误
    if (error.statusCode === 404) {
      throw new Error(`容器 ${id} 不存在`);
    }
    // 可以根据需要添加其他错误类型的检查
    throw new Error(`重启容器失败: ${error.message}`);
  }
}

// 停止容器
async function stopContainer(id) {
  logger.info(`Attempting to stop container ${id}`);
  const docker = await getDockerConnection();
  if (!docker) {
    logger.error(`[stopContainer ${id}] Cannot connect to Docker daemon.`);
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  try {
    const container = docker.getContainer(id);
    await container.stop();
    logger.success(`Container ${id} stopped successfully.`);
    return { success: true };
  } catch (error) {
    logger.error(`[stopContainer ${id}] Error stopping container:`, error.message || error);
    // 检查是否是容器不存在或已停止的错误
    if (error.statusCode === 404) {
      throw new Error(`容器 ${id} 不存在`);
    } else if (error.statusCode === 304) {
        logger.warn(`[stopContainer ${id}] Container already stopped.`);
        return { success: true, message: '容器已停止' }; // 认为已停止也是成功
    }
    throw new Error(`停止容器失败: ${error.message}`);
  }
}

// 删除容器
async function deleteContainer(id) {
  const docker = await getDockerConnection();
  if (!docker) {
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  const container = docker.getContainer(id);
  
  // 首先停止容器（如果正在运行）
  try {
    await container.stop();
  } catch (stopError) {
    logger.info('Container may already be stopped:', stopError.message);
  }
  
  // 然后删除容器
  await container.remove();
  return { success: true, message: '容器已成功删除' };
}

// 更新容器
async function updateContainer(id, tag) {
  const docker = await getDockerConnection();
  if (!docker) {
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  // 获取容器信息
  const container = docker.getContainer(id);
  const containerInfo = await container.inspect();
  const currentImage = containerInfo.Config.Image;
  const [imageName] = currentImage.split(':');
  const newImage = `${imageName}:${tag}`;
  const containerName = containerInfo.Name.slice(1); // 去掉开头的 '/'
  
  logger.info(`Updating container ${id} from ${currentImage} to ${newImage}`);
  
  // 拉取新镜像
  logger.info(`Pulling new image: ${newImage}`);
  await new Promise((resolve, reject) => {
    docker.pull(newImage, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err, output) => err ? reject(err) : resolve(output));
    });
  });
  
  // 停止旧容器
  logger.info('Stopping old container');
  await container.stop();
  
  // 删除旧容器
  logger.info('Removing old container');
  await container.remove();
  
  // 创建新容器
  logger.info('Creating new container');
  const newContainerConfig = {
    ...containerInfo.Config,
    Image: newImage,
    HostConfig: containerInfo.HostConfig,
    NetworkingConfig: {
      EndpointsConfig: containerInfo.NetworkSettings.Networks
    }
  };
  
  const newContainer = await docker.createContainer({
    ...newContainerConfig,
    name: containerName
  });
  
  // 启动新容器
  logger.info('Starting new container');
  await newContainer.start();
  
  logger.success('Container update completed successfully');
  return { success: true };
}

// 获取容器日志
async function getContainerLogs(id, options = {}) {
  logger.info(`Attempting to get logs for container ${id} with options:`, options);
  const docker = await getDockerConnection();
  if (!docker) {
     logger.error(`[getContainerLogs ${id}] Cannot connect to Docker daemon.`);
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  try {
    const container = docker.getContainer(id);
    const logOptions = {
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      follow: options.follow || false
    };
    
    // 修复日志获取方式
    if (!options.follow) {
      // 对于非流式日志，直接等待返回
      try {
        const logs = await container.logs(logOptions);
        
        // 如果logs是Buffer或字符串，直接处理
        if (Buffer.isBuffer(logs) || typeof logs === 'string') {
          // 清理ANSI转义码
          const cleanedLogs = logs.toString('utf8').replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
          logger.success(`Successfully retrieved logs for container ${id}`);
          return cleanedLogs;
        } 
        // 如果logs是流，转换为字符串
        else if (typeof logs === 'object' && logs !== null) {
          return new Promise((resolve, reject) => {
            let allLogs = '';
            
            // 处理数据事件
            if (typeof logs.on === 'function') {
              logs.on('data', chunk => {
                allLogs += chunk.toString('utf8');
              });
              
              logs.on('end', () => {
                const cleanedLogs = allLogs.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
                logger.success(`Successfully retrieved logs for container ${id}`);
                resolve(cleanedLogs);
              });
              
              logs.on('error', err => {
                logger.error(`[getContainerLogs ${id}] Error reading log stream:`, err.message || err);
                reject(new Error(`读取日志流失败: ${err.message}`));
              });
            } else {
              // 如果不是标准流但返回了对象，尝试转换为字符串
              logger.warn(`[getContainerLogs ${id}] Logs object does not have stream methods, trying to convert`);
              try {
                const logStr = logs.toString();
                const cleanedLogs = logStr.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
                resolve(cleanedLogs);
              } catch (convErr) {
                logger.error(`[getContainerLogs ${id}] Failed to convert logs to string:`, convErr);
                reject(new Error('日志格式转换失败'));
              }
            }
          });
        } else {
          logger.error(`[getContainerLogs ${id}] Unexpected logs response type:`, typeof logs);
          throw new Error('日志响应格式错误');
        }
      } catch (logError) {
        logger.error(`[getContainerLogs ${id}] Error getting logs:`, logError);
        throw logError;
      }
    } else {
      // 对于流式日志，调整方式
      logger.info(`[getContainerLogs ${id}] Returning log stream for follow=true`);
      const stream = await container.logs(logOptions);
      return stream; // 直接返回流对象
    }
  } catch (error) {
    logger.error(`[getContainerLogs ${id}] Error getting container logs:`, error.message || error);
    if (error.statusCode === 404) {
        throw new Error(`容器 ${id} 不存在`);
    }
    throw new Error(`获取日志失败: ${error.message}`);
  }
}

// 获取已停止的容器
async function getStoppedContainers() {
  const docker = await getDockerConnection();
  if (!docker) {
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  const containers = await docker.listContainers({ 
    all: true,
    filters: { status: ['exited', 'dead', 'created'] }
  });
  
  return containers.map(container => ({
    id: container.Id.slice(0, 12),
    name: container.Names[0].replace(/^\//, ''),
    status: container.State
  }));
}

// 获取最近的Docker事件
async function getRecentEvents(limit = 10) {
  const docker = await getDockerConnection();
  if (!docker) {
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  // 注意：Dockerode的getEvents API可能不支持历史事件查询
  // 以下代码是模拟生成最近事件，实际应用中可能需要其他方式实现
  
  try {
    const containers = await docker.listContainers({ 
      all: true, 
      limit: limit,
      filters: { status: ['exited', 'created', 'running', 'restarting'] }
    });
    
    // 从容器状态转换为事件
    const events = containers.map(container => {
      let action, status;
      
      switch(container.State) {
        case 'running':
          action = 'start';
          status = '运行中';
          break;
        case 'exited':
          action = 'die';
          status = '已停止';
          break;
        case 'created':
          action = 'create';
          status = '已创建';
          break;
        case 'restarting':
          action = 'restart';
          status = '重启中';
          break;
        default:
          action = 'update';
          status = container.Status;
      }
      
      return {
        time: container.Created,
        Action: action,
        status: status,
        Actor: {
          Attributes: {
            name: container.Names[0].replace(/^\//, '')
          }
        }
      };
    });
    
    return events.sort((a, b) => b.time - a.time);
  } catch (error) {
    logger.error('获取Docker事件失败:', error);
    return [];
  }
}

module.exports = {
  initDockerConnection,
  getDockerConnection,
  getContainersStatus,
  getContainerStatus,
  restartContainer,
  stopContainer,
  deleteContainer,
  updateContainer,
  getContainerLogs,
  getStoppedContainers,
  getRecentEvents
};

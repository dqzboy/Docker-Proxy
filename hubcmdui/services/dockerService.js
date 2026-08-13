/**
 * Docker服务模块 - 处理Docker容器管理
 */
const Docker = require('dockerode');
const logger = require('../logger');
const { decodeDockerLogBuffer, createDockerLogDemuxStream } = require('../lib/dockerLogs');

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

// ---------- Docker 状态短缓存 ----------
// getContainersStatus 每次都要直连 Docker 守护进程（list + 逐个 inspect + 运行中的 stats），
// 稳定需要 1~3 秒。系统看板每 5 秒轮询一次，这里用 2.5s 的 TTL 内存缓存：
//   - 自动轮询（间隔 5s）必然错过缓存，始终拿到最新数据；
//   - 快速来回切换菜单时那次刷新直接命中缓存，秒回，避免“切回看板要等几秒”。
// 同时用 in-flight promise 合并并发请求，防止缓存失效瞬间的惊群。
let _statusCache = { data: null, ts: 0 }
let _statusPromise = null
const STATUS_TTL = 2500

// 修改其他Docker相关方法，添加更友好的错误处理
async function getContainersStatus(opts = {}) {
  const force = !!(opts && opts.force)
  const now = Date.now()
  if (!force && _statusCache.data && (now - _statusCache.ts) < STATUS_TTL) {
    return _statusCache.data
  }
  // 缓存未命中但有进行中的请求：直接复用，避免重复打 Docker
  if (!force && _statusPromise) {
    return _statusPromise
  }
  _statusPromise = (async () => {
    const data = await _fetchContainersStatus()
    _statusCache = { data, ts: Date.now() }
    _statusPromise = null
    return data
  })()
  try {
    return await _statusPromise
  } catch (e) {
    _statusPromise = null
    throw e
  }
}

async function _fetchContainersStatus() {
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

// 启动容器
async function startContainer(id) {
  logger.info(`Attempting to start container ${id}`);
  const docker = await getDockerConnection();
  if (!docker) {
    logger.error(`[startContainer ${id}] Cannot connect to Docker daemon.`);
    throw new Error('无法连接到 Docker 守护进程');
  }
  
  try {
    const container = docker.getContainer(id);
    await container.start();
    logger.success(`Container ${id} started successfully.`);
    return { success: true };
  } catch (error) {
    logger.error(`[startContainer ${id}] Error starting container:`, error.message || error);
    // 检查是否是容器不存在的错误
    if (error.statusCode === 404) {
      throw new Error(`容器 ${id} 不存在`);
    } else if (error.statusCode === 304) {
      logger.warn(`[startContainer ${id}] Container already started.`);
      return { success: true, message: '容器已启动' }; // 认为已启动也是成功
    }
    throw new Error(`启动容器失败: ${error.message}`);
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
    // TTY=true 时 Docker 返回原始字节；TTY=false 时 stdout/stderr 使用 8 字节帧头复用。
    const containerInfo = await container.inspect();
    const tty = !!(containerInfo && containerInfo.Config && containerInfo.Config.Tty);
    const follow = options.follow === true;
    const logOptions = {
      stdout: true,
      stderr: true,
      tail: Number.isInteger(options.tail) ? options.tail : 100,
      follow
    };

    const logs = await container.logs(logOptions);

    if (!follow) {
      if (Buffer.isBuffer(logs)) {
        const decoded = decodeDockerLogBuffer(logs, { tty });
        logger.success(`Successfully retrieved logs for container ${id}`);
        return decoded;
      }

      if (typeof logs === 'string') {
        // 字符串说明调用方或兼容实现已经完成解码，按纯文本清理即可。
        const decoded = decodeDockerLogBuffer(Buffer.from(logs), { tty: true });
        logger.success(`Successfully retrieved logs for container ${id}`);
        return decoded;
      }

      throw new Error(`日志响应格式错误: ${typeof logs}`);
    }

    if (!logs || typeof logs.pipe !== 'function') {
      throw new Error('Docker 实时日志响应不是可读流');
    }

    const demuxedStream = createDockerLogDemuxStream({ tty });
    logs.on('error', error => demuxedStream.destroy(error));
    demuxedStream.once('close', () => {
      if (typeof logs.destroy === 'function' && !logs.destroyed) logs.destroy();
    });
    logs.pipe(demuxedStream);
    return demuxedStream;
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
  
  try {
    logger.info('正在获取已停止的容器...');
    const containers = await docker.listContainers({ 
      all: true,
      filters: { status: ['exited', 'dead', 'created'] }
    });
    
    logger.info(`找到 ${containers.length} 个已停止的容器`);
    
    // 记录每个容器的信息
    containers.forEach(container => {
      logger.info(`容器 ID: ${container.Id}, 名称: ${container.Names}, 镜像: ${container.Image}, 状态: ${container.State}`);
    });
    
    const result = containers.map(container => ({
      id: container.Id.slice(0, 12),
      name: container.Names[0].replace(/^\//, ''),
      image: container.Image,
      status: container.State
    }));
    
    logger.info('已转换容器信息: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    logger.error('获取已停止容器失败:', error);
    throw error;
  }
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
  startContainer,
  deleteContainer,
  updateContainer,
  getContainerLogs,
  getStoppedContainers,
  getRecentEvents
};

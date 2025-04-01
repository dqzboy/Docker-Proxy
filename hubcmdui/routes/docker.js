/**
 * Docker容器管理路由
 */
const express = require('express');
const router = express.Router();
const WebSocket = require('ws');
const http = require('http');
const dockerService = require('../services/dockerService');
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');

// 获取Docker状态
router.get('/status', requireLogin, async (req, res) => {
  try {
    const containerStatus = await dockerService.getContainersStatus();
    res.json(containerStatus);
  } catch (error) {
    logger.error('获取 Docker 状态时出错:', error);
    res.status(500).json({ error: '获取 Docker 状态失败', details: error.message });
  }
});

// 获取单个容器状态
router.get('/status/:id', requireLogin, async (req, res) => {
  try {
    const containerInfo = await dockerService.getContainerStatus(req.params.id);
    res.json(containerInfo);
  } catch (error) {
    logger.error('获取容器状态失败:', error);
    res.status(500).json({ error: '获取容器状态失败', details: error.message });
  }
});

// 重启容器
router.post('/restart/:id', requireLogin, async (req, res) => {
  try {
    await dockerService.restartContainer(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('重启容器失败:', error);
    res.status(500).json({ error: '重启容器失败', details: error.message });
  }
});

// 停止容器
router.post('/stop/:id', requireLogin, async (req, res) => {
  try {
    await dockerService.stopContainer(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('停止容器失败:', error);
    res.status(500).json({ error: '停止容器失败', details: error.message });
  }
});

// 删除容器
router.post('/delete/:id', requireLogin, async (req, res) => {
  try {
    await dockerService.deleteContainer(req.params.id);
    res.json({ success: true, message: '容器已成功删除' });
  } catch (error) {
    logger.error('删除容器失败:', error);
    res.status(500).json({ error: '删除容器失败', details: error.message });
  }
});

// 更新容器
router.post('/update/:id', requireLogin, async (req, res) => {
  try {
    const { tag } = req.body;
    await dockerService.updateContainer(req.params.id, tag);
    res.json({ success: true, message: '容器更新成功' });
  } catch (error) {
    logger.error('更新容器失败:', error);
    res.status(500).json({ error: '更新容器失败', details: error.message, stack: error.stack });
  }
});

// 获取已停止容器
router.get('/stopped', requireLogin, async (req, res) => {
  try {
    const stoppedContainers = await dockerService.getStoppedContainers();
    res.json(stoppedContainers);
  } catch (error) {
    logger.error('获取已停止容器列表失败:', error);
    res.status(500).json({ error: '获取已停止容器列表失败', details: error.message });
  }
});

// 获取容器日志(HTTP轮询)
router.get('/logs-poll/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await dockerService.getContainerLogs(id);
    res.send(logs);
  } catch (error) {
    logger.error('获取容器日志失败:', error);
    res.status(500).send('获取日志失败');
  }
});

// 设置WebSocket路由，用于实时日志流
function setupLogWebsocket(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', async (ws, req) => {
    try {
      const containerId = req.url.split('/').pop();
      const docker = await dockerService.getDockerConnection();
      
      if (!docker) {
        ws.send('Error: 无法连接到 Docker 守护进程');
        return;
      }
      
      const container = docker.getContainer(containerId);
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 100
      });
      
      stream.on('data', (chunk) => {
        const cleanedChunk = chunk.toString('utf8').replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
        // 移除不可打印字符
        const printableChunk = cleanedChunk.replace(/[^\x20-\x7E\x0A\x0D]/g, '');
        ws.send(printableChunk);
      });
      
      ws.on('close', () => {
        stream.destroy();
      });
      
      stream.on('error', (err) => {
        ws.send('Error: ' + err.message);
      });
    } catch (err) {
      ws.send('Error: ' + err.message);
    }
  });
}

// 直接导出 router 实例，并添加 setupLogWebsocket 作为静态属性
router.setupLogWebsocket = setupLogWebsocket;
module.exports = router;

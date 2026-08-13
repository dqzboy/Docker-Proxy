/**
 * Docker容器管理路由
 */
const express = require('express');
const router = express.Router();
const WebSocket = require('ws');
const { StringDecoder } = require('string_decoder');
const dockerService = require('../services/dockerService');
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const { sanitizeLogText } = require('../lib/dockerLogs');

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
router.get('/logs-poll/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await dockerService.getContainerLogs(id);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'text/plain; charset=utf-8').send(logs);
  } catch (error) {
    logger.error('获取容器日志失败:', error);
    res.status(500).send('获取日志失败');
  }
});

// 设置 WebSocket 路由，用于实时日志流。
// 仅接管 /api/docker/logs-stream/:id，并复用 HTTP Session 校验登录态。
let logWebsocketInitialized = false;
function setupLogWebsocket(server, sessionMiddleware) {
  if (logWebsocketInitialized) return;
  if (typeof sessionMiddleware !== 'function') {
    throw new Error('容器日志 WebSocket 缺少 Session 中间件');
  }
  logWebsocketInitialized = true;

  const wss = new WebSocket.Server({ noServer: true });
  const logPathPattern = /^\/api\/docker\/logs-stream\/([^/]+)$/;

  server.on('upgrade', (req, socket, head) => {
    let match;
    try {
      match = new URL(req.url, 'http://localhost').pathname.match(logPathPattern);
    } catch (_) {
      return;
    }
    if (!match) return;

    // express-session 需要一个最小响应对象来读取 Cookie/Session，Upgrade 本身不会发送普通响应。
    const sessionResponse = {
      getHeader: () => undefined,
      setHeader: () => {},
      writeHead: () => {},
      write: () => true,
      end: () => {}
    };

    sessionMiddleware(req, sessionResponse, (error) => {
      if (error || !req.session || !req.session.user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      let containerId;
      try {
        containerId = decodeURIComponent(match[1]);
      } catch (_) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/.test(containerId)) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      req.containerId = containerId;
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', async (ws, req) => {
    let stream;
    const decoder = new StringDecoder('utf8');

    try {
      stream = await dockerService.getContainerLogs(req.containerId, {
        follow: true,
        tail: 100
      });

      stream.on('data', chunk => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const text = sanitizeLogText(decoder.write(chunk));
        if (text) ws.send(text);
      });

      stream.on('end', () => {
        const remaining = sanitizeLogText(decoder.end());
        if (remaining && ws.readyState === WebSocket.OPEN) ws.send(remaining);
        if (ws.readyState === WebSocket.OPEN) ws.close(1000, '日志流已结束');
      });

      stream.on('error', error => {
        logger.error(`容器 ${req.containerId} 实时日志流错误:`, error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`Error: ${error.message}`);
          ws.close(1011, '日志流读取失败');
        }
      });
    } catch (error) {
      logger.error(`启动容器 ${req.containerId} 实时日志失败:`, error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`Error: ${error.message}`);
        ws.close(1011, '无法启动日志流');
      }
    }

    ws.on('close', () => {
      if (stream && typeof stream.destroy === 'function' && !stream.destroyed) {
        stream.destroy();
      }
    });
  });
}

// 直接导出 router 实例，并添加 setupLogWebsocket 作为静态属性
router.setupLogWebsocket = setupLogWebsocket;
module.exports = router;

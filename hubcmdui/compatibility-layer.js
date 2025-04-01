/**
 * 兼容层 - 确保旧版API接口继续工作
 */
const logger = require('./logger');
const { requireLogin } = require('./middleware/auth');
const { execCommand } = require('./server-utils');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = function(app) {
  logger.info('加载API兼容层...');
  
  // 会话检查接口
  app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.user) {
      res.json({ authenticated: true, user: req.session.user });
    } else {
      res.json({ authenticated: false });
    }
  });
  
  // 添加Docker状态检查接口，并使用 requireLogin 中间件
  app.get('/api/docker/status', requireLogin, async (req, res) => {
    try {
      const dockerService = require('./services/dockerService');
      const dockerStatus = await dockerService.checkDockerAvailability();
      res.json({ isRunning: dockerStatus });
    } catch (error) {
      logger.error('检查Docker状态失败:', error);
      res.status(500).json({ error: '检查Docker状态失败', details: error.message });
    }
  });
  
  // 验证码接口
  app.get('/api/captcha', (req, res) => {
    try {
      const num1 = Math.floor(Math.random() * 10);
      const num2 = Math.floor(Math.random() * 10);
      const captcha = `${num1} + ${num2} = ?`;
      req.session.captcha = num1 + num2;
      res.json({ captcha });
    } catch (error) {
      logger.error('生成验证码失败:', error);
      res.status(500).json({ error: '生成验证码失败' });
    }
  });
  
  // 停止容器列表接口
  app.get('/api/stopped-containers', requireLogin, async (req, res) => {
    try {
      const monitoringService = require('./services/monitoringService');
      const stoppedContainers = await monitoringService.getStoppedContainers();
      res.json(stoppedContainers);
    } catch (error) {
      logger.error('获取已停止容器列表失败:', error);
      res.status(500).json({ error: '获取已停止容器列表失败', details: error.message });
    }
  });
  
  // 修复Docker Hub搜索接口 - 直接使用axios请求，避免dockerHubService的依赖问题
  app.get('/api/dockerhub/search', async (req, res) => {
    try {
      const axios = require('axios');
      const term = req.query.term;
      const page = req.query.page || 1;
      
      if (!term) {
        return res.status(400).json({ error: '搜索词不能为空' });
      }
      
      logger.info(`搜索Docker Hub: ${term} (页码: ${page})`);
      
      const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page=${page}&page_size=25`;
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'DockerHubSearchClient/1.0',
          'Accept': 'application/json'
        }
      });
      
      res.json(response.data);
    } catch (error) {
      logger.error('搜索Docker Hub失败:', error.message || error);
      res.status(500).json({ 
        error: '搜索失败', 
        details: error.message || '未知错误',
        retryable: true 
      });
    }
  });
  
  // Docker Hub 标签计数接口
  app.get('/api/dockerhub/tag-count', async (req, res) => {
    try {
      const axios = require('axios');
      const name = req.query.name;
      const isOfficial = req.query.official === 'true';
      
      if (!name) {
        return res.status(400).json({ error: '镜像名称不能为空' });
      }
      
      const fullImageName = isOfficial ? `library/${name}` : name;
      const apiUrl = `https://hub.docker.com/v2/repositories/${fullImageName}/tags/?page_size=1`;
      
      logger.info(`获取标签计数: ${fullImageName}`);
      
      const response = await axios.get(apiUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'DockerHubSearchClient/1.0',
          'Accept': 'application/json'
        }
      });
      
      res.json({
        count: response.data.count,
        recommended_mode: response.data.count > 500 ? 'paginated' : 'full'
      });
    } catch (error) {
      logger.error('获取标签计数失败:', error.message || error);
      res.status(500).json({ 
        error: '获取标签计数失败', 
        details: error.message || '未知错误',
        retryable: true 
      });
    }
  });
  
  // Docker Hub 标签接口
  app.get('/api/dockerhub/tags', async (req, res) => {
    try {
      const axios = require('axios');
      const imageName = req.query.name;
      const isOfficial = req.query.official === 'true';
      const page = parseInt(req.query.page) || 1;
      const page_size = parseInt(req.query.page_size) || 25;
      const getAllTags = req.query.all === 'true';
      
      if (!imageName) {
        return res.status(400).json({ error: '镜像名称不能为空' });
      }
      
      const fullImageName = isOfficial ? `library/${imageName}` : imageName;
      logger.info(`获取镜像标签: ${fullImageName}, 页码: ${page}, 每页数量: ${page_size}, 获取全部: ${getAllTags}`);
      
      // 如果请求所有标签，需要递归获取所有页
      if (getAllTags) {
        // 暂不实现全部获取，返回错误
        return res.status(400).json({ error: '获取全部标签功能暂未实现，请使用分页获取' });
      } else {
        // 获取特定页的标签
        const tagsUrl = `https://hub.docker.com/v2/repositories/${fullImageName}/tags?page=${page}&page_size=${page_size}`;
        
        const tagsResponse = await axios.get(tagsUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
          }
        });
        
        // 检查响应数据有效性
        if (!tagsResponse.data || typeof tagsResponse.data !== 'object') {
          logger.warn(`镜像 ${fullImageName} 返回的数据格式不正确`);
          return res.status(500).json({ error: '响应数据格式不正确' });
        }
        
        if (!tagsResponse.data.results || !Array.isArray(tagsResponse.data.results)) {
          logger.warn(`镜像 ${fullImageName} 没有返回有效的标签数据`);
          return res.status(500).json({ error: '没有找到有效的标签数据' });
        }
        
        // 过滤掉无效平台信息
        const cleanedResults = tagsResponse.data.results.map(tag => {
          if (tag.images && Array.isArray(tag.images)) {
            tag.images = tag.images.filter(img => !(img.os === 'unknown' && img.architecture === 'unknown'));
          }
          return tag;
        });
        
        return res.json({
          ...tagsResponse.data,
          results: cleanedResults
        });
      }
    } catch (error) {
      logger.error('获取标签列表失败:', error.message || error);
      res.status(500).json({ 
        error: '获取标签列表失败', 
        details: error.message || '未知错误',
        retryable: true 
      });
    }
  });
  
  // 文档接口
  app.get('/api/documentation', async (req, res) => {
    try {
      const docService = require('./services/documentationService');
      const documents = await docService.getPublishedDocuments();
      res.json(documents);
    } catch (error) {
      logger.error('获取已发布文档失败:', error);
      res.status(500).json({ error: '获取文档失败', details: error.message });
    }
  });
  
  // 监控配置接口
  app.get('/api/monitoring-config', async (req, res) => {
    try {
      logger.info('兼容层处理监控配置请求');
      const fs = require('fs').promises;
      const path = require('path');
      
      // 监控配置文件路径
      const CONFIG_FILE = path.join(__dirname, './config/monitoring.json');
      
      // 确保配置文件存在
      try {
        await fs.access(CONFIG_FILE);
      } catch (err) {
        // 文件不存在，创建默认配置
        const defaultConfig = {
          isEnabled: false,
          notificationType: 'wechat',
          webhookUrl: '',
          telegramToken: '',
          telegramChatId: '',
          monitorInterval: 60
        };
        
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
        await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
        return res.json(defaultConfig);
      }
      
      // 文件存在，读取配置
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      res.json(JSON.parse(data));
    } catch (err) {
      logger.error('获取监控配置失败:', err);
      res.status(500).json({ error: '获取监控配置失败' });
    }
  });
  
  // 保存监控配置接口
  app.post('/api/monitoring-config', async (req, res) => {
    try {
      logger.info('兼容层处理保存监控配置请求');
      const fs = require('fs').promises;
      const path = require('path');
      
      const { 
        notificationType, 
        webhookUrl, 
        telegramToken, 
        telegramChatId, 
        monitorInterval,
        isEnabled
      } = req.body;
      
      // 简单验证
      if (notificationType === 'wechat' && !webhookUrl) {
        return res.status(400).json({ error: '企业微信通知需要设置 webhook URL' });
      }
      
      if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
        return res.status(400).json({ error: 'Telegram 通知需要设置 Token 和 Chat ID' });
      }
      
      // 监控配置文件路径
      const CONFIG_FILE = path.join(__dirname, './config/monitoring.json');
      
      // 确保配置文件存在
      let config = {
        isEnabled: false,
        notificationType: 'wechat',
        webhookUrl: '',
        telegramToken: '',
        telegramChatId: '',
        monitorInterval: 60
      };
      
      try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        config = JSON.parse(data);
      } catch (err) {
        // 如果读取失败，使用默认配置
        logger.warn('读取监控配置失败，将使用默认配置:', err);
      }
      
      // 更新配置
      const updatedConfig = {
        ...config,
        notificationType,
        webhookUrl: webhookUrl || '',
        telegramToken: telegramToken || '',
        telegramChatId: telegramChatId || '',
        monitorInterval: parseInt(monitorInterval, 10) || 60,
        isEnabled: isEnabled !== undefined ? isEnabled : config.isEnabled
      };
      
      await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
      await fs.writeFile(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2), 'utf8');
      
      res.json({ success: true, message: '监控配置已保存' });
      
      // 通知监控服务重新加载配置
      if (global.monitoringService && typeof global.monitoringService.reload === 'function') {
        global.monitoringService.reload();
      }
    } catch (err) {
      logger.error('保存监控配置失败:', err);
      res.status(500).json({ error: '保存监控配置失败' });
    }
  });
  
  // 获取单个文档接口
  app.get('/api/documentation/:id', async (req, res) => {
    try {
      const docService = require('./services/documentationService');
      const document = await docService.getDocument(req.params.id);
      
      // 如果文档不是发布状态，只有已登录用户才能访问
      if (!document.published && !req.session.user) {
        return res.status(403).json({ error: '没有权限访问该文档' });
      }
      
      res.json(document);
    } catch (error) {
      logger.error(`获取文档 ID:${req.params.id} 失败:`, error);
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: '文档不存在' });
      }
      res.status(500).json({ error: '获取文档失败', details: error.message });
    }
  });
  
  // 文档列表接口
  app.get('/api/documentation-list', requireLogin, async (req, res) => {
    try {
      const docService = require('./services/documentationService');
      const documents = await docService.getDocumentationList();
      res.json(documents);
    } catch (error) {
      logger.error('获取文档列表失败:', error);
      res.status(500).json({ error: '获取文档列表失败', details: error.message });
    }
  });
  
  // 切换监控状态接口
  app.post('/api/toggle-monitoring', async (req, res) => {
    try {
      logger.info('兼容层处理切换监控状态请求');
      const fs = require('fs').promises;
      const path = require('path');
      
      const { isEnabled } = req.body;
      
      // 监控配置文件路径
      const CONFIG_FILE = path.join(__dirname, './config/monitoring.json');
      
      // 确保配置文件存在
      let config = {
        isEnabled: false,
        notificationType: 'wechat',
        webhookUrl: '',
        telegramToken: '',
        telegramChatId: '',
        monitorInterval: 60
      };
      
      try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        config = JSON.parse(data);
      } catch (err) {
        // 如果读取失败，使用默认配置
        logger.warn('读取监控配置失败，将使用默认配置:', err);
      }
      
      // 更新启用状态
      config.isEnabled = !!isEnabled;
      
      await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
      
      res.json({ 
        success: true, 
        message: `监控已${isEnabled ? '启用' : '禁用'}`
      });
      
      // 通知监控服务重新加载配置
      if (global.monitoringService && typeof global.monitoringService.reload === 'function') {
        global.monitoringService.reload();
      }
    } catch (err) {
      logger.error('切换监控状态失败:', err);
      res.status(500).json({ error: '切换监控状态失败' });
    }
  });
  
  // 测试通知接口
  app.post('/api/test-notification', async (req, res) => {
    try {
      logger.info('兼容层处理测试通知请求');
      
      const { 
        notificationType, 
        webhookUrl, 
        telegramToken, 
        telegramChatId
      } = req.body;
      
      // 简单验证
      if (notificationType === 'wechat' && !webhookUrl) {
        return res.status(400).json({ error: '企业微信通知需要设置 webhook URL' });
      }
      
      if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
        return res.status(400).json({ error: 'Telegram 通知需要设置 Token 和 Chat ID' });
      }
      
      // 发送测试通知
      const notifier = require('./services/notificationService');
      const testMessage = {
        title: '测试通知',
        content: '这是一条测试通知，如果您收到这条消息，说明您的通知配置工作正常。',
        time: new Date().toLocaleString()
      };
      
      await notifier.sendNotification(testMessage, {
        type: notificationType,
        webhookUrl,
        telegramToken,
        telegramChatId
      });
      
      res.json({ success: true, message: '测试通知已发送' });
    } catch (err) {
      logger.error('发送测试通知失败:', err);
      res.status(500).json({ error: '发送测试通知失败: ' + err.message });
    }
  });
  
  // 获取已停止的容器接口
  app.get('/api/stopped-containers', requireLogin, async (req, res) => {
    try {
      logger.info('兼容层处理获取已停止容器请求');
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      const { stdout } = await execPromise('docker ps -f "status=exited" --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}"');
      
      const containers = stdout.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [id, name, ...statusParts] = line.split('\t');
          return {
            id: id.substring(0, 12),
            name,
            status: statusParts.join(' ')
          };
        });
      
      res.json(containers);
    } catch (err) {
      logger.error('获取已停止容器失败:', err);
      res.status(500).json({ error: '获取已停止容器失败', details: err.message });
    }
  });
  
  // 系统状态接口
  app.get('/api/system-status', requireLogin, async (req, res) => {
    try {
      const systemRouter = require('./routes/system');
      return await systemRouter.getSystemStats(req, res);
    } catch (error) {
      logger.error('获取系统状态失败:', error);
      res.status(500).json({ error: '获取系统状态失败', details: error.message });
    }
  });
  
  // Docker容器状态接口
  app.get('/api/docker-status', async (req, res) => {
    try {
      const dockerService = require('./services/dockerService');
      const containerStatus = await dockerService.getContainersStatus();
      res.json(containerStatus);
    } catch (error) {
      logger.error('获取Docker状态失败:', error);
      res.status(500).json({ error: '获取Docker状态失败', details: error.message });
    }
  });
  
  // 单个容器状态接口
  app.get('/api/docker/status/:id', requireLogin, async (req, res) => {
    try {
      const dockerService = require('./services/dockerService');
      const containerInfo = await dockerService.getContainerStatus(req.params.id);
      res.json(containerInfo);
    } catch (error) {
      logger.error('获取容器状态失败:', error);
      res.status(500).json({ error: '获取容器状态失败', details: error.message });
    }
  });
  
  // 添加Docker容器操作API兼容层 - 解决404问题
  // 容器日志获取接口
  app.get('/api/docker/containers/:id/logs', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理获取容器日志请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      const logs = await dockerService.getContainerLogs(req.params.id);
      res.send(logs);
    } catch (error) {
      logger.error(`获取容器日志失败:`, error);
      res.status(500).json({ error: '获取容器日志失败', details: error.message });
    }
  });
  
  // 容器详情接口
  app.get('/api/docker/containers/:id', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理获取容器详情请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      const containerInfo = await dockerService.getContainerStatus(req.params.id);
      res.json(containerInfo);
    } catch (error) {
      logger.error(`获取容器详情失败:`, error);
      res.status(500).json({ error: '获取容器详情失败', details: error.message });
    }
  });
  
  // 启动容器接口
  app.post('/api/docker/containers/:id/start', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理启动容器请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      await dockerService.startContainer(req.params.id);
      res.json({ success: true, message: '容器启动成功' });
    } catch (error) {
      logger.error(`启动容器失败:`, error);
      res.status(500).json({ error: '启动容器失败', details: error.message });
    }
  });
  
  // 停止容器接口
  app.post('/api/docker/containers/:id/stop', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理停止容器请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      await dockerService.stopContainer(req.params.id);
      res.json({ success: true, message: '容器停止成功' });
    } catch (error) {
      logger.error(`停止容器失败:`, error);
      res.status(500).json({ error: '停止容器失败', details: error.message });
    }
  });
  
  // 重启容器接口
  app.post('/api/docker/containers/:id/restart', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理重启容器请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      await dockerService.restartContainer(req.params.id);
      res.json({ success: true, message: '容器重启成功' });
    } catch (error) {
      logger.error(`重启容器失败:`, error);
      res.status(500).json({ error: '重启容器失败', details: error.message });
    }
  });
  
  // 更新容器接口
  app.post('/api/docker/containers/:id/update', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理更新容器请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      const { tag } = req.body;
      await dockerService.updateContainer(req.params.id, tag);
      res.json({ success: true, message: '容器更新成功' });
    } catch (error) {
      logger.error(`更新容器失败:`, error);
      res.status(500).json({ error: '更新容器失败', details: error.message });
    }
  });
  
  // 删除容器接口
  app.post('/api/docker/containers/:id/remove', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理删除容器请求: ${req.params.id}`);
      const dockerService = require('./services/dockerService');
      await dockerService.deleteContainer(req.params.id);
      res.json({ success: true, message: '容器删除成功' });
    } catch (error) {
      logger.error(`删除容器失败:`, error);
      res.status(500).json({ error: '删除容器失败', details: error.message });
    }
  });
  
  // 登录接口 (兼容层备份)
  app.post('/api/login', async (req, res) => {
    try {
      const { username, password, captcha } = req.body;
      
      if (req.session.captcha !== parseInt(captcha)) {
        logger.warn(`Captcha verification failed for user: ${username}`);
        return res.status(401).json({ error: '验证码错误' });
      }

      const userService = require('./services/userService');
      const users = await userService.getUsers();
      const user = users.users.find(u => u.username === username);
      
      if (!user) {
        logger.warn(`User ${username} not found`);
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const bcrypt = require('bcrypt');
      if (bcrypt.compareSync(password, user.password)) {
        req.session.user = { username: user.username };
        
        // 更新用户登录信息
        await userService.updateUserLoginInfo(username);
        
        logger.info(`User ${username} logged in successfully`);
        res.json({ success: true });
      } else {
        logger.warn(`Login failed for user: ${username}`);
        res.status(401).json({ error: '用户名或密码错误' });
      }
    } catch (error) {
      logger.error('登录失败:', error);
      res.status(500).json({ error: '登录处理失败', details: error.message });
    }
  });
  
  // 修复搜索函数问题 - 完善错误处理
  app.get('/api/search', async (req, res) => {
    try {
      const dockerHubService = require('./services/dockerHubService');
      const term = req.query.term;
      
      if (!term) {
        return res.status(400).json({ error: '搜索词不能为空' });
      }
      
      // 直接处理搜索，不依赖缓存
      try {
        const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page=${req.query.page || 1}&page_size=25`;
        const axios = require('axios');
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'DockerHubSearchClient/1.0',
            'Accept': 'application/json'
          }
        });
        
        res.json(response.data);
      } catch (searchError) {
        logger.error('Docker Hub搜索请求失败:', searchError.message);
        res.status(500).json({ 
          error: '搜索Docker Hub失败', 
          details: searchError.message,
          retryable: true 
        });
      }
    } catch (error) {
      logger.error('搜索Docker Hub失败:', error);
      res.status(500).json({ error: '搜索失败', details: error.message });
    }
  });
  
  // 获取磁盘空间信息的API
  app.get('/api/disk-space', requireLogin, async (req, res) => {
    try {
      // 使用server-utils中的execCommand函数执行df命令
      const diskInfo = await execCommand('df -h | grep -E "/$|/home" | head -1');
      const diskParts = diskInfo.split(/\s+/);
      
      if (diskParts.length >= 5) {
        res.json({
          diskSpace: `${diskParts[2]}/${diskParts[1]}`, // 已用/总量
          usagePercent: parseInt(diskParts[4].replace('%', '')) // 使用百分比
        });
      } else {
        throw new Error('磁盘信息格式不正确');
      }
    } catch (error) {
      logger.error('获取磁盘空间信息失败:', error);
      res.status(500).json({ 
        error: '获取磁盘空间信息失败', 
        details: error.message,
        diskSpace: '未知',
        usagePercent: 0 
      });
    }
  });
  
  // 兼容config API
  app.get('/api/config', async (req, res) => {
    try {
      logger.info('兼容层处理配置请求');
      const fs = require('fs').promises;
      const path = require('path');
      
      // 配置文件路径
      const configFilePath = path.join(__dirname, './data/config.json');
      
      // 默认配置
      const DEFAULT_CONFIG = {
        proxyDomain: 'registry-1.docker.io',
        logo: '',
        theme: 'light',
        menuItems: [
          {
            text: "首页",
            link: "/",
            newTab: false
          },
          {
            text: "文档",
            link: "/docs",
            newTab: false
          }
        ]
      };
      
      // 确保配置存在
      let config = DEFAULT_CONFIG;
      
      try {
        await fs.access(configFilePath);
        const data = await fs.readFile(configFilePath, 'utf8');
        config = JSON.parse(data);
      } catch (err) {
        // 如果文件不存在或解析失败，使用默认配置
        logger.warn('读取配置文件失败，将使用默认配置:', err);
        // 尝试创建配置文件
        try {
          await fs.mkdir(path.dirname(configFilePath), { recursive: true });
          await fs.writeFile(configFilePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
        } catch (writeErr) {
          logger.error('创建默认配置文件失败:', writeErr);
        }
      }
      
      res.json(config);
    } catch (err) {
      logger.error('获取配置失败:', err);
      res.status(500).json({ error: '获取配置失败' });
    }
  });
  
  // 保存配置API
  app.post('/api/config', async (req, res) => {
    try {
      logger.info('兼容层处理保存配置请求');
      const fs = require('fs').promises;
      const path = require('path');
      
      const newConfig = req.body;
      
      // 验证请求数据
      if (!newConfig || typeof newConfig !== 'object') {
        return res.status(400).json({
          error: '无效的配置数据',
          details: '配置必须是一个对象'
        });
      }
      
      const configFilePath = path.join(__dirname, './data/config.json');
      
      // 读取现有配置
      let existingConfig = {};
      try {
        const data = await fs.readFile(configFilePath, 'utf8');
        existingConfig = JSON.parse(data);
      } catch (err) {
        // 文件不存在或解析失败时创建目录
        await fs.mkdir(path.dirname(configFilePath), { recursive: true });
      }
      
      // 合并配置
      const mergedConfig = { ...existingConfig, ...newConfig };
      
      // 保存到文件
      await fs.writeFile(configFilePath, JSON.stringify(mergedConfig, null, 2));
      
      res.json({ success: true, message: '配置已保存' });
    } catch (err) {
      logger.error('保存配置失败:', err);
      res.status(500).json({ 
        error: '保存配置失败',
        details: err.message 
      });
    }
  });
  
  // 文档管理API - 获取文档列表
  app.get('/api/documents', requireLogin, async (req, res) => {
    try {
      logger.info('兼容层处理获取文档列表请求');
      const docService = require('./services/documentationService');
      const documents = await docService.getDocumentationList();
      res.json(documents);
    } catch (err) {
      logger.error('获取文档列表失败:', err);
      res.status(500).json({ error: '获取文档列表失败', details: err.message });
    }
  });
  
  // 文档管理API - 获取单个文档
  app.get('/api/documents/:id', async (req, res) => {
    try {
      logger.info(`兼容层处理获取文档请求: ${req.params.id}`);
      const docService = require('./services/documentationService');
      const document = await docService.getDocument(req.params.id);
      
      // 如果文档不是发布状态，只有已登录用户才能访问
      if (!document.published && !req.session.user) {
        return res.status(403).json({ error: '没有权限访问该文档' });
      }
      
      res.json(document);
    } catch (err) {
      logger.error(`获取文档 ID:${req.params.id} 失败:`, err);
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: '文档不存在' });
      }
      res.status(500).json({ error: '获取文档失败', details: err.message });
    }
  });
  
  // 文档管理API - 保存或更新文档
  app.put('/api/documents/:id', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理更新文档请求: ${req.params.id}`);
      const { title, content, published } = req.body;
      const docService = require('./services/documentationService');
      
      // 检查必需参数
      if (!title) {
        return res.status(400).json({ error: '文档标题不能为空' });
      }
      
      const docId = req.params.id;
      await docService.saveDocument(docId, title, content || '', published);
      
      res.json({ success: true, id: docId, message: '文档已保存' });
    } catch (err) {
      logger.error(`更新文档 ID:${req.params.id} 失败:`, err);
      res.status(500).json({ error: '保存文档失败', details: err.message });
    }
  });
  
  // 文档管理API - 创建新文档
  app.post('/api/documents', requireLogin, async (req, res) => {
    try {
      logger.info('兼容层处理创建文档请求');
      const { title, content, published } = req.body;
      const docService = require('./services/documentationService');
      
      // 检查必需参数
      if (!title) {
        return res.status(400).json({ error: '文档标题不能为空' });
      }
      
      // 创建新文档ID (使用时间戳)
      const docId = Date.now().toString();
      await docService.saveDocument(docId, title, content || '', published);
      
      res.status(201).json({ success: true, id: docId, message: '文档已创建' });
    } catch (err) {
      logger.error('创建文档失败:', err);
      res.status(500).json({ error: '创建文档失败', details: err.message });
    }
  });
  
  // 文档管理API - 删除文档
  app.delete('/api/documents/:id', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理删除文档请求: ${req.params.id}`);
      const docService = require('./services/documentationService');
      
      await docService.deleteDocument(req.params.id);
      res.json({ success: true, message: '文档已删除' });
    } catch (err) {
      logger.error(`删除文档 ID:${req.params.id} 失败:`, err);
      res.status(500).json({ error: '删除文档失败', details: err.message });
    }
  });
  
  // 文档管理API - 切换文档发布状态
  app.put('/api/documentation/toggle-publish/:id', requireLogin, async (req, res) => {
    try {
      logger.info(`兼容层处理切换文档发布状态请求: ${req.params.id}`);
      const docService = require('./services/documentationService');
      
      const result = await docService.toggleDocumentPublish(req.params.id);
      res.json({ 
        success: true, 
        published: result.published,
        message: `文档已${result.published ? '发布' : '取消发布'}`
      });
    } catch (err) {
      logger.error(`切换文档 ID:${req.params.id} 发布状态失败:`, err);
      res.status(500).json({ error: '切换文档发布状态失败', details: err.message });
    }
  });
  
  // 网络测试接口
  app.post('/api/network-test', requireLogin, async (req, res) => {
    const { type, domain } = req.body;
    
    // 验证输入
    if (!domain || !domain.match(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
      return res.status(400).json({ error: '无效的域名格式' });
    }
    
    if (!type || !['ping', 'traceroute'].includes(type)) {
      return res.status(400).json({ error: '无效的测试类型' });
    }
    
    try {
      const command = type === 'ping' 
        ? `ping -c 4 ${domain}` 
        : `traceroute -m 10 ${domain}`;
        
      logger.info(`执行网络测试: ${command}`);
      const result = await execCommand(command, { timeout: 30000 });
      res.send(result);
    } catch (error) {
      logger.error(`执行网络测试命令错误:`, error);
      
      if (error.killed) {
        return res.status(408).send('测试超时');
      }
      
      res.status(500).send('测试执行失败: ' + (error.message || '未知错误'));
    }
  });
  
  // 用户信息接口
  app.get('/api/user-info', requireLogin, async (req, res) => {
    try {
      const userService = require('./services/userService');
      const userStats = await userService.getUserStats(req.session.user.username);
      
      res.json(userStats);
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      res.status(500).json({ error: '获取用户信息失败', details: error.message });
    }
  });
  
  // 修改密码接口
  app.post('/api/change-password', requireLogin, async (req, res) => {
      const { currentPassword, newPassword } = req.body;
      const username = req.session.user.username;
      
      if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: '当前密码和新密码不能为空' });
      }
      
      try {
          const userService = require('./services/userService');
          await userService.changePassword(username, currentPassword, newPassword);
          res.json({ success: true, message: '密码修改成功' });
      } catch (error) {
          logger.error(`用户 ${username} 修改密码失败:`, error);
          res.status(400).json({ error: error.message || '修改密码失败' }); // 返回具体的错误信息
      }
  });
  
  // 系统资源兼容路由
  app.get('/api/system-resources', requireLogin, async (req, res) => {
    try {
      const startTime = Date.now();
      logger.info('兼容层: 请求 /api/system-resources');
      
      // 获取CPU信息
      const cpuCores = os.cpus().length;
      const cpuModel = os.cpus()[0].model;
      const cpuSpeed = os.cpus()[0].speed;
      const loadAvg = os.loadavg();
      
      // 获取内存信息
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = ((usedMem / totalMem) * 100).toFixed(1) + '%';
      
      // 获取磁盘信息
      let diskCommand = '';
      if (process.platform === 'win32') {
        diskCommand = 'wmic logicaldisk get size,freespace,caption';
      } else {
        // 在 macOS 和 Linux 上使用 df 命令
        diskCommand = 'df -h /';
      }
      
      try {
        // 执行磁盘命令
        logger.debug(`执行磁盘命令: ${diskCommand}`);
        const { stdout } = await execPromise(diskCommand, { timeout: 5000 });
        logger.debug(`磁盘命令输出: ${stdout}`);
        
        // 解析磁盘信息
        let disk = { size: "未知", used: "未知", available: "未知", percent: "未知" };
        
        if (process.platform === 'win32') {
          // Windows解析逻辑不变
          // ... (省略Windows解析代码)
        } else {
          // macOS/Linux格式解析
          const lines = stdout.trim().split('\n');
          if (lines.length >= 2) {
            const headerParts = lines[0].trim().split(/\s+/);
            const dataParts = lines[1].trim().split(/\s+/);
            
            logger.debug(`解析磁盘信息, 头部: ${headerParts}, 数据: ${dataParts}`);
            
            // 检查MacOS格式 (通常是Filesystem Size Used Avail Capacity iused ifree %iused Mounted on)
            const isMacOS = headerParts.includes('Capacity') && headerParts.includes('iused');
            
            if (isMacOS) {
              // macOS格式处理
              const fsIndex = 0; // Filesystem
              const sizeIndex = 1; // Size
              const usedIndex = 2; // Used
              const availIndex = 3; // Avail
              const percentIndex = 4; // Capacity
              const mountedIndex = headerParts.indexOf('Mounted') + 1; // Mounted on
              
              disk = {
                filesystem: dataParts[fsIndex],
                size: dataParts[sizeIndex],
                used: dataParts[usedIndex],
                available: dataParts[availIndex],
                percent: dataParts[percentIndex],
                mountedOn: dataParts[mountedIndex] || '/'
              };
            } else {
              // 标准Linux格式处理 (通常是Filesystem Size Used Avail Use% Mounted on)
              const fsIndex = 0; // Filesystem
              const sizeIndex = 1; // Size
              const usedIndex = 2; // Used
              const availIndex = 3; // Avail
              const percentIndex = 4; // Use%
              const mountedIndex = 5; // Mounted on
              
              disk = {
                filesystem: dataParts[fsIndex],
                size: dataParts[sizeIndex],
                used: dataParts[usedIndex],
                available: dataParts[availIndex],
                percent: dataParts[percentIndex],
                mountedOn: dataParts[mountedIndex] || '/'
              };
            }
          }
        }
        
        // 构建最终结果
        const result = {
          cpu: {
            cores: cpuCores,
            model: cpuModel,
            speed: cpuSpeed,
            loadAvg: loadAvg
          },
          memory: {
            total: totalMem,
            free: freeMem,
            used: usedMem,
            percent: memoryPercent
          },
          disk: disk,
          uptime: os.uptime()
        };
        
        logger.debug(`系统资源API返回结果: ${JSON.stringify(result)}`);
        
        // 计算处理时间并返回结果
        const endTime = Date.now();
        logger.info(`兼容层: /api/system-resources 请求完成，耗时 ${endTime - startTime}ms`);
        res.json(result);
      } catch (diskError) {
        // 磁盘信息获取失败时，仍然返回CPU和内存信息
        logger.error(`获取磁盘信息失败: ${diskError.message}`);
        
        const result = {
          cpu: {
            cores: cpuCores,
            model: cpuModel,
            speed: cpuSpeed,
            loadAvg: loadAvg
          },
          memory: {
            total: totalMem,
            free: freeMem,
            used: usedMem,
            percent: memoryPercent
          },
          disk: { size: "未知", used: "未知", available: "未知", percent: "未知" },
          uptime: os.uptime(),
          diskError: diskError.message
        };
        
        // 计算处理时间并返回结果（即使有错误）
        const endTime = Date.now();
        logger.info(`兼容层: /api/system-resources 请求完成（但磁盘信息失败），耗时 ${endTime - startTime}ms`);
        res.json(result);
      }
    } catch (error) {
      logger.error(`系统资源API错误: ${error.message}`);
      res.status(500).json({ error: '获取系统资源信息失败', message: error.message });
    }
  });
  
  // 登出接口
  app.post('/api/logout', (req, res) => {
    if (req.session) {
      req.session.destroy(err => {
        if (err) {
          logger.error('销毁会话失败:', err);
          return res.status(500).json({ error: '退出登录失败' });
        }
        // 清除客户端的 connect.sid cookie
        res.clearCookie('connect.sid', { path: '/' }); // 确保路径与设置时一致
        logger.info('用户已成功登出');
        res.json({ success: true, message: '已成功登出' });
      });
    } else {
      // 如果没有会话，也认为登出成功
      logger.info('用户已登出（无会话）');
      res.json({ success: true, message: '已成功登出' });
    }
  });
  
  logger.success('API兼容层加载完成');
};

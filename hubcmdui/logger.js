const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const util = require('util');
const os = require('os');

// 日志级别定义
const LOG_LEVELS = {
  TRACE: { priority: 0, color: 'grey', prefix: 'TRACE' },
  DEBUG: { priority: 1, color: 'blue', prefix: 'DEBUG' },
  INFO: { priority: 2, color: 'green', prefix: 'INFO' },
  SUCCESS: { priority: 3, color: 'greenBright', prefix: 'SUCCESS' },
  WARN: { priority: 4, color: 'yellow', prefix: 'WARN' },
  ERROR: { priority: 5, color: 'red', prefix: 'ERROR' },
  FATAL: { priority: 6, color: 'redBright', prefix: 'FATAL' }
};

// 彩色日志实现
const colors = {
  grey: text => `\x1b[90m${text}\x1b[0m`,
  blue: text => `\x1b[34m${text}\x1b[0m`,
  green: text => `\x1b[32m${text}\x1b[0m`,
  greenBright: text => `\x1b[92m${text}\x1b[0m`,
  yellow: text => `\x1b[33m${text}\x1b[0m`,
  red: text => `\x1b[31m${text}\x1b[0m`,
  redBright: text => `\x1b[91m${text}\x1b[0m`
};

// 日志配置
const LOG_CONFIG = {
  // 默认日志级别
  level: process.env.LOG_LEVEL || 'INFO',
  // 日志文件配置
  file: {
    enabled: true,
    dir: path.join(__dirname, 'logs'),
    nameFormat: 'app-%DATE%.log',
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 14, // 保留14天的日志
  },
  // 控制台输出配置
  console: {
    enabled: true,
    colorize: true,
    // 简化输出在控制台
    simplified: process.env.NODE_ENV === 'production' || process.env.SIMPLE_LOGS === 'true'
  },
  // 是否打印请求体、查询参数等详细信息（默认关闭）
  includeDetails: process.env.NODE_ENV === 'development' || process.env.DETAILED_LOGS === 'true',
  // 是否显示堆栈跟踪（默认关闭）
  includeStack: process.env.NODE_ENV === 'development' || process.env.SHOW_STACK === 'true'
};

// 根据环境变量初始化配置
function initConfig() {
  // 检查环境变量并更新配置
  if (process.env.LOG_FILE_ENABLED === 'false') {
    LOG_CONFIG.file.enabled = false;
  }
  
  if (process.env.LOG_CONSOLE_ENABLED === 'false') {
    LOG_CONFIG.console.enabled = false;
  }
  
  if (process.env.LOG_MAX_SIZE) {
    LOG_CONFIG.file.maxSize = parseInt(process.env.LOG_MAX_SIZE) * 1024 * 1024;
  }
  
  if (process.env.LOG_MAX_FILES) {
    LOG_CONFIG.file.maxFiles = parseInt(process.env.LOG_MAX_FILES);
  }
  
  if (process.env.DETAILED_LOGS === 'true') {
    LOG_CONFIG.includeDetails = true;
  } else if (process.env.DETAILED_LOGS === 'false') {
    LOG_CONFIG.includeDetails = false;
  }
  
  if (process.env.SIMPLE_LOGS === 'true') {
    LOG_CONFIG.console.simplified = true;
  } else if (process.env.SIMPLE_LOGS === 'false') {
    LOG_CONFIG.console.simplified = false;
  }
  
  // 验证日志级别是否有效
  if (!LOG_LEVELS[LOG_CONFIG.level]) {
    console.warn(`无效的日志级别: ${LOG_CONFIG.level}，将使用默认级别: INFO`);
    LOG_CONFIG.level = 'INFO';
  }
}

// 初始化配置
initConfig();

// 确保日志目录存在
async function ensureLogDir() {
  if (!LOG_CONFIG.file.enabled) return;
  
  try {
    await fsPromises.access(LOG_CONFIG.file.dir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fsPromises.mkdir(LOG_CONFIG.file.dir, { recursive: true });
    } else {
      console.error('无法创建日志目录:', error);
    }
  }
}

// 生成当前日志文件名
function getCurrentLogFile() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(LOG_CONFIG.file.dir, LOG_CONFIG.file.nameFormat.replace(/%DATE%/g, today));
}

// 检查是否需要轮转日志
async function checkRotation() {
  if (!LOG_CONFIG.file.enabled) return false;
  
  const currentLogFile = getCurrentLogFile();
  try {
    const stats = await fsPromises.stat(currentLogFile);
    if (stats.size >= LOG_CONFIG.file.maxSize) {
      return true;
    }
  } catch (err) {
    // 文件不存在，不需要轮转
    if (err.code !== 'ENOENT') {
      console.error('检查日志文件大小失败:', err);
    }
  }
  return false;
}

// 轮转日志文件
async function rotateLogFile() {
  if (!LOG_CONFIG.file.enabled) return;
  
  const currentLogFile = getCurrentLogFile();
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = `${currentLogFile}.${timestamp}`;
    
    try {
      // 检查文件是否存在
      await fsPromises.access(currentLogFile);
      // 重命名文件
      await fsPromises.rename(currentLogFile, rotatedFile);
      
      // 清理旧日志文件
      await cleanupOldLogFiles();
    } catch (err) {
      // 如果文件不存在，则忽略
      if (err.code !== 'ENOENT') {
        console.error('轮转日志文件失败:', err);
      }
    }
  } catch (err) {
    console.error('轮转日志文件失败:', err);
  }
}

// 清理旧日志文件
async function cleanupOldLogFiles() {
  if (!LOG_CONFIG.file.enabled || LOG_CONFIG.file.maxFiles <= 0) return;
  
  try {
    const files = await fsPromises.readdir(LOG_CONFIG.file.dir);
    const logFilePattern = LOG_CONFIG.file.nameFormat.replace(/%DATE%/g, '\\d{4}-\\d{2}-\\d{2}');
    const logFileRegex = new RegExp(`^${logFilePattern}(\\.[\\d-T]+)?$`);
    
    const logFiles = files
      .filter(file => logFileRegex.test(file))
      .map(file => ({
        name: file,
        path: path.join(LOG_CONFIG.file.dir, file),
        time: fs.statSync(path.join(LOG_CONFIG.file.dir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // 按修改时间降序排序
    
    // 保留最新的maxFiles个文件，删除其余的
    const filesToDelete = logFiles.slice(LOG_CONFIG.file.maxFiles);
    for (const file of filesToDelete) {
      try {
        await fsPromises.unlink(file.path);
      } catch (err) {
        console.error(`删除旧日志文件 ${file.path} 失败:`, err);
      }
    }
  } catch (err) {
    console.error('清理旧日志文件失败:', err);
  }
}

// 写入日志文件
async function writeToLogFile(message) {
  if (!LOG_CONFIG.file.enabled) return;
  
  try {
    await ensureLogDir();
    
    // 检查是否需要轮转日志
    if (await checkRotation()) {
      await rotateLogFile();
    }
    
    const currentLogFile = getCurrentLogFile();
    const logEntry = `${message}\n`;
    await fsPromises.appendFile(currentLogFile, logEntry);
  } catch (error) {
    console.error('写入日志文件失败:', error);
  }
}

// 格式化日志消息
function formatLogMessage(level, message, details) {
  const timestamp = new Date().toISOString();
  const prefix = `[${level.prefix}]`;
  
  // 简化标准日志格式：时间戳 [日志级别] 消息
  const standardMessage = `${timestamp} ${prefix} ${message}`;
  
  let detailsStr = '';
  
  if (details) {
    if (details instanceof Error) {
      detailsStr = ` ${details.message}`;
      if (LOG_CONFIG.includeStack && details.stack) {
        detailsStr += `\n${details.stack}`;
      }
    } else if (typeof details === 'object') {
      try {
        // 只输出关键字段
        const filteredDetails = { ...details };
        // 移除大型或不重要的字段
        ['stack', 'userAgent', 'referer'].forEach(key => {
          if (key in filteredDetails) delete filteredDetails[key];
        });
        
        // 使用紧凑格式输出JSON
        detailsStr = Object.keys(filteredDetails).length > 0 
          ? ` ${JSON.stringify(filteredDetails)}` 
          : '';
      } catch (e) {
        detailsStr = ` ${util.inspect(details, { depth: 1, colors: false, compact: true })}`;
      }
    } else {
      detailsStr = ` ${details}`;
    }
  }
  
  return {
    console: LOG_CONFIG.console.colorize 
      ? `${timestamp} ${colors[level.color](prefix)} ${message}${detailsStr}`
      : `${timestamp} ${prefix} ${message}${detailsStr}`,
    file: `${standardMessage}${detailsStr}`
  };
}

// 检查当前日志级别是否应该记录指定级别的日志
function shouldLog(levelName) {
  const configLevel = LOG_LEVELS[LOG_CONFIG.level];
  const messageLevel = LOG_LEVELS[levelName];
  
  if (!configLevel || !messageLevel) {
    return true; // 默认允许记录
  }
  
  return messageLevel.priority >= configLevel.priority;
}

// 记录日志的通用函数
function log(level, message, details) {
  if (!LOG_LEVELS[level]) {
    level = 'INFO';
  }
  
  // 检查是否应该记录该级别的日志
  if (!shouldLog(level)) {
    return;
  }
  
  const formattedMessage = formatLogMessage(LOG_LEVELS[level], message, details);
  
  // 控制台输出
  if (LOG_CONFIG.console.enabled) {
    console.log(formattedMessage.console);
  }
  
  // 写入文件
  if (LOG_CONFIG.file.enabled) {
    writeToLogFile(formattedMessage.file);
  }
}

// 请求日志函数
function request(req, res, duration) {
  const method = req.method;
  const url = req.originalUrl || req.url;
  const status = res.statusCode;
  const ip = req.ip ? req.ip.replace(/::ffff:/, '') : 'unknown';
  
  // 根据状态码确定日志级别
  let level = 'INFO';
  if (status >= 400 && status < 500) level = 'WARN';
  if (status >= 500) level = 'ERROR';
  
  // 简化日志消息格式
  const logMessage = `${method} ${url} ${status} ${duration}ms`;
  
  // 只有在需要时才收集详细信息
  let details = null;
  
  // 如果请求标记为跳过详细日志或不是开发环境，则不记录详细信息
  if (!req.skipDetailedLogging && LOG_CONFIG.includeDetails) {
    // 记录最少的必要信息
    details = {};
    
    // 只在错误状态码时记录更多信息
    if (status >= 400) {
      // 安全地记录请求参数，过滤敏感信息
      const sanitizedBody = req.sanitizedBody || req.body;
      if (sanitizedBody && Object.keys(sanitizedBody).length > 0) {
        // 屏蔽敏感字段
        const filtered = { ...sanitizedBody };
        ['password', 'token', 'apiKey', 'secret', 'credentials'].forEach(key => {
          if (key in filtered) filtered[key] = '******';
        });
        details.body = filtered;
      }
      
      if (req.params && Object.keys(req.params).length > 0) {
        details.params = req.params;
      }
      
      if (req.query && Object.keys(req.query).length > 0) {
        details.query = req.query;
      }
    }
    
    // 如果details为空对象，则设为null
    if (Object.keys(details).length === 0) {
      details = null;
    }
  }
  
  log(level, logMessage, details);
}

// 设置日志级别
function setLogLevel(level) {
  if (LOG_LEVELS[level]) {
    LOG_CONFIG.level = level;
    log('INFO', `日志级别已设置为 ${level}`);
    return true;
  }
  log('WARN', `尝试设置无效的日志级别: ${level}`);
  return false;
}

// 公开各类日志记录函数
module.exports = {
  trace: (message, details) => log('TRACE', message, details),
  debug: (message, details) => log('DEBUG', message, details),
  info: (message, details) => log('INFO', message, details),
  success: (message, details) => log('SUCCESS', message, details),
  warn: (message, details) => log('WARN', message, details),
  error: (message, details) => log('ERROR', message, details),
  fatal: (message, details) => log('FATAL', message, details),
  request,
  setLogLevel,
  LOG_LEVELS: Object.keys(LOG_LEVELS),
  config: LOG_CONFIG
};
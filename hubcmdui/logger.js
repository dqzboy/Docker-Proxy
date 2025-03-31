const fs = require('fs').promises;
const path = require('path');
const util = require('util');

// 日志级别配置
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    success: 2,
    warn: 3,
    error: 4,
    fatal: 5
};

// 默认配置
const config = {
    level: process.env.LOG_LEVEL || 'info',
    logToFile: process.env.LOG_TO_FILE === 'true',
    logDirectory: path.join(__dirname, 'logs'),
    logFileName: 'app.log',
    maxLogSize: 10 * 1024 * 1024, // 10MB
    colorize: process.env.NODE_ENV !== 'production'
};

// 确保日志目录存在
async function ensureLogDirectory() {
    if (config.logToFile) {
        try {
            await fs.access(config.logDirectory);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(config.logDirectory, { recursive: true });
                console.log(`Created log directory: ${config.logDirectory}`);
            } else {
                throw error;
            }
        }
    }
}

// 格式化时间 - 改进为更易读的格式
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// 颜色代码
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    
    // 前景色
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    // 背景色
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m'
};

// 日志级别对应的颜色和标签
const LEVEL_STYLES = {
    debug: { color: COLORS.cyan, label: 'DEBUG' },
    info: { color: COLORS.blue, label: 'INFO ' },
    success: { color: COLORS.green, label: 'DONE ' },
    warn: { color: COLORS.yellow, label: 'WARN ' },
    error: { color: COLORS.red, label: 'ERROR' },
    fatal: { color: COLORS.bright + COLORS.red, label: 'FATAL' }
};

// 创建日志条目 - 改进格式
function createLogEntry(level, message, meta = {}) {
    const timestamp = getTimestamp();
    const levelInfo = LEVEL_STYLES[level] || { label: level.toUpperCase() };
    
    // 元数据格式化 - 更简洁的呈现方式
    let metaOutput = '';
    if (meta instanceof Error) {
        metaOutput = `\n  ${COLORS.red}Error: ${meta.message}${COLORS.reset}`;
        if (meta.stack) {
            metaOutput += `\n  ${COLORS.dim}Stack: ${meta.stack.split('\n').join('\n  ')}${COLORS.reset}`;
        }
    } else if (Object.keys(meta).length > 0) {
        // 检查是否为HTTP请求信息，如果是则使用更简洁的格式
        if (meta.ip && meta.userAgent) {
            metaOutput = ` ${COLORS.dim}from ${meta.ip}${COLORS.reset}`;
        } else {
            // 对于其他元数据，仍然使用检查器但格式更友好
            metaOutput = `\n  ${util.inspect(meta, { colors: true, depth: 3 })}`;
        }
    }
    
    // 为控制台格式化日志
    const consoleOutput = config.colorize ? 
        `${COLORS.dim}${timestamp}${COLORS.reset} [${levelInfo.color}${levelInfo.label}${COLORS.reset}] ${message}${metaOutput}` :
        `${timestamp} [${levelInfo.label}] ${message}${metaOutput ? ' ' + metaOutput.trim() : ''}`;
    
    // 为文件准备JSON格式日志
    const logObject = {
        timestamp,
        level: level,
        message
    };
    
    if (Object.keys(meta).length > 0) {
        logObject.meta = meta instanceof Error ? 
            { name: meta.name, message: meta.message, stack: meta.stack } : 
            meta;
    }
    
    return {
        formatted: consoleOutput,
        json: JSON.stringify(logObject)
    };
}

// 日志函数
async function log(level, message, meta = {}) {
    if (LOG_LEVELS[level] < LOG_LEVELS[config.level]) {
        return;
    }

    const { formatted, json } = createLogEntry(level, message, meta);

    // 控制台输出
    console.log(formatted);

    // 文件日志
    if (config.logToFile) {
        try {
            await ensureLogDirectory();
            const logFilePath = path.join(config.logDirectory, config.logFileName);
            await fs.appendFile(logFilePath, json + '\n', 'utf8');
        } catch (err) {
            console.error(`${COLORS.red}Error writing to log file: ${err.message}${COLORS.reset}`);
        }
    }
}

// 日志API
const logger = {
    debug: (message, meta = {}) => log('debug', message, meta),
    info: (message, meta = {}) => log('info', message, meta),
    success: (message, meta = {}) => log('success', message, meta),
    warn: (message, meta = {}) => log('warn', message, meta),
    error: (message, meta = {}) => log('error', message, meta),
    fatal: (message, meta = {}) => log('fatal', message, meta),
    
    // 配置方法
    configure: (options) => {
        Object.assign(config, options);
    },
    
    // HTTP请求日志方法 - 简化输出格式
    request: (req, res, duration) => {
        const status = res.statusCode;
        const method = req.method;
        const url = req.originalUrl || req.url;
        const userAgent = req.headers['user-agent'] || '-';
        const ip = req.ip || req.connection.remoteAddress || '-';
        
        let level = 'info';
        if (status >= 500) level = 'error';
        else if (status >= 400) level = 'warn';
        
        // 为HTTP请求创建更简洁的日志消息
        let statusIndicator = '';
        if (config.colorize) {
            if (status >= 500) statusIndicator = COLORS.red;
            else if (status >= 400) statusIndicator = COLORS.yellow;
            else if (status >= 300) statusIndicator = COLORS.cyan;
            else if (status >= 200) statusIndicator = COLORS.green;
            statusIndicator += status + COLORS.reset;
        } else {
            statusIndicator = status;
        }
        
        // 简化的请求日志格式
        const message = `${method} ${url} ${statusIndicator} ${duration}ms`;
        
        // 传递ip和userAgent作为元数据，但以简洁方式显示
        log(level, message, { ip, userAgent });
    }
};

// 初始化
ensureLogDirectory().catch(err => {
    console.error(`${COLORS.red}Failed to initialize logger: ${err.message}${COLORS.reset}`);
});

module.exports = logger;
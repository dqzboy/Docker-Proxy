/**
 * 客户端错误处理中间件
 */
const logger = require('../logger');

// 处理客户端上报的错误
function handleClientError(req, res, next) {
  if (req.url === '/api/client-error' && req.method === 'POST') {
    const { message, source, lineno, colno, error, stack, userAgent, page } = req.body;
    
    logger.error('客户端错误:', {
      message,
      source,
      location: `${lineno}:${colno}`,
      stack: stack || (error && error.stack),
      userAgent,
      page
    });
    
    res.json({ success: true });
  } else {
    next();
  }
}

module.exports = handleClientError;

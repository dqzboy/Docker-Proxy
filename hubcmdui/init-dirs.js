/**
 * 目录初始化模块 - 确保应用需要的所有目录都存在
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * 确保所有必需的目录存在
 */
// 添加缓存机制
const checkedDirs = new Set();

async function ensureDirectoriesExist() {
  const dirs = [
    // 文档目录
    path.join(__dirname, 'documentation'),
    // 日志目录
    path.join(__dirname, 'logs'),
    // 图片目录
    path.join(__dirname, 'web', 'images'),
    // 数据目录
    path.join(__dirname, 'data'),
    // 配置目录
    path.join(__dirname, 'config'),
    // 临时文件目录
    path.join(__dirname, 'temp'),
    // session 目录
    path.join(__dirname, 'data', 'sessions'),
    // 文档数据目录
    path.join(__dirname, 'web', 'data', 'documentation')
  ];
  
  for (const dir of dirs) {
    if (checkedDirs.has(dir)) continue;
    
    try {
      await fs.access(dir);
      logger.info(`目录已存在: ${dir}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          await fs.mkdir(dir, { recursive: true });
          logger.success(`创建目录: ${dir}`);
        } catch (mkdirError) {
          logger.error(`创建目录 ${dir} 失败: ${mkdirError.message}`);
          throw mkdirError;
        }
      } else {
        logger.error(`检查目录 ${dir} 失败: ${error.message}`);
        throw error;
      }
    }
    
    checkedDirs.add(dir);
  }
  
  // 确保文档索引存在，但不再添加默认文档
  const docIndexPath = path.join(__dirname, 'web', 'data', 'documentation', 'index.json');
  try {
    await fs.access(docIndexPath);
    logger.info('文档索引已存在');
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        // 创建一个空的文档索引
        await fs.writeFile(docIndexPath, JSON.stringify([]), 'utf8');
        logger.success('创建了空的文档索引文件');
      } catch (writeError) {
        logger.error(`创建文档索引失败: ${writeError.message}`);
      }
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  ensureDirectoriesExist()
    .then(() => logger.info('目录初始化完成'))
    .catch(err => {
      logger.error('目录初始化失败:', err);
      process.exit(1);
    });
}

module.exports = { ensureDirectoriesExist };

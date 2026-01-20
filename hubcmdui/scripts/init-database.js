/**
 * 数据库初始化脚本
 */
const database = require('../database/database');
const userServiceDB = require('../services/userServiceDB');
const configServiceDB = require('../services/configServiceDB');
const logger = require('../logger');

async function initializeDatabase() {
  try {
    logger.info('开始初始化数据库...');

    // 连接数据库
    await database.connect();

    // 始终运行 createTables 以确保新表被创建 (使用 IF NOT EXISTS 是安全的)
    await database.createTables();

    // 检查数据库是否已经初始化
    const isInitialized = await database.isInitialized();
    if (isInitialized) {
      logger.info('数据库已经初始化，检查并初始化新配置...');
      // 即使已初始化，也要确保 Registry 配置存在
      await configServiceDB.initializeRegistryConfigs();
      return;
    }

    // 创建默认管理员用户（如果不存在）
    await database.createDefaultAdmin();

    // 创建默认文档
    await database.createDefaultDocuments();

    // 初始化默认配置
    await configServiceDB.initializeDefaultConfig();

    // 初始化 Registry 配置
    await configServiceDB.initializeRegistryConfigs();

    // 标记数据库已初始化
    await database.markAsInitialized();

    logger.info('数据库初始化完成！');
    
    // 显示数据库信息
    const userCount = await database.get('SELECT COUNT(*) as count FROM users');
    const configCount = await database.get('SELECT COUNT(*) as count FROM configs');
    const docCount = await database.get('SELECT COUNT(*) as count FROM documents');
    
    logger.info(`数据库统计:`);
    logger.info(`  用户数量: ${userCount.count}`);
    logger.info(`  配置项数量: ${configCount.count}`);
    logger.info(`  文档数量: ${docCount.count}`);

  } catch (error) {
    logger.error('数据库初始化失败:', error);
    process.exit(1);
  }
}

/**
 * 检查数据库是否已经初始化
 */
async function checkDatabaseInitialized() {
  try {
    // 检查用户表是否有数据
    const userCount = await database.get('SELECT COUNT(*) as count FROM users');
    if (userCount && userCount.count > 0) {
      return true;
    }
    
    // 检查配置表是否有数据
    const configCount = await database.get('SELECT COUNT(*) as count FROM configs');
    if (configCount && configCount.count > 0) {
      return true;
    }
    
    return false;
  } catch (error) {
    // 如果查询失败，认为数据库未初始化
    return false;
  }
}

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  initializeDatabase().then(() => {
    process.exit(0);
  }).catch((error) => {
    logger.error('初始化过程出错:', error);
    process.exit(1);
  });
}

module.exports = {
  initializeDatabase
};

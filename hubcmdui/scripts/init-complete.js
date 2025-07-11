#!/usr/bin/env node
/**
 * 系统初始化和配置脚本
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

// 颜色输出
const chalk = require('chalk');

async function initializeSystem() {
  console.log(chalk.blue('🚀 正在初始化 HubCmdUI 系统...\n'));

  try {
    // 1. 检查并创建必要目录
    console.log(chalk.yellow('📁 创建必要目录...'));
    await createDirectories();

    // 2. 检查数据库是否已初始化
    const database = require('../database/database');
    try {
      await database.connect();
      const isInitialized = await database.isInitialized();
      
      if (isInitialized) {
        console.log(chalk.green('  ✓ 数据库已初始化，跳过初始化步骤'));
        console.log(chalk.green('\n✅ 系统检查完成！'));
        console.log(chalk.cyan('💡 使用 npm start 启动服务'));
        console.log(chalk.cyan('🌐 默认访问地址: http://localhost:3000'));
        return;
      }
    } catch (error) {
      // 数据库连接失败，继续初始化流程
    }

    // 3. 检查配置文件
    console.log(chalk.yellow('⚙️  检查配置文件...'));
    await checkConfigFiles();

    // 4. 询问用户是否要启用SQLite
    const useDatabase = await askUserChoice();

    if (useDatabase) {
      // 5. 迁移数据到SQLite
      console.log(chalk.yellow('📊 初始化SQLite数据库...'));
      await initializeSQLite();

      // 6. 设置环境变量
      console.log(chalk.yellow('🔧 配置数据库模式...'));
      await setDatabaseMode(true);
    } else {
      console.log(chalk.yellow('📁 使用文件存储模式...'));
      await setDatabaseMode(false);
    }

    // 7. 创建默认用户
    console.log(chalk.yellow('👤 创建默认用户...'));
    await createDefaultUser();

    // 8. 配置HTTP代理
    console.log(chalk.yellow('🌐 配置HTTP代理服务...'));
    await configureHttpProxy();

    console.log(chalk.green('\n✅ 系统初始化完成！'));
    console.log(chalk.cyan('💡 使用 npm start 启动服务'));
    console.log(chalk.cyan('🌐 默认访问地址: http://localhost:3000'));
    console.log(chalk.cyan('👤 默认用户: root / admin@123'));

  } catch (error) {
    console.error(chalk.red('❌ 初始化失败:'), error.message);
    process.exit(1);
  }
}

/**
 * 创建必要目录
 */
async function createDirectories() {
  const dirs = [
    'data',          // 数据库文件目录
    'documentation', // 文档目录（静态文件）
    'logs',          // 日志目录
    'temp'           // 临时文件目录
  ];

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  console.log(chalk.green('  ✓ 目录创建完成'));
}

/**
 * 检查配置文件 - 简化版，不再创建config.json
 */
async function checkConfigFiles() {
  console.log(chalk.green('  ✓ 使用SQLite数据库存储配置'));
}

/**
 * 询问用户选择
 */
async function askUserChoice() {
  // 简化处理，默认使用SQLite
  const useDatabase = process.env.USE_SQLITE !== 'false';
  
  if (useDatabase) {
    console.log(chalk.green('  ✓ 将使用SQLite数据库存储'));
  } else {
    console.log(chalk.yellow('  ⚠ 将使用文件存储模式'));
  }
  
  return useDatabase;
}

/**
 * 初始化SQLite数据库
 */
async function initializeSQLite() {
  try {
    const database = require('../database/database');
    await database.connect();
    await database.createTables();
    
    // 初始化数据库（创建默认数据）
    await database.createDefaultAdmin();
    await database.createDefaultDocuments();
    await database.createDefaultMenuItems();
    
    // 初始化默认配置
    const configServiceDB = require('../services/configServiceDB');
    await configServiceDB.initializeDefaultConfig();
    
    // 标记数据库已初始化
    await database.markAsInitialized();
    
    console.log(chalk.green('  ✓ SQLite数据库初始化完成'));
  } catch (error) {
    console.log(chalk.red('  ❌ SQLite初始化失败:'), error.message);
    throw error;
  }
}

/**
 * 设置数据库模式
 */
async function setDatabaseMode(useDatabase) {
  const envPath = path.join(__dirname, '../.env');
  const envContent = `# 数据库配置
USE_DATABASE=${useDatabase}
AUTO_MIGRATE=true

# HTTP代理配置
PROXY_PORT=8080
PROXY_HOST=0.0.0.0
`;

  await fs.writeFile(envPath, envContent);
  console.log(chalk.green(`  ✓ 数据库模式已设置为: ${useDatabase ? 'SQLite' : '文件存储'}`));
}

/**
 * 创建默认用户 - 简化版，数据库已处理
 */
async function createDefaultUser() {
  console.log(chalk.green('  ✓ 默认管理员用户由数据库处理 (root/admin@123)'));
}

/**
 * 配置HTTP代理服务信息
 */
async function configureHttpProxy() {
  try {
    console.log(chalk.green('  ✓ HTTP代理服务需要通过环境变量配置'));
    console.log(chalk.cyan('    配置方式: 设置 PROXY_PORT 和 PROXY_HOST 环境变量'));
    console.log(chalk.cyan('    示例: PROXY_PORT=8080 PROXY_HOST=0.0.0.0 npm start'));
  } catch (error) {
    console.log(chalk.yellow('  ⚠ HTTP代理服务配置提示显示失败'));
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initializeSystem().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(chalk.red('初始化失败:'), error);
    process.exit(1);
  });
}

module.exports = { initializeSystem };

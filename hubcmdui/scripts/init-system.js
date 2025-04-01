/**
 * 系统初始化脚本 - 首次运行时执行
 */
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const { execSync } = require('child_process');
const logger = require('../logger');
const { ensureDirectoriesExist } = require('../init-dirs');
const { downloadImages } = require('../download-images');
const configService = require('../services/configService');

// 用户文件路径
const USERS_FILE = path.join(__dirname, '..', 'users.json');

/**
 * 创建管理员用户
 * @param {string} username 用户名
 * @param {string} password 密码
 */
async function createAdminUser(username = 'root', password = 'admin') {
  try {
    // 检查用户文件是否已存在
    try {
      await fs.access(USERS_FILE);
      logger.info('用户文件已存在，跳过创建管理员用户');
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    // 创建默认管理员用户
    const defaultUser = {
      username,
      password: bcrypt.hashSync(password, 10),
      createdAt: new Date().toISOString(),
      loginCount: 0,
      lastLogin: null
    };
    
    await fs.writeFile(USERS_FILE, JSON.stringify({ users: [defaultUser] }, null, 2));
    logger.success(`创建默认管理员用户: ${username}/${password}`);
    logger.warn('请在首次登录后立即修改默认密码');
  } catch (error) {
    logger.error('创建管理员用户失败:', error);
    throw error;
  }
}

/**
 * 创建默认配置
 */
async function createDefaultConfig() {
  try {
    // 检查配置是否已存在
    const config = await configService.getConfig();
    
    // 如果菜单项为空，添加默认菜单项
    if (!config.menuItems || config.menuItems.length === 0) {
      config.menuItems = [
        {
          text: "控制台",
          link: "/admin",
          newTab: false
        },
        {
          text: "镜像搜索",
          link: "/",
          newTab: false
        },
        {
          text: "文档",
          link: "/docs",
          newTab: false
        },
        {
          text: "GitHub",
          link: "https://github.com/dqzboy/hubcmdui",
          newTab: true
        }
      ];
      
      await configService.saveConfig(config);
      logger.success('创建默认菜单配置');
    }
    
    return config;
  } catch (error) {
    logger.error('初始化配置失败:', error);
    throw error;
  }
}

/**
 * 创建示例文档 - 现已禁用
 */
async function createSampleDocumentation() {
  logger.info('示例文档创建功能已禁用');
  return; // 不再创建默认文档
  
  /* 旧代码保留注释，已禁用
  const docService = require('../services/documentationService');
  
  try {
    await docService.ensureDocumentationDir();
    
    // 检查是否有现有文档
    const docs = await docService.getDocumentationList();
    if (docs && docs.length > 0) {
      logger.info('文档已存在，跳过创建示例文档');
      return;
    }
    
    // 创建示例文档
    const welcomeDoc = {
      title: "欢迎使用 Docker 镜像代理加速系统",
      content: `# 欢迎使用 Docker 镜像代理加速系统

## 系统简介

Docker 镜像代理加速系统是一个帮助用户快速搜索、拉取 Docker 镜像的工具。本系统提供了以下功能：

- 快速搜索 Docker Hub 上的镜像
- 查看镜像的详细信息和标签
- 管理本地 Docker 容器
- 监控容器状态并发送通知

## 快速开始

1. 在首页搜索框中输入要查找的镜像名称
2. 点击搜索结果查看详细信息
3. 使用提供的命令拉取镜像

## 管理功能

管理员可以通过控制面板管理系统：

- 查看所有容器状态
- 启动/停止/重启容器
- 更新容器镜像
- 配置监控告警

祝您使用愉快！
`,
      published: true
    };
    
    const aboutDoc = {
      title: "关于系统",
      content: `# 关于 Docker 镜像代理加速系统

## 系统版本

当前版本: v1.0.0

## 技术栈

- 前端: HTML, CSS, JavaScript
- 后端: Node.js, Express
- 容器: Docker, Dockerode
- 数据存储: 文件系统

## 联系方式

如有问题，请通过以下方式联系我们：

- GitHub Issues
- 电子邮件: example@example.com

## 许可证

本项目采用 MIT 许可证
`,
      published: true
    };
    
    await docService.saveDocument(Date.now().toString(), welcomeDoc.title, welcomeDoc.content);
    await docService.saveDocument((Date.now() + 1000).toString(), aboutDoc.title, aboutDoc.content);
    
    logger.success('创建示例文档成功');
  } catch (error) {
    logger.error('创建示例文档失败:', error);
  }
  */
}

/**
 * 检查必要依赖
 */
async function checkDependencies() {
  try {
    logger.info('正在检查系统依赖...');
    
    // 检查 Node.js 版本
    const nodeVersion = process.version;
    const minNodeVersion = 'v14.0.0';
    if (compareVersions(nodeVersion, minNodeVersion) < 0) {
      logger.warn(`当前 Node.js 版本 ${nodeVersion} 低于推荐的最低版本 ${minNodeVersion}`);
    } else {
      logger.success(`Node.js 版本 ${nodeVersion} 满足要求`);
    }
    
    // 检查必要的 npm 包
    try {
      const packageJson = require('../package.json');
      const requiredDeps = Object.keys(packageJson.dependencies);
      
      logger.info(`系统依赖共 ${requiredDeps.length} 个包`);
      
      // 检查是否有 node_modules 目录
      try {
        await fs.access(path.join(__dirname, '..', 'node_modules'));
      } catch (err) {
        if (err.code === 'ENOENT') {
          logger.warn('未找到 node_modules 目录，请运行 npm install 安装依赖');
          return false;
        }
      }
    } catch (err) {
      logger.warn('无法读取 package.json:', err.message);
    }
    
    // 检查 Docker
    try {
      execSync('docker --version', { stdio: ['ignore', 'ignore', 'ignore'] });
      logger.success('Docker 已安装');
    } catch (err) {
      logger.warn('未检测到 Docker，部分功能可能无法正常使用');
    }
    
    return true;
  } catch (error) {
    logger.error('依赖检查失败:', error);
    return false;
  }
}

/**
 * 比较版本号
 */
function compareVersions(v1, v2) {
  const v1parts = v1.replace('v', '').split('.');
  const v2parts = v2.replace('v', '').split('.');
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = parseInt(v1parts[i] || 0);
    const v2part = parseInt(v2parts[i] || 0);
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  
  return 0;
}

/**
 * 主初始化函数
 */
async function initialize() {
  logger.info('开始系统初始化...');
  
  try {
    // 1. 检查系统依赖
    await checkDependencies();
    
    // 2. 确保目录结构存在
    await ensureDirectoriesExist();
    logger.success('目录结构初始化完成');
    
    // 3. 下载必要图片
    await downloadImages();
    
    // 4. 创建默认用户
    await createAdminUser();
    
    // 5. 创建默认配置
    await createDefaultConfig();
    
    // 6. 创建示例文档
    await createSampleDocumentation();
    
    logger.success('系统初始化完成！');
    // 移除敏感的账户信息日志
    logger.warn('首次登录后请立即修改默认密码!');
    
    return { success: true };
  } catch (error) {
    logger.error('系统初始化失败:', error);
    return { success: false, error: error.message };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initialize()
    .then((result) => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.fatal('初始化过程中发生错误:', error);
      process.exit(1);
    });
}

module.exports = {
  initialize,
  createAdminUser,
  createDefaultConfig,
  createSampleDocumentation,
  checkDependencies
};

/**
 * 系统诊断工具 - 帮助找出可能存在的问题
 */
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../logger');

// 检查所有必要的文件和目录是否存在
async function checkFilesAndDirectories() {
  logger.info('开始检查必要的文件和目录...');
  
  // 检查必要的目录
  const requiredDirs = [
    { path: 'logs', critical: true },
    { path: 'documentation', critical: true },
    { path: 'web/images', critical: true },
    { path: 'routes', critical: true },
    { path: 'services', critical: true },
    { path: 'middleware', critical: true },
    { path: 'scripts', critical: false }
  ];
  
  const dirsStatus = {};
  for (const dir of requiredDirs) {
    const fullPath = path.join(__dirname, '..', dir.path);
    try {
      await fs.access(fullPath);
      dirsStatus[dir.path] = { exists: true, critical: dir.critical };
      logger.info(`目录存在: ${dir.path}`);
    } catch (error) {
      dirsStatus[dir.path] = { exists: false, critical: dir.critical };
      logger.error(`目录不存在: ${dir.path} (${dir.critical ? '关键' : '非关键'})`);
    }
  }
  
  // 检查必要的文件
  const requiredFiles = [
    { path: 'server.js', critical: true },
    { path: 'app.js', critical: false },
    { path: 'config.js', critical: true },
    { path: 'logger.js', critical: true },
    { path: 'init-dirs.js', critical: true },
    { path: 'download-images.js', critical: true },
    { path: 'cleanup.js', critical: true },
    { path: 'package.json', critical: true },
    { path: 'web/index.html', critical: true },
    { path: 'web/admin.html', critical: true }
  ];
  
  const filesStatus = {};
  for (const file of requiredFiles) {
    const fullPath = path.join(__dirname, '..', file.path);
    try {
      await fs.access(fullPath);
      filesStatus[file.path] = { exists: true, critical: file.critical };
      logger.info(`文件存在: ${file.path}`);
    } catch (error) {
      filesStatus[file.path] = { exists: false, critical: file.critical };
      logger.error(`文件不存在: ${file.path} (${file.critical ? '关键' : '非关键'})`);
    }
  }
  
  return { directories: dirsStatus, files: filesStatus };
}

// 检查Node.js模块依赖
function checkNodeDependencies() {
  logger.info('开始检查Node.js依赖...');
  
  try {
    // 执行npm list --depth=0来检查已安装的依赖
    const npmListOutput = execSync('npm list --depth=0', { encoding: 'utf8' });
    logger.info('已安装的依赖:\n' + npmListOutput);
    
    return { success: true, output: npmListOutput };
  } catch (error) {
    logger.error('检查依赖时出错:', error.message);
    return { success: false, error: error.message };
  }
}

// 检查系统环境
async function checkSystemEnvironment() {
  logger.info('开始检查系统环境...');
  
  const checks = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    docker: null
  };
  
  try {
    // 检查Docker是否可用
    const dockerVersion = execSync('docker --version', { encoding: 'utf8' });
    checks.docker = dockerVersion.trim();
    logger.info(`Docker版本: ${dockerVersion.trim()}`);
  } catch (error) {
    checks.docker = false;
    logger.warn('Docker未安装或不可用');
  }
  
  return checks;
}

// 运行诊断
async function runDiagnostics() {
  logger.info('======= 开始系统诊断 =======');
  
  const results = {
    filesAndDirs: await checkFilesAndDirectories(),
    dependencies: checkNodeDependencies(),
    environment: await checkSystemEnvironment()
  };
  
  // 检查关键错误
  const criticalErrors = [];
  
  // 检查关键目录
  Object.entries(results.filesAndDirs.directories).forEach(([dir, status]) => {
    if (status.critical && !status.exists) {
      criticalErrors.push(`关键目录丢失: ${dir}`);
    }
  });
  
  // 检查关键文件
  Object.entries(results.filesAndDirs.files).forEach(([file, status]) => {
    if (status.critical && !status.exists) {
      criticalErrors.push(`关键文件丢失: ${file}`);
    }
  });
  
  // 检查依赖
  if (!results.dependencies.success) {
    criticalErrors.push('依赖检查失败');
  }
  
  // 总结
  logger.info('======= 诊断完成 =======');
  if (criticalErrors.length > 0) {
    logger.error('发现关键错误:');
    criticalErrors.forEach(err => logger.error(`- ${err}`));
    logger.error('请解决以上问题后重试');
  } else {
    logger.success('未发现关键错误，系统应该可以正常运行');
  }
  
  return { results, criticalErrors };
}

// 直接运行脚本时启动诊断
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      logger.info('诊断完成');
    })
    .catch(error => {
      logger.fatal('诊断过程中发生错误:', error);
    });
}

module.exports = { runDiagnostics };

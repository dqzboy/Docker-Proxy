/**
 * 路由注册器
 * 负责注册所有API路由
 */
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// 检查文件是否是路由模块
function isRouteModule(file) {
    return file.endsWith('.js') && 
           file !== 'index.js' && 
           file !== 'routeLoader.js' &&
           // login.js 是旧的文件用户认证实现；当前统一由 auth.js 提供登录和验证码接口。
           file !== 'login.js' &&
           !file.startsWith('_');
}

/**
 * 注册所有路由
 * @param {Express} app - Express应用实例
 */
function registerRoutes(app) {
    const routeDir = __dirname;
    
    try {
        const files = fs.readdirSync(routeDir);
        const routeFiles = files.filter(isRouteModule);
        
        logger.info(`发现 ${routeFiles.length} 个路由文件待加载`);
        
        routeFiles.forEach(file => {
                const routeName = path.basename(file, '.js');
                try {
                    const routePath = path.join(routeDir, file);
                    const routeExport = require(routePath); // 加载导出的模块

                    // 根级路由模块：其内部路径已定义为 /api 根级
                    // （如 auth.js 的 /login、/change-username），不应再叠加文件名前缀，
                    // 否则会变成 /api/auth/change-username，
                    // 而前端只请求 /api/change-username → 404。
                    // 资源型模块（config/menu/docker/registry…）内部路径相对资源名，
                    // 需保留 /api/<文件名> 前缀才能与前端保持一致，故不在此列。
                    const rootLevelRouters = new Set(['auth']);
                    const mountBase = rootLevelRouters.has(routeName) ? '/api' : `/api/${routeName}`;

                    // 优先处理 { router: routerInstance, ... } 格式
                    if (routeExport && typeof routeExport === 'object' && routeExport.router && typeof routeExport.router === 'function' && routeExport.router.stack) {
                        app.use(mountBase, routeExport.router);
                        logger.info(`✓ 挂载路由对象: ${mountBase}`);
                    }
                    // 处理直接导出 routerInstance 的情况 (更严格的检查)
                    else if (typeof routeExport === 'function' && routeExport.handle && routeExport.stack) {
                        app.use(mountBase, routeExport);
                        logger.info(`✓ 挂载路由: ${mountBase}`);
                    } 
                // 处理导出 { setup: setupFunction } 的情况
                else if (routeExport && typeof routeExport === 'object' && routeExport.setup && typeof routeExport.setup === 'function') {
                    routeExport.setup(app);
                    logger.info(`✓ 初始化路由: ${routeName}`);
                } 
                // 处理导出 setup 函数 (app) => {} 的情况
                else if (typeof routeExport === 'function') {
                    // 检查是否是 Express Router 实例 (避免重复判断 Case 3)
                    if (!(routeExport.handle && routeExport.stack)) { 
                         routeExport(app);
                         logger.info(`✓ 注册路由函数: ${routeName}`);
                    } else {
                         logger.warn(`× 路由 ${file} 格式疑似 Router 实例但未被 Case 3 处理，已跳过`);
                    }
                } 
                // 其他无法识别的格式
                else {
                    logger.warn(`× 路由 ${file} 导出格式无法识别 (${typeof routeExport})，已跳过`);
                }
            } catch (error) {
                logger.error(`× 加载路由 ${file} 失败: ${error.message}`);
                 // 可以在这里添加更详细的错误堆栈日志
                 logger.debug(error.stack);
            }
        });
        
        logger.info('所有路由注册完成');
    } catch (error) {
        logger.error(`路由注册失败: ${error.message}`);
    }
}

module.exports = registerRoutes;

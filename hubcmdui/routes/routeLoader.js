const fs = require('fs');
const path = require('path');
const express = require('express');
const { executeOnce } = require('../lib/initScheduler');

// 引入logger
const logger = require('../logger');

// 改进路由加载器，确保每个路由只被加载一次
async function loadRoutes(app, customLogger) {
    // 使用传入的logger或默认logger
    const log = customLogger || logger;
    
    const routesDir = path.join(__dirname);
    const routeFiles = fs.readdirSync(routesDir).filter(file => 
        file.endsWith('.js') && !file.includes('routeLoader') && !file.includes('index')
    );
    
    log.info(`发现 ${routeFiles.length} 个路由文件待加载`);
    
    for (const file of routeFiles) {
        const routeName = path.basename(file, '.js');
        
        try {
            await executeOnce(`loadRoute_${routeName}`, async () => {
                const routePath = path.join(routesDir, file);
                
                // 添加错误处理来避免路由加载失败时导致应用崩溃
                try {
                    const route = require(routePath);
                    
                    if (typeof route === 'function') {
                        route(app);
                        log.success(`✓ 注册路由: ${routeName}`);
                    } else if (route && typeof route.router === 'function') {
                        route.router(app);
                        log.success(`✓ 注册路由对象: ${routeName}`);
                    } else {
                        log.error(`× 路由格式错误: ${file} (应该导出一个函数或router方法)`);
                    }
                } catch (routeError) {
                    log.error(`× 加载路由 ${file} 失败: ${routeError.message}`);
                    // 继续加载其他路由，不中断流程
                }
            }, log);
        } catch (error) {
            log.error(`× 路由加载流程出错: ${error.message}`);
            // 继续处理下一个路由
        }
    }
    
    log.info('所有路由注册完成');
}

module.exports = loadRoutes;

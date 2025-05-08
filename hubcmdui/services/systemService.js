/**
 * 系统服务模块 - 处理系统级信息获取
 * 使用 systeminformation 库来提供跨平台的系统数据
 */
const si = require('systeminformation');
const logger = require('../logger');
const os = require('os'); // os模块仍可用于某些特定情况或日志记录

// Helper function to format bytes into a more readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    try {
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    } catch (e) {
        return 'N/A'; // In case of Math.log error with very small numbers etc.
    }
}

// 获取核心系统资源信息 (CPU, Memory, Disk)
async function getSystemResources() {
    try {
        logger.info('Fetching system resources using systeminformation...');

        // 并行获取数据以提高效率
        const [cpuInfo, memInfo, fsInfo, cpuLoadInfo, osInfo] = await Promise.all([
            si.cpu(),         // For CPU model, cores, speed
            si.mem(),         // For memory details
            si.fsSize(),      // For filesystem details
            si.currentLoad(), // For current CPU load percentage and per-core load
            si.osInfo()       // For OS type, mainly for specific disk selection if needed
        ]);

        // --- CPU 信息处理 ---
        let cpuUsage = parseFloat(cpuLoadInfo.currentLoad.toFixed(1));
        // Fallback if currentLoad is not a number (very unlikely with systeminformation)
        if (isNaN(cpuUsage) && Array.isArray(cpuLoadInfo.cpus) && cpuLoadInfo.cpus.length > 0) {
            // Calculate average from per-core loads if overall isn't good
            const totalLoad = cpuLoadInfo.cpus.reduce((acc, core) => acc + core.load, 0);
            cpuUsage = parseFloat((totalLoad / cpuLoadInfo.cpus.length).toFixed(1));
        }
        if (isNaN(cpuUsage)) cpuUsage = null; // Final fallback to null if still NaN

        const cpuData = {
            cores: cpuInfo.cores,
            physicalCores: cpuInfo.physicalCores,
            model: cpuInfo.manufacturer + ' ' + cpuInfo.brand,
            speed: cpuInfo.speed, // in GHz
            usage: cpuUsage, // Overall CPU usage percentage
            loadAvg: osInfo.platform !== 'win32' ? os.loadavg().map(load => parseFloat(load.toFixed(1))) : null // os.loadavg() is not for Windows
        };

        // --- 内存信息处理 ---
        // systeminformation already provides these in bytes
        const memData = {
            total: memInfo.total,
            free: memInfo.free,       // Truly free
            used: memInfo.used,       // total - free (includes buff/cache on Linux, PhysMem used on macOS)
            active: memInfo.active,   // More representative of app-used memory
            available: memInfo.available, // Memory available to applications (often free + reclaimable buff/cache)
            wired: memInfo.wired,     // macOS specific: memory that cannot be paged out
            // compressed: memInfo.compressed, // macOS specific, if systeminformation lib provides it directly
            buffcache: memInfo.buffcache // Linux specific: buffer and cache
        };

        // --- 磁盘信息处理 ---
        // Find the primary disk (e.g., mounted on '/' for Linux/macOS, or C: for Windows)
        let mainDiskInfo = null;
        if (osInfo.platform === 'win32') {
            mainDiskInfo = fsInfo.find(d => d.fs.startsWith('C:'));
        } else {
            mainDiskInfo = fsInfo.find(d => d.mount === '/');
        }
        if (!mainDiskInfo && fsInfo.length > 0) {
             // Fallback to the first disk if the standard one isn't found
            mainDiskInfo = fsInfo[0]; 
        }

        const diskData = mainDiskInfo ? {
            mount: mainDiskInfo.mount,
            size: formatBytes(mainDiskInfo.size),
            used: formatBytes(mainDiskInfo.used),
            available: formatBytes(mainDiskInfo.available), // systeminformation provides 'available'
            percent: mainDiskInfo.use !== null && mainDiskInfo.use !== undefined ? mainDiskInfo.use.toFixed(0) + '%' : 'N/A'
        } : {
            mount: 'N/A',
            size: 'N/A',
            used: 'N/A',
            available: 'N/A',
            percent: 'N/A'
        };

        const resources = {
            osType: osInfo.platform, // e.g., 'darwin', 'linux', 'win32'
            osDistro: osInfo.distro,
            cpu: cpuData,
            memory: memData,
            disk: diskData
        };
        logger.info('Successfully fetched system resources:', /* JSON.stringify(resources, null, 2) */ resources.osType);
        return resources;

    } catch (error) {
        logger.error('获取系统资源失败 (services/systemService.js):', error);
        // Return a structured error object or rethrow, 
        // so the API route can send an appropriate HTTP error
        throw new Error(`Failed to get system resources: ${error.message}`);
    }
}

module.exports = {
  getSystemResources
  // getDiskSpace, if it was previously exported and used by another route, can be kept
  // or removed if getSystemResources now covers all disk info needs for /api/system-resources
};

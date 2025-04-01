/**
 * 下载必要的图片资源
 */
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const logger = require('./logger');
const { ensureDirectoriesExist } = require('./init-dirs');

// 背景图片URL
const LOGIN_BG_URL = 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1470&auto=format&fit=crop';

// 下载图片函数
function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image. Status code: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        logger.success(`Image downloaded to: ${dest}`);
        resolve();
      });
      
      file.on('error', err => {
        fs.unlink(dest).catch(() => {}); // 删除文件（如果存在）
        reject(err);
      });
    }).on('error', err => {
      fs.unlink(dest).catch(() => {}); // 删除文件（如果存在）
      reject(err);
    });
  });
}

// 主函数
async function downloadImages() {
  try {
    // 确保目录存在
    await ensureDirectoriesExist();
    
    // 下载登录背景图片
    const loginBgPath = path.join(__dirname, 'web', 'images', 'login-bg.jpg');
    try {
      await fs.access(loginBgPath);
      logger.info('Login background image already exists, skipping download');
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('Downloading login background image...');
        try {
          // 确保images目录存在
          await fs.mkdir(path.dirname(loginBgPath), { recursive: true });
          await downloadImage(LOGIN_BG_URL, loginBgPath);
        } catch (downloadError) {
          logger.error(`Download error: ${downloadError.message}`);
          // 下载失败时使用备用解决方案
          await fs.writeFile(loginBgPath, 'Failed to download', 'utf8');
          logger.warn('Created placeholder image file');
        }
      } else {
        throw error;
      }
    }
    
    logger.success('All images downloaded successfully');
  } catch (error) {
    logger.error('Error downloading images:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  downloadImages();
}

module.exports = { downloadImages };

const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

const CONFIG_FILE = path.join(__dirname, '../config.json');
const DEFAULT_CONFIG = {
  theme: 'light',
  language: 'zh_CN',
  notifications: true,
  autoRefresh: true,
  refreshInterval: 30000,
  dockerHost: 'localhost',
  dockerPort: 2375,
  useHttps: false
};

async function ensureConfigFile() {
  try {
    await fs.access(CONFIG_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } else {
      throw error;
    }
  }
}

async function getConfig() {
  try {
    await ensureConfigFile();
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('读取配置文件失败:', error);
    return { ...DEFAULT_CONFIG, error: true };
  }
}

module.exports = {
  getConfig,
  saveConfig: async (config) => {
    await ensureConfigFile();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  },
  DEFAULT_CONFIG
};

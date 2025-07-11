/**
 * 基于SQLite的配置服务模块
 */
const logger = require('../logger');
const database = require('../database/database');

class ConfigServiceDB {
  /**
   * 获取配置项
   */
  async getConfig(key = null) {
    try {
      if (key) {
        const config = await database.get('SELECT * FROM configs WHERE key = ?', [key]);
        if (config) {
          return JSON.parse(config.value);
        }
        return null;
      } else {
        // 获取所有配置
        const configs = await database.all('SELECT * FROM configs');
        const result = {};
        for (const config of configs) {
          result[config.key] = JSON.parse(config.value);
        }
        return result;
      }
    } catch (error) {
      logger.error('获取配置失败:', error);
      throw error;
    }
  }

  /**
   * 保存配置项
   */
  async saveConfig(key, value, description = null) {
    try {
      const valueString = JSON.stringify(value);
      const valueType = typeof value;
      
      const existingConfig = await database.get('SELECT id FROM configs WHERE key = ?', [key]);
      
      if (existingConfig) {
        // 更新现有配置
        await database.run(
          'UPDATE configs SET value = ?, type = ?, description = ?, updated_at = ? WHERE key = ?',
          [valueString, valueType, description, new Date().toISOString(), key]
        );
      } else {
        // 创建新配置
        await database.run(
          'INSERT INTO configs (key, value, type, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [key, valueString, valueType, description, new Date().toISOString(), new Date().toISOString()]
        );
      }
      
      // 移除详细的配置保存日志，减少日志噪音
    } catch (error) {
      logger.error('保存配置失败:', error);
      throw error;
    }
  }

  /**
   * 批量保存配置
   */
  async saveConfigs(configs) {
    try {
      const configCount = Object.keys(configs).length;
      for (const [key, value] of Object.entries(configs)) {
        await this.saveConfig(key, value);
      }
      logger.info(`批量保存配置完成，共 ${configCount} 项配置`);
    } catch (error) {
      logger.error('批量保存配置失败:', error);
      throw error;
    }
  }

  /**
   * 删除配置项
   */
  async deleteConfig(key) {
    try {
      await database.run('DELETE FROM configs WHERE key = ?', [key]);
      // 删除配置时仍保留日志，因为这是重要操作
      logger.info(`配置 ${key} 已删除`);
    } catch (error) {
      logger.error('删除配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取系统默认配置
   */
  getDefaultConfig() {
    return {
      theme: 'light',
      language: 'zh_CN',
      notifications: true,
      autoRefresh: true,
      refreshInterval: 30000,
      dockerHost: 'localhost',
      dockerPort: 2375,
      useHttps: false,
      proxyDomain: 'registry-1.docker.io',
      logo: '',
      menuItems: [
        {
          text: "首页",
          link: "/",
          newTab: false
        },
        {
          text: "文档",
          link: "https://dqzboy.github.io/docs/",
          newTab: true
        },
        {
          text: "推广",
          link: "https://dqzboy.github.io/proxyui/zanzhu",
          newTab: true
        },
        {
          text: "GitHub",
          link: "https://github.com/dqzboy/Docker-Proxy",
          newTab: true
        }
      ],
      monitoringConfig: {
        notificationType: 'wechat',
        webhookUrl: '',
        telegramToken: '',
        telegramChatId: '',
        monitorInterval: 60,
        isEnabled: false
      }
    };
  }

  /**
   * 初始化默认配置
   */
  async initializeDefaultConfig() {
    try {
      const defaultConfig = this.getDefaultConfig();
      let newConfigCount = 0;
      
      for (const [key, value] of Object.entries(defaultConfig)) {
        const existingConfig = await database.get('SELECT id FROM configs WHERE key = ?', [key]);
        if (!existingConfig) {
          await this.saveConfig(key, value, `默认${key}配置`);
          newConfigCount++;
        }
      }
    } catch (error) {
      logger.error('初始化默认配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取监控配置
   */
  async getMonitoringConfig() {
    try {
      return await this.getConfig('monitoringConfig') || this.getDefaultConfig().monitoringConfig;
    } catch (error) {
      logger.error('获取监控配置失败:', error);
      return this.getDefaultConfig().monitoringConfig;
    }
  }

  /**
   * 保存监控配置
   */
  async saveMonitoringConfig(config) {
    try {
      await this.saveConfig('monitoringConfig', config, '监控系统配置');
    } catch (error) {
      logger.error('保存监控配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取菜单项配置
   */
  async getMenuItems() {
    try {
      const menuItems = await database.all(
        'SELECT text, link, new_tab, sort_order, enabled FROM menu_items WHERE enabled = 1 ORDER BY sort_order'
      );
      
      return menuItems.map(item => ({
        text: item.text,
        link: item.link,
        newTab: Boolean(item.new_tab)
      }));
    } catch (error) {
      logger.error('获取菜单项失败:', error);
      return [];
    }
  }

  /**
   * 保存菜单项配置
   */
  async saveMenuItems(menuItems) {
    try {
      // 先清空现有菜单项
      await database.run('DELETE FROM menu_items');
      
      // 插入新的菜单项
      for (let i = 0; i < menuItems.length; i++) {
        const item = menuItems[i];
        await database.run(
          'INSERT INTO menu_items (text, link, new_tab, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [item.text, item.link, item.newTab ? 1 : 0, i + 1, 1, new Date().toISOString(), new Date().toISOString()]
        );
      }
      
      logger.info('菜单项配置保存成功');
    } catch (error) {
      logger.error('保存菜单项失败:', error);
      throw error;
    }
  }
}

module.exports = new ConfigServiceDB();

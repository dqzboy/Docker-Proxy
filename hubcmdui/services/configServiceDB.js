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

  /**
   * 获取默认 Registry 配置
   */
  getDefaultRegistryConfigs() {
    return [
      {
        registry_id: 'docker-hub',
        name: 'Docker Hub',
        icon: 'fab fa-docker',
        color: '#2496ED',
        prefix: '',
        description: 'Docker 官方镜像仓库',
        proxy_url: 'registry-1.docker.io',
        enabled: true,
        sort_order: 1
      },
      {
        registry_id: 'ghcr',
        name: 'GitHub Container Registry',
        icon: 'fab fa-github',
        color: '#333333',
        prefix: 'ghcr.io',
        description: 'GitHub 容器镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 2
      },
      {
        registry_id: 'quay',
        name: 'Quay.io',
        icon: 'fas fa-cube',
        color: '#40B4E5',
        prefix: 'quay.io',
        description: 'Red Hat Quay 容器镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 3
      },
      {
        registry_id: 'gcr',
        name: 'Google Container Registry',
        icon: 'fab fa-google',
        color: '#4285F4',
        prefix: 'gcr.io',
        description: 'Google 容器镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 4
      },
      {
        registry_id: 'k8s',
        name: 'Kubernetes Registry',
        icon: 'fas fa-dharmachakra',
        color: '#326CE5',
        prefix: 'registry.k8s.io',
        description: 'Kubernetes 官方镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 5
      },
      {
        registry_id: 'mcr',
        name: 'Microsoft Container Registry',
        icon: 'fab fa-microsoft',
        color: '#00A4EF',
        prefix: 'mcr.microsoft.com',
        description: 'Microsoft 容器镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 6
      },
      {
        registry_id: 'elastic',
        name: 'Elastic Container Registry',
        icon: 'fas fa-bolt',
        color: '#FEC514',
        prefix: 'docker.elastic.co',
        description: 'Elastic 官方镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 7
      },
      {
        registry_id: 'nvcr',
        name: 'NVIDIA Container Registry',
        icon: 'fas fa-microchip',
        color: '#76B900',
        prefix: 'nvcr.io',
        description: 'NVIDIA GPU 容器镜像仓库',
        proxy_url: '',
        enabled: false,
        sort_order: 8
      }
    ];
  }

  /**
   * 初始化 Registry 配置
   */
  async initializeRegistryConfigs() {
    try {
      const defaultConfigs = this.getDefaultRegistryConfigs();
      
      for (const config of defaultConfigs) {
        const existing = await database.get(
          'SELECT id FROM registry_configs WHERE registry_id = ?',
          [config.registry_id]
        );
        
        if (!existing) {
          await database.run(
            `INSERT INTO registry_configs 
             (registry_id, name, icon, color, prefix, description, proxy_url, enabled, sort_order, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              config.registry_id,
              config.name,
              config.icon,
              config.color,
              config.prefix,
              config.description,
              config.proxy_url,
              config.enabled ? 1 : 0,
              config.sort_order,
              new Date().toISOString(),
              new Date().toISOString()
            ]
          );
        }
      }
      
      logger.info('Registry 配置初始化完成');
    } catch (error) {
      logger.error('初始化 Registry 配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有 Registry 配置
   */
  async getRegistryConfigs() {
    try {
      const configs = await database.all(
        'SELECT * FROM registry_configs ORDER BY sort_order'
      );
      
      // 如果表不存在或为空，返回默认配置
      if (!configs || configs.length === 0) {
        return this.getDefaultRegistryConfigs().map(config => ({
          registryId: config.registry_id,
          name: config.name,
          icon: config.icon,
          color: config.color,
          prefix: config.prefix,
          description: config.description,
          proxyUrl: config.proxy_url,
          enabled: config.enabled,
          sortOrder: config.sort_order
        }));
      }
      
      return configs.map(config => ({
        registryId: config.registry_id,
        name: config.name,
        icon: config.icon,
        color: config.color,
        prefix: config.prefix,
        description: config.description,
        proxyUrl: config.proxy_url,
        enabled: Boolean(config.enabled),
        sortOrder: config.sort_order
      }));
    } catch (error) {
      logger.error('获取 Registry 配置失败:', error);
      // 返回默认配置
      return this.getDefaultRegistryConfigs().map(config => ({
        registryId: config.registry_id,
        name: config.name,
        icon: config.icon,
        color: config.color,
        prefix: config.prefix,
        description: config.description,
        proxyUrl: config.proxy_url,
        enabled: config.enabled,
        sortOrder: config.sort_order
      }));
    }
  }

  /**
   * 获取启用的 Registry 配置
   */
  async getEnabledRegistryConfigs() {
    try {
      const configs = await database.all(
        'SELECT * FROM registry_configs WHERE enabled = 1 ORDER BY sort_order'
      );
      
      // 如果没有启用的配置，返回默认的 Docker Hub
      if (!configs || configs.length === 0) {
        return [{
          registryId: 'docker-hub',
          name: 'Docker Hub',
          icon: 'fab fa-docker',
          color: '#2496ED',
          prefix: '',
          description: 'Docker 官方镜像仓库',
          proxyUrl: '',
          enabled: true,
          sortOrder: 1
        }];
      }
      
      return configs.map(config => ({
        registryId: config.registry_id,
        name: config.name,
        icon: config.icon,
        color: config.color,
        prefix: config.prefix,
        description: config.description,
        proxyUrl: config.proxy_url,
        enabled: true,
        sortOrder: config.sort_order
      }));
    } catch (error) {
      logger.error('获取启用的 Registry 配置失败:', error);
      // 返回默认的 Docker Hub 配置
      return [{
        registryId: 'docker-hub',
        name: 'Docker Hub',
        icon: 'fab fa-docker',
        color: '#2496ED',
        prefix: '',
        description: 'Docker 官方镜像仓库',
        proxyUrl: '',
        enabled: true,
        sortOrder: 1
      }];
    }
  }

  /**
   * 更新单个 Registry 配置
   */
  async updateRegistryConfig(registryId, config) {
    try {
      await database.run(
        `UPDATE registry_configs 
         SET proxy_url = ?, enabled = ?, updated_at = ?
         WHERE registry_id = ?`,
        [
          config.proxyUrl || '',
          config.enabled ? 1 : 0,
          new Date().toISOString(),
          registryId
        ]
      );
      
      logger.info(`Registry 配置 ${registryId} 更新成功`);
    } catch (error) {
      logger.error('更新 Registry 配置失败:', error);
      throw error;
    }
  }

  /**
   * 批量更新 Registry 配置
   */
  async updateRegistryConfigs(configs) {
    try {
      for (const config of configs) {
        await this.updateRegistryConfig(config.registryId, config);
      }
      logger.info('批量更新 Registry 配置成功');
    } catch (error) {
      logger.error('批量更新 Registry 配置失败:', error);
      throw error;
    }
  }
}

module.exports = new ConfigServiceDB();

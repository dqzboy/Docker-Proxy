/**
 * SQLite 数据库管理模块
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../logger');
const bcrypt = require('bcrypt');

// 数据库文件路径
const DB_PATH = path.join(__dirname, '../data/app.db');

class Database {
  constructor() {
    this.db = null;
  }

  /**
   * 初始化数据库连接
   */
  async connect() {
    try {
      // 确保数据目录存在
      const dbDir = path.dirname(DB_PATH);
      await fs.mkdir(dbDir, { recursive: true });

      return new Promise((resolve, reject) => {
        this.db = new sqlite3.Database(DB_PATH, (err) => {
          if (err) {
            logger.error('数据库连接失败:', err);
            reject(err);
          } else {
            logger.info('SQLite 数据库连接成功');
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error('初始化数据库失败:', error);
      throw error;
    }
  }

  /**
   * 创建数据表
   */
  async createTables() {
    const tables = [
      // 用户表
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        login_count INTEGER DEFAULT 0,
        last_login DATETIME
      )`,

      // 配置表
      `CREATE TABLE IF NOT EXISTS configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'string',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 文档表
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        published BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 系统日志表
      `CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Session表 - 用于存储用户会话
      `CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire DATETIME NOT NULL
      )`,

      // 菜单项表 - 用于存储导航菜单配置
      `CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        link TEXT NOT NULL,
        new_tab BOOLEAN DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Registry 配置表 - 用于存储各 Registry 平台的启用状态和代理地址
      `CREATE TABLE IF NOT EXISTS registry_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        registry_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        prefix TEXT,
        description TEXT,
        proxy_url TEXT,
        enabled BOOLEAN DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of tables) {
      await this.run(sql);
    }

    logger.info('数据表创建完成');
  }

  /**
   * 执行SQL语句
   */
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('SQL执行失败:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * 查询单条记录
   */
  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('SQL查询失败:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * 查询多条记录
   */
  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('SQL查询失败:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }



  /**
   * 初始化默认管理员用户
   */
  async createDefaultAdmin() {
    try {
      const adminUser = await this.get('SELECT id FROM users WHERE username = ?', ['root']);
      
      if (!adminUser) {
        const hashedPassword = await bcrypt.hash('admin@123', 10);
        await this.run(
          'INSERT INTO users (username, password, created_at, login_count, last_login) VALUES (?, ?, ?, ?, ?)',
          ['root', hashedPassword, new Date().toISOString(), 0, null]
        );
        logger.info('默认管理员用户创建成功: root/admin@123');
      }
    } catch (error) {
      logger.error('创建默认管理员用户失败:', error);
    }
  }

  /**
   * 创建默认文档
   */
  async createDefaultDocuments() {
    try {
      const docCount = await this.get('SELECT COUNT(*) as count FROM documents');
      
      if (docCount.count === 0) {
        const defaultDocs = [
          {
            doc_id: 'welcome',
            title: '欢迎使用 Docker 镜像代理加速系统',
            content: `## 系统介绍

这是一个基于 Nginx 的 Docker 镜像代理加速系统，可以帮助您加速 Docker 镜像的下载和部署。

## 主要功能

- 🚀 **镜像加速**: 提供多个 Docker 镜像仓库的代理加速
- 🔧 **配置管理**: 简单易用的 Web 管理界面
- 📊 **监控统计**: 实时监控代理服务状态
- 📖 **文档管理**: 内置文档系统，方便管理和分享

## 快速开始

1. 访问管理面板进行基础配置
2. 配置 Docker 客户端使用代理地址
3. 开始享受加速的镜像下载体验

## 更多信息

如需更多帮助，请查看项目文档或访问 GitHub 仓库。`,
            published: 1
          },
          {
            doc_id: 'docker-config',
            title: 'Docker 客户端配置指南',
            content: `## 配置说明

使用本代理服务需要配置 Docker 客户端的镜像仓库地址。

## Linux/macOS 配置

编辑或创建 \`/etc/docker/daemon.json\` 文件：

\`\`\`json
{
  "registry-mirrors": [
    "http://your-proxy-domain.com"
  ]
}
\`\`\`

重启 Docker 服务：
\`\`\`bash
sudo systemctl restart docker
\`\`\`

## Windows 配置

在 Docker Desktop 设置中：
1. 打开 Settings -> Docker Engine
2. 添加配置到 JSON 文件中
3. 点击 "Apply & Restart"

## 验证配置

运行以下命令验证配置是否生效：
\`\`\`bash
docker info
\`\`\`

在输出中查看 "Registry Mirrors" 部分。`,
            published: 1
          }
        ];

        for (const doc of defaultDocs) {
          await this.run(
            'INSERT INTO documents (doc_id, title, content, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [doc.doc_id, doc.title, doc.content, doc.published, new Date().toISOString(), new Date().toISOString()]
          );
        }
      }
    } catch (error) {
      logger.error('创建默认文档失败:', error);
    }
  }

  /**
   * 检查数据库是否已经初始化
   */
  async isInitialized() {
    try {
      // 先检查是否有用户表
      const tableExists = await this.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      if (!tableExists) {
        return false;
      }
      
      // 检查是否有初始化标记
      const configTableExists = await this.get("SELECT name FROM sqlite_master WHERE type='table' AND name='configs'");
      if (configTableExists) {
        const initFlag = await this.get('SELECT value FROM configs WHERE key = ?', ['db_initialized']);
        if (initFlag) {
          return true;
        }
      }
      
      // 检查是否有用户数据
      const userCount = await this.get('SELECT COUNT(*) as count FROM users');
      return userCount && userCount.count > 0;
    } catch (error) {
      // 如果查询失败，认为数据库未初始化
      return false;
    }
  }

  /**
   * 标记数据库已初始化
   */
  async markAsInitialized() {
    try {
      await this.run(
        'INSERT OR REPLACE INTO configs (key, value, type, description) VALUES (?, ?, ?, ?)',
        ['db_initialized', 'true', 'boolean', '数据库初始化标记']
      );
      logger.info('数据库已标记为已初始化');
    } catch (error) {
      logger.error('标记数据库初始化状态失败:', error);
    }
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('关闭数据库连接失败:', err);
            reject(err);
          } else {
            logger.info('数据库连接已关闭');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 清理过期的会话
   */
  async cleanExpiredSessions() {
    try {
      const result = await this.run(
        'DELETE FROM sessions WHERE expire < ?',
        [new Date().toISOString()]
      );
      if (result.changes > 0) {
        logger.info(`清理了 ${result.changes} 个过期会话`);
      }
    } catch (error) {
      logger.error('清理过期会话失败:', error);
    }
  }

  /**
   * 创建默认菜单项
   */
  async createDefaultMenuItems() {
    try {
      const menuCount = await this.get('SELECT COUNT(*) as count FROM menu_items');
      
      if (menuCount.count === 0) {
        const defaultMenuItems = [
          { text: '控制台', link: '/admin', new_tab: 0, sort_order: 1 },
          { text: '镜像搜索', link: '/', new_tab: 0, sort_order: 2 },
          { text: '文档', link: '/docs', new_tab: 0, sort_order: 3 },
          { text: 'GitHub', link: 'https://github.com/dqzboy/hubcmdui', new_tab: 1, sort_order: 4 }
        ];

        for (const item of defaultMenuItems) {
          await this.run(
            'INSERT INTO menu_items (text, link, new_tab, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [item.text, item.link, item.new_tab, item.sort_order, 1, new Date().toISOString(), new Date().toISOString()]
          );
        }
      }
    } catch (error) {
      logger.error('创建默认菜单项失败:', error);
    }
  }
}

// 创建数据库实例
const database = new Database();

module.exports = database;

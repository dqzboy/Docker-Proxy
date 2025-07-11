/**
 * 数据库状态检查工具
 */
const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/app.db');

/**
 * 检查数据库是否已完全初始化
 */
async function isDatabaseReady() {
  return new Promise((resolve) => {
    // 检查数据库文件是否存在
    if (!fs.existsSync(DB_PATH)) {
      resolve(false);
      return;
    }

    // 检查文件大小
    try {
      const stats = fs.statSync(DB_PATH);
      if (stats.size < 1024) {
        resolve(false);
        return;
      }
    } catch (error) {
      resolve(false);
      return;
    }

    // 检查数据库结构和数据
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        resolve(false);
        return;
      }

      // 检查必要的表是否存在
      const requiredTables = ['users', 'configs', 'documents'];
      let checkedTables = 0;
      let allTablesReady = true;
      let tablesWithData = 0;

      requiredTables.forEach(tableName => {
        db.get(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          [tableName],
          (err, row) => {
            if (err || !row) {
              allTablesReady = false;
              checkedTables++;
              checkComplete();
              return;
            }

            // 检查表是否有数据（至少用户表和配置表应该有数据）
            if (tableName === 'users' || tableName === 'configs') {
              db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, countRow) => {
                if (err || !countRow || countRow.count === 0) {
                  allTablesReady = false;
                } else {
                  tablesWithData++;
                }
                checkedTables++;
                checkComplete();
              });
            } else {
              checkedTables++;
              checkComplete();
            }
          }
        );
      });

      function checkComplete() {
        if (checkedTables === requiredTables.length) {
          db.close((err) => {
            // 需要至少用户表和配置表有数据
            resolve(allTablesReady && tablesWithData >= 2);
          });
        }
      }
    });
  });
}

/**
 * 获取数据库统计信息
 */
async function getDatabaseStats() {
  return new Promise((resolve) => {
    if (!fs.existsSync(DB_PATH)) {
      resolve(null);
      return;
    }

    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        resolve(null);
        return;
      }

      const stats = {};
      let completedQueries = 0;
      const tables = ['users', 'configs', 'documents'];

      tables.forEach(table => {
        db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
          completedQueries++;
          if (!err && row) {
            stats[table] = row.count;
          } else {
            stats[table] = 0;
          }

          if (completedQueries === tables.length) {
            db.close();
            resolve(stats);
          }
        });
      });
    });
  });
}

module.exports = {
  isDatabaseReady,
  getDatabaseStats
};

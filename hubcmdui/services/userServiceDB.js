/**
 * 基于SQLite的用户服务模块
 */
const bcrypt = require('bcrypt');
const logger = require('../logger');
const database = require('../database/database');

class UserServiceDB {
  /**
   * 获取所有用户
   */
  async getUsers() {
    try {
      const users = await database.all('SELECT * FROM users ORDER BY created_at DESC');
      return { users };
    } catch (error) {
      logger.error('获取用户列表失败:', error);
      throw error;
    }
  }

  /**
   * 通过用户名获取用户
   */
  async getUserByUsername(username) {
    try {
      return await database.get('SELECT * FROM users WHERE username = ?', [username]);
    } catch (error) {
      logger.error('获取用户失败:', error);
      throw error;
    }
  }

  /**
   * 创建新用户
   */
  async createUser(username, password) {
    try {
      // 检查用户是否已存在
      const existingUser = await this.getUserByUsername(username);
      if (existingUser) {
        throw new Error('用户名已存在');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await database.run(
        'INSERT INTO users (username, password, created_at, login_count, last_login) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, new Date().toISOString(), 0, null]
      );

      return { success: true, username, id: result.id };
    } catch (error) {
      logger.error('创建用户失败:', error);
      throw error;
    }
  }

  /**
   * 更新用户登录信息
   */
  async updateUserLoginInfo(username) {
    try {
      const user = await this.getUserByUsername(username);
      if (user) {
        await database.run(
          'UPDATE users SET login_count = login_count + 1, last_login = ? WHERE username = ?',
          [new Date().toISOString(), username]
        );
      }
    } catch (error) {
      logger.error('更新用户登录信息失败:', error);
    }
  }

  /**
   * 获取用户统计信息
   */
  async getUserStats(username) {
    try {
      const user = await this.getUserByUsername(username);
      
      if (!user) {
        return { loginCount: '0', lastLogin: '未知', accountAge: '0' };
      }

      // 计算账户年龄
      let accountAge = '0';
      if (user.created_at) {
        const createdDate = new Date(user.created_at);
        const currentDate = new Date();
        const diffTime = Math.abs(currentDate - createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        accountAge = diffDays.toString();
      }

      // 格式化最后登录时间
      let lastLogin = '未知';
      if (user.last_login) {
        const lastLoginDate = new Date(user.last_login);
        const now = new Date();
        const isToday = lastLoginDate.toDateString() === now.toDateString();
        
        if (isToday) {
          lastLogin = '今天 ' + lastLoginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          lastLogin = lastLoginDate.toLocaleDateString() + ' ' + lastLoginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }

      return {
        username: user.username,
        loginCount: (user.login_count || 0).toString(),
        lastLogin,
        accountAge
      };
    } catch (error) {
      logger.error('获取用户统计信息失败:', error);
      return { loginCount: '0', lastLogin: '未知', accountAge: '0' };
    }
  }

  /**
   * 修改用户密码
   */
  async changePassword(username, currentPassword, newPassword) {
    try {
      const user = await this.getUserByUsername(username);
      
      if (!user) {
        throw new Error('用户不存在');
      }

      // 验证当前密码
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        throw new Error('当前密码不正确');
      }

      // 验证新密码复杂度
      if (!this.isPasswordComplex(newPassword)) {
        throw new Error('新密码不符合复杂度要求');
      }

      // 更新密码
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await database.run(
        'UPDATE users SET password = ?, updated_at = ? WHERE username = ?',
        [hashedNewPassword, new Date().toISOString(), username]
      );

      logger.info(`用户 ${username} 密码已成功修改`);
    } catch (error) {
      logger.error('修改密码失败:', error);
      throw error;
    }
  }

  /**
   * 修改用户名
   */
  async changeUsername(currentUsername, newUsername, password) {
    try {
      const user = await this.getUserByUsername(currentUsername);
      
      if (!user) {
        throw new Error('用户不存在');
      }

      // 验证密码
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new Error('密码不正确');
      }

      // 验证新用户名格式
      if (!this.isUsernameValid(newUsername)) {
        throw new Error('用户名格式不正确（3-20位，只能包含字母、数字和下划线）');
      }

      // 检查新用户名是否已存在
      const existingUser = await this.getUserByUsername(newUsername);
      if (existingUser) {
        throw new Error('该用户名已被使用');
      }

      // 更新用户名
      await database.run(
        'UPDATE users SET username = ?, updated_at = ? WHERE username = ?',
        [newUsername, new Date().toISOString(), currentUsername]
      );

      logger.info(`用户 ${currentUsername} 已成功修改用户名为 ${newUsername}`);
      return { success: true, newUsername };
    } catch (error) {
      logger.error('修改用户名失败:', error);
      throw error;
    }
  }

  /**
   * 验证用户名格式
   */
  isUsernameValid(username) {
    // 3-20位，只能包含字母、数字和下划线
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
  }

  /**
   * 验证密码复杂度
   */
  isPasswordComplex(password) {
    // 至少包含1个字母、1个数字和1个特殊字符，长度在8-16位之间
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
    return passwordRegex.test(password);
  }

  /**
   * 验证用户登录
   */
  async validateUser(username, password) {
    try {
      const user = await this.getUserByUsername(username);
      if (!user) {
        return null;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        return user;
      }
      
      return null;
    } catch (error) {
      logger.error('验证用户失败:', error);
      throw error;
    }
  }

  /**
   * 生成密码重置令牌
   * 返回一个临时令牌，存储在内存中，有效期10分钟
   */
  generateResetToken(username) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 10 * 60 * 1000; // 10分钟有效期
    
    // 存储在内存中（简单实现）
    if (!this.resetTokens) {
      this.resetTokens = {};
    }
    
    this.resetTokens[token] = {
      username,
      expiry
    };
    
    // 清理过期令牌
    this.cleanExpiredTokens();
    
    logger.info(`为用户 ${username} 生成了密码重置令牌`);
    return token;
  }

  /**
   * 清理过期的重置令牌
   */
  cleanExpiredTokens() {
    if (!this.resetTokens) return;
    
    const now = Date.now();
    for (const token in this.resetTokens) {
      if (this.resetTokens[token].expiry < now) {
        delete this.resetTokens[token];
      }
    }
  }

  /**
   * 验证重置令牌
   */
  validateResetToken(token) {
    if (!this.resetTokens || !this.resetTokens[token]) {
      return null;
    }
    
    const tokenData = this.resetTokens[token];
    if (tokenData.expiry < Date.now()) {
      delete this.resetTokens[token];
      return null;
    }
    
    return tokenData.username;
  }

  /**
   * 使用令牌重置密码
   */
  async resetPasswordWithToken(token, newPassword) {
    try {
      const username = this.validateResetToken(token);
      if (!username) {
        throw new Error('重置令牌无效或已过期');
      }

      // 验证新密码复杂度
      if (!this.isPasswordComplex(newPassword)) {
        throw new Error('新密码不符合复杂度要求（需要8-16位，包含字母、数字和特殊字符）');
      }

      const user = await this.getUserByUsername(username);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 更新密码
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await database.run(
        'UPDATE users SET password = ?, updated_at = ? WHERE username = ?',
        [hashedNewPassword, new Date().toISOString(), username]
      );

      // 删除使用过的令牌
      delete this.resetTokens[token];
      
      logger.info(`用户 ${username} 密码已通过重置令牌成功修改`);
      return { success: true, username };
    } catch (error) {
      logger.error('重置密码失败:', error);
      throw error;
    }
  }

  /**
   * 直接重置用户密码（管理员功能，无需旧密码）
   * 用于忘记密码时，通过验证用户名来重置
   */
  async forceResetPassword(username, newPassword) {
    try {
      const user = await this.getUserByUsername(username);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 验证新密码复杂度
      if (!this.isPasswordComplex(newPassword)) {
        throw new Error('新密码不符合复杂度要求（需要8-16位，包含字母、数字和特殊字符）');
      }

      // 更新密码
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await database.run(
        'UPDATE users SET password = ?, updated_at = ? WHERE username = ?',
        [hashedNewPassword, new Date().toISOString(), username]
      );

      logger.info(`用户 ${username} 密码已被强制重置`);
      return { success: true };
    } catch (error) {
      logger.error('强制重置密码失败:', error);
      throw error;
    }
  }
}

module.exports = new UserServiceDB();

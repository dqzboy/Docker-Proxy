/**
 * 基于SQLite的文档服务模块
 */
const logger = require('../logger');
const database = require('../database/database');

class DocumentationServiceDB {
  /**
   * 获取文档列表
   */
  async getDocumentationList() {
    try {
      const documents = await database.all(
        'SELECT doc_id, title, published, created_at, updated_at FROM documents ORDER BY updated_at DESC'
      );
      
      return documents.map(doc => ({
        id: doc.doc_id,
        title: doc.title,
        published: Boolean(doc.published),
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }));
    } catch (error) {
      logger.error('获取文档列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取已发布文档列表
   */
  async getPublishedDocuments() {
    try {
      const documents = await database.all(
        'SELECT doc_id, title, published, created_at, updated_at FROM documents WHERE published = 1 ORDER BY updated_at DESC'
      );
      
      return documents.map(doc => ({
        id: doc.doc_id,
        title: doc.title,
        published: Boolean(doc.published),
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }));
    } catch (error) {
      logger.error('获取已发布文档列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个文档
   */
  async getDocument(docId) {
    try {
      const document = await database.get(
        'SELECT * FROM documents WHERE doc_id = ?',
        [docId]
      );
      
      if (!document) {
        return null;
      }
      
      return {
        id: document.doc_id,
        title: document.title,
        content: document.content,
        published: Boolean(document.published),
        createdAt: document.created_at,
        updatedAt: document.updated_at
      };
    } catch (error) {
      logger.error(`获取文档 ${docId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 保存文档
   */
  async saveDocument(docId, title, content, published = false) {
    try {
      const id = docId || Date.now().toString();
      const now = new Date().toISOString();
      
      const existingDoc = await database.get(
        'SELECT id FROM documents WHERE doc_id = ?',
        [id]
      );
      
      if (existingDoc) {
        // 更新现有文档
        await database.run(
          'UPDATE documents SET title = ?, content = ?, published = ?, updated_at = ? WHERE doc_id = ?',
          [title, content, published ? 1 : 0, now, id]
        );
        logger.info(`文档 ${id} 已更新`);
      } else {
        // 创建新文档
        await database.run(
          'INSERT INTO documents (doc_id, title, content, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, title, content, published ? 1 : 0, now, now]
        );
        logger.info(`文档 ${id} 已创建`);
      }
      
      return {
        id,
        title,
        content,
        published: Boolean(published),
        createdAt: existingDoc ? existingDoc.created_at : now,
        updatedAt: now
      };
    } catch (error) {
      logger.error('保存文档失败:', error);
      throw error;
    }
  }

  /**
   * 删除文档
   */
  async deleteDocument(docId) {
    try {
      const result = await database.run(
        'DELETE FROM documents WHERE doc_id = ?',
        [docId]
      );
      
      if (result.changes === 0) {
        throw new Error(`文档 ${docId} 不存在`);
      }
      
      logger.info(`文档 ${docId} 已删除`);
      return true;
    } catch (error) {
      logger.error(`删除文档 ${docId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 切换文档发布状态
   */
  async toggleDocumentPublish(docId) {
    try {
      const document = await this.getDocument(docId);
      const newPublishedStatus = !document.published;
      
      await database.run(
        'UPDATE documents SET published = ?, updated_at = ? WHERE doc_id = ?',
        [newPublishedStatus ? 1 : 0, new Date().toISOString(), docId]
      );
      
      logger.info(`文档 ${docId} 发布状态已切换为: ${newPublishedStatus}`);
      
      return {
        ...document,
        published: newPublishedStatus,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`切换文档 ${docId} 发布状态失败:`, error);
      throw error;
    }
  }

  /**
   * 批量更新文档发布状态
   */
  async batchUpdatePublishStatus(docIds, published) {
    try {
      const placeholders = docIds.map(() => '?').join(',');
      const params = [...docIds, published ? 1 : 0, new Date().toISOString()];
      
      const result = await database.run(
        `UPDATE documents SET published = ?, updated_at = ? WHERE doc_id IN (${placeholders})`,
        params
      );
      
      logger.info(`批量更新 ${result.changes} 个文档的发布状态`);
      return result.changes;
    } catch (error) {
      logger.error('批量更新文档发布状态失败:', error);
      throw error;
    }
  }

  /**
   * 搜索文档
   */
  async searchDocuments(keyword, publishedOnly = false) {
    try {
      let sql = 'SELECT doc_id, title, published, created_at, updated_at FROM documents WHERE (title LIKE ? OR content LIKE ?)';
      const params = [`%${keyword}%`, `%${keyword}%`];
      
      if (publishedOnly) {
        sql += ' AND published = 1';
      }
      
      sql += ' ORDER BY updated_at DESC';
      
      const documents = await database.all(sql, params);
      
      return documents.map(doc => ({
        id: doc.doc_id,
        title: doc.title,
        published: Boolean(doc.published),
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
      }));
    } catch (error) {
      logger.error('搜索文档失败:', error);
      throw error;
    }
  }

  /**
   * 获取文档统计信息
   */
  async getDocumentStats() {
    try {
      const totalCount = await database.get('SELECT COUNT(*) as count FROM documents');
      const publishedCount = await database.get('SELECT COUNT(*) as count FROM documents WHERE published = 1');
      const unpublishedCount = await database.get('SELECT COUNT(*) as count FROM documents WHERE published = 0');
      
      return {
        total: totalCount.count,
        published: publishedCount.count,
        unpublished: unpublishedCount.count
      };
    } catch (error) {
      logger.error('获取文档统计信息失败:', error);
      throw error;
    }
  }
}

module.exports = new DocumentationServiceDB();

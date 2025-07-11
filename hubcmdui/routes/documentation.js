/**
 * 文档管理路由 - 使用SQLite数据库
 */
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');
const documentationServiceDB = require('../services/documentationServiceDB');

// 获取所有文档列表（管理员）
router.get('/documents', requireLogin, async (req, res) => {
    try {
        const documents = await documentationServiceDB.getDocumentationList();
        res.json(documents);
    } catch (err) {
        logger.error('获取文档列表失败:', err);
        res.status(500).json({ error: '获取文档列表失败' });
    }
});

// 获取已发布文档列表（公开）
router.get('/published', async (req, res) => {
    try {
        const documents = await documentationServiceDB.getPublishedDocuments();
        res.json(documents);
    } catch (err) {
        logger.error('获取已发布文档列表失败:', err);
        res.status(500).json({ error: '获取已发布文档列表失败' });
    }
});

// 获取单个文档
router.get('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const document = await documentationServiceDB.getDocument(id);
        
        if (!document) {
            return res.status(404).json({ error: '文档不存在' });
        }
        
        // 如果文档未发布，需要登录权限
        if (!document.published && !req.session.user) {
            return res.status(403).json({ error: '没有权限访问该文档' });
        }
        
        res.json(document);
    } catch (err) {
        logger.error('获取文档失败:', err);
        res.status(500).json({ error: '获取文档失败' });
    }
});

// 保存文档
router.put('/documents/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, published } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ error: '标题和内容为必填项' });
        }
        
        const document = await documentationServiceDB.saveDocument(id, title, content, published);
        res.json(document);
    } catch (err) {
        logger.error('保存文档失败:', err);
        res.status(500).json({ error: '保存文档失败' });
    }
});

// 创建新文档
router.post('/documents', requireLogin, async (req, res) => {
    try {
        const { title, content, published } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ error: '标题和内容为必填项' });
        }
        
        const id = Date.now().toString();
        const document = await documentationServiceDB.saveDocument(id, title, content, published);
        res.status(201).json(document);
    } catch (err) {
        logger.error('创建文档失败:', err);
        res.status(500).json({ error: '创建文档失败' });
    }
});

// 删除文档
router.delete('/documents/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const success = await documentationServiceDB.deleteDocument(id);
        if (!success) {
            return res.status(404).json({ error: '文档不存在' });
        }
        
        res.json({ success: true, message: '文档已删除' });
    } catch (err) {
        logger.error('删除文档失败:', err);
        res.status(500).json({ error: '删除文档失败' });
    }
});

// 切换文档发布状态
router.put('/toggle-publish/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const document = await documentationServiceDB.toggleDocumentPublish(id);
        res.json(document);
    } catch (err) {
        logger.error('切换文档发布状态失败:', err);
        res.status(500).json({ error: '切换文档发布状态失败' });
    }
});

module.exports = router;

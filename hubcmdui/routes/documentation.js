/**
 * 文档管理路由
 */
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');
const { requireLogin } = require('../middleware/auth');

// 确保文档目录存在
const docsDir = path.join(__dirname, '../documentation');
const metaDir = path.join(docsDir, 'meta');

// 文档文件扩展名
const FILE_EXTENSION = '.md';
const META_EXTENSION = '.json';

// 确保目录存在
async function ensureDirectories() {
    try {
        await fs.mkdir(docsDir, { recursive: true });
        await fs.mkdir(metaDir, { recursive: true });
    } catch (err) {
        logger.error('创建文档目录失败:', err);
    }
}

// 读取文档元数据
async function getDocumentMeta(id) {
    const metaPath = path.join(metaDir, `${id}${META_EXTENSION}`);
    try {
        const metaContent = await fs.readFile(metaPath, 'utf8');
        return JSON.parse(metaContent);
    } catch (err) {
        // 如果元数据文件不存在，返回默认值
        return {
            id,
            published: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
}

// 保存文档元数据
async function saveDocumentMeta(id, metadata) {
    await ensureDirectories();
    const metaPath = path.join(metaDir, `${id}${META_EXTENSION}`);
    const metaContent = JSON.stringify(metadata, null, 2);
    await fs.writeFile(metaPath, metaContent);
}

// 初始化确保目录存在，但不再创建默认文档
(async function() {
    try {
        await ensureDirectories();
        logger.info('文档目录已初始化');
    } catch (error) {
        logger.error('初始化文档目录失败:', error);
    }
})();

// 获取所有文档列表
router.get('/documents', async (req, res) => {
    try {
        let files;
        try {
            files = await fs.readdir(docsDir);
        } catch (err) {
            // 如果目录不存在，尝试创建它并返回空列表
            if (err.code === 'ENOENT') {
                await fs.mkdir(docsDir, { recursive: true });
                files = [];
            } else {
                throw err;
            }
        }
        
        const documents = [];
        for (const file of files) {
            if (file.endsWith(FILE_EXTENSION)) {
                const filePath = path.join(docsDir, file);
                const stats = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf8');
                const id = file.replace(FILE_EXTENSION, '');
                
                // 读取元数据
                const metadata = await getDocumentMeta(id);
                
                // 解析文档元数据（简单实现）
                const titleMatch = content.match(/^#\s+(.*)$/m);
                const title = titleMatch ? titleMatch[1] : id;
                
                documents.push({
                    id,
                    title,
                    content,
                    createdAt: metadata.createdAt || stats.birthtime,
                    updatedAt: metadata.updatedAt || stats.mtime,
                    published: metadata.published || false
                });
            }
        }
        
        res.json(documents);
    } catch (err) {
        logger.error('获取文档列表失败:', err);
        res.status(500).json({ error: '获取文档列表失败' });
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
        
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        
        // 确保文档目录存在
        await ensureDirectories();
        
        // 获取或创建元数据
        const metadata = await getDocumentMeta(id);
        metadata.title = title;
        metadata.published = typeof published === 'boolean' ? published : metadata.published;
        metadata.updatedAt = new Date().toISOString();
        
        // 保存文档内容
        await fs.writeFile(filePath, content);
        
        // 保存元数据
        await saveDocumentMeta(id, metadata);
        
        // 获取文件状态
        const stats = await fs.stat(filePath);
        const document = {
            id,
            title,
            content,
            createdAt: metadata.createdAt,
            updatedAt: new Date().toISOString(),
            published: metadata.published
        };
        
        res.json(document);
    } catch (err) {
        logger.error('保存文档失败:', err);
        res.status(500).json({ error: '保存文档失败', details: err.message });
    }
});

// 创建新文档
router.post('/documents', requireLogin, async (req, res) => {
    try {
        const { title, content, published } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ error: '标题和内容为必填项' });
        }
        
        // 生成唯一ID
        const id = Date.now().toString();
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        
        // 确保文档目录存在
        await ensureDirectories();
        
        // 创建元数据
        const now = new Date().toISOString();
        const metadata = {
            id,
            title,
            published: typeof published === 'boolean' ? published : false,
            createdAt: now,
            updatedAt: now
        };
        
        // 保存文档内容
        await fs.writeFile(filePath, content);
        
        // 保存元数据
        await saveDocumentMeta(id, metadata);
        
        const document = {
            id,
            title,
            content,
            createdAt: now,
            updatedAt: now,
            published: metadata.published
        };
        
        res.status(201).json(document);
    } catch (err) {
        logger.error('创建文档失败:', err);
        res.status(500).json({ error: '创建文档失败', details: err.message });
    }
});

// 删除文档
router.delete('/documents/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        const metaPath = path.join(metaDir, `${id}${META_EXTENSION}`);
        
        let success = false;
        
        // 尝试删除主文档文件
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            success = true;
            logger.info(`文档 ${id} 已成功删除`);
        } catch (err) {
            logger.warn(`删除文档文件 ${id} 失败:`, err);
        }
        
        // 尝试删除元数据文件
        try {
            await fs.access(metaPath);
            await fs.unlink(metaPath);
            success = true;
            logger.info(`文档元数据 ${id} 已成功删除`);
        } catch (err) {
            logger.warn(`删除文档元数据 ${id} 失败:`, err);
        }
        
        if (success) {
            res.json({ success: true });
        } else {
            throw new Error('文档和元数据均不存在或无法删除');
        }
    } catch (err) {
        logger.error(`删除文档 ${req.params.id} 失败:`, err);
        res.status(500).json({ error: '删除文档失败', details: err.message });
    }
});

// 获取单个文档
router.get('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        
        // 检查文件是否存在
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.status(404).json({ error: '文档不存在' });
        }
        
        // 读取文件内容和元数据
        const content = await fs.readFile(filePath, 'utf8');
        const metadata = await getDocumentMeta(id);
        
        // 解析文档标题
        const titleMatch = content.match(/^#\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1] : metadata.title || id;
        
        const document = {
            id,
            title,
            content,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            published: metadata.published
        };
        
        res.json(document);
    } catch (err) {
        logger.error(`获取文档 ${req.params.id} 失败:`, err);
        res.status(500).json({ error: '获取文档失败', details: err.message });
    }
});

// 更新文档发布状态
router.put('/documentation/toggle-publish/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const { published } = req.body;
        
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        
        // 检查文件是否存在
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.status(404).json({ error: '文档不存在' });
        }
        
        // 读取文件内容和元数据
        const content = await fs.readFile(filePath, 'utf8');
        const metadata = await getDocumentMeta(id);
        
        // 更新元数据
        metadata.published = typeof published === 'boolean' ? published : !metadata.published;
        metadata.updatedAt = new Date().toISOString();
        
        // 保存元数据
        await saveDocumentMeta(id, metadata);
        
        // 解析文档标题
        const titleMatch = content.match(/^#\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1] : metadata.title || id;
        
        const document = {
            id,
            title,
            content,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            published: metadata.published
        };
        
        res.json(document);
    } catch (err) {
        logger.error(`更新文档状态 ${req.params.id} 失败:`, err);
        res.status(500).json({ error: '更新文档状态失败', details: err.message });
    }
});

// 为前端添加获取已发布文档列表的路由
router.get('/documentation', async (req, res) => {
    try {
        let files;
        try {
            files = await fs.readdir(docsDir);
        } catch (err) {
            if (err.code === 'ENOENT') {
                await fs.mkdir(docsDir, { recursive: true });
                files = [];
            } else {
                throw err;
            }
        }
        
        const documents = [];
        for (const file of files) {
            if (file.endsWith(FILE_EXTENSION)) {
                const filePath = path.join(docsDir, file);
                const stats = await fs.stat(filePath);
                const id = file.replace(FILE_EXTENSION, '');
                
                // 读取元数据
                const metadata = await getDocumentMeta(id);
                
                // 如果发布状态为true，则包含在返回结果中
                if (metadata.published === true) {
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    // 解析文档标题
                    const titleMatch = content.match(/^#\s+(.*)$/m);
                    const title = titleMatch ? titleMatch[1] : metadata.title || id;
                    
                    documents.push({
                        id,
                        title,
                        createdAt: metadata.createdAt || stats.birthtime,
                        updatedAt: metadata.updatedAt || stats.mtime,
                        published: true
                    });
                }
            }
        }
        
        logger.info(`前端请求文档列表，返回 ${documents.length} 个已发布文档`);
        res.json(documents);
    } catch (err) {
        logger.error('获取前端文档列表失败:', err);
        res.status(500).json({ error: '获取文档列表失败' });
    }
});

// 前端获取单个文档内容
router.get('/documentation/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        
        // 检查文件是否存在
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.status(404).json({ error: '文档不存在' });
        }
        
        // 读取文件内容和元数据
        const content = await fs.readFile(filePath, 'utf8');
        const metadata = await getDocumentMeta(id);
        
        // 如果文档未发布，则不允许前端访问
        if (metadata.published !== true) {
            return res.status(403).json({ error: '该文档未发布，无法访问' });
        }
        
        // 解析文档标题
        const titleMatch = content.match(/^#\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1] : metadata.title || id;
        
        const document = {
            id,
            title,
            content,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            published: true
        };
        
        logger.info(`前端请求文档: ${id} - ${title}`);
        res.json(document);
    } catch (err) {
        logger.error(`获取前端文档内容 ${req.params.id} 失败:`, err);
        res.status(500).json({ error: '获取文档内容失败', details: err.message });
    }
});

// 修改发布状态
router.patch('/documents/:id/publish', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const { published } = req.body;
        
        if (typeof published !== 'boolean') {
            return res.status(400).json({ error: '发布状态必须为布尔值' });
        }
        
        // 获取或创建元数据
        const metadata = await getDocumentMeta(id);
        metadata.published = published;
        metadata.updatedAt = new Date().toISOString();
        
        // 保存元数据
        await saveDocumentMeta(id, metadata);
        
        // 获取文档内容
        const filePath = path.join(docsDir, `${id}${FILE_EXTENSION}`);
        let content;
        try {
            content = await fs.readFile(filePath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: '文档不存在' });
            }
            throw err;
        }
        
        // 解析标题
        const titleMatch = content.match(/^#\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1] : id;
        
        // 返回更新后的文档信息
        const document = {
            id,
            title,
            content,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            published: metadata.published
        };
        
        res.json(document);
    } catch (err) {
        logger.error('修改发布状态失败:', err);
        res.status(500).json({ error: '修改发布状态失败', details: err.message });
    }
});

// 获取单个文档文件内容
router.get('/file', async (req, res) => {
    try {
        const filePath = req.query.path;
        
        if (!filePath) {
            return res.status(400).json({ error: '文件路径不能为空' });
        }
        
        logger.info(`请求获取文档文件: ${filePath}`);
        
        // 尝试直接从文件系统读取文件
        try {
            // 安全检查，确保只能访问documentation目录下的文件
            const fileName = path.basename(filePath);
            const fileDir = path.dirname(filePath);
            
            // 构建完整路径（只允许访问documentation目录）
            const fullPath = path.join(__dirname, '..', 'documentation', fileName);
            
            logger.info(`尝试读取文件: ${fullPath}`);
            
            // 检查文件是否存在
            const fileExists = await fs.access(fullPath)
                .then(() => true)
                .catch(() => false);
            
            // 如果文件不存在，则返回错误
            if (!fileExists) {
                logger.warn(`文件不存在: ${fullPath}`);
                return res.status(404).json({ error: '文档不存在' });
            }
            
            logger.info(`文件存在，开始读取: ${fullPath}`);
            
            // 读取文件内容
            const fileContent = await fs.readFile(fullPath, 'utf8');
            
            // 设置适当的Content-Type
            if (fileName.endsWith('.md')) {
                res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            } else if (fileName.endsWith('.json')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
            } else {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            }
            
            logger.info(`成功读取文件，内容长度: ${fileContent.length}`);
            return res.send(fileContent);
        } catch (error) {
            logger.error(`读取文件失败: ${error.message}`, error);
            return res.status(500).json({ error: `读取文件失败: ${error.message}` });
        }
        
    } catch (error) {
        logger.error('获取文档文件失败:', error);
        res.status(500).json({ error: '获取文档文件失败', details: error.message });
    }
});

// 导出路由
logger.success('✓ 文档管理路由已加载');
module.exports = router;

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 文档存储目录
const DOCUMENTATION_DIR = path.join(__dirname, '..', 'data', 'documentation');

/**
 * 确保文档目录存在
 */
async function ensureDocumentationDirExists() {
    if (!fs.existsSync(DOCUMENTATION_DIR)) {
        await fs.promises.mkdir(DOCUMENTATION_DIR, { recursive: true });
        console.log(`创建文档目录: ${DOCUMENTATION_DIR}`);
    }
}

/**
 * 获取文档列表
 * @returns {Promise<Array>} 文档列表
 */
async function getDocumentList() {
    try {
        await ensureDocumentationDirExists();
        
        // 检查索引文件是否存在
        const indexPath = path.join(DOCUMENTATION_DIR, 'index.json');
        if (!fs.existsSync(indexPath)) {
            // 创建空索引，不再添加默认文档
            await fs.promises.writeFile(indexPath, JSON.stringify([]), 'utf8');
            console.log('创建了空的文档索引文件');
            return [];
        }
        
        // 读取索引文件
        const data = await fs.promises.readFile(indexPath, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        console.error('获取文档列表失败:', error);
        return [];
    }
}

/**
 * 保存文档列表
 * @param {Array} docList 文档列表
 */
async function saveDocumentList(docList) {
    try {
        await ensureDocumentationDirExists();
        
        const indexPath = path.join(DOCUMENTATION_DIR, 'index.json');
        await fs.promises.writeFile(indexPath, JSON.stringify(docList, null, 2), 'utf8');
        console.log('文档列表已更新');
    } catch (error) {
        console.error('保存文档列表失败:', error);
        throw error;
    }
}

/**
 * 获取单个文档的内容
 * @param {string} docId 文档ID
 * @returns {Promise<string>} 文档内容
 */
async function getDocumentContent(docId) {
    try {
        console.log(`尝试获取文档内容，ID: ${docId}`);
        
        // 确保文档目录存在
        await ensureDocumentationDirExists();
        
        // 获取文档列表
        const docList = await getDocumentList();
        const doc = docList.find(doc => doc.id === docId || doc._id === docId);
        
        if (!doc) {
            throw new Error(`文档不存在，ID: ${docId}`);
        }
        
        // 构建文档路径
        const docPath = path.join(DOCUMENTATION_DIR, `${docId}.md`);
        
        // 检查文件是否存在
        if (!fs.existsSync(docPath)) {
            return ''; // 文件不存在，返回空内容
        }
        
        // 读取文档内容
        const content = await fs.promises.readFile(docPath, 'utf8');
        console.log(`成功读取文档内容，ID: ${docId}, 内容长度: ${content.length}`);
        
        return content;
    } catch (error) {
        console.error(`获取文档内容失败，ID: ${docId}`, error);
        throw error;
    }
}

/**
 * 创建或更新文档
 * @param {Object} doc 文档对象
 * @param {string} content 文档内容
 * @returns {Promise<Object>} 保存后的文档
 */
async function saveDocument(doc, content) {
    try {
        await ensureDocumentationDirExists();
        
        // 获取现有文档列表
        const docList = await getDocumentList();
        
        // 为新文档生成ID
        if (!doc.id) {
            doc.id = uuidv4();
        }
        
        // 更新文档元数据
        doc.lastUpdated = new Date().toISOString();
        
        // 查找现有文档索引
        const existingIndex = docList.findIndex(item => item.id === doc.id);
        
        if (existingIndex >= 0) {
            // 更新现有文档
            docList[existingIndex] = { ...docList[existingIndex], ...doc };
        } else {
            // 添加新文档
            docList.push(doc);
        }
        
        // 保存文档内容
        const docPath = path.join(DOCUMENTATION_DIR, `${doc.id}.md`);
        await fs.promises.writeFile(docPath, content || '', 'utf8');
        
        // 更新文档列表
        await saveDocumentList(docList);
        
        return doc;
    } catch (error) {
        console.error('保存文档失败:', error);
        throw error;
    }
}

/**
 * 删除文档
 * @param {string} docId 文档ID
 * @returns {Promise<boolean>} 删除结果
 */
async function deleteDocument(docId) {
    try {
        await ensureDocumentationDirExists();
        
        // 获取现有文档列表
        const docList = await getDocumentList();
        
        // 查找文档索引
        const existingIndex = docList.findIndex(doc => doc.id === docId);
        
        if (existingIndex === -1) {
            return false; // 文档不存在
        }
        
        // 从列表中移除
        docList.splice(existingIndex, 1);
        
        // 删除文档文件
        const docPath = path.join(DOCUMENTATION_DIR, `${docId}.md`);
        if (fs.existsSync(docPath)) {
            await fs.promises.unlink(docPath);
        }
        
        // 更新文档列表
        await saveDocumentList(docList);
        
        return true;
    } catch (error) {
        console.error('删除文档失败:', error);
        throw error;
    }
}

/**
 * 发布或取消发布文档
 * @param {string} docId 文档ID
 * @param {boolean} publishState 发布状态
 * @returns {Promise<Object>} 更新后的文档
 */
async function togglePublishState(docId, publishState) {
    try {
        // 获取现有文档列表
        const docList = await getDocumentList();
        
        // 查找文档索引
        const existingIndex = docList.findIndex(doc => doc.id === docId);
        
        if (existingIndex === -1) {
            throw new Error('文档不存在');
        }
        
        // 更新发布状态
        docList[existingIndex].published = !!publishState;
        docList[existingIndex].lastUpdated = new Date().toISOString();
        
        // 更新文档列表
        await saveDocumentList(docList);
        
        return docList[existingIndex];
    } catch (error) {
        console.error('更新文档发布状态失败:', error);
        throw error;
    }
}

module.exports = {
    ensureDocumentationDirExists,
    getDocumentList,
    saveDocumentList,
    getDocumentContent,
    saveDocument,
    deleteDocument,
    togglePublishState
}; 
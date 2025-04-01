/**
 * 文档服务模块 - 处理文档管理功能
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

const DOCUMENTATION_DIR = path.join(__dirname, '..', 'documentation');
const META_DIR = path.join(DOCUMENTATION_DIR, 'meta');

// 确保文档目录存在
async function ensureDocumentationDir() {
  try {
    await fs.access(DOCUMENTATION_DIR);
    logger.debug('文档目录已存在');
    
    // 确保meta目录存在
    try {
      await fs.access(META_DIR);
      logger.debug('文档meta目录已存在');
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(META_DIR, { recursive: true });
        logger.success('文档meta目录已创建');
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(DOCUMENTATION_DIR, { recursive: true });
      logger.success('文档目录已创建');
      
      // 创建meta目录
      await fs.mkdir(META_DIR, { recursive: true });
      logger.success('文档meta目录已创建');
    } else {
      throw error;
    }
  }
}

// 获取文档列表
async function getDocumentationList() {
  try {
    await ensureDocumentationDir();
    const files = await fs.readdir(DOCUMENTATION_DIR);
    
    const documents = await Promise.all(files.map(async file => {
      // 跳过目录和非文档文件
      if (file === 'meta' || file.startsWith('.')) return null;
      
      // 处理JSON文件
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(DOCUMENTATION_DIR, file);
          const content = await fs.readFile(filePath, 'utf8');
          const doc = JSON.parse(content);
          return {
            id: path.parse(file).name,
            title: doc.title,
            published: doc.published,
            createdAt: doc.createdAt || new Date().toISOString(),
            updatedAt: doc.updatedAt || new Date().toISOString()
          };
        } catch (fileError) {
          logger.error(`读取JSON文档文件 ${file} 失败:`, fileError);
          return null;
        }
      } 
      
      // 处理MD文件
      if (file.endsWith('.md')) {
        try {
          const id = path.parse(file).name;
          let metaData = { published: true, title: path.parse(file).name };
          
          // 尝试读取meta数据
          try {
            const metaPath = path.join(META_DIR, `${id}.json`);
            const metaContent = await fs.readFile(metaPath, 'utf8');
            metaData = { ...metaData, ...JSON.parse(metaContent) };
          } catch (metaError) {
            // meta文件不存在或无法解析，使用默认值
            logger.warn(`无法读取文档 ${id} 的meta数据:`, metaError.message);
          }
          
          // 确保有发布状态
          if (typeof metaData.published !== 'boolean') {
            metaData.published = true;
          }
          
          return {
            id,
            title: metaData.title || id,
            path: file,  // 不直接加载内容，而是提供路径
            published: metaData.published,
            createdAt: metaData.createdAt || new Date().toISOString(),
            updatedAt: metaData.updatedAt || new Date().toISOString()
          };
        } catch (mdError) {
          logger.error(`处理MD文档 ${file} 失败:`, mdError);
          return null;
        }
      }
      
      return null;
    }));
    
    return documents.filter(doc => doc !== null);
  } catch (error) {
    logger.error('获取文档列表失败:', error);
    throw error;
  }
}

// 获取已发布文档
async function getPublishedDocuments() {
  const documents = await getDocumentationList();
  return documents.filter(doc => doc.published);
}

// 获取单个文档
async function getDocument(id) {
  try {
    await ensureDocumentationDir();
    
    // 首先尝试读取JSON文件
    try {
      const jsonPath = path.join(DOCUMENTATION_DIR, `${id}.json`);
      const jsonContent = await fs.readFile(jsonPath, 'utf8');
      return JSON.parse(jsonContent);
    } catch (jsonError) {
      // JSON文件不存在，尝试读取MD文件
      if (jsonError.code === 'ENOENT') {
        const mdPath = path.join(DOCUMENTATION_DIR, `${id}.md`);
        const mdContent = await fs.readFile(mdPath, 'utf8');
        
        // 读取meta数据
        let metaData = { published: true, title: id };
        try {
          const metaPath = path.join(META_DIR, `${id}.json`);
          const metaContent = await fs.readFile(metaPath, 'utf8');
          metaData = { ...metaData, ...JSON.parse(metaContent) };
        } catch (metaError) {
          // meta文件不存在或无法解析，使用默认值
          logger.warn(`无法读取文档 ${id} 的meta数据:`, metaError.message);
        }
        
        return {
          id,
          title: metaData.title || id,
          content: mdContent,
          published: metaData.published,
          createdAt: metaData.createdAt || new Date().toISOString(),
          updatedAt: metaData.updatedAt || new Date().toISOString()
        };
      }
      
      // 其他错误，直接抛出
      throw jsonError;
    }
  } catch (error) {
    logger.error(`获取文档 ${id} 失败:`, error);
    throw error;
  }
}

// 保存文档
async function saveDocument(id, title, content) {
  try {
    await ensureDocumentationDir();
    const docId = id || Date.now().toString();
    const docPath = path.join(DOCUMENTATION_DIR, `${docId}.json`);
    
    // 检查是否已存在，保留发布状态
    let published = false;
    try {
      const existingDoc = await fs.readFile(docPath, 'utf8');
      published = JSON.parse(existingDoc).published || false;
    } catch (error) {
      // 文件不存在，使用默认值
    }
    
    const now = new Date().toISOString();
    const docData = {
      title, 
      content, 
      published,
      createdAt: now,
      updatedAt: now
    };
    
    await fs.writeFile(
      docPath, 
      JSON.stringify(docData, null, 2),
      'utf8'
    );
    
    return { id: docId, ...docData };
  } catch (error) {
    logger.error('保存文档失败:', error);
    throw error;
  }
}

// 删除文档
async function deleteDocument(id) {
  try {
    await ensureDocumentationDir();
    
    // 删除JSON文件(如果存在)
    try {
      const jsonPath = path.join(DOCUMENTATION_DIR, `${id}.json`);
      await fs.unlink(jsonPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`删除JSON文档 ${id} 失败:`, error);
      }
    }
    
    // 删除MD文件(如果存在)
    try {
      const mdPath = path.join(DOCUMENTATION_DIR, `${id}.md`);
      await fs.unlink(mdPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`删除MD文档 ${id} 失败:`, error);
      }
    }
    
    // 删除meta文件(如果存在)
    try {
      const metaPath = path.join(META_DIR, `${id}.json`);
      await fs.unlink(metaPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`删除文档 ${id} 的meta数据失败:`, error);
      }
    }
    
    return { success: true };
  } catch (error) {
    logger.error(`删除文档 ${id} 失败:`, error);
    throw error;
  }
}

// 切换文档发布状态
async function toggleDocumentPublish(id) {
  try {
    await ensureDocumentationDir();
    
    // 尝试读取JSON文件
    try {
      const jsonPath = path.join(DOCUMENTATION_DIR, `${id}.json`);
      const content = await fs.readFile(jsonPath, 'utf8');
      const doc = JSON.parse(content);
      doc.published = !doc.published;
      doc.updatedAt = new Date().toISOString();
      
      await fs.writeFile(jsonPath, JSON.stringify(doc, null, 2), 'utf8');
      return doc;
    } catch (jsonError) {
      // 如果JSON文件不存在，尝试处理MD文件的meta数据
      if (jsonError.code === 'ENOENT') {
        const mdPath = path.join(DOCUMENTATION_DIR, `${id}.md`);
        
        // 确认MD文件存在
        try {
          await fs.access(mdPath);
        } catch (mdError) {
          throw new Error(`文档 ${id} 不存在`);
        }
        
        // 获取或创建meta数据
        const metaPath = path.join(META_DIR, `${id}.json`);
        let metaData = { published: true, title: id };
        
        try {
          const metaContent = await fs.readFile(metaPath, 'utf8');
          metaData = { ...metaData, ...JSON.parse(metaContent) };
        } catch (metaError) {
          // meta文件不存在，使用默认值
        }
        
        // 切换发布状态
        metaData.published = !metaData.published;
        metaData.updatedAt = new Date().toISOString();
        
        // 保存meta数据
        await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2), 'utf8');
        
        // 获取MD文件内容
        const mdContent = await fs.readFile(mdPath, 'utf8');
        
        return {
          id,
          title: metaData.title,
          content: mdContent,
          published: metaData.published,
          createdAt: metaData.createdAt,
          updatedAt: metaData.updatedAt
        };
      }
      
      // 其他错误，直接抛出
      throw jsonError;
    }
  } catch (error) {
    logger.error(`切换文档 ${id} 发布状态失败:`, error);
    throw error;
  }
}

module.exports = {
  ensureDocumentationDir,
  getDocumentationList,
  getPublishedDocuments,
  getDocument,
  saveDocument,
  deleteDocument,
  toggleDocumentPublish
};

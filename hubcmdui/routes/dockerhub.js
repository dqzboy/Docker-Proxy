/**
 * Docker Hub 代理路由
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../logger');

// Docker Hub API 基础 URL
const DOCKER_HUB_API = 'https://hub.docker.com/v2';

// 搜索镜像
router.get('/search', async (req, res) => {
    try {
        const { term, page = 1, limit = 25 } = req.query;
        
        // 确保有搜索关键字
        if (!term) {
            return res.status(400).json({ error: '缺少搜索关键字(term)' });
        }
        
        logger.info(`搜索 Docker Hub: 关键字="${term}", 页码=${page}`);
        
        const response = await axios.get(`${DOCKER_HUB_API}/search/repositories`, {
            params: {
                query: term,
                page,
                page_size: limit
            },
            timeout: 10000
        });
        
        res.json(response.data);
    } catch (err) {
        logger.error('Docker Hub 搜索失败:', err.message);
        res.status(500).json({ error: 'Docker Hub 搜索失败', details: err.message });
    }
});

// 获取镜像标签
router.get('/tags/:owner/:repo', async (req, res) => {
    try {
        const { owner, repo } = req.params;
        const { page = 1, limit = 25 } = req.query;
        
        logger.info(`获取镜像标签: ${owner}/${repo}, 页码=${page}`);
        
        const response = await axios.get(
            `${DOCKER_HUB_API}/repositories/${owner}/${repo}/tags`, {
            params: {
                page,
                page_size: limit
            },
            timeout: 10000
        });
        
        res.json(response.data);
    } catch (err) {
        logger.error('获取 Docker 镜像标签失败:', err.message);
        res.status(500).json({ error: '获取镜像标签失败', details: err.message });
    }
});

// 直接导出路由实例
module.exports = router;

// ... existing code ...
    // 获取文档列表
    app.get('/api/documentation', requireLogin, async (req, res) => {
        try {
            const docList = await getDocumentList();
            res.json(docList);
        } catch (error) {
            console.error('获取文档列表失败:', error);
            res.status(500).json({ error: '获取文档列表失败', details: error.message });
        }
    });
    
    // 获取单个文档内容
    app.get('/api/documentation/:id', requireLogin, async (req, res) => {
        const docId = req.params.id;
        console.log(`获取文档内容请求，ID: ${docId}`);
        
        try {
            // 获取文档列表
            const docList = await getDocumentList();
            
            // 查找指定ID的文档
            const doc = docList.find(doc => doc.id === docId || doc._id === docId);
            
            if (!doc) {
                return res.status(404).json({ error: '文档不存在', docId });
            }
            
            // 如果文档未发布且用户不是管理员，则拒绝访问
            if (!doc.published && !isAdmin(req.user)) {
                return res.status(403).json({ error: '无权访问未发布的文档' });
            }
            
            // 获取文档完整内容
            const docContent = await getDocumentContent(docId);
            
            // 合并文档信息和内容
            const fullDoc = {
                ...doc,
                content: docContent
            };
            
            res.json(fullDoc);
        } catch (error) {
            console.error(`获取文档内容失败，ID: ${docId}`, error);
            res.status(500).json({ 
                error: '获取文档内容失败', 
                details: error.message,
                docId
            });
        }
    });
// ... existing code ... 
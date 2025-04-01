/**
 * 文档管理模块
 */

// 文档列表
let documents = [];
// 当前正在编辑的文档
let currentDocument = null;
// Markdown编辑器实例
let editorMd = null;

// 创建documentManager对象
const documentManager = {
    // 初始化文档管理
    init: function() {
        console.log('初始化文档管理模块...');
        // 渲染表头
        this.renderDocumentTableHeader();
        // 加载文档列表
        return this.loadDocuments().catch(err => {
            console.error('加载文档列表失败:', err);
            return Promise.resolve(); // 即使失败也继续初始化过程
        });
    },

    // 渲染文档表格头部
    renderDocumentTableHeader: function() {
        try {
            const documentTable = document.getElementById('documentTable');
            if (!documentTable) {
                console.warn('文档管理表格元素 (id=\"documentTable\") 未找到，无法渲染表头。');
                return;
            }
            
            // 查找或创建 thead
            let thead = documentTable.querySelector('thead');
            if (!thead) {
                thead = document.createElement('thead');
                documentTable.insertBefore(thead, documentTable.firstChild); // 确保 thead 在 tbody 之前
                console.log('创建了文档表格的 thead 元素。');
            }
            
            // 设置表头内容 (包含 ID 列)
            thead.innerHTML = `
                <tr>
                    <th style="width: 5%">#</th>
                    <th style="width: 25%">标题</th>
                    <th style="width: 20%">创建时间</th>
                    <th style="width: 20%">更新时间</th>
                    <th style="width: 10%">状态</th>
                    <th style="width: 20%">操作</th>
                </tr>
            `;
            console.log('文档表格表头已渲染。');
        } catch (error) {
            console.error('渲染文档表格表头时出错:', error);
        }
    },

    // 加载文档列表
    loadDocuments: async function() {
        try {
            // 显示加载状态
            const documentTableBody = document.getElementById('documentTableBody');
            if (documentTableBody) {
                documentTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> 正在加载文档列表...</td></tr>';
            }
            
            // 简化会话检查逻辑，只验证会话是否有效
            let sessionValid = true;
            try {
                const sessionResponse = await fetch('/api/check-session', {
                    headers: { 
                        'Cache-Control': 'no-cache',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'same-origin'
                });
                
                if (sessionResponse.status === 401) {
                    console.warn('会话已过期，无法加载文档');
                    sessionValid = false;
                }
            } catch (sessionError) {
                console.warn('检查会话状态发生网络错误:', sessionError);
                // 发生网络错误时继续尝试加载文档
            }
            
            // 尝试不同的API路径
            const possiblePaths = [
                '/api/documents', 
                '/api/documentation-list', 
                '/api/documentation'
            ];
            
            let success = false;
            let authError = false;
            
            for (const path of possiblePaths) {
                try {
                    console.log(`尝试从 ${path} 获取文档列表`);
                    const response = await fetch(path, {
                        credentials: 'same-origin',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    
                    if (response.status === 401) {
                        console.warn(`API路径 ${path} 返回未授权状态`);
                        authError = true;
                        continue;
                    }
                    
                    if (response.ok) {
                        const data = await response.json();
                        documents = Array.isArray(data) ? data : [];
                        
                        // 确保每个文档都包含必要的时间字段
                        documents = documents.map(doc => {
                            if (!doc.createdAt && doc.updatedAt) {
                                // 如果没有创建时间但有更新时间，使用更新时间
                                doc.createdAt = doc.updatedAt;
                            } else if (!doc.createdAt) {
                                // 如果都没有，使用当前时间
                                doc.createdAt = new Date().toISOString();
                            }
                            
                            if (!doc.updatedAt) {
                                // 如果没有更新时间，使用创建时间
                                doc.updatedAt = doc.createdAt;
                            }
                            
                            return doc;
                        });
                        
                        // 先渲染表头，再渲染文档列表
                        this.renderDocumentTableHeader();
                        this.renderDocumentList();
                        console.log(`成功从API路径 ${path} 加载文档列表`, documents);
                        success = true;
                        break;
                    }
                } catch (e) {
                    console.warn(`从 ${path} 加载文档失败:`, e);
                }
            }
            
            // 处理认证错误 - 只有当会话检查和API请求都明确失败时才强制登出
            if ((authError || !sessionValid) && !success && localStorage.getItem('isLoggedIn') === 'true') {
                console.warn('会话检查和API请求均指示会话已过期');
                core.showAlert('会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            // 如果API请求失败但不是认证错误，显示空文档列表
            if (!success) {
                console.log('API请求失败，显示空文档列表');
                documents = [];
                // 仍然需要渲染表头
                this.renderDocumentTableHeader();
                this.renderDocumentList();
            }
        } catch (error) {
            console.error('加载文档失败:', error);
            // 在UI上显示错误
            const documentTableBody = document.getElementById('documentTableBody');
            if (documentTableBody) {
                documentTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">加载文档失败: ${error.message} <button onclick="documentManager.loadDocuments()">重试</button></td></tr>`;
            }
            
            // 设置为空文档列表
            documents = [];
        }
    },

    // 初始化编辑器
    initEditor: function() {
        try {
            const editorContainer = document.getElementById('editor');
            if (!editorContainer) {
                console.error('找不到编辑器容器元素');
                return;
            }
            
            // 检查 toastui 是否已加载
            console.log('检查编辑器依赖项:', typeof toastui);
            
            // 确保 toastui 对象存在
            if (typeof toastui === 'undefined') {
                console.error('Toast UI Editor 未加载');
                return;
            }
            
            // 创建编辑器实例
            editorMd = new toastui.Editor({
                el: editorContainer,
                height: '600px',
                initialValue: '',
                previewStyle: 'vertical',
                initialEditType: 'markdown',
                toolbarItems: [
                    ['heading', 'bold', 'italic', 'strike'],
                    ['hr', 'quote'],
                    ['ul', 'ol', 'task', 'indent', 'outdent'],
                    ['table', 'image', 'link'],
                    ['code', 'codeblock']
                ]
            });

            console.log('编辑器初始化完成', editorMd);
        } catch (error) {
            console.error('初始化编辑器出错:', error);
            core.showAlert('初始化编辑器失败: ' + error.message, 'error');
        }
    },

    // 检查编辑器是否已初始化
    isEditorInitialized: function() {
        return editorMd !== null;
    },

    // 创建新文档
    newDocument: function() {
        // 首先确保编辑器已初始化
        if (!editorMd) {
            this.initEditor();
            // 等待编辑器初始化完成后再继续
            setTimeout(() => {
                currentDocument = null;
                document.getElementById('documentTitle').value = '';
                editorMd.setMarkdown('');
                this.showEditor();
            }, 500);
        } else {
            currentDocument = null;
            document.getElementById('documentTitle').value = '';
            editorMd.setMarkdown('');
            this.showEditor();
        }
    },

    // 显示编辑器
    showEditor: function() {
        document.getElementById('documentTable').style.display = 'none';
        document.getElementById('editorContainer').style.display = 'block';
        if (editorMd) {
            // 确保每次显示编辑器时都切换到编辑模式
            editorMd.focus();
        }
    },

    // 隐藏编辑器
    hideEditor: function() {
        document.getElementById('documentTable').style.display = 'table';
        document.getElementById('editorContainer').style.display = 'none';
    },

    // 取消编辑
    cancelEdit: function() {
        this.hideEditor();
    },

    // 保存文档
    saveDocument: async function() {
        const title = document.getElementById('documentTitle').value.trim();
        const content = editorMd.getMarkdown();
        
        if (!title) {
            core.showAlert('请输入文档标题', 'error');
            return;
        }
        
        // 显示保存中状态
        core.showLoading();
        
        try {
            // 简化会话检查逻辑，只验证会话是否有效
            let sessionValid = true;
            try {
                const sessionResponse = await fetch('/api/check-session', {
                    headers: { 
                        'Cache-Control': 'no-cache',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'same-origin'
                });
                
                if (sessionResponse.status === 401) {
                    console.warn('会话已过期，无法保存文档');
                    sessionValid = false;
                }
            } catch (sessionError) {
                console.warn('检查会话状态发生网络错误:', sessionError);
                // 发生网络错误时继续尝试保存操作
            }
            
            // 只有在会话明确无效时才退出
            if (!sessionValid) {
                core.showAlert('您的会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            // 确保Markdown内容以标题开始
            let processedContent = content;
            if (!content.startsWith('# ')) {
                // 如果内容不是以一级标题开始，则在开头添加标题
                processedContent = `# ${title}\n\n${content}`;
            } else {
                // 如果已经有一级标题，替换为当前标题
                processedContent = content.replace(/^# .*$/m, `# ${title}`);
            }
            
            const apiUrl = currentDocument && currentDocument.id 
                ? `/api/documents/${currentDocument.id}` 
                : '/api/documents';
            
            const method = currentDocument && currentDocument.id ? 'PUT' : 'POST';
            
            console.log(`尝试${method === 'PUT' ? '更新' : '创建'}文档，标题: ${title}`);
            
            const response = await fetch(apiUrl, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: JSON.stringify({ 
                    title, 
                    content: processedContent,
                    published: currentDocument && currentDocument.published ? currentDocument.published : false
                })
            });
            
            // 处理响应
            if (response.status === 401) {
                // 明确的未授权响应
                console.warn('保存文档返回401未授权');
                core.showAlert('未登录或会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    // 如果不是有效的JSON，直接使用文本
                    throw new Error(errorText || '保存失败，请重试');
                }
                throw new Error(errorData.error || errorData.message || '保存失败，请重试');
            }
            
            const savedDoc = await response.json();
            console.log('保存的文档:', savedDoc);

            // 确保savedDoc包含必要的时间字段
            if (savedDoc) {
                // 如果返回的保存文档中没有时间字段，从API获取完整文档信息
                if (!savedDoc.createdAt || !savedDoc.updatedAt) {
                    try {
                        const docId = savedDoc.id || (currentDocument ? currentDocument.id : null);
                        if (docId) {
                            const docResponse = await fetch(`/api/documents/${docId}`, {
                                headers: { 'Cache-Control': 'no-cache' },
                                credentials: 'same-origin'
                            });
                            
                            if (docResponse.ok) {
                                const fullDoc = await docResponse.json();
                                Object.assign(savedDoc, {
                                    createdAt: fullDoc.createdAt,
                                    updatedAt: fullDoc.updatedAt
                                });
                                console.log('获取到完整的文档时间信息:', fullDoc);
                            }
                        }
                    } catch (timeError) {
                        console.warn('获取文档完整时间信息失败:', timeError);
                    }
                }
                
                // 更新文档列表中的文档
                const existingIndex = documents.findIndex(d => d.id === savedDoc.id);
                if (existingIndex >= 0) {
                    documents[existingIndex] = { ...documents[existingIndex], ...savedDoc };
                } else {
                    documents.push(savedDoc);
                }
            }

            core.showAlert('文档保存成功', 'success');
            this.hideEditor();
            await this.loadDocuments(); // 重新加载文档列表
        } catch (error) {
            console.error('保存文档失败:', error);
            core.showAlert('保存文档失败: ' + error.message, 'error');
        } finally {
            core.hideLoading();
        }
    },

    // 渲染文档列表
    renderDocumentList: function() {
        const tbody = document.getElementById('documentTableBody');
        tbody.innerHTML = '';
        
        if (documents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">没有找到文档</td></tr>';
            return;
        }
        
        documents.forEach((doc, index) => {
            // 确保文档时间有合理默认值
            let createdAt = '未知';
            let updatedAt = '未知';
            
            try {
                // 尝试解析创建时间，如果失败则回退到默认值
                if (doc.createdAt) {
                    const createdDate = new Date(doc.createdAt);
                    if (!isNaN(createdDate.getTime())) {
                        createdAt = createdDate.toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                    }
                }
                
                // 尝试解析更新时间，如果失败则回退到默认值
                if (doc.updatedAt) {
                    const updatedDate = new Date(doc.updatedAt);
                    if (!isNaN(updatedDate.getTime())) {
                        updatedAt = updatedDate.toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                    }
                }
                
                // 简化时间显示逻辑 - 直接显示时间戳，不添加特殊标记
                if (createdAt === '未知' && updatedAt !== '未知') {
                    // 如果没有创建时间但有更新时间
                    createdAt = '未记录';
                } else if (updatedAt === '未知' && createdAt !== '未知') {
                    // 如果没有更新时间但有创建时间
                    updatedAt = '未更新';
                }
            } catch (error) {
                console.warn(`解析文档时间失败:`, error, doc);
            }
            
            const statusClasses = doc.published ? 'status-badge status-running' : 'status-badge status-stopped';
            const statusText = doc.published ? '已发布' : '未发布';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${doc.title || '无标题文档'}</td>
                <td>${createdAt}</td>
                <td>${updatedAt}</td>
                <td><span class="${statusClasses}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn edit-btn" title="编辑文档" onclick="documentManager.editDocument('${doc.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn ${doc.published ? 'unpublish-btn' : 'publish-btn'}" 
                        title="${doc.published ? '取消发布' : '发布文档'}" 
                        onclick="documentManager.togglePublish('${doc.id}')">
                        <i class="fas ${doc.published ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                    </button>
                    <button class="action-btn delete-btn" title="删除文档" onclick="documentManager.deleteDocument('${doc.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    },

    // 编辑文档
    editDocument: async function(id) {
        try {
            console.log(`准备编辑文档，ID: ${id}`);
            core.showLoading();
            
            // 检查会话状态，优化会话检查逻辑
            let sessionValid = true;
            try {
                const sessionResponse = await fetch('/api/check-session', {
                    headers: { 
                        'Cache-Control': 'no-cache',
                        'X-Requested-With': 'XMLHttpRequest' 
                    },
                    credentials: 'same-origin'
                });
                
                if (sessionResponse.status === 401) {
                    console.warn('会话已过期，无法编辑文档');
                    sessionValid = false;
                }
            } catch (sessionError) {
                console.warn('检查会话状态发生网络错误:', sessionError);
                // 发生网络错误时不立即判定会话失效，继续尝试编辑操作
            }
            
            // 只有在明确会话无效时才提示重新登录
            if (!sessionValid) {
                core.showAlert('您的会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            // 在本地查找文档
            currentDocument = documents.find(doc => doc.id === id);
            
            // 如果本地未找到，从API获取
            if (!currentDocument && id) {
                try {
                    console.log('从API获取文档详情');
                    
                    // 尝试多个可能的API路径
                    const apiPaths = [
                        `/api/documents/${id}`,
                        `/api/documentation/${id}`
                    ];
                    
                    let docResponse = null;
                    let authError = false;
                    
                    for (const apiPath of apiPaths) {
                        try {
                            console.log(`尝试从 ${apiPath} 获取文档`);
                            const response = await fetch(apiPath, {
                                credentials: 'same-origin',
                                headers: {
                                    'X-Requested-With': 'XMLHttpRequest'
                                }
                            });
                            
                            // 只有明确401错误才认定为会话过期
                            if (response.status === 401) {
                                console.warn(`API ${apiPath} 返回401未授权`);
                                authError = true;
                                continue;
                            }
                            
                            if (response.ok) {
                                docResponse = response;
                                console.log(`成功从 ${apiPath} 获取文档`);
                                break;
                            }
                        } catch (pathError) {
                            console.warn(`从 ${apiPath} 获取文档失败:`, pathError);
                        }
                    }
                    
                    // 处理认证错误
                    if (authError && !docResponse) {
                        core.showAlert('未登录或会话已过期，请重新登录', 'warning');
                        setTimeout(() => {
                            localStorage.removeItem('isLoggedIn');
                            window.location.reload();
                        }, 1500);
                        return;
                    }
                    
                    if (docResponse && docResponse.ok) {
                        currentDocument = await docResponse.json();
                        console.log('获取到文档详情:', currentDocument);
                        
                        // 确保文档包含必要的时间字段
                        if (!currentDocument.createdAt && currentDocument.updatedAt) {
                            // 如果没有创建时间但有更新时间，使用更新时间
                            currentDocument.createdAt = currentDocument.updatedAt;
                        } else if (!currentDocument.createdAt) {
                            // 如果都没有，使用当前时间
                            currentDocument.createdAt = new Date().toISOString();
                        }
                        
                        if (!currentDocument.updatedAt) {
                            // 如果没有更新时间，使用创建时间
                            currentDocument.updatedAt = currentDocument.createdAt;
                        }
                        
                        // 将获取到的文档添加到文档列表中
                        const existingIndex = documents.findIndex(d => d.id === id);
                        if (existingIndex >= 0) {
                            documents[existingIndex] = currentDocument;
                        } else {
                            documents.push(currentDocument);
                        }
                    } else {
                        throw new Error('所有API路径都无法获取文档');
                    }
                } catch (apiError) {
                    console.error('从API获取文档详情失败:', apiError);
                    core.showAlert('获取文档详情失败: ' + apiError.message, 'error');
                }
            }
            
            // 如果仍然没有找到文档，显示错误
            if (!currentDocument) {
                core.showAlert('未找到指定的文档', 'error');
                return;
            }
            
            // 显示编辑器界面并设置内容
            this.showEditor();
            
            // 确保编辑器已初始化
            if (!editorMd) {
                await new Promise(resolve => setTimeout(resolve, 100));
                this.initEditor();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // 设置文档内容
            if (editorMd) {
                document.getElementById('documentTitle').value = currentDocument.title || '';
                
                if (currentDocument.content) {
                    console.log(`设置文档内容，长度: ${currentDocument.content.length}`);
                    editorMd.setMarkdown(currentDocument.content);
                } else {
                    console.log('文档内容为空，尝试额外获取内容');
                    
                    // 如果文档内容为空，尝试额外获取内容
                    try {
                        const contentResponse = await fetch(`/api/documents/${id}/content`, {
                            credentials: 'same-origin',
                            headers: {
                                'X-Requested-With': 'XMLHttpRequest'
                            }
                        });
                        
                        // 只有明确401错误才提示重新登录
                        if (contentResponse.status === 401) {
                            core.showAlert('会话已过期，请重新登录', 'warning');
                            setTimeout(() => {
                                localStorage.removeItem('isLoggedIn');
                                window.location.reload();
                            }, 1500);
                            return;
                        }
                        
                        if (contentResponse.ok) {
                            const contentData = await contentResponse.json();
                            if (contentData.content) {
                                currentDocument.content = contentData.content;
                                editorMd.setMarkdown(contentData.content);
                                console.log('成功获取额外内容');
                            }
                        }
                    } catch (contentError) {
                        console.warn('获取额外内容失败:', contentError);
                    }
                    
                    // 如果仍然没有内容，设置为空
                    if (!currentDocument.content) {
                        editorMd.setMarkdown('');
                    }
                }
            } else {
                console.error('编辑器初始化失败，无法设置内容');
                core.showAlert('编辑器初始化失败，请刷新页面重试', 'error');
            }
        } catch (error) {
            console.error('编辑文档时出错:', error);
            core.showAlert('编辑文档失败: ' + error.message, 'error');
        } finally {
            core.hideLoading();
        }
    },

    // 查看文档
    viewDocument: function(id) {
        const doc = documents.find(doc => doc.id === id);
        if (!doc) {
            core.showAlert('未找到指定的文档', 'error');
            return;
        }

        Swal.fire({
            title: doc.title,
            html: `<div class="document-preview">${marked.parse(doc.content || '')}</div>`,
            width: '70%',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                container: 'document-preview-container',
                popup: 'document-preview-popup',
                content: 'document-preview-content'
            }
        });
    },

    // 删除文档
    deleteDocument: async function(id) {
        Swal.fire({
            title: '确定要删除此文档吗?',
            text: "此操作无法撤销!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '是，删除它',
            cancelButtonText: '取消'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    console.log(`尝试删除文档: ${id}`);
                    
                    // 检查会话状态
                    const sessionResponse = await fetch('/api/check-session', {
                        headers: { 'Cache-Control': 'no-cache' }
                    });
                    
                    if (sessionResponse.status === 401) {
                        // 会话已过期，提示用户并重定向到登录
                        core.showAlert('您的会话已过期，请重新登录', 'warning');
                        setTimeout(() => {
                            localStorage.removeItem('isLoggedIn');
                            window.location.reload();
                        }, 1500);
                        return;
                    }
                    
                    // 使用正确的API路径删除
                    const response = await fetch(`/api/documents/${id}`, { 
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        credentials: 'same-origin' // 确保发送cookie
                    });
                    
                    if (response.status === 401) {
                        // 处理未授权错误
                        core.showAlert('未登录或会话已过期，请重新登录', 'warning');
                        setTimeout(() => {
                            localStorage.removeItem('isLoggedIn');
                            window.location.reload();
                        }, 1500);
                        return;
                    }
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || '删除文档失败');
                    }
                    
                    console.log('文档删除成功响应:', await response.json());
                    core.showAlert('文档已成功删除', 'success');
                    await this.loadDocuments(); // 重新加载文档列表
                } catch (error) {
                    console.error('删除文档失败:', error);
                    core.showAlert('删除文档失败: ' + error.message, 'error');
                }
            }
        });
    },

    // 切换文档发布状态
    togglePublish: async function(id) {
        try {
            const doc = documents.find(d => d.id === id);
            if (!doc) {
                throw new Error('找不到指定文档');
            }
            
            // 添加加载指示
            core.showLoading();
            
            // 检查会话状态
            const sessionResponse = await fetch('/api/check-session', {
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (sessionResponse.status === 401) {
                // 会话已过期，提示用户并重定向到登录
                core.showAlert('您的会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            console.log(`尝试切换文档 ${id} 的发布状态，当前状态:`, doc.published);
            
            // 构建更新请求数据
            const updateData = {
                id: doc.id,
                title: doc.title,
                published: !doc.published // 切换发布状态
            };
            
            // 使用正确的API端点进行更新
            const response = await fetch(`/api/documentation/toggle-publish/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin', // 确保发送cookie
                body: JSON.stringify(updateData)
            });
            
            if (response.status === 401) {
                // 处理未授权错误
                core.showAlert('未登录或会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '更新文档状态失败');
            }
            
            // 更新成功
            const updatedDoc = await response.json();
            console.log('文档状态更新响应:', updatedDoc);
            
            // 更新本地文档列表
            const docIndex = documents.findIndex(d => d.id === id);
            if (docIndex >= 0) {
                documents[docIndex].published = updatedDoc.published;
                this.renderDocumentList();
            }
            
            core.showAlert('文档状态已更新', 'success');
        } catch (error) {
            console.error('更改发布状态失败:', error);
            core.showAlert('更改发布状态失败: ' + error.message, 'error');
        } finally {
            core.hideLoading();
        }
    }
};

// 全局公开文档管理模块
window.documentManager = documentManager;

/**
 * 显示指定文档的内容
 * @param {string} docId 文档ID
 */
async function showDocument(docId) {
    try {
        console.log('正在获取文档内容，ID:', docId);
        
        // 显示加载状态
        const documentContent = document.getElementById('documentContent');
        if (documentContent) {
            documentContent.innerHTML = '<div class="loading-container"><i class="fas fa-spinner fa-spin"></i> 正在加载文档内容...</div>';
        }
        
        // 获取文档内容
        const response = await fetch(`/api/documentation/${docId}`);
        if (!response.ok) {
            throw new Error(`获取文档内容失败，状态码: ${response.status}`);
        }
        
        const doc = await response.json();
        console.log('获取到文档:', doc);
        
        // 更新文档内容区域
        if (documentContent) {
            if (doc.content) {
                // 使用marked渲染markdown内容
                documentContent.innerHTML = `
                    <h1>${doc.title || '无标题'}</h1>
                    ${doc.lastUpdated ? `<div class="doc-meta">最后更新: ${new Date(doc.lastUpdated).toLocaleDateString('zh-CN')}</div>` : ''}
                    <div class="doc-content">${window.marked ? marked.parse(doc.content) : doc.content}</div>
                `;
            } else {
                documentContent.innerHTML = `
                    <h1>${doc.title || '无标题'}</h1>
                    <div class="empty-content">
                        <i class="fas fa-file-alt fa-3x"></i>
                        <p>该文档暂无内容</p>
                    </div>
                `;
            }
        } else {
            console.error('找不到文档内容容器，ID: documentContent');
        }
        
        // 高亮当前选中的文档
        highlightSelectedDocument(docId);
    } catch (error) {
        console.error('获取文档内容失败:', error);
        
        // 显示错误信息
        const documentContent = document.getElementById('documentContent');
        if (documentContent) {
            documentContent.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle fa-3x"></i>
                    <h2>加载失败</h2>
                    <p>无法获取文档内容: ${error.message}</p>
                    <button class="btn btn-retry" onclick="showDocument('${docId}')">重试</button>
                </div>
            `;
        }
    }
}

/**
 * 高亮选中的文档
 * @param {string} docId 文档ID
 */
function highlightSelectedDocument(docId) {
    // 移除所有高亮
    const docLinks = document.querySelectorAll('.doc-list .doc-item');
    docLinks.forEach(link => link.classList.remove('active'));
    
    // 添加当前高亮
    const selectedLink = document.querySelector(`.doc-list .doc-item[data-id="${docId}"]`);
    if (selectedLink) {
        selectedLink.classList.add('active');
        // 确保选中项可见
        selectedLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

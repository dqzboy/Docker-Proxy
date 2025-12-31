/**
 * 文档管理模块
 */

// 文档列表
let documents = [];

// 创建documentManager对象
const documentManager = {
    // 初始化文档管理
    init: function() {
        // console.log('初始化文档管理模块...');
        // 渲染表头
        this.renderDocumentTableHeader();
        // 加载文档列表
        return this.loadDocuments().catch(err => {
            // console.error('加载文档列表失败:', err);
            return Promise.resolve(); // 即使失败也继续初始化过程
        });
    },

    // 渲染文档表格头部
    renderDocumentTableHeader: function() {
        try {
            const documentTable = document.getElementById('documentTable');
            if (!documentTable) {
                // console.warn('文档管理表格元素 (id=\"documentTable\") 未找到，无法渲染表头。');
                return;
            }
            
            // 查找或创建 thead
            let thead = documentTable.querySelector('thead');
            if (!thead) {
                thead = document.createElement('thead');
                documentTable.insertBefore(thead, documentTable.firstChild); // 确保 thead 在 tbody 之前
                // console.log('创建了文档表格的 thead 元素。');
            }
            
            // 设置表头内容 (包含 ID 列)
            thead.innerHTML = `
                <tr>
                    <th style="width: 6%">#</th>
                    <th style="width: 28%">文档标题</th>
                    <th style="width: 18%">创建时间</th>
                    <th style="width: 18%">更新时间</th>
                    <th style="width: 10%">状态</th>
                    <th style="width: 20%">操作</th>
                </tr>
            `;
            // console.log('文档表格表头已渲染。');
        } catch (error) {
            // console.error('渲染文档表格表头时出错:', error);
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
                    // console.warn('会话已过期，无法加载文档');
                    sessionValid = false;
                }
            } catch (sessionError) {
                // console.warn('检查会话状态发生网络错误:', sessionError);
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
                    // console.log(`尝试从 ${path} 获取文档列表`);
                    const response = await fetch(path, {
                        credentials: 'same-origin',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    
                    if (response.status === 401) {
                        // console.warn(`API路径 ${path} 返回未授权状态`);
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
                        // console.log(`成功从API路径 ${path} 加载文档列表`, documents);
                        success = true;
                        break;
                    }
                } catch (e) {
                    // console.warn(`从 ${path} 加载文档失败:`, e);
                }
            }
            
            // 处理认证错误 - 只有当会话检查和API请求都明确失败时才强制登出
            if ((authError || !sessionValid) && !success && localStorage.getItem('isLoggedIn') === 'true') {
                // console.warn('会话检查和API请求均指示会话已过期');
                core.showAlert('会话已过期，请重新登录', 'warning');
                setTimeout(() => {
                    localStorage.removeItem('isLoggedIn');
                    window.location.reload();
                }, 1500);
                return;
            }
            
            // 如果API请求失败但不是认证错误，显示空文档列表
            if (!success) {
                // console.log('API请求失败，显示空文档列表');
                documents = [];
                // 仍然需要渲染表头
                this.renderDocumentTableHeader();
                this.renderDocumentList();
            }
        } catch (error) {
            // console.error('加载文档失败:', error);
            // 在UI上显示错误
            const documentTableBody = document.getElementById('documentTableBody');
            if (documentTableBody) {
                documentTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">加载文档失败: ${error.message} <button onclick="documentManager.loadDocuments()">重试</button></td></tr>`;
            }
            
            // 设置为空文档列表
            documents = [];
        }
    },

    // 创建新文档
    newDocument: function() {
        // 跳转到专门的文档编辑页面
        window.open('/document-editor.html', '_blank');
    },

    // 渲染文档列表
    renderDocumentList: function() {
        const tbody = document.getElementById('documentTableBody');
        tbody.innerHTML = '';
        
        if (documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty-state">
                        <i class="fas fa-file-alt"></i>
                        <p>暂无文档，点击"新建文档"开始创建</p>
                    </td>
                </tr>`;
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
                // console.warn(`解析文档时间失败:`, error, doc);
            }
            
            const statusClasses = doc.published ? 'doc-status-badge published' : 'doc-status-badge draft';
            const statusText = doc.published ? '已发布' : '草稿';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="table-row-num">${index + 1}</span></td>
                <td><span class="doc-title-display">${doc.title || '无标题文档'}</span></td>
                <td><span class="doc-date">${createdAt}</span></td>
                <td><span class="doc-date">${updatedAt}</span></td>
                <td><span class="${statusClasses}">${statusText}</span></td>
                <td class="action-buttons">
                    <button class="action-btn edit-btn" title="编辑文档" onclick="documentManager.editDocument('${doc.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn ${doc.published ? 'view-btn' : 'publish-btn'}" 
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
        // 跳转到专门的文档编辑页面，并传递文档ID
        window.open(`/document-editor.html?id=${id}`, '_blank');
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
                    // console.log(`尝试删除文档: ${id}`);
                    
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
                    
                    // console.log('文档删除成功响应:', await response.json());
                    core.showAlert('文档已成功删除', 'success');
                    await this.loadDocuments(); // 重新加载文档列表
                } catch (error) {
                    // console.error('删除文档失败:', error);
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
            
            // console.log(`尝试切换文档 ${id} 的发布状态，当前状态:`, doc.published);
            
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
            // console.log('文档状态更新响应:', updatedDoc);
            
            // 更新本地文档列表
            const docIndex = documents.findIndex(d => d.id === id);
            if (docIndex >= 0) {
                documents[docIndex].published = updatedDoc.published;
                this.renderDocumentList();
            }
            
            core.showAlert('文档状态已更新', 'success');
        } catch (error) {
            // console.error('更改发布状态失败:', error);
            core.showAlert('更改发布状态失败: ' + error.message, 'error');
        } finally {
            core.hideLoading();
        }
    }
};
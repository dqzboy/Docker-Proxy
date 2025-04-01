/**
 * Docker管理模块 - 专注于 Docker 容器表格的渲染和交互
 */

const dockerManager = {
    // 初始化函数 - 只做基本的 UI 设置或事件监听（如果需要）
    init: function() {
        // 减少日志输出
        // console.log('[dockerManager] Initializing Docker manager UI components...');
        
        // 可以在这里添加下拉菜单的全局事件监听器等
        this.setupActionDropdownListener(); 
        
        // 立即显示加载状态和表头
        this.showLoadingState();
        
        // 添加对Bootstrap下拉菜单的初始化
        document.addEventListener('DOMContentLoaded', () => {
            this.initDropdowns();
        });
        
        // 当文档已经加载完成时立即初始化
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this.initDropdowns();
        }
        
        return Promise.resolve();
    },

    // 初始化Bootstrap下拉菜单组件
    initDropdowns: function() {
        // 减少日志输出
        // console.log('[dockerManager] Initializing Bootstrap dropdowns...');
        
        // 直接初始化，不使用setTimeout避免延迟导致的问题
        try {
            // 动态初始化所有下拉菜单
            const dropdownElements = document.querySelectorAll('[data-bs-toggle="dropdown"]');
            if (dropdownElements.length === 0) {
                return; // 如果没有找到下拉元素，直接返回
            }
            
            if (window.bootstrap && window.bootstrap.Dropdown) {
                dropdownElements.forEach(el => {
                    try {
                        new window.bootstrap.Dropdown(el);
                    } catch (e) {
                        // 静默处理错误，不要输出到控制台
                    }
                });
            } else {
                console.warn('Bootstrap Dropdown 组件未找到，将尝试使用jQuery初始化');
                // 尝试使用jQuery初始化（如果存在）
                if (window.jQuery) {
                    window.jQuery('[data-bs-toggle="dropdown"]').dropdown();
                }
            }
        } catch (error) {
            // 静默处理错误
        }
    },

    // 显示表格加载状态 - 保持，用于初始渲染和刷新
    showLoadingState() {
        const table = document.getElementById('dockerStatusTable');
        const tbody = document.getElementById('dockerStatusTableBody');
        
        // 首先创建表格标题区域（如果不存在）
        let tableContainer = document.getElementById('dockerTableContainer');
        if (tableContainer) {
            // 添加表格标题区域 - 只有不存在时才添加
            if (!tableContainer.querySelector('.docker-table-header')) {
                const tableHeader = document.createElement('div');
                tableHeader.className = 'docker-table-header';
                tableHeader.innerHTML = `
                    <h2 class="docker-table-title">Docker 容器管理</h2>
                    <div class="docker-table-actions">
                        <button id="refreshDockerBtn" class="btn btn-sm btn-primary">
                            <i class="fas fa-sync-alt me-1"></i> 刷新列表
                        </button>
                    </div>
                `;
                
                // 插入到表格前面
                if (table) {
                    tableContainer.insertBefore(tableHeader, table);
                    
                    // 添加刷新按钮事件
                    const refreshBtn = document.getElementById('refreshDockerBtn');
                    if (refreshBtn) {
                        refreshBtn.addEventListener('click', () => {
                            if (window.systemStatus && typeof window.systemStatus.refreshSystemStatus === 'function') {
                                window.systemStatus.refreshSystemStatus();
                            }
                        });
                    }
                }
            }
        }
        
        if (table && tbody) {
            // 添加Excel风格表格类
            table.classList.add('excel-table');
            
            // 确保表头存在并正确渲染
            const thead = table.querySelector('thead');
            if (thead) {
                thead.innerHTML = ` 
                    <tr>
                        <th style="width: 120px;">容器ID</th>
                        <th style="width: 25%;">容器名称</th>
                        <th style="width: 35%;">镜像名称</th>
                        <th style="width: 100px;">运行状态</th>
                        <th style="width: 150px;">操作</th>
                    </tr>
                `;
            }
            
            // 显示加载状态
            tbody.innerHTML = `
                <tr class="loading-container">
                    <td colspan="5">
                        <div class="loading-animation">
                            <div class="spinner"></div>
                            <p>正在加载容器列表...</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    },

    // 渲染容器表格 - 核心渲染函数，由 systemStatus 调用
    renderContainersTable(containers, dockerStatus) {
        // 减少详细日志输出
        // console.log(`[dockerManager] Rendering containers table. Containers count: ${containers ? containers.length : 0}`);
        
        const tbody = document.getElementById('dockerStatusTableBody');
        if (!tbody) {
            return;
        }
        
        // 确保表头存在 (showLoadingState 应该已经创建)
        const table = document.getElementById('dockerStatusTable');
        if (table) {
            const thead = table.querySelector('thead');
            if (!thead || !thead.querySelector('tr')) {
                // 重新创建表头
                const newThead = thead || document.createElement('thead');
                newThead.innerHTML = ` 
                    <tr>
                        <th style="width: 120px;">容器ID</th>
                        <th style="width: 25%;">容器名称</th>
                        <th style="width: 35%;">镜像名称</th>
                        <th style="width: 100px;">运行状态</th>
                        <th style="width: 150px;">操作</th>
                    </tr>
                `;
                
                if (!thead) {
                    table.insertBefore(newThead, tbody);
                }
            }
        }

        // 1. 检查 Docker 服务状态
        if (dockerStatus !== 'running') {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-4">
                        <i class="fab fa-docker fa-lg me-2"></i> Docker 服务未运行
                    </td>
                </tr>
            `;
            return;
        }

        // 2. 检查容器数组是否有效且有内容
        if (!Array.isArray(containers) || containers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-4">
                         <i class="fas fa-info-circle me-2"></i> 暂无运行中的Docker容器
                    </td>
                </tr>
            `;
            return;
        }

        // 3. 渲染容器列表
        let html = '';
        containers.forEach(container => {
            const status = container.State || container.status || '未知';
            const statusClass = this.getContainerStatusClass(status);
            const containerId = container.Id || container.id || '未知';
            const containerName = container.Names?.[0]?.substring(1) || container.name || '未知';
            const containerImage = container.Image || container.image || '未知';
            
            // 添加lowerStatus变量定义，修复错误
            const lowerStatus = status.toLowerCase();

            // 替换下拉菜单实现为直接的操作按钮
            let actionButtons = '';
            
            // 基本操作：查看日志和详情
            actionButtons += `
                <button class="btn btn-sm btn-outline-info mb-1 mr-1 action-logs" data-id="${containerId}" data-name="${containerName}">
                    <i class="fas fa-file-alt"></i> 日志
                </button>
                <button class="btn btn-sm btn-outline-secondary mb-1 mr-1 action-details" data-id="${containerId}">
                    <i class="fas fa-info-circle"></i> 详情
                </button>
            `;
            
            // 根据状态显示不同操作
            if (lowerStatus.includes('running')) {
                actionButtons += `
                    <button class="btn btn-sm btn-outline-warning mb-1 mr-1 action-stop" data-id="${containerId}">
                        <i class="fas fa-stop"></i> 停止
                    </button>
                    <button class="btn btn-sm btn-outline-primary mb-1 mr-1 action-restart" data-id="${containerId}">
                        <i class="fas fa-sync-alt"></i> 重启
                    </button>
                `;
            } else if (lowerStatus.includes('exited') || lowerStatus.includes('stopped') || lowerStatus.includes('created')) {
                actionButtons += `
                    <button class="btn btn-sm btn-outline-success mb-1 mr-1 action-start" data-id="${containerId}">
                        <i class="fas fa-play"></i> 启动
                    </button>
                    <button class="btn btn-sm btn-outline-danger mb-1 mr-1 action-remove" data-id="${containerId}">
                        <i class="fas fa-trash-alt"></i> 删除
                    </button>
                `;
            } else if (lowerStatus.includes('paused')) {
                actionButtons += `
                    <button class="btn btn-sm btn-outline-success mb-1 mr-1 action-unpause" data-id="${containerId}">
                        <i class="fas fa-play"></i> 恢复
                    </button>
                `;
            }
            
            // 更新容器按钮（总是显示）
            actionButtons += `
                <button class="btn btn-sm btn-outline-primary mb-1 mr-1 action-update" data-id="${containerId}" data-image="${containerImage || ''}">
                    <i class="fas fa-cloud-download-alt"></i> 更新
                </button>
            `;

            html += `
                <tr>
                    <td data-label="ID" title="${containerId}">${containerId.substring(0, 12)}</td>
                    <td data-label="名称" title="${containerName}">${containerName}</td>
                    <td data-label="镜像" title="${containerImage}">${containerImage}</td>
                    <td data-label="状态"><span class="badge ${statusClass}">${status}</span></td>
                    <td data-label="操作" class="action-cell">
                        <div class="action-buttons">
                            ${actionButtons}
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
        // 为所有操作按钮绑定事件
        this.setupButtonListeners();
    },
    
    // 为所有操作按钮绑定事件
    setupButtonListeners() {
        // 查找所有操作按钮并绑定点击事件
        document.querySelectorAll('.action-cell button').forEach(button => {
            const action = Array.from(button.classList).find(cls => cls.startsWith('action-'));
            if (!action) return;
            
            const containerId = button.dataset.id;
            if (!containerId) return;
            
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const containerName = button.dataset.name;
                const containerImage = button.dataset.image;
                
                switch (action) {
                    case 'action-logs':
                        this.showContainerLogs(containerId, containerName);
                        break;
                    case 'action-details':
                        this.showContainerDetails(containerId);
                        break;
                    case 'action-stop':
                        this.stopContainer(containerId);
                        break;
                    case 'action-start':
                        this.startContainer(containerId);
                        break;
                    case 'action-restart':
                        this.restartContainer(containerId);
                        break;
                    case 'action-remove':
                        this.removeContainer(containerId);
                        break;
                    case 'action-unpause':
                        // this.unpauseContainer(containerId); // 假设有这个函数
                        console.warn('Unpause action not implemented yet.');
                        break;
                    case 'action-update':
                        this.updateContainer(containerId, containerImage);
                        break;
                    default:
                        console.warn('Unknown action:', action);
                }
            });
        });
    },
    
    // 获取容器状态对应的 CSS 类 - 保持
    getContainerStatusClass(state) {
        if (!state) return 'status-unknown';
        state = state.toLowerCase();
        if (state.includes('running')) return 'status-running';
        if (state.includes('created')) return 'status-created';
        if (state.includes('exited') || state.includes('stopped')) return 'status-stopped';
        if (state.includes('paused')) return 'status-paused';
        return 'status-unknown';
    },
    
    // 设置下拉菜单动作的事件监听 (委托方法 - 现在直接使用按钮，不再需要)
    setupActionDropdownListener() {
        // 这个方法留作兼容性，但实际上我们现在直接使用按钮而非下拉菜单
    },

    // 查看日志 (示例：用 SweetAlert 显示)
    async showContainerLogs(containerId, containerName) {
        core.showLoading('正在加载日志...');
        try {
            // 注意: 后端 /api/docker/containers/:id/logs 需要存在并返回日志文本
            const response = await fetch(`/api/docker/containers/${containerId}/logs`); 
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ details: '无法解析错误响应' }));
                throw new Error(errorData.details || `获取日志失败 (${response.status})`);
            }
            const logs = await response.text();
            core.hideLoading();
            
            Swal.fire({
                title: `容器日志: ${containerName || containerId.substring(0, 6)}`,
                html: `<pre class="container-logs">${logs.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
                width: '80%',
                customClass: {
                    htmlContainer: 'swal2-logs-container',
                    popup: 'swal2-logs-popup'
                },
                confirmButtonText: '关闭'
            });
        } catch (error) {
            core.hideLoading();
            core.showAlert(`查看日志失败: ${error.message}`, 'error');
            logger.error(`[dockerManager] Error fetching logs for ${containerId}:`, error);
        }
    },
    
    // 显示容器详情 (示例：用 SweetAlert 显示)
    async showContainerDetails(containerId) {
        core.showLoading('正在加载详情...');
        try {
            // 注意: 后端 /api/docker/containers/:id 需要存在并返回详细信息
            const response = await fetch(`/api/docker/containers/${containerId}`); 
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ details: '无法解析错误响应' }));
                throw new Error(errorData.details || `获取详情失败 (${response.status})`);
            }
            const details = await response.json();
            core.hideLoading();
            
            // 格式化显示详情
            let detailsHtml = '<div class="container-details">';
            for (const key in details) {
                detailsHtml += `<p><strong>${key}:</strong> ${JSON.stringify(details[key], null, 2)}</p>`;
            }
            detailsHtml += '</div>';
            
            Swal.fire({
                title: `容器详情: ${details.Name || containerId.substring(0, 6)}`,
                html: detailsHtml,
                width: '80%',
                confirmButtonText: '关闭'
            });
        } catch (error) {
            core.hideLoading();
            core.showAlert(`查看详情失败: ${error.message}`, 'error');
            logger.error(`[dockerManager] Error fetching details for ${containerId}:`, error);
        }
    },

    // 启动容器
    async startContainer(containerId) {
        core.showLoading('正在启动容器...');
        try {
            const response = await fetch(`/api/docker/containers/${containerId}/start`, { method: 'POST' });
            const data = await response.json();
            core.hideLoading();
            if (!response.ok) throw new Error(data.details || '启动容器失败');
            core.showAlert('容器启动成功', 'success');
            systemStatus.refreshSystemStatus(); // 刷新整体状态
        } catch (error) {
            core.hideLoading();
            core.showAlert(`启动容器失败: ${error.message}`, 'error');
            logger.error(`[dockerManager] Error starting container ${containerId}:`, error);
        }
    },
    
    // 停止容器
    async stopContainer(containerId) {
        core.showLoading('正在停止容器...');
        try {
            const response = await fetch(`/api/docker/containers/${containerId}/stop`, { method: 'POST' });
            const data = await response.json();
            core.hideLoading();
            if (!response.ok && response.status !== 304) { // 304 Not Modified 也算成功（已停止）
                 throw new Error(data.details || '停止容器失败');
            }
            core.showAlert(data.message || '容器停止成功', 'success');
            systemStatus.refreshSystemStatus(); // 刷新整体状态
        } catch (error) {
            core.hideLoading();
            core.showAlert(`停止容器失败: ${error.message}`, 'error');
            logger.error(`[dockerManager] Error stopping container ${containerId}:`, error);
        }
    },
    
    // 重启容器
    async restartContainer(containerId) {
        core.showLoading('正在重启容器...');
        try {
            const response = await fetch(`/api/docker/containers/${containerId}/restart`, { method: 'POST' });
            const data = await response.json();
            core.hideLoading();
            if (!response.ok) throw new Error(data.details || '重启容器失败');
            core.showAlert('容器重启成功', 'success');
            systemStatus.refreshSystemStatus(); // 刷新整体状态
        } catch (error) {
            core.hideLoading();
            core.showAlert(`重启容器失败: ${error.message}`, 'error');
             logger.error(`[dockerManager] Error restarting container ${containerId}:`, error);
        }
    },

    // 删除容器 (带确认)
    removeContainer(containerId) {
        Swal.fire({
            title: '确认删除?',
            text: `确定要删除容器 ${containerId.substring(0, 6)} 吗？此操作不可恢复！`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--danger-color)',
            cancelButtonColor: '#6c757d',
            confirmButtonText: '确认删除',
            cancelButtonText: '取消'
        }).then(async (result) => {
            if (result.isConfirmed) {
                core.showLoading('正在删除容器...');
                try {
                    const response = await fetch(`/api/docker/containers/${containerId}/remove`, { method: 'POST' }); // 使用 remove
                    const data = await response.json();
                    core.hideLoading();
                    if (!response.ok) throw new Error(data.details || '删除容器失败');
                    core.showAlert(data.message || '容器删除成功', 'success');
                    systemStatus.refreshSystemStatus(); // 刷新整体状态
                } catch (error) {
                    core.hideLoading();
                    core.showAlert(`删除容器失败: ${error.message}`, 'error');
                    logger.error(`[dockerManager] Error removing container ${containerId}:`, error);
                }
            }
        });
    },

    // --- 新增：更新容器函数 ---
    async updateContainer(containerId, currentImage) {
        const imageName = currentImage.split(':')[0]; // 提取基础镜像名
        
        const { value: newTag } = await Swal.fire({
            title: `更新容器: ${imageName}`,
            input: 'text',
            inputLabel: '请输入新的镜像标签 (例如 latest, v1.2)',
            inputValue: 'latest', // 默认值
            showCancelButton: true,
            confirmButtonText: '开始更新',
            cancelButtonText: '取消',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            inputValidator: (value) => {
                if (!value || value.trim() === '') {
                    return '镜像标签不能为空!';
                }
            },
            // 美化弹窗样式
            customClass: {
                container: 'update-container',
                popup: 'update-popup',
                header: 'update-header',
                title: 'update-title',
                closeButton: 'update-close',
                icon: 'update-icon',
                image: 'update-image',
                content: 'update-content',
                input: 'update-input',
                actions: 'update-actions',
                confirmButton: 'update-confirm',
                cancelButton: 'update-cancel',
                footer: 'update-footer'
            }
        });

        if (newTag) {
            // 显示进度弹窗
            Swal.fire({
                title: '更新容器',
                html: `
                    <div class="update-progress">
                        <p>正在更新容器 <strong>${containerId.substring(0, 8)}</strong></p>
                        <p>镜像: <strong>${imageName}:${newTag.trim()}</strong></p>
                        <div class="progress-status">准备中...</div>
                        <div class="progress-container">
                            <div class="progress-bar"></div>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => {
                    const progressBar = Swal.getPopup().querySelector('.progress-bar');
                    const progressStatus = Swal.getPopup().querySelector('.progress-status');
                    
                    // 设置初始进度
                    progressBar.style.width = '0%';
                    progressBar.style.backgroundColor = '#4CAF50';
                    
                    // 模拟进度动画
                    let progress = 0;
                    const progressInterval = setInterval(() => {
                        // 进度最多到95%，剩下的在请求完成后处理
                        if (progress < 95) {
                            progress += Math.random() * 3;
                            if (progress > 95) progress = 95;
                            progressBar.style.width = `${progress}%`;
                            
                            // 更新状态文本
                            if (progress < 30) {
                                progressStatus.textContent = "拉取新镜像...";
                            } else if (progress < 60) {
                                progressStatus.textContent = "准备更新容器...";
                            } else if (progress < 90) {
                                progressStatus.textContent = "应用新配置...";
                            } else {
                                progressStatus.textContent = "即将完成...";
                            }
                        }
                    }, 300);
                    
                    // 发送更新请求
                    this.performContainerUpdate(containerId, newTag.trim(), progressBar, progressStatus, progressInterval);
                }
            });
        }
    },
    
    // 执行容器更新请求
    async performContainerUpdate(containerId, newTag, progressBar, progressStatus, progressInterval) {
        try {
            const response = await fetch(`/api/docker/containers/${containerId}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tag: newTag })
            });
            
            // 清除进度定时器
            clearInterval(progressInterval);
            
            if (response.ok) {
                const data = await response.json();
                
                // 设置进度为100%
                progressBar.style.width = '100%';
                progressStatus.textContent = "更新完成!";
                
                // 显示成功消息
                setTimeout(() => {
                    Swal.fire({
                        icon: 'success',
                        title: '更新成功!',
                        text: data.message || '容器已成功更新',
                        confirmButtonText: '确定'
                    });
                    
                    // 刷新容器列表
                    systemStatus.refreshSystemStatus();
                }, 800);
            } else {
                const data = await response.json().catch(() => ({ error: '解析响应失败', details: '服务器返回了无效的数据' }));
                
                // 设置进度条为错误状态
                progressBar.style.width = '100%';
                progressBar.style.backgroundColor = '#f44336';
                progressStatus.textContent = "更新失败";
                
                // 显示错误消息
                setTimeout(() => {
                    Swal.fire({
                        icon: 'error',
                        title: '更新失败',
                        text: data.details || data.error || '未知错误',
                        confirmButtonText: '确定'
                    });
                }, 800);
            }
        } catch (error) {
            // 清除进度定时器
            clearInterval(progressInterval);
            
            // 设置进度条为错误状态
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = '#f44336';
            progressStatus.textContent = "更新出错";
            
            // 显示错误信息
            setTimeout(() => {
                Swal.fire({
                    icon: 'error',
                    title: '更新失败',
                    text: error.message || '网络请求失败',
                    confirmButtonText: '确定'
                });
            }, 800);
            
            // 记录错误日志
            logger.error(`[dockerManager] Error updating container ${containerId} to tag ${newTag}:`, error);
        }
    },

    // --- 新增：绑定排查按钮事件 ---
    bindTroubleshootButton() {
        // 使用 setTimeout 确保按钮已经渲染到 DOM 中
        setTimeout(() => {
            const troubleshootBtn = document.getElementById('docker-troubleshoot-btn');
            if (troubleshootBtn) {
                // 先移除旧监听器，防止重复绑定
                troubleshootBtn.replaceWith(troubleshootBtn.cloneNode(true));
                const newBtn = document.getElementById('docker-troubleshoot-btn'); // 重新获取克隆后的按钮
                if(newBtn) { 
                    newBtn.addEventListener('click', () => {
                        if (window.systemStatus && typeof window.systemStatus.showDockerHelp === 'function') {
                            window.systemStatus.showDockerHelp();
                        } else {
                            console.error('[dockerManager] systemStatus.showDockerHelp is not available.');
                            // 可以提供一个备用提示
                            alert('无法显示帮助信息，请检查控制台。');
                        }
                    });
                    console.log('[dockerManager] Troubleshoot button event listener bound.');
                } else {
                     console.warn('[dockerManager] Cloned troubleshoot button not found after replace.');
                }
            } else {
                console.warn('[dockerManager] Troubleshoot button not found for binding.');
            }
        }, 0); // 延迟 0ms 执行，让浏览器有机会渲染
    }
};

// 确保在 DOM 加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 注意：init 现在只设置监听器，不加载数据
    // dockerManager.init(); 
    // 可以在 app.js 或 systemStatus.js 初始化完成后调用
});

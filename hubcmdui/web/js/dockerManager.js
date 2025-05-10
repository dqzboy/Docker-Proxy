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
        try {
            console.log('[dockerManager] 初始化下拉菜单...');
            
            // 动态初始化所有下拉菜单按钮
            const dropdownElements = document.querySelectorAll('[data-bs-toggle="dropdown"]');
            console.log(`[dockerManager] 找到 ${dropdownElements.length} 个下拉元素`);
            
            if (dropdownElements.length === 0) {
                return; // 如果没有找到下拉元素，直接返回
            }
            
            // 尝试使用所有可能的Bootstrap初始化方法
            if (window.bootstrap && typeof window.bootstrap.Dropdown !== 'undefined') {
                console.log('[dockerManager] 使用 Bootstrap 5 初始化下拉菜单');
                dropdownElements.forEach(el => {
                    try {
                        new window.bootstrap.Dropdown(el);
                    } catch (e) {
                        console.error('Bootstrap 5 下拉菜单初始化错误:', e);
                    }
                });
            } else if (typeof $ !== 'undefined' && typeof $.fn.dropdown !== 'undefined') {
                console.log('[dockerManager] 使用 jQuery Bootstrap 初始化下拉菜单');
                $(dropdownElements).dropdown();
            } else {
                console.warn('[dockerManager] 未找到Bootstrap下拉菜单组件，将使用手动下拉实现');
                this.setupManualDropdowns();
            }
        } catch (error) {
            console.error('[dockerManager] 初始化下拉菜单错误:', error);
            // 失败时使用备用方案
            this.setupManualDropdowns();
        }
    },

    // 手动实现下拉菜单功能（备用方案）
    setupManualDropdowns: function() {
        console.log('[dockerManager] 设置手动下拉菜单...');
        
        // 为所有下拉菜单按钮添加点击事件
        document.querySelectorAll('.btn-group .dropdown-toggle').forEach(button => {
            // 移除旧事件监听器
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            // 添加新事件监听器
            newButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // 查找关联的下拉菜单
                const dropdownMenu = this.nextElementSibling;
                if (!dropdownMenu || !dropdownMenu.classList.contains('dropdown-menu')) {
                    return;
                }
                
                // 切换显示/隐藏
                const isVisible = dropdownMenu.classList.contains('show');
                
                // 先隐藏所有其他打开的下拉菜单
                document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
                
                // 切换当前菜单
                if (!isVisible) {
                    dropdownMenu.classList.add('show');
                    
                    // 计算位置 - 精确计算确保菜单位置更美观
                    const buttonRect = newButton.getBoundingClientRect();
                    const tableCell = newButton.closest('td');
                    const tableCellRect = tableCell ? tableCell.getBoundingClientRect() : buttonRect;
                    
                    // 设置最小宽度，确保下拉菜单够宽
                    const minWidth = Math.max(180, buttonRect.width * 1.5);
                    dropdownMenu.style.minWidth = `${minWidth}px`;
                    
                    // 设置绝对定位
                    dropdownMenu.style.position = 'absolute';
                    
                    // 根据屏幕空间计算最佳位置
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const spaceRight = viewportWidth - buttonRect.right;
                    const spaceBottom = viewportHeight - buttonRect.bottom;
                    const spaceAbove = buttonRect.top;
                    
                    // 先移除所有位置相关的类
                    dropdownMenu.classList.remove('dropdown-menu-top', 'dropdown-menu-right');
                    
                    // 设置为右对齐，且显示在按钮上方
                    dropdownMenu.style.right = '0';
                    dropdownMenu.style.left = 'auto';
                    
                    // 计算菜单高度 (假设每个菜单项高度为40px，分隔线10px)
                    const menuItemCount = dropdownMenu.querySelectorAll('.dropdown-item').length;
                    const dividerCount = dropdownMenu.querySelectorAll('.dropdown-divider').length;
                    const estimatedMenuHeight = (menuItemCount * 40) + (dividerCount * 10) + 20; // 加上padding
                    
                    // 优先显示在按钮上方，如果空间不足则显示在下方
                    if (spaceAbove >= estimatedMenuHeight && spaceAbove > spaceBottom) {
                        // 显示在按钮上方
                        dropdownMenu.style.bottom = `${buttonRect.height + 5}px`; // 5px间距
                        dropdownMenu.style.top = 'auto';
                        // 设置动画原点为底部
                        dropdownMenu.style.transformOrigin = 'bottom right';
                        // 添加上方显示的类
                        dropdownMenu.classList.add('dropdown-menu-top');
                    } else {
                        // 显示在右侧而不是正下方
                        if (spaceRight >= minWidth && tableCellRect.width > buttonRect.width + 20) {
                            // 有足够的右侧空间，显示在按钮右侧
                            dropdownMenu.style.top = '0';
                            dropdownMenu.style.left = `${buttonRect.width + 5}px`; // 5px间距
                            dropdownMenu.style.right = 'auto';
                            dropdownMenu.style.bottom = 'auto';
                            dropdownMenu.style.transformOrigin = 'left top';
                            // 添加右侧显示的类
                            dropdownMenu.classList.add('dropdown-menu-right');
                        } else {
                            // 显示在按钮下方，但尝试右对齐
                            dropdownMenu.style.top = `${buttonRect.height + 5}px`; // 5px间距
                            dropdownMenu.style.bottom = 'auto';
                            
                            // 如果下拉菜单宽度超过右侧可用空间，则左对齐显示
                            if (minWidth > spaceRight) {
                                dropdownMenu.style.right = 'auto';
                                dropdownMenu.style.left = '0';
                            } else {
                                // 继续使用右对齐
                                dropdownMenu.classList.add('dropdown-menu-end');
                            }
                            
                            dropdownMenu.style.transformOrigin = 'top right';
                        }
                    }
                    
                    // 清除其他可能影响布局的样式
                    dropdownMenu.style.margin = '0';
                    dropdownMenu.style.maxHeight = '85vh';
                    dropdownMenu.style.overflowY = 'auto';
                    dropdownMenu.style.zIndex = '1050'; // 确保在表格上方
                }
                
                // 点击其他区域关闭下拉菜单
                const closeHandler = function(event) {
                    if (!dropdownMenu.contains(event.target) && !newButton.contains(event.target)) {
                        dropdownMenu.classList.remove('show');
                        document.removeEventListener('click', closeHandler);
                    }
                };
                
                // 只在打开菜单时添加全局点击监听
                if (!isVisible) {
                    // 延迟一点添加事件，避免立即触发
                    setTimeout(() => {
                        document.addEventListener('click', closeHandler);
                    }, 10);
                }
            });
        });
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
                            // 显示加载状态，提高用户体验
                            this.showRefreshingState(refreshBtn);
                            
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
                        <th style="width: 12%;">容器ID</th>
                        <th style="width: 18%;">容器名称</th>
                        <th style="width: 30%;">镜像名称</th>
                        <th style="width: 15%;">运行状态</th>
                        <th style="width: 15%;">操作</th>
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
            
            // 添加表格样式
            this.applyTableStyles(table);
        }
    },

    // 新增：显示刷新中状态
    showRefreshingState(refreshBtn) {
        if (!refreshBtn) return;
        
        // 保存原始按钮内容
        const originalContent = refreshBtn.innerHTML;
        
        // 更改为加载状态
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> 刷新中...';
        refreshBtn.disabled = true;
        refreshBtn.classList.add('refreshing');
        
        // 添加样式使按钮看起来正在加载
        const style = document.createElement('style');
        style.textContent = `
            .btn.refreshing {
                opacity: 0.8;
                cursor: not-allowed;
            }
            @keyframes pulse {
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
            .btn.refreshing i {
                animation: pulse 1.5s infinite;
            }
            .table-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.7);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 10;
                border-radius: 0.25rem;
            }
            .table-overlay .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 10px;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        // 检查是否已经添加了样式
        const existingStyle = document.querySelector('style[data-for="refresh-button"]');
        if (!existingStyle) {
            style.setAttribute('data-for', 'refresh-button');
            document.head.appendChild(style);
        }
        
        // 获取表格和容器
        const table = document.getElementById('dockerStatusTable');
        const tableContainer = document.getElementById('dockerTableContainer');
        
        // 移除任何现有的覆盖层
        const existingOverlay = document.querySelector('.table-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // 创建一个覆盖层而不是替换表格内容
        if (table) {
            // 设置表格容器为相对定位，以便正确放置覆盖层
            if (tableContainer) {
                tableContainer.style.position = 'relative';
            } else {
                table.parentNode.style.position = 'relative';
            }
            
            // 创建覆盖层
            const overlay = document.createElement('div');
            overlay.className = 'table-overlay';
            overlay.innerHTML = `
                <div class="spinner"></div>
                <p>正在更新容器列表...</p>
            `;
            
            // 获取表格的位置并设置覆盖层
            const tableRect = table.getBoundingClientRect();
            overlay.style.width = `${table.offsetWidth}px`;
            overlay.style.height = `${table.offsetHeight}px`;
            
            // 将覆盖层添加到表格容器
            if (tableContainer) {
                tableContainer.appendChild(overlay);
            } else {
                table.parentNode.appendChild(overlay);
            }
        }
        
        // 设置超时，防止永久加载状态
        setTimeout(() => {
            // 如果按钮仍处于加载状态，恢复为原始状态
            if (refreshBtn.classList.contains('refreshing')) {
                refreshBtn.innerHTML = originalContent;
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('refreshing');
                
                // 移除覆盖层
                const overlay = document.querySelector('.table-overlay');
                if (overlay) {
                    overlay.remove();
                }
            }
        }, 10000); // 10秒超时
    },

    // 渲染容器表格 - 核心渲染函数，由 systemStatus 调用
    renderContainersTable(containers, dockerStatus) {
        // 减少详细日志输出
        // console.log(`[dockerManager] Rendering containers table. Containers count: ${containers ? containers.length : 0}`);
        
        // 重置刷新按钮状态
        const refreshBtn = document.getElementById('refreshDockerBtn');
        if (refreshBtn && refreshBtn.classList.contains('refreshing')) {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-1"></i> 刷新列表';
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('refreshing');
            
            // 移除覆盖层
            const overlay = document.querySelector('.table-overlay');
            if (overlay) {
                overlay.remove();
            }
        }
        
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
                        <th style="width: 12%;">容器ID</th>
                        <th style="width: 18%;">容器名称</th>
                        <th style="width: 30%;">镜像名称</th>
                        <th style="width: 15%;">运行状态</th>
                        <th style="width: 15%;">操作</th>
                    </tr>
                `;
                
                if (!thead) {
                    table.insertBefore(newThead, tbody);
                }
            }
            
            // 应用表格样式
            this.applyTableStyles(table);
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
            
            // 创建按钮组，使用标准Bootstrap 5下拉菜单语法
            let actionButtons = `
                <div class="btn-group">
                    <button type="button" class="btn btn-sm btn-primary dropdown-toggle simple-dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                        操作
                    </button>
                    <select class="simple-dropdown">
                        <option value="" selected disabled>选择操作</option>
                        <option class="dropdown-item action-logs" data-id="${containerId}" data-name="${containerName}">查看日志</option>
            `;
            
            // 根据状态添加不同的操作选项
            if (lowerStatus.includes('running')) {
                actionButtons += `
                        <option class="dropdown-item action-stop" data-id="${containerId}">停止容器</option>
                `;
            } else if (lowerStatus.includes('exited') || lowerStatus.includes('stopped') || lowerStatus.includes('created')) {
                actionButtons += `
                        <option class="dropdown-item action-start" data-id="${containerId}">启动容器</option>
                `;
            } else if (lowerStatus.includes('paused')) {
                actionButtons += `
                        <option class="dropdown-item action-unpause" data-id="${containerId}">恢复容器</option>
                `;
            }
            
            // 重启和删除操作对所有状态都可用
            actionButtons += `
                        <option class="dropdown-item action-restart" data-id="${containerId}">重启容器</option>
                        <option class="dropdown-item action-stop" data-id="${containerId}">停止容器</option>
                        <option class="dropdown-item action-remove" data-id="${containerId}">删除容器</option>
                        <option class="dropdown-item action-update" data-id="${containerId}" data-image="${containerImage || ''}">更新容器</option>
                    </select>
                </div>
            `;

            html += `
                <tr>
                    <td data-label="ID" title="${containerId}" class="text-center">${containerId.substring(0, 12)}</td>
                    <td data-label="名称" title="${containerName}" class="text-center">${containerName}</td>
                    <td data-label="镜像" title="${containerImage}" class="text-center">${containerImage}</td>
                    <td data-label="状态" class="text-center"><span class="badge ${statusClass}">${status}</span></td>
                    <td data-label="操作" class="action-cell text-center">
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
        
        // 确保在内容渲染后立即初始化下拉菜单
        setTimeout(() => {
            this.initDropdowns();
            // 备用方法：直接为下拉菜单按钮添加点击事件
            this.setupManualDropdowns();
        }, 100); // 增加延迟确保DOM完全渲染
    },
    
    // 为所有操作按钮绑定事件 - 简化此方法，专注于直接点击处理
    setupButtonListeners() {
        // 为下拉框选择事件添加处理逻辑
        document.querySelectorAll('.action-cell .simple-dropdown').forEach(select => {
            select.addEventListener('change', (event) => {
                event.preventDefault();
                
                const selectedOption = select.options[select.selectedIndex];
                if (!selectedOption || selectedOption.disabled) return;
                
                const action = Array.from(selectedOption.classList).find(cls => cls.startsWith('action-'));
                if (!action) return;
                
                const containerId = selectedOption.getAttribute('data-id');
                if (!containerId) return;
                
                const containerName = selectedOption.getAttribute('data-name');
                const containerImage = selectedOption.getAttribute('data-image');
                
                console.log('处理容器操作:', action, '容器ID:', containerId);
                
                // 执行对应的容器操作
                this.handleContainerAction(action, containerId, containerName, containerImage);
                
                // 重置选择，以便下次可以再次选择相同选项
                select.selectedIndex = 0;
            });
        });
        
        // 让下拉框按钮隐藏，只显示select元素
        document.querySelectorAll('.simple-dropdown-toggle').forEach(button => {
            button.style.display = 'none';
        });
        
        // 样式化select元素
        document.querySelectorAll('.simple-dropdown').forEach(select => {
            select.style.display = 'block';
            select.style.width = '100%';
            select.style.padding = '0.375rem 0.75rem';
            select.style.fontSize = '0.875rem';
            select.style.borderRadius = '0.25rem';
            select.style.border = '1px solid #ced4da';
            select.style.backgroundColor = '#fff';
        });
    },
    
    // 处理容器操作的统一方法
    handleContainerAction(action, containerId, containerName, containerImage) {
        console.log('Handling container action:', action, 'for container:', containerId);
        
        switch (action) {
            case 'action-logs':
                this.showContainerLogs(containerId, containerName);
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
                console.warn('Unpause action not implemented yet.');
                break;
            case 'action-update':
                this.updateContainer(containerId, containerImage);
                break;
            default:
                console.warn('Unknown action:', action);
        }
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
    
    // 设置下拉菜单动作的事件监听 - 简化为空方法，因为使用原生select不需要
    setupActionDropdownListener() {
        // 不需要特殊处理，使用原生select元素的change事件
    },

    // 查看日志
    async showContainerLogs(containerId, containerName) {
        console.log('正在获取日志，容器ID:', containerId, '容器名称:', containerName);
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
            console.error(`[dockerManager] Error fetching logs for ${containerId}:`, error);
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
            
            // 刷新已停止容器列表
            if (window.app && typeof window.app.refreshStoppedContainers === 'function') {
                window.app.refreshStoppedContainers();
            }
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
            width: '36em', // 增加弹窗宽度
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
            },
            // 添加自定义CSS
            didOpen: () => {
                // 修复输入框宽度
                const inputElement = Swal.getInput();
                if (inputElement) {
                    inputElement.style.maxWidth = '100%';
                    inputElement.style.width = '100%';
                    inputElement.style.boxSizing = 'border-box';
                    inputElement.style.margin = '0';
                    inputElement.style.padding = '0.5rem';
                }
                
                // 修复输入标签宽度
                const inputLabel = Swal.getPopup().querySelector('.swal2-input-label');
                if (inputLabel) {
                    inputLabel.style.whiteSpace = 'normal';
                    inputLabel.style.textAlign = 'left';
                    inputLabel.style.width = '100%';
                    inputLabel.style.padding = '0 10px';
                    inputLabel.style.boxSizing = 'border-box';
                    inputLabel.style.marginBottom = '0.5rem';
                }
                
                // 调整弹窗内容区域
                const content = Swal.getPopup().querySelector('.swal2-content');
                if (content) {
                    content.style.padding = '0 1.5rem';
                    content.style.boxSizing = 'border-box';
                    content.style.width = '100%';
                }
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
    },

    // 新增方法: 应用表格样式
    applyTableStyles(table) {
        if (!table) return;
        
        // 添加基本样式
        table.style.width = "100%";
        table.style.tableLayout = "auto";
        table.style.borderCollapse = "collapse";
        
        // 设置表头样式
        const thead = table.querySelector('thead');
        if (thead) {
            thead.style.backgroundColor = "#f8f9fa";
            thead.style.fontWeight = "bold";
            const thCells = thead.querySelectorAll('th');
            thCells.forEach(th => {
                th.style.textAlign = "center";
                th.style.padding = "10px 8px";
                th.style.verticalAlign = "middle";
            });
        }
        
        // 添加响应式样式
        const style = document.createElement('style');
        style.textContent = `
            #dockerStatusTable {
                width: 100%;
                table-layout: auto;
            }
            #dockerStatusTable th, #dockerStatusTable td {
                text-align: center;
                vertical-align: middle;
                padding: 8px;
            }
            #dockerStatusTable td.action-cell {
                padding: 4px;
            }
            @media (max-width: 768px) {
                #dockerStatusTable {
                    table-layout: fixed;
                }
            }
        `;
        
        // 检查是否已经添加了样式
        const existingStyle = document.querySelector('style[data-for="dockerStatusTable"]');
        if (!existingStyle) {
            style.setAttribute('data-for', 'dockerStatusTable');
            document.head.appendChild(style);
        }
    }
};

// 确保在 DOM 加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 注意：init 现在只设置监听器，不加载数据
    // dockerManager.init(); 
    // 可以在 app.js 或 systemStatus.js 初始化完成后调用
});

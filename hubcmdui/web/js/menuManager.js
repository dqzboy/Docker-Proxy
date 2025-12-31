/**
 * 菜单管理模块 - 管理 data/config.json 中的 menuItems
 */

// 菜单项列表 (从 config.json 读取)
let configMenuItems = [];
let currentConfig = {}; // 保存当前完整的配置

// 创建menuManager对象
const menuManager = {
    // 初始化菜单管理
    init: async function() {
        // console.log('初始化菜单管理 (config.json)...');
        this.renderMenuTableHeader(); // 渲染表头
        await this.loadMenuItems();   // 加载菜单项
        return Promise.resolve();
    },

    // 渲染菜单表格头部 (根据 config.json 结构调整)
    renderMenuTableHeader: function() {
        const menuTable = document.getElementById('menuTable');
        if (!menuTable) return;

        const thead = menuTable.querySelector('thead') || document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th style="width: 6%">#</th>
                <th style="width: 22%">菜单文本</th>
                <th style="width: 38%">链接地址</th>
                <th style="width: 12%">新标签页</th>
                <th style="width: 22%">操作</th>
            </tr>
        `;

        if (!menuTable.querySelector('thead')) {
            menuTable.appendChild(thead);
        }
    },

    // 加载菜单项 (从 /api/config 获取)
    loadMenuItems: async function() {
        try {
            const menuTableBody = document.getElementById('menuTableBody');
            if (menuTableBody) {
                menuTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> 正在加载菜单项...</td></tr>';
            }

            const response = await fetch('/api/config'); // 请求配置接口
            if (!response.ok) {
                throw new Error(`获取配置失败: ${response.statusText || response.status}`);
            }

            currentConfig = await response.json(); // 保存完整配置
            configMenuItems = currentConfig.menuItems || []; // 提取菜单项，如果不存在则为空数组

            this.renderMenuItems();
            // console.log('成功从 /api/config 加载菜单项', configMenuItems);

        } catch (error) {
            // console.error('加载菜单项失败:', error);
            const menuTableBody = document.getElementById('menuTableBody');
            if (menuTableBody) {
                menuTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: #ff4d4f;">
                            <i class="fas fa-exclamation-circle"></i>
                            加载菜单项失败: ${error.message}
                            <button onclick="menuManager.loadMenuItems()" class="retry-btn">
                                <i class="fas fa-sync"></i> 重试
                            </button>
                        </td>
                    </tr>
                `;
            }
        }
    },

    // 渲染菜单项 (根据 config.json 结构)
    renderMenuItems: function() {
        const menuTableBody = document.getElementById('menuTableBody');
        if (!menuTableBody) return;

        menuTableBody.innerHTML = ''; // 清空现有内容

        if (!Array.isArray(configMenuItems)) {
            // console.error("configMenuItems 不是一个数组:", configMenuItems);
            menuTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>菜单数据格式错误</p>
                    </td>
                </tr>`;
            return;
        }

        if (configMenuItems.length === 0) {
            menuTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty-state">
                        <i class="fas fa-list-ul"></i>
                        <p>暂无菜单项，点击"添加菜单项"开始创建</p>
                    </td>
                </tr>`;
            return;
        }

        configMenuItems.forEach((item, index) => {
            const row = document.createElement('tr');
            // 使用 index 作为临时 ID 进行操作
            row.innerHTML = `
                <td><span class="table-row-num">${index + 1}</span></td>
                <td><span class="menu-text-display">${item.text || ''}</span></td>
                <td><code class="menu-link-display">${item.link || ''}</code></td>
                <td><span class="menu-newtab-badge ${item.newTab ? 'yes' : 'no'}">${item.newTab ? '是' : '否'}</span></td>
                <td class="action-buttons">
                    <button class="action-btn edit-btn" title="编辑菜单" onclick="menuManager.editMenuItem(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" title="删除菜单" onclick="menuManager.deleteMenuItem(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            menuTableBody.appendChild(row);
        });
    },

    // 显示新菜单项行 (调整字段)
    showNewMenuItemRow: function() {
        const menuTableBody = document.getElementById('menuTableBody');
        if (!menuTableBody) return;

        // 移除空状态行（如果存在）
        const emptyState = menuTableBody.querySelector('.table-empty-state');
        if (emptyState) {
            emptyState.closest('tr').remove();
        }

        // 如果已存在新行，则不重复添加
        if (document.getElementById('new-menu-item-row')) {
            document.getElementById('new-text').focus();
            return;
        }

        const newRow = document.createElement('tr');
        newRow.id = 'new-menu-item-row';
        newRow.className = 'new-item-row'; // 可以为此行添加特定样式

        newRow.innerHTML = `
            <td>#</td>
            <td><input type="text" id="new-text" class="form-control form-control-sm" placeholder="菜单文本"></td>
            <td><input type="text" id="new-link" class="form-control form-control-sm" placeholder="链接地址 (例如 /about 或 https://example.com)"></td>
            <td>
                <select id="new-newTab" class="form-select form-select-sm">
                    <option value="false">否</option>
                    <option value="true">是</option>
                </select>
            </td>
            <td class="action-buttons-new-menu">
                <button class="btn btn-sm btn-success save-new-menu-btn" onclick="menuManager.saveNewMenuItem()">
                    <i class="fas fa-save"></i> 保存
                </button>
                <button class="btn btn-sm btn-danger cancel-new-menu-btn" onclick="menuManager.cancelNewMenuItem()">
                    <i class="fas fa-times"></i> 取消
                </button>
            </td>
        `;
        // 将新行添加到表格体的最上方
        menuTableBody.insertBefore(newRow, menuTableBody.firstChild);
        document.getElementById('new-text').focus();
    },

    // 保存新菜单项 (更新整个配置)
    saveNewMenuItem: async function() {
        try {
            const text = document.getElementById('new-text').value.trim();
            const link = document.getElementById('new-link').value.trim();
            const newTab = document.getElementById('new-newTab').value === 'true';

            if (!text || !link) {
                throw new Error('文本和链接为必填项');
            }

            const newMenuItem = { text, link, newTab };

            // 创建更新后的配置对象
            const updatedConfig = {
                ...currentConfig,
                menuItems: [...(currentConfig.menuItems || []), newMenuItem] // 添加新项
            };

            // 调用API保存整个配置
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConfig) // 发送更新后的完整配置
            });

            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(`保存配置失败: ${errorData.details || response.statusText}`);
            }

            // 重新加载菜单项以更新视图和 currentConfig
            await this.loadMenuItems();
            this.cancelNewMenuItem(); // 移除编辑行
            core.showAlert('菜单项已添加', 'success');

        } catch (error) {
            // console.error('添加菜单项失败:', error);
            core.showAlert('添加菜单项失败: ' + error.message, 'error');
        }
    },

    // 取消新菜单项
    cancelNewMenuItem: function() {
        const newRow = document.getElementById('new-menu-item-row');
        if (newRow) {
            newRow.remove();
        }
    },

    // 编辑菜单项 (使用 index 定位)
    editMenuItem: function(index) {
        const item = configMenuItems[index];
        if (!item) {
            core.showAlert('找不到指定的菜单项', 'error');
            return;
        }

        Swal.fire({
            title: '',
            html: `
                <div class="swal-edit-container">
                    <div class="swal-edit-header">
                        <div class="swal-edit-icon">
                            <i class="fas fa-edit"></i>
                        </div>
                        <h2 class="swal-edit-title">编辑菜单项</h2>
                        <p class="swal-edit-subtitle">修改菜单显示文本和链接配置</p>
                    </div>
                    
                    <div class="swal-edit-form">
                        <div class="swal-form-group">
                            <label for="edit-text" class="swal-form-label">
                                <i class="fas fa-font"></i> 菜单文本
                            </label>
                            <div class="swal-input-wrapper">
                                <input type="text" id="edit-text" class="swal-modern-input" value="${item.text || ''}" placeholder="输入菜单显示文本">
                            </div>
                            <p class="swal-form-hint">用户在导航中看到的文字</p>
                        </div>
                        
                        <div class="swal-form-group">
                            <label for="edit-link" class="swal-form-label">
                                <i class="fas fa-link"></i> 链接地址
                            </label>
                            <div class="swal-input-wrapper">
                                <input type="text" id="edit-link" class="swal-modern-input" value="${item.link || ''}" placeholder="https://example.com 或 /page">
                            </div>
                            <p class="swal-form-hint">点击菜单后跳转的URL</p>
                        </div>
                        
                        <div class="swal-form-group swal-toggle-group">
                            <div class="swal-toggle-left">
                                <label class="swal-form-label">
                                    <i class="fas fa-external-link-alt"></i> 新标签页打开
                                </label>
                                <p class="swal-form-hint">是否在新窗口中打开链接</p>
                            </div>
                            <div class="swal-toggle-right">
                                <label class="swal-toggle-switch">
                                    <input type="checkbox" id="edit-newTab" ${item.newTab ? 'checked' : ''}>
                                    <span class="swal-toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="swal-preview-box">
                            <div class="swal-preview-label">
                                <i class="fas fa-eye"></i> 效果预览
                            </div>
                            <div class="swal-preview-content">
                                <a href="javascript:void(0)" class="swal-preview-link" id="preview-link-el">
                                    <span id="preview-text-el">${item.text || '菜单项'}</span>
                                    <i class="fas fa-external-link-alt swal-preview-external" id="preview-external-icon" style="${item.newTab ? '' : 'display:none'}"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                <style>
                    .swal2-popup.swal2-modal {
                        border-radius: 20px !important;
                        padding: 0 !important;
                        overflow: hidden;
                    }
                    .swal-edit-container {
                        padding: 0;
                    }
                    .swal-edit-header {
                        background: linear-gradient(135deg, #3d7cfa 0%, #6366f1 100%);
                        padding: 2rem 2rem 1.75rem;
                        text-align: center;
                        position: relative;
                    }
                    .swal-edit-icon {
                        width: 56px;
                        height: 56px;
                        background: rgba(255,255,255,0.2);
                        border-radius: 16px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 1rem;
                        backdrop-filter: blur(10px);
                    }
                    .swal-edit-icon i {
                        font-size: 1.5rem;
                        color: white;
                    }
                    .swal-edit-title {
                        color: white;
                        font-size: 1.4rem;
                        font-weight: 700;
                        margin: 0 0 0.35rem 0;
                    }
                    .swal-edit-subtitle {
                        color: rgba(255,255,255,0.85);
                        font-size: 0.9rem;
                        margin: 0;
                        font-weight: 400;
                    }
                    .swal-edit-form {
                        padding: 1.75rem 2rem 1.5rem;
                    }
                    .swal-form-group {
                        margin-bottom: 1.35rem;
                    }
                    .swal-form-label {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        font-size: 0.9rem;
                        font-weight: 600;
                        color: #334155;
                        margin-bottom: 0.6rem;
                    }
                    .swal-form-label i {
                        color: #3d7cfa;
                        font-size: 0.85rem;
                    }
                    .swal-input-wrapper {
                        position: relative;
                    }
                    .swal-modern-input {
                        width: 100%;
                        padding: 0.85rem 1rem;
                        border: 2px solid #e2e8f0;
                        border-radius: 12px;
                        font-size: 0.95rem;
                        transition: all 0.25s ease;
                        background: #f8fafc;
                        color: #1e293b;
                        box-sizing: border-box;
                    }
                    .swal-modern-input::placeholder {
                        color: #94a3b8;
                    }
                    .swal-modern-input:focus {
                        border-color: #3d7cfa;
                        background: white;
                        box-shadow: 0 0 0 4px rgba(61, 124, 250, 0.12);
                        outline: none;
                    }
                    .swal-form-hint {
                        font-size: 0.78rem;
                        color: #94a3b8;
                        margin: 0.4rem 0 0 0;
                    }
                    .swal-toggle-group {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: linear-gradient(135deg, #f1f5f9, #f8fafc);
                        padding: 1rem 1.25rem;
                        border-radius: 12px;
                        border: 1px solid #e2e8f0;
                    }
                    .swal-toggle-left {
                        flex: 1;
                    }
                    .swal-toggle-left .swal-form-label {
                        margin-bottom: 0.25rem;
                    }
                    .swal-toggle-left .swal-form-hint {
                        margin: 0;
                    }
                    .swal-toggle-switch {
                        position: relative;
                        display: inline-block;
                        width: 52px;
                        height: 28px;
                    }
                    .swal-toggle-switch input {
                        opacity: 0;
                        width: 0;
                        height: 0;
                    }
                    .swal-toggle-slider {
                        position: absolute;
                        cursor: pointer;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: #cbd5e1;
                        transition: 0.3s;
                        border-radius: 28px;
                    }
                    .swal-toggle-slider:before {
                        position: absolute;
                        content: "";
                        height: 22px;
                        width: 22px;
                        left: 3px;
                        bottom: 3px;
                        background: white;
                        transition: 0.3s;
                        border-radius: 50%;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                    }
                    .swal-toggle-switch input:checked + .swal-toggle-slider {
                        background: linear-gradient(135deg, #10b981, #34d399);
                    }
                    .swal-toggle-switch input:checked + .swal-toggle-slider:before {
                        transform: translateX(24px);
                    }
                    .swal-preview-box {
                        margin-top: 1.5rem;
                        border: 2px dashed #e2e8f0;
                        border-radius: 12px;
                        padding: 1rem;
                        background: linear-gradient(135deg, #fafbfc, #f5f7fa);
                    }
                    .swal-preview-label {
                        text-align: center;
                        font-size: 0.8rem;
                        color: #94a3b8;
                        margin-bottom: 0.75rem;
                        font-weight: 500;
                    }
                    .swal-preview-label i {
                        margin-right: 0.35rem;
                    }
                    .swal-preview-content {
                        display: flex;
                        justify-content: center;
                        padding: 0.75rem;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                    }
                    .swal-preview-link {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.4rem;
                        color: #3d7cfa;
                        text-decoration: none;
                        font-weight: 600;
                        font-size: 1rem;
                        padding: 0.5rem 1rem;
                        border-radius: 8px;
                        transition: all 0.2s ease;
                    }
                    .swal-preview-link:hover {
                        background: rgba(61, 124, 250, 0.08);
                    }
                    .swal-preview-external {
                        font-size: 0.75rem;
                        opacity: 0.7;
                    }
                    .swal2-actions {
                        padding: 0 2rem 1.75rem !important;
                        gap: 0.75rem !important;
                        margin: 0 !important;
                    }
                    .swal2-confirm {
                        background: linear-gradient(135deg, #3d7cfa, #6366f1) !important;
                        border-radius: 10px !important;
                        padding: 0.75rem 1.5rem !important;
                        font-weight: 600 !important;
                        font-size: 0.95rem !important;
                        box-shadow: 0 4px 14px rgba(61, 124, 250, 0.35) !important;
                        border: none !important;
                    }
                    .swal2-confirm:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(61, 124, 250, 0.45) !important;
                    }
                    .swal2-cancel {
                        background: #f1f5f9 !important;
                        color: #64748b !important;
                        border-radius: 10px !important;
                        padding: 0.75rem 1.5rem !important;
                        font-weight: 600 !important;
                        font-size: 0.95rem !important;
                        border: none !important;
                    }
                    .swal2-cancel:hover {
                        background: #e2e8f0 !important;
                    }
                    .swal2-validation-message {
                        background: #fef2f2 !important;
                        color: #dc2626 !important;
                        border-radius: 8px !important;
                        margin: 0 2rem 1rem !important;
                        padding: 0.75rem 1rem !important;
                        font-size: 0.9rem !important;
                    }
                </style>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check"></i> 保存更改',
            cancelButtonText: '取消',
            width: '480px',
            focusConfirm: false,
            showClass: {
                popup: 'animate__animated animate__fadeInUp animate__faster'
            },
            hideClass: {
                popup: 'animate__animated animate__fadeOutDown animate__faster'
            },
            didOpen: () => {
                // 添加输入监听，更新预览
                const textInput = document.getElementById('edit-text');
                const linkInput = document.getElementById('edit-link');
                const newTabToggle = document.getElementById('edit-newTab');
                const previewTextEl = document.getElementById('preview-text-el');
                const previewExternalIcon = document.getElementById('preview-external-icon');
                
                const updatePreview = () => {
                    previewTextEl.textContent = textInput.value || '菜单项';
                    previewExternalIcon.style.display = newTabToggle.checked ? '' : 'none';
                };
                
                textInput.addEventListener('input', updatePreview);
                linkInput.addEventListener('input', updatePreview);
                newTabToggle.addEventListener('change', updatePreview);
            },
            preConfirm: () => {
                const text = document.getElementById('edit-text').value.trim();
                const link = document.getElementById('edit-link').value.trim();
                const newTab = document.getElementById('edit-newTab').checked;
                
                if (!text) {
                    Swal.showValidationMessage('菜单文本不能为空');
                    return false;
                }
                
                if (!link) {
                    Swal.showValidationMessage('链接地址不能为空');
                    return false;
                }
                
                return { text, link, newTab };
            }
        }).then(async (result) => {
            if (!result.isConfirmed) return;
            
            try {
                // 显示保存中状态
                Swal.fire({
                    title: '保存中...',
                    html: '<i class="fas fa-spinner fa-spin"></i> 正在保存菜单项',
                    showConfirmButton: false,
                    allowOutsideClick: false,
                    willOpen: () => {
                        Swal.showLoading();
                    }
                });
                
                // 更新配置中的菜单项
                configMenuItems[index] = result.value;
                
                // 创建更新后的配置对象
                const updatedConfig = {
                    ...currentConfig,
                    menuItems: configMenuItems // 更新后的菜单项数组
                };
                
                // 调用API保存整个配置
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedConfig) // 发送更新后的完整配置
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`保存配置失败: ${errorData.details || response.statusText}`);
                }
                
                // 重新渲染菜单项
                this.renderMenuItems();

                // 显示成功消息
                Swal.fire({
                    icon: 'success',
                    title: '保存成功',
                    html: '<i class="fas fa-check-circle"></i> 菜单项已更新',
                    timer: 1500,
                    showConfirmButton: false
                });
                
            } catch (error) {
                // console.error('更新菜单项失败:', error);
                Swal.fire({
                    icon: 'error',
                    title: '保存失败',
                    html: `<i class="fas fa-times-circle"></i> 更新菜单项失败: ${error.message}`,
                    confirmButtonText: '确定'
                });
            }
        });
    },

    // 删除菜单项
    deleteMenuItem: function(index) {
        const item = configMenuItems[index];
        if (!item) {
            core.showAlert('找不到指定的菜单项', 'error');
            return;
        }
        
        Swal.fire({
            title: '确认删除',
            text: `确定要删除菜单项 "${item.text}" 吗？`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            confirmButtonColor: '#d33'
        }).then(async (result) => {
            if (!result.isConfirmed) return;
            
            try {
                // 从菜单项数组中移除指定项
                configMenuItems.splice(index, 1);
                
                // 创建更新后的配置对象
                const updatedConfig = {
                    ...currentConfig,
                    menuItems: configMenuItems // 更新后的菜单项数组
                };
                
                // 调用API保存整个配置
                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedConfig) // 发送更新后的完整配置
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`保存配置失败: ${errorData.details || response.statusText}`);
                }
                
                // 重新渲染菜单项
                this.renderMenuItems();
                core.showAlert('菜单项已删除', 'success');
                
            } catch (error) {
                // console.error('删除菜单项失败:', error);
                core.showAlert('删除菜单项失败: ' + error.message, 'error');
            }
        });
    }
};

// 全局公开菜单管理模块
window.menuManager = menuManager;

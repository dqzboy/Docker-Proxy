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
        console.log('初始化菜单管理 (config.json)...');
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
                <th style="width: 5%">#</th>
                <th style="width: 25%">文本 (Text)</th>
                <th style="width: 40%">链接 (Link)</th>
                <th style="width: 10%">新标签页 (New Tab)</th>
                <th style="width: 20%">操作</th>
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
            console.log('成功从 /api/config 加载菜单项', configMenuItems);

        } catch (error) {
            console.error('加载菜单项失败:', error);
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
            console.error("configMenuItems 不是一个数组:", configMenuItems);
            menuTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff4d4f;">菜单数据格式错误</td></tr>';
            return;
        }

        configMenuItems.forEach((item, index) => {
            const row = document.createElement('tr');
            // 使用 index 作为临时 ID 进行操作
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.text || ''}</td>
                <td>${item.link || ''}</td>
                <td>${item.newTab ? '是' : '否'}</td>
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

        const newRow = document.createElement('tr');
        newRow.id = 'new-menu-item-row';
        newRow.className = 'new-item-row';

        newRow.innerHTML = `
            <td>#</td>
            <td><input type="text" id="new-text" placeholder="菜单文本"></td>
            <td><input type="text" id="new-link" placeholder="链接地址"></td>
            <td>
                <select id="new-newTab">
                    <option value="false">否</option>
                    <option value="true">是</option>
                </select>
            </td>
            <td>
                <button class="action-btn" onclick="menuManager.saveNewMenuItem()">保存</button>
                <button class="action-btn" onclick="menuManager.cancelNewMenuItem()">取消</button>
            </td>
        `;
        menuTableBody.appendChild(newRow);
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
            console.error('添加菜单项失败:', error);
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
            title: '<div class="edit-title"><i class="fas fa-edit"></i> 编辑菜单项</div>',
            html: `
                <div class="edit-menu-form">
                    <div class="form-group">
                        <label for="edit-text">
                            <i class="fas fa-font"></i> 菜单文本
                        </label>
                        <div class="input-wrapper">
                            <input type="text" id="edit-text" class="modern-input" value="${item.text || ''}" placeholder="请输入菜单文本">
                            <span class="input-icon"><i class="fas fa-heading"></i></span>
                        </div>
                        <small class="form-hint">菜单项显示的文本，保持简洁明了</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="edit-link">
                            <i class="fas fa-link"></i> 链接地址
                        </label>
                        <div class="input-wrapper">
                            <input type="text" id="edit-link" class="modern-input" value="${item.link || ''}" placeholder="请输入链接地址">
                            <span class="input-icon"><i class="fas fa-globe"></i></span>
                        </div>
                        <small class="form-hint">完整URL路径（例如: https://example.com）或相对路径（例如: /docs）</small>
                    </div>
                    
                    <div class="form-group toggle-switch">
                        <label for="edit-newTab" class="toggle-label-text">
                            <i class="fas fa-external-link-alt"></i> 在新标签页打开
                        </label>
                        <div class="toggle-switch-container">
                            <input type="checkbox" id="edit-newTab" class="toggle-input" ${item.newTab ? 'checked' : ''}>
                            <label for="edit-newTab" class="toggle-label"></label>
                            <span class="toggle-status">${item.newTab ? '是' : '否'}</span>
                        </div>
                    </div>
                    
                    <div class="form-preview">
                        <div class="preview-title"><i class="fas fa-eye"></i> 预览</div>
                        <div class="preview-content">
                            <a href="${item.link || '#'}" class="preview-link" target="${item.newTab ? '_blank' : '_self'}">
                                <span class="preview-text">${item.text || '菜单项'}</span>
                                ${item.newTab ? '<i class="fas fa-external-link-alt preview-icon"></i>' : ''}
                            </a>
                        </div>
                    </div>
                </div>
                <style>
                    .edit-title {
                        font-size: 1.5rem;
                        color: #3085d6;
                        margin-bottom: 10px;
                    }
                    .edit-menu-form {
                        text-align: left;
                        padding: 0 15px;
                    }
                    .form-group {
                        margin-bottom: 20px;
                        position: relative;
                    }
                    .form-group label {
                        display: block;
                        margin-bottom: 8px;
                        font-weight: 600;
                        color: #444;
                        font-size: 0.95rem;
                    }
                    .input-wrapper {
                        position: relative;
                    }
                    .modern-input {
                        width: 100%;
                        padding: 12px 40px 12px 15px;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        font-size: 1rem;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                    }
                    .modern-input:focus {
                        border-color: #3085d6;
                        box-shadow: 0 0 0 3px rgba(48, 133, 214, 0.2);
                        outline: none;
                    }
                    .input-icon {
                        position: absolute;
                        right: 12px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: #aaa;
                    }
                    .form-hint {
                        display: block;
                        font-size: 0.8rem;
                        color: #888;
                        margin-top: 5px;
                        font-style: italic;
                    }
                    .toggle-switch {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 5px 0;
                    }
                    .toggle-label-text {
                        margin-bottom: 0 !important;
                    }
                    .toggle-switch-container {
                        display: flex;
                        align-items: center;
                    }
                    .toggle-input {
                        display: none;
                    }
                    .toggle-label {
                        display: block;
                        width: 52px;
                        height: 26px;
                        background: #e6e6e6;
                        border-radius: 13px;
                        position: relative;
                        cursor: pointer;
                        transition: background 0.3s ease;
                        box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .toggle-label:after {
                        content: '';
                        position: absolute;
                        top: 3px;
                        left: 3px;
                        width: 20px;
                        height: 20px;
                        background: white;
                        border-radius: 50%;
                        transition: transform 0.3s ease, box-shadow 0.3s ease;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .toggle-input:checked + .toggle-label {
                        background: #3085d6;
                    }
                    .toggle-input:checked + .toggle-label:after {
                        transform: translateX(26px);
                    }
                    .toggle-status {
                        margin-left: 10px;
                        font-size: 0.9rem;
                        color: #666;
                        min-width: 20px;
                    }
                    .form-preview {
                        margin-top: 25px;
                        border: 1px dashed #ccc;
                        border-radius: 8px;
                        padding: 15px;
                        background-color: #f9f9f9;
                    }
                    .preview-title {
                        font-size: 0.9rem;
                        color: #666;
                        margin-bottom: 10px;
                        text-align: center;
                    }
                    .preview-content {
                        display: flex;
                        justify-content: center;
                        padding: 10px;
                        background: white;
                        border-radius: 6px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .preview-link {
                        display: flex;
                        align-items: center;
                        color: #3085d6;
                        text-decoration: none;
                        font-weight: 500;
                        padding: 5px 10px;
                        border-radius: 4px;
                        transition: background 0.2s ease;
                    }
                    .preview-link:hover {
                        background: #f0f7ff;
                    }
                    .preview-text {
                        margin-right: 5px;
                    }
                    .preview-icon {
                        font-size: 0.8rem;
                        opacity: 0.7;
                    }
                </style>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save"></i> 保存',
            cancelButtonText: '<i class="fas fa-times"></i> 取消',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#6c757d',
            width: '550px',
            focusConfirm: false,
            customClass: {
                container: 'menu-edit-container',
                popup: 'menu-edit-popup',
                title: 'menu-edit-title',
                confirmButton: 'menu-edit-confirm',
                cancelButton: 'menu-edit-cancel'
            },
            didOpen: () => {
                // 添加输入监听，更新预览
                const textInput = document.getElementById('edit-text');
                const linkInput = document.getElementById('edit-link');
                const newTabToggle = document.getElementById('edit-newTab');
                const toggleStatus = document.querySelector('.toggle-status');
                const previewText = document.querySelector('.preview-text');
                const previewLink = document.querySelector('.preview-link');
                const previewIcon = document.querySelector('.preview-icon') || document.createElement('i');
                
                if (!previewIcon.classList.contains('fas')) {
                    previewIcon.className = 'fas fa-external-link-alt preview-icon';
                }
                
                const updatePreview = () => {
                    previewText.textContent = textInput.value || '菜单项';
                    previewLink.href = linkInput.value || '#';
                    previewLink.target = newTabToggle.checked ? '_blank' : '_self';
                    
                    if (newTabToggle.checked) {
                        if (!previewLink.contains(previewIcon)) {
                            previewLink.appendChild(previewIcon);
                        }
                    } else {
                        if (previewLink.contains(previewIcon)) {
                            previewLink.removeChild(previewIcon);
                        }
                    }
                };
                
                textInput.addEventListener('input', updatePreview);
                linkInput.addEventListener('input', updatePreview);
                newTabToggle.addEventListener('change', () => {
                    toggleStatus.textContent = newTabToggle.checked ? '是' : '否';
                    updatePreview();
                });
            },
            preConfirm: () => {
                const text = document.getElementById('edit-text').value.trim();
                const link = document.getElementById('edit-link').value.trim();
                const newTab = document.getElementById('edit-newTab').checked;
                
                if (!text) {
                    Swal.showValidationMessage('<i class="fas fa-exclamation-circle"></i> 菜单文本不能为空');
                    return false;
                }
                
                if (!link) {
                    Swal.showValidationMessage('<i class="fas fa-exclamation-circle"></i> 链接地址不能为空');
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
                console.error('更新菜单项失败:', error);
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
                console.error('删除菜单项失败:', error);
                core.showAlert('删除菜单项失败: ' + error.message, 'error');
            }
        });
    }
};

// 全局公开菜单管理模块
window.menuManager = menuManager;

// 应用程序入口模块

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM 加载完成，初始化模块...');
    
    // 启动应用程序
    core.initApp();
    
    // 在核心应用初始化后，再初始化其他模块
    initializeModules(); 
    console.log('模块初始化已启动');
});

// 初始化所有模块
async function initializeModules() {
    console.log('开始初始化所有模块...');
    try {
        // 初始化核心模块
        console.log('正在初始化核心模块...');
        if (typeof core !== 'undefined') {
            // core.init() 已经在core.initApp()中调用，这里不再重复调用
            console.log('核心模块初始化完成');
        } else {
            console.error('核心模块未定义');
        }

        // 初始化认证模块
        console.log('正在初始化认证模块...');
        if (typeof auth !== 'undefined') {
            await auth.init();
            console.log('认证模块初始化完成');
        } else {
            console.error('认证模块未定义');
        }

        // 初始化用户中心
        console.log('正在初始化用户中心...');
        if (typeof userCenter !== 'undefined') {
            await userCenter.init();
            console.log('用户中心初始化完成');
        } else {
            console.error('用户中心未定义');
        }

        // 初始化菜单管理
        console.log('正在初始化菜单管理...');
        if (typeof menuManager !== 'undefined') {
            await menuManager.init();
            console.log('菜单管理初始化完成');
        } else {
            console.error('菜单管理未定义');
        }

        // 初始化文档管理
        console.log('正在初始化文档管理...');
        if (typeof documentManager !== 'undefined') {
            await documentManager.init();
            console.log('文档管理初始化完成');
        } else {
            console.error('文档管理未定义');
        }

        // 初始化Docker管理
        console.log('正在初始化Docker管理...');
        if (typeof dockerManager !== 'undefined') {
            await dockerManager.init();
            console.log('Docker管理初始化完成');
        } else {
            console.error('Docker管理未定义');
        }

        // 初始化系统状态
        console.log('正在初始化系统状态...');
        if (typeof systemStatus !== 'undefined') {
            if (typeof systemStatus.initDashboard === 'function') {
                 await systemStatus.initDashboard();
                 console.log('系统状态初始化完成');
            } else {
                 console.error('systemStatus.initDashboard 函数未定义!');
            }
        } else {
            console.error('系统状态未定义');
        }

        // 初始化网络测试
        console.log('正在初始化网络测试...');
        if (typeof networkTest !== 'undefined') {
            await networkTest.init();
            console.log('网络测试初始化完成');
        } else {
            console.error('网络测试未定义');
        }

        // 加载监控配置
        await loadMonitoringConfig();
        
        // 显示默认页面 - 使用core中的showSection函数
        core.showSection('dashboard');
        
        console.log('所有模块初始化完成');
    } catch (error) {
        console.error('初始化模块时发生错误:', error);
        // 尝试使用 core.showAlert，如果 core 本身加载失败则用 console.error
        if (typeof core !== 'undefined' && core.showAlert) {
             core.showAlert('初始化失败: ' + error.message, 'error');
        } else {
             console.error('核心模块无法加载，无法显示警告弹窗');
        }
    }
}

// 监控配置相关函数
function loadMonitoringConfig() {
    console.log('正在加载监控配置...');
    fetch('/api/monitoring-config')
        .then(response => {
            console.log('监控配置API响应:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP状态错误 ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(config => {
            console.log('获取到监控配置:', config);
            // 填充表单
            document.getElementById('notificationType').value = config.notificationType || 'wechat';
            document.getElementById('webhookUrl').value = config.webhookUrl || '';
            document.getElementById('telegramToken').value = config.telegramToken || '';
            document.getElementById('telegramChatId').value = config.telegramChatId || '';
            document.getElementById('monitorInterval').value = config.monitorInterval || 60;
            
            // 显示或隐藏相应的字段
            toggleNotificationFields();
            
            // 更新监控状态
            document.getElementById('monitoringStatus').textContent = 
                config.isEnabled ? '已启用' : '已禁用';
            document.getElementById('monitoringStatus').style.color = 
                config.isEnabled ? '#4CAF50' : '#F44336';
            
            document.getElementById('toggleMonitoringBtn').textContent = 
                config.isEnabled ? '禁用监控' : '启用监控';
            
            console.log('监控配置加载完成');
        })
        .catch(error => {
            console.error('加载监控配置失败:', error);
            // 使用安全的方式调用core.showAlert
            if (typeof core !== 'undefined' && core && typeof core.showAlert === 'function') {
                core.showAlert('加载监控配置失败: ' + error.message, 'error');
            } else {
                // 如果core未定义，使用alert作为备选
                alert('加载监控配置失败: ' + error.message);
            }
        });
}

function toggleNotificationFields() {
    const type = document.getElementById('notificationType').value;
    if (type === 'wechat') {
        document.getElementById('wechatFields').style.display = 'block';
        document.getElementById('telegramFields').style.display = 'none';
    } else {
        document.getElementById('wechatFields').style.display = 'none';
        document.getElementById('telegramFields').style.display = 'block';
    }
}

function testNotification() {
    const notificationType = document.getElementById('notificationType').value;
    const webhookUrl = document.getElementById('webhookUrl').value;
    const telegramToken = document.getElementById('telegramToken').value;
    const telegramChatId = document.getElementById('telegramChatId').value;
    
    // 验证输入
    if (notificationType === 'wechat' && !webhookUrl) {
        Swal.fire({
            icon: 'error',
            title: '验证失败',
            text: '请输入企业微信机器人 Webhook URL',
            confirmButtonText: '确定'
        });
        return;
    }
    
    if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
        Swal.fire({
            icon: 'error',
            title: '验证失败',
            text: '请输入 Telegram Bot Token 和 Chat ID',
            confirmButtonText: '确定'
        });
        return;
    }
    
    // 显示处理中的状态
    Swal.fire({
        title: '发送中...',
        html: '<i class="fas fa-spinner fa-spin"></i> 正在发送测试通知',
        showConfirmButton: false,
        allowOutsideClick: false,
        willOpen: () => {
            Swal.showLoading();
        }
    });
    
    fetch('/api/test-notification', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            notificationType,
            webhookUrl,
            telegramToken,
            telegramChatId
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('测试通知失败');
        return response.json();
    })
    .then(() => {
        Swal.fire({
            icon: 'success',
            title: '发送成功',
            text: '测试通知已发送，请检查您的接收设备',
            timer: 2000,
            showConfirmButton: false
        });
    })
    .catch(error => {
        console.error('测试通知失败:', error);
        Swal.fire({
            icon: 'error',
            title: '发送失败',
            text: '测试通知发送失败: ' + error.message,
            confirmButtonText: '确定'
        });
    });
}

function saveMonitoringConfig() {
    const notificationType = document.getElementById('notificationType').value;
    const webhookUrl = document.getElementById('webhookUrl').value;
    const telegramToken = document.getElementById('telegramToken').value;
    const telegramChatId = document.getElementById('telegramChatId').value;
    const monitorInterval = document.getElementById('monitorInterval').value;
    
    // 验证输入
    if (notificationType === 'wechat' && !webhookUrl) {
        Swal.fire({
            icon: 'error',
            title: '验证失败',
            text: '请输入企业微信机器人 Webhook URL',
            confirmButtonText: '确定'
        });
        return;
    }
    
    if (notificationType === 'telegram' && (!telegramToken || !telegramChatId)) {
        Swal.fire({
            icon: 'error',
            title: '验证失败',
            text: '请输入 Telegram Bot Token 和 Chat ID',
            confirmButtonText: '确定'
        });
        return;
    }
    
    // 显示保存中的状态
    Swal.fire({
        title: '保存中...',
        html: '<i class="fas fa-spinner fa-spin"></i> 正在保存监控配置',
        showConfirmButton: false,
        allowOutsideClick: false,
        willOpen: () => {
            Swal.showLoading();
        }
    });
    
    fetch('/api/monitoring-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            notificationType,
            webhookUrl,
            telegramToken,
            telegramChatId,
            monitorInterval,
            isEnabled: document.getElementById('monitoringStatus').textContent === '已启用'
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('保存配置失败');
        return response.json();
    })
    .then(() => {
        Swal.fire({
            icon: 'success',
            title: '保存成功',
            text: '监控配置已成功保存',
            timer: 2000,
            showConfirmButton: false
        });
        loadMonitoringConfig();
    })
    .catch(error => {
        console.error('保存监控配置失败:', error);
        Swal.fire({
            icon: 'error',
            title: '保存失败',
            text: '保存监控配置失败: ' + error.message,
            confirmButtonText: '确定'
        });
    });
}

function toggleMonitoring() {
    const isCurrentlyEnabled = document.getElementById('monitoringStatus').textContent === '已启用';
    const newStatus = !isCurrentlyEnabled ? '启用' : '禁用';
    
    Swal.fire({
        title: `确认${newStatus}监控?`,
        html: `
            <div style="text-align: left; margin-top: 10px;">
                <p>您确定要<strong>${newStatus}</strong>容器监控系统吗？</p>
                ${isCurrentlyEnabled ? 
                  '<p><i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i> 禁用后，系统将停止监控容器状态并停止发送通知。</p>' : 
                  '<p><i class="fas fa-info-circle" style="color: #3498db;"></i> 启用后，系统将开始定期检查容器状态并在发现异常时发送通知。</p>'}
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: isCurrentlyEnabled ? '#d33' : '#3085d6',
        cancelButtonColor: '#6c757d',
        confirmButtonText: `确认${newStatus}`,
        cancelButtonText: '取消'
    }).then((result) => {
        if (result.isConfirmed) {
            // 显示处理中状态
            Swal.fire({
                title: '处理中...',
                html: `<i class="fas fa-spinner fa-spin"></i> 正在${newStatus}监控`,
                showConfirmButton: false,
                allowOutsideClick: false,
                willOpen: () => {
                    Swal.showLoading();
                }
            });
            
            fetch('/api/toggle-monitoring', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    isEnabled: !isCurrentlyEnabled
                })
            })
            .then(response => {
                if (!response.ok) throw new Error('切换监控状态失败');
                return response.json();
            })
            .then(() => {
                loadMonitoringConfig();
                Swal.fire({
                    icon: 'success',
                    title: `${newStatus}成功`,
                    text: `监控已成功${newStatus}`,
                    timer: 2000,
                    showConfirmButton: false
                });
            })
            .catch(error => {
                console.error('切换监控状态失败:', error);
                Swal.fire({
                    icon: 'error',
                    title: `${newStatus}失败`,
                    text: '切换监控状态失败: ' + error.message,
                    confirmButtonText: '确定'
                });
            });
        }
    });
}

function refreshStoppedContainers() {
    fetch('/api/stopped-containers')
        .then(response => {
            if (!response.ok) throw new Error('获取已停止容器列表失败');
            return response.json();
        })
        .then(containers => {
            const tbody = document.getElementById('stoppedContainersBody');
            tbody.innerHTML = '';
            
            if (containers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">没有已停止的容器</td></tr>';
                return;
            }
            
            containers.forEach(container => {
                const row = `
                    <tr>
                        <td>${container.id}</td>
                        <td>${container.name}</td>
                        <td>${container.status}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        })
        .catch(error => {
            console.error('获取已停止容器列表失败:', error);
            document.getElementById('stoppedContainersBody').innerHTML = 
                '<tr><td colspan="3" style="text-align: center; color: red;">获取已停止容器列表失败</td></tr>';
        });
}

// 保存配置函数
function saveConfig(configData) {
    core.showLoading();
    
    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(configData)
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`保存配置失败: ${text || response.statusText || response.status}`);
            });
        }
        return response.json();
    })
    .then(() => {
        core.showAlert('配置已保存', 'success');
        // 如果更新了菜单，重新加载菜单项
        if (configData.menuItems) {
            menuManager.loadMenuItems();
        }
        // 重新加载系统配置
        core.loadSystemConfig();
    })
    .catch(error => {
        console.error('保存配置失败:', error);
        core.showAlert('保存配置失败: ' + error.message, 'error');
    })
    .finally(() => {
        core.hideLoading();
    });
}

// 加载基本配置
function loadBasicConfig() {
    fetch('/api/config')
        .then(response => {
            if (!response.ok) throw new Error('加载配置失败');
            return response.json();
        })
        .then(config => {
            // 填充Logo URL
            if (document.getElementById('logoUrl')) {
                document.getElementById('logoUrl').value = config.logo || '';
            }
            
            // 填充代理域名
            if (document.getElementById('proxyDomain')) {
                document.getElementById('proxyDomain').value = config.proxyDomain || '';
            }
            
            console.log('基本配置已加载');
        })
        .catch(error => {
            console.error('加载基本配置失败:', error);
        });
}

// 暴露给全局作用域的函数
window.app = {
    loadMonitoringConfig,
    loadBasicConfig,
    toggleNotificationFields,
    saveMonitoringConfig,
    testNotification,
    toggleMonitoring,
    refreshStoppedContainers,
    saveConfig
};

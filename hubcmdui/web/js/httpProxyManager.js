/**
 * HTTP代理管理模块
 */

const httpProxyManager = {
    currentConfig: {},

    // 初始化代理管理
    init: async function() {
        try {
            console.log('初始化HTTP代理管理...');
            await this.loadProxyStatus();
            this.bindEvents();
            return Promise.resolve();
        } catch (error) {
            console.error('初始化HTTP代理管理失败:', error);
        }
    },

    // 加载代理状态
    loadProxyStatus: async function() {
        try {
            const response = await fetch('/api/httpProxy/proxy/status');
            if (!response.ok) {
                throw new Error('获取代理状态失败');
            }
            
            const status = await response.json();
            this.updateStatusDisplay(status);
            
            // 加载配置
            const configResponse = await fetch('/api/httpProxy/proxy/config');
            if (configResponse.ok) {
                const configData = await configResponse.json();
                this.currentConfig = configData.config || {};
                this.updateConfigForm();
            }
        } catch (error) {
            console.error('加载代理状态失败:', error);
            this.updateStatusDisplay({ 
                isRunning: false, 
                error: error.message 
            });
        }
    },

    // 更新状态显示
    updateStatusDisplay: function(status) {
        const statusElement = document.getElementById('proxyStatus');
        const statusBadge = document.getElementById('proxyStatusBadge');
        const portInfo = document.getElementById('proxyPortInfo');
        
        if (statusElement) {
            if (status.isRunning) {
                statusElement.textContent = '运行中';
                statusElement.className = 'status-running';
                if (statusBadge) {
                    statusBadge.textContent = '运行中';
                    statusBadge.className = 'badge badge-success';
                }
            } else {
                statusElement.textContent = '已停止';
                statusElement.className = 'status-stopped';
                if (statusBadge) {
                    statusBadge.textContent = '已停止';
                    statusBadge.className = 'badge badge-secondary';
                }
            }
        }
        
        if (portInfo && status.config) {
            portInfo.textContent = `${status.config.host}:${status.config.port}`;
        }
    },

    // 更新配置表单
    updateConfigForm: function() {
        if (!this.currentConfig) return;
        
        const elements = {
            'proxy-port': this.currentConfig.port || 8080,
            'proxy-host': this.currentConfig.host || '0.0.0.0',
            'proxy-enable-https': this.currentConfig.enableHttps || false,
            'proxy-enable-auth': this.currentConfig.enableAuth || false,
            'proxy-username': this.currentConfig.username || '',
            'proxy-password': this.currentConfig.password || '',
            'proxy-log-requests': this.currentConfig.logRequests !== false
        };
        
        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = Boolean(value);
                } else {
                    element.value = value;
                }
            }
        }
        
        // 更新允许和阻止的主机列表
        this.updateHostLists();
    },

    // 更新主机列表显示
    updateHostLists: function() {
        const allowedList = document.getElementById('allowedHostsList');
        const blockedList = document.getElementById('blockedHostsList');
        
        if (allowedList && this.currentConfig.allowedHosts) {
            allowedList.innerHTML = this.currentConfig.allowedHosts
                .map(host => `<span class="host-tag">${host} <button onclick="httpProxyManager.removeAllowedHost('${host}')">&times;</button></span>`)
                .join('');
        }
        
        if (blockedList && this.currentConfig.blockedHosts) {
            blockedList.innerHTML = this.currentConfig.blockedHosts
                .map(host => `<span class="host-tag blocked">${host} <button onclick="httpProxyManager.removeBlockedHost('${host}')">&times;</button></span>`)
                .join('');
        }
    },

    // 绑定事件
    bindEvents: function() {
        // 启动代理按钮
        const startBtn = document.getElementById('startProxyBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startProxy());
        }
        
        // 停止代理按钮
        const stopBtn = document.getElementById('stopProxyBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopProxy());
        }
        
        // 保存配置按钮
        const saveBtn = document.getElementById('saveProxyConfigBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveConfig());
        }
        
        // 测试代理按钮
        const testBtn = document.getElementById('testProxyBtn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testProxy());
        }
        
        // 添加允许主机
        const addAllowedBtn = document.getElementById('addAllowedHostBtn');
        if (addAllowedBtn) {
            addAllowedBtn.addEventListener('click', () => this.addAllowedHost());
        }
        
        // 添加阻止主机
        const addBlockedBtn = document.getElementById('addBlockedHostBtn');
        if (addBlockedBtn) {
            addBlockedBtn.addEventListener('click', () => this.addBlockedHost());
        }
    },

    // 启动代理
    startProxy: async function() {
        try {
            const config = this.getConfigFromForm();
            
            const response = await fetch('/api/httpProxy/proxy/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '启动失败');
            }
            
            const result = await response.json();
            core.showAlert('代理服务启动成功', 'success');
            this.updateStatusDisplay(result.status);
        } catch (error) {
            console.error('启动代理失败:', error);
            core.showAlert('启动代理失败: ' + error.message, 'error');
        }
    },

    // 停止代理
    stopProxy: async function() {
        try {
            const response = await fetch('/api/httpProxy/proxy/stop', {
                method: 'POST'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '停止失败');
            }
            
            const result = await response.json();
            core.showAlert('代理服务已停止', 'success');
            this.updateStatusDisplay(result.status);
        } catch (error) {
            console.error('停止代理失败:', error);
            core.showAlert('停止代理失败: ' + error.message, 'error');
        }
    },

    // 保存配置
    saveConfig: async function() {
        try {
            const config = this.getConfigFromForm();
            
            const response = await fetch('/api/httpProxy/proxy/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '保存配置失败');
            }
            
            const result = await response.json();
            this.currentConfig = config;
            core.showAlert('代理配置已保存', 'success');
            this.updateStatusDisplay(result.status);
        } catch (error) {
            console.error('保存配置失败:', error);
            core.showAlert('保存配置失败: ' + error.message, 'error');
        }
    },

    // 测试代理
    testProxy: async function() {
        try {
            const testUrl = document.getElementById('proxyTestUrl')?.value || 'http://httpbin.org/ip';
            
            const response = await fetch('/api/httpProxy/proxy/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testUrl })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '测试失败');
            }
            
            const result = await response.json();
            core.showAlert(`代理测试成功 (${result.responseTime})`, 'success');
        } catch (error) {
            console.error('代理测试失败:', error);
            core.showAlert('代理测试失败: ' + error.message, 'error');
        }
    },

    // 从表单获取配置
    getConfigFromForm: function() {
        return {
            port: parseInt(document.getElementById('proxy-port')?.value) || 8080,
            host: document.getElementById('proxy-host')?.value || '0.0.0.0',
            enableHttps: document.getElementById('proxy-enable-https')?.checked || false,
            enableAuth: document.getElementById('proxy-enable-auth')?.checked || false,
            username: document.getElementById('proxy-username')?.value || '',
            password: document.getElementById('proxy-password')?.value || '',
            logRequests: document.getElementById('proxy-log-requests')?.checked !== false,
            allowedHosts: this.currentConfig.allowedHosts || [],
            blockedHosts: this.currentConfig.blockedHosts || []
        };
    },

    // 添加允许的主机
    addAllowedHost: function() {
        const input = document.getElementById('newAllowedHost');
        const host = input?.value?.trim();
        
        if (host && !this.currentConfig.allowedHosts?.includes(host)) {
            if (!this.currentConfig.allowedHosts) {
                this.currentConfig.allowedHosts = [];
            }
            this.currentConfig.allowedHosts.push(host);
            this.updateHostLists();
            input.value = '';
        }
    },

    // 移除允许的主机
    removeAllowedHost: function(host) {
        if (this.currentConfig.allowedHosts) {
            this.currentConfig.allowedHosts = this.currentConfig.allowedHosts.filter(h => h !== host);
            this.updateHostLists();
        }
    },

    // 添加阻止的主机
    addBlockedHost: function() {
        const input = document.getElementById('newBlockedHost');
        const host = input?.value?.trim();
        
        if (host && !this.currentConfig.blockedHosts?.includes(host)) {
            if (!this.currentConfig.blockedHosts) {
                this.currentConfig.blockedHosts = [];
            }
            this.currentConfig.blockedHosts.push(host);
            this.updateHostLists();
            input.value = '';
        }
    },

    // 移除阻止的主机
    removeBlockedHost: function(host) {
        if (this.currentConfig.blockedHosts) {
            this.currentConfig.blockedHosts = this.currentConfig.blockedHosts.filter(h => h !== host);
            this.updateHostLists();
        }
    }
};

// 全局公开模块
window.httpProxyManager = httpProxyManager;

// 用户认证相关功能

// 登录函数
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const captcha = document.getElementById('captcha').value;
            
    try {
        core.showLoading();
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, captcha })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            window.isLoggedIn = true;
            localStorage.setItem('isLoggedIn', 'true');
            persistSession();
            document.getElementById('currentUsername').textContent = username;
            document.getElementById('welcomeUsername').textContent = username;
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('adminContainer').style.display = 'flex';
            
            // 确保加载完成后初始化事件监听器
            await core.loadSystemConfig();
            core.initEventListeners();
            core.showSection('dashboard');
            userCenter.getUserInfo();
            systemStatus.refreshSystemStatus();
        } else {
            const errorData = await response.json();
            core.showAlert(errorData.error || '登录失败', 'error');
            refreshCaptcha();
        }
    } catch (error) {
        core.showAlert('登录失败: ' + error.message, 'error');
        refreshCaptcha();
    } finally {
        core.hideLoading();
    }
}

// 注销函数
async function logout() {
    console.log("注销操作被触发");
    try {
        core.showLoading();
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            // 清除所有登录状态
            localStorage.removeItem('isLoggedIn');
            sessionStorage.removeItem('sessionActive');
            window.isLoggedIn = false;
            // 清除cookie
            document.cookie = 'connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            window.location.reload();
        } else {
            throw new Error('退出登录失败');
        }
    } catch (error) {
        console.error('退出登录失败:', error);
        core.showAlert('退出登录失败: ' + error.message, 'error');
        // 即使API失败也清除本地状态
        localStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('sessionActive');
        window.isLoggedIn = false;
        window.location.reload();
    } finally {
        core.hideLoading();
    }
}

// 验证码刷新函数
async function refreshCaptcha() {
    try {
        const response = await fetch('/api/captcha');
        if (!response.ok) {
            throw new Error(`验证码获取失败: ${response.status}`);
        }
        const data = await response.json();
        document.getElementById('captchaText').textContent = data.captcha;
    } catch (error) {
        console.error('刷新验证码失败:', error);
        document.getElementById('captchaText').textContent = '验证码加载失败，点击重试';
    }
}

// 持久化会话
function persistSession() {
    if (document.cookie.includes('connect.sid')) {
        sessionStorage.setItem('sessionActive', 'true');
    }
}

// 显示登录模态框
function showLoginModal() {
    // 确保先隐藏加载指示器
    if (core && typeof core.hideLoadingIndicator === 'function') {
        core.hideLoadingIndicator();
    }
    
    document.getElementById('loginModal').style.display = 'flex';
    refreshCaptcha();
}

// 导出模块
const auth = {
    init: function() {
        console.log('初始化认证模块...');
        // 在这里可以添加认证模块初始化的相关代码
        return Promise.resolve(); // 返回一个已解决的 Promise，保持与其他模块一致
    },
    login,
    logout,
    refreshCaptcha,
    showLoginModal
};

// 全局公开认证模块
window.auth = auth;

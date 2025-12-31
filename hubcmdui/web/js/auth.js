// 用户认证相关功能

// 存储重置令牌
let currentResetToken = null;

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
    // console.log("注销操作被触发");
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
        // console.error('退出登录失败:', error);
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
        
        // 更新登录表单验证码
        const captchaText = document.getElementById('captchaText');
        if (captchaText) {
            captchaText.textContent = data.captcha;
        }
        
        // 更新忘记密码表单验证码
        const resetCaptchaText = document.getElementById('resetCaptchaText');
        if (resetCaptchaText) {
            resetCaptchaText.textContent = data.captcha;
        }
    } catch (error) {
        // console.error('刷新验证码失败:', error);
        const captchaText = document.getElementById('captchaText');
        if (captchaText) {
            captchaText.textContent = '验证码加载失败，点击重试';
        }
        const resetCaptchaText = document.getElementById('resetCaptchaText');
        if (resetCaptchaText) {
            resetCaptchaText.textContent = '验证码加载失败，点击重试';
        }
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
    showLoginForm(); // 确保显示登录表单
    refreshCaptcha();
}

// 显示登录表单
function showLoginForm() {
    document.getElementById('loginTitle').textContent = '管理员登录';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
    currentResetToken = null;
    refreshCaptcha();
}

// 显示忘记密码表单
function showForgotPassword() {
    document.getElementById('loginTitle').textContent = '忘记密码';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'block';
    document.getElementById('resetPasswordForm').style.display = 'none';
    refreshCaptcha();
}

// 显示重置密码表单
function showResetPasswordForm(token) {
    document.getElementById('loginTitle').textContent = '重置密码';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'block';
    
    if (token) {
        currentResetToken = token;
        document.getElementById('tokenValue').textContent = token;
        document.getElementById('resetTokenDisplay').style.display = 'block';
    }
}

// 请求重置令牌
async function requestResetToken() {
    const username = document.getElementById('resetUsername').value;
    const captcha = document.getElementById('resetCaptcha').value;
    
    if (!username) {
        core.showAlert('请输入用户名', 'error');
        return;
    }
    
    if (!captcha) {
        core.showAlert('请输入验证码', 'error');
        return;
    }
    
    try {
        core.showLoading();
        const response = await fetch('/api/auth/request-reset-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, captcha })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            core.showAlert('重置令牌已生成，有效期10分钟', 'success');
            showResetPasswordForm(data.token);
        } else {
            core.showAlert(data.error || '获取重置令牌失败', 'error');
            refreshCaptcha();
        }
    } catch (error) {
        core.showAlert('获取重置令牌失败: ' + error.message, 'error');
        refreshCaptcha();
    } finally {
        core.hideLoading();
    }
}

// 重置密码
async function resetPassword() {
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    
    if (!newPassword || !confirmPassword) {
        core.showAlert('请填写所有密码字段', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        core.showAlert('两次输入的密码不一致', 'error');
        return;
    }
    
    // 密码复杂度验证
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
    if (!passwordRegex.test(newPassword)) {
        core.showAlert('密码需要8-16位，包含至少一个字母、一个数字和一个特殊字符', 'error');
        return;
    }
    
    if (!currentResetToken) {
        core.showAlert('重置令牌无效，请重新获取', 'error');
        showForgotPassword();
        return;
    }
    
    try {
        core.showLoading();
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                token: currentResetToken, 
                newPassword, 
                confirmPassword 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            core.showAlert('密码重置成功！请使用新密码登录', 'success');
            currentResetToken = null;
            showLoginForm();
        } else {
            core.showAlert(data.error || '重置密码失败', 'error');
        }
    } catch (error) {
        core.showAlert('重置密码失败: ' + error.message, 'error');
    } finally {
        core.hideLoading();
    }
}

// 导出模块
const auth = {
    init: function() {
        // console.log('初始化认证模块...');
        // 初始化忘记密码表单事件
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', function(e) {
                e.preventDefault();
                requestResetToken();
            });
        }
        
        const resetPasswordForm = document.getElementById('resetPasswordForm');
        if (resetPasswordForm) {
            resetPasswordForm.addEventListener('submit', function(e) {
                e.preventDefault();
                resetPassword();
            });
        }
        
        return Promise.resolve(); // 返回一个已解决的 Promise，保持与其他模块一致
    },
    login,
    logout,
    refreshCaptcha,
    showLoginModal,
    showLoginForm,
    showForgotPassword,
    showResetPasswordForm,
    requestResetToken,
    resetPassword
};

// 全局公开认证模块
window.auth = auth;

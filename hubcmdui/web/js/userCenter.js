/**
 * 用户中心管理模块
 */

// 获取用户信息
async function getUserInfo() {
    try {
        // 先检查是否已登录
        const sessionResponse = await fetch('/api/check-session');
        const sessionData = await sessionResponse.json();
        
        if (!sessionData.authenticated) {
            // 用户未登录，不显示错误，静默返回
            console.log('用户未登录或会话无效，跳过获取用户信息');
            return;
        }
        
        // 用户已登录，获取用户信息
        console.log('会话有效，尝试获取用户信息...');
        const response = await fetch('/api/user-info');
        if (!response.ok) {
            // 检查是否是认证问题
            if (response.status === 401) {
                console.log('会话已过期，需要重新登录');
                return;
            }
            throw new Error('获取用户信息失败');
        }
        
        const data = await response.json();
        console.log('获取到用户信息:', data);
        
        // 更新顶部导航栏的用户名
        const currentUsername = document.getElementById('currentUsername');
        if (currentUsername) {
            currentUsername.textContent = data.username || '未知用户';
        }
        
        // 更新统计卡片数据
        const loginCountElement = document.getElementById('loginCount');
        if (loginCountElement) {
            loginCountElement.textContent = data.loginCount || '0';
        }
        
        const accountAgeElement = document.getElementById('accountAge');
        if (accountAgeElement) {
            accountAgeElement.textContent = data.accountAge ? `${data.accountAge}天` : '0天';
        }
        
        const lastLoginElement = document.getElementById('lastLogin');
        if (lastLoginElement) {
            let lastLogin = data.lastLogin || '未知';
            // 检查是否包含 "今天" 字样，添加样式
            if (lastLogin.includes('今天')) {
                lastLoginElement.innerHTML = `<span class="today-login">${lastLogin}</span>`;
            } else {
                lastLoginElement.textContent = lastLogin;
            }
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
        // 不显示错误通知，只在控制台记录错误
    }
}

// 修改密码
async function changePassword(event) {
    if (event) {
        event.preventDefault();
    }
    
    const form = document.getElementById('changePasswordForm');
    const currentPassword = form.querySelector('#ucCurrentPassword').value;
    const newPassword = form.querySelector('#ucNewPassword').value;
    const confirmPassword = form.querySelector('#ucConfirmPassword').value;
    
    // 验证表单
    if (!currentPassword || !newPassword || !confirmPassword) {
        return core.showAlert('所有字段都不能为空', 'error');
    }
    
    if (newPassword !== confirmPassword) {
        return core.showAlert('两次输入的新密码不一致', 'error');
    }
    
    // 密码复杂度检查
    if (!isPasswordComplex(newPassword)) {
        return core.showAlert('密码必须包含至少1个字母、1个数字和1个特殊字符，长度在8-16位之间', 'error');
    }
    
    // 显示加载状态
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        // 无论成功与否，去除加载状态
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '修改密码失败');
        }
        
        // 清空表单
        form.reset();
        
        // 设置倒计时并显示
        let countDown = 5;
        
        Swal.fire({
            title: '密码修改成功',
            html: `您的密码已成功修改，系统将在 <b>${countDown}</b> 秒后自动退出，请使用新密码重新登录。`,
            icon: 'success',
            timer: countDown * 1000,
            timerProgressBar: true,
            didOpen: () => {
                const content = Swal.getHtmlContainer();
                const timerInterval = setInterval(() => {
                    countDown--;
                    if (content) {
                        const b = content.querySelector('b');
                        if (b) {
                            b.textContent = countDown > 0 ? countDown : 0;
                        }
                    }
                    if (countDown <= 0) clearInterval(timerInterval);
                }, 1000);
            },
            allowOutsideClick: false, // 禁止外部点击关闭
            showConfirmButton: true, // 重新显示确认按钮
            confirmButtonText: '确定' // 设置按钮文本
        }).then((result) => {
            // 当计时器结束或弹窗被关闭时 (包括点击确定按钮)
            if (result.dismiss === Swal.DismissReason.timer || result.isConfirmed) {
                console.log('计时器结束或手动确认，执行登出');
                auth.logout();
            }
        });
    } catch (error) {
        console.error('修改密码失败:', error);
        core.showAlert('修改密码失败: ' + error.message, 'error');
    }
}

// 验证密码复杂度
function isPasswordComplex(password) {
    // 至少包含1个字母、1个数字和1个特殊字符，长度在8-16位之间
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&])[A-Za-z\d.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]{8,16}$/;
    return passwordRegex.test(password);
}

// 检查密码强度
function checkUcPasswordStrength() {
    const password = document.getElementById('ucNewPassword').value;
    const strengthSpan = document.getElementById('ucPasswordStrength');
    
    if (!password) {
        strengthSpan.textContent = '';
        return;
    }
    
    let strength = 0;
    let strengthText = '';
    
    // 长度检查
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    
    // 包含字母
    if (/[A-Za-z]/.test(password)) strength++;
    
    // 包含数字
    if (/\d/.test(password)) strength++;
    
    // 包含特殊字符
    if (/[.,\-_+=()[\]{}|\\;:'"<>?/@$!%*#?&]/.test(password)) strength++;
    
    // 根据强度设置文本和颜色
    switch(strength) {
        case 0:
        case 1:
            strengthText = '密码强度：非常弱';
            strengthSpan.style.color = '#FF4136';
            break;
        case 2:
            strengthText = '密码强度：弱';
            strengthSpan.style.color = '#FF851B';
            break;
        case 3:
            strengthText = '密码强度：中';
            strengthSpan.style.color = '#FFDC00';
            break;
        case 4:
            strengthText = '密码强度：强';
            strengthSpan.style.color = '#2ECC40';
            break;
        case 5:
            strengthText = '密码强度：非常强';
            strengthSpan.style.color = '#3D9970';
            break;
    }
    
    strengthSpan.textContent = strengthText;
}

// 初始化用户中心
function initUserCenter() {
    console.log('初始化用户中心');
    
    // 获取用户信息
    getUserInfo();
    
    // 为用户中心按钮添加事件
    const userCenterBtn = document.getElementById('userCenterBtn');
    if (userCenterBtn) {
        userCenterBtn.addEventListener('click', () => {
            core.showSection('user-center');
        });
    }
}

// 加载用户统计信息
function loadUserStats() {
    getUserInfo();
}

// 导出模块
const userCenter = {
    init: function() {
        console.log('初始化用户中心模块...');
        // 可以在这里调用初始化逻辑，也可以延迟到需要时调用
        return Promise.resolve(); // 返回一个已解决的 Promise，保持与其他模块一致
    },
    getUserInfo,
    changePassword,
    checkUcPasswordStrength,
    initUserCenter,
    loadUserStats,
    isPasswordComplex
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initUserCenter);

// 全局公开用户中心模块
window.userCenter = userCenter;

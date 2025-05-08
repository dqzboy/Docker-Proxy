/**
 * 核心功能模块
 * 提供全局共享的工具函数和状态管理
 */

// 全局变量和状态
let isLoggedIn = false;
let userPermissions = [];
let systemConfig = {};

/**
 * 初始化应用
 * 检查登录状态，加载基础配置
 */
async function initApp() {
    // console.log('初始化应用...');
    // console.log('-------------调试信息开始-------------');
    // console.log('当前URL:', window.location.href);
    // console.log('浏览器信息:', navigator.userAgent);
    // console.log('DOM已加载状态:', document.readyState);
    
    // 检查当前页面是否为登录页
    const isLoginPage = window.location.pathname.includes('admin');
    // console.log('是否为管理页面:', isLoginPage);
    
    try {
        // 检查会话状态
        const sessionResult = await checkSession();
        const isAuthenticated = sessionResult.authenticated;
        // console.log('会话检查结果:', isAuthenticated);

        // 检查localStorage中的登录状态 (主要用于刷新页面时保持UI)
        const localLoginState = localStorage.getItem('isLoggedIn') === 'true';
        
        // 核心登录状态判断
        if (isAuthenticated) {
            // 已登录
            isLoggedIn = true;
            localStorage.setItem('isLoggedIn', 'true'); // 保持本地状态
            
            if (isLoginPage) {
                // 在登录页，但会话有效，显示管理界面
                // console.log('已登录，显示管理界面...');
                await loadSystemConfig();
                showAdminInterface();
            } else {
                // 在非登录页，正常显示
                // console.log('已登录，继续应用初始化...');
                await loadSystemConfig();
                showAdminInterface(); // 确保管理界面可见
            }
        } else {
            // 未登录
            isLoggedIn = false;
            localStorage.removeItem('isLoggedIn'); // 清除本地登录状态
            
            if (!isLoginPage) {
                // 在非登录页，重定向到登录页
                // console.log('未登录，重定向到登录页...');
                window.location.href = '/admin';
                return false;
            } else {
                // 在登录页，显示登录框
                // console.log('未登录，显示登录模态框...');
                hideLoadingIndicator();
                showLoginModal();
            }
        }
        
        // console.log('应用初始化完成');
        // console.log('-------------调试信息结束-------------');
        return isAuthenticated;
    } catch (error) {
        // console.error('初始化应用失败:', error);
        // console.log('-------------调试错误信息-------------');
        // console.log('错误堆栈:', error.stack);
        // console.log('错误类型:', error.name);
        // console.log('错误消息:', error.message);
        // console.log('---------------------------------------');
        showAlert('加载应用失败：' + error.message, 'error');
        hideLoadingIndicator();
        showLoginModal();
        return false;
    }
}

/**
 * 检查会话状态
 */
async function checkSession() {
    try {
        const response = await fetch('/api/check-session', {
            headers: {
                'Cache-Control': 'no-cache',
                'X-Requested-With': 'XMLHttpRequest',
                'Pragma': 'no-cache'
            },
            credentials: 'same-origin'
        });
        
        // 只关心请求是否成功以及认证状态
        if (response.ok) {
            const data = await response.json();
            return {
                authenticated: data.authenticated // 直接使用API返回的状态
            };
        }
        
        // 非OK响应（包括401）都视为未认证
        return {
            authenticated: false
        };
    } catch (error) {
        // console.error('检查会话状态出错:', error);
        return {
            authenticated: false,
            error: error.message
        };
    }
}

/**
 * 加载系统配置
 */
function loadSystemConfig() {
    fetch('/api/config')
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(`加载配置失败: ${text || response.statusText || response.status}`);
                });
            }
            return response.json();
        })
        .then(config => {
            // console.log('加载配置成功:', config);
            // 应用配置 
            applySystemConfig(config);
        })
        .catch(error => {
            // console.error('加载配置失败:', error);
            showAlert('加载配置失败: ' + error.message, 'warning');
        });
}

// 应用系统配置
function applySystemConfig(config) {
    // 如果有proxyDomain配置，则更新输入框
    if (config.proxyDomain && document.getElementById('proxyDomain')) {
        document.getElementById('proxyDomain').value = config.proxyDomain;
    }
    
    // 应用其他配置...
}

/**
 * 显示管理界面
 */
function showAdminInterface() {
    // console.log('开始显示管理界面...');
    hideLoadingIndicator();
    
    const adminContainer = document.getElementById('adminContainer');
    if (adminContainer) {
        // console.log('找到管理界面容器，设置为显示');
        adminContainer.style.display = 'flex';
    } else {
        // console.error('未找到管理界面容器元素 #adminContainer');
    }
    
    // console.log('管理界面已显示，正在初始化事件监听器');
    
    // 初始化菜单事件监听
    initEventListeners();
}

/**
 * 隐藏加载提示器
 */
function hideLoadingIndicator() {
    // console.log('正在隐藏加载提示器...');
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
        // console.log('加载提示器已隐藏');
    } else {
        // console.warn('未找到加载提示器元素 #loadingIndicator');
    }
}

/**
 * 显示登录模态框
 */
function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
        // 刷新验证码
        if (window.auth && typeof window.auth.refreshCaptcha === 'function') {
            window.auth.refreshCaptcha();
        }
    }
}

/**
 * 显示加载动画
 */
function showLoading() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.style.display = 'block';
    }
}

/**
 * 隐藏加载动画
 */
function hideLoading() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.style.display = 'none';
    }
}

/**
 * 显示警告消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 (info, success, error)
 * @param {string} title - 标题（可选）
 */
function showAlert(message, type = 'info', title = '') {
    // 使用SweetAlert2替代自定义警告框，确保弹窗总是显示
    Swal.fire({
        title: title || (type === 'success' ? '成功' : (type === 'error' ? '错误' : '提示')),
        text: message,
        icon: type,
        timer: type === 'success' ? 2000 : undefined,
        timerProgressBar: type === 'success',
        confirmButtonColor: '#3d7cf4',
        confirmButtonText: '确定'
    });
}

/**
 * 显示确认对话框
 * @param {string} message - 消息内容
 * @param {Function} onConfirm - 确认回调
 * @param {Function} onCancel - 取消回调（可选）
 * @param {string} title - 标题（可选）
 */
function showConfirm(message, onConfirm, onCancel, title = '确认') {
    Swal.fire({
        title: title,
        text: message,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3d7cf4',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '确认',
        cancelButtonText: '取消'
    }).then((result) => {
        if (result.isConfirmed && typeof onConfirm === 'function') {
            onConfirm();
        } else if (typeof onCancel === 'function') {
            onCancel();
        }
    });
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * 防抖函数：限制函数在一定时间内只能执行一次
 */
function debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数：保证一定时间内多次调用只执行一次
 */
function throttle(func, wait = 300) {
    let timeout = null;
    let previous = 0;
    
    return function(...args) {
        const now = Date.now();
        const remaining = wait - (now - previous);
        
        if (remaining <= 0) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func.apply(this, args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                previous = Date.now();
                timeout = null;
                func.apply(this, args);
            }, remaining);
        }
    };
}

/**
 * 初始化事件监听
 */
function initEventListeners() {
    // console.log('开始初始化事件监听器...');
    
    // 侧边栏菜单项事件
    const menuItems = document.querySelectorAll('.sidebar-nav li');
    // console.log('找到侧边栏菜单项数量:', menuItems.length);
    menuItems.forEach((item, index) => {
        const section = item.getAttribute('data-section');
        // console.log(`绑定事件到菜单项 #${index + 1}: ${section}`);
        item.addEventListener('click', () => showSection(section));
    });
    // console.log('侧边栏菜单事件监听器已绑定');
    
    // 用户中心按钮
    const userCenterBtn = document.getElementById('userCenterBtn');
    if (userCenterBtn) {
        // console.log('找到用户中心按钮，绑定事件');
        userCenterBtn.addEventListener('click', () => showSection('user-center'));
    }

    // 登出按钮 (侧边栏)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        // console.log('找到登出按钮，绑定事件');
        logoutBtn.addEventListener('click', () => {
            if (window.auth && typeof window.auth.logout === 'function') {
                window.auth.logout();
            }
        });
    }

    // 登出按钮 (用户中心)
    const ucLogoutBtn = document.getElementById('ucLogoutBtn');
    if (ucLogoutBtn) {
        // console.log('找到用户中心内登出按钮，绑定事件');
        ucLogoutBtn.addEventListener('click', () => {
            if (window.auth && typeof window.auth.logout === 'function') {
                window.auth.logout();
            }
        });
    }
    // console.log('事件监听器初始化完成');
}

/**
 * 显示指定的内容区域
 * @param {string} sectionId 要显示的内容区域ID
 */
function showSection(sectionId) {
    // console.log('尝试显示内容区域:', sectionId);

    const contentSections = document.querySelectorAll('.content-section');
    const menuItems = document.querySelectorAll('.sidebar-nav li');
    // console.log('找到', contentSections.length, '个内容区域和', menuItems.length, '个菜单项');

    let sectionFound = false;
    contentSections.forEach(section => {
        if (section.id === sectionId) {
            section.classList.add('active');
            sectionFound = true;
            // console.log('成功激活内容区域:', sectionId);
        } else {
            section.classList.remove('active');
        }
    });

    if (!sectionFound) {
        // console.warn('未找到要显示的内容区域:', sectionId, '. 默认显示dashboard.');
        document.getElementById('dashboard').classList.add('active');
        sectionId = 'dashboard'; // 更新 sectionId 以便正确高亮菜单
    }

    let menuItemFound = false;
    menuItems.forEach(item => {
        if (item.getAttribute('data-section') === sectionId) {
            item.classList.add('active');
            menuItemFound = true;
            // console.log('成功激活菜单项:', sectionId);
        } else {
            item.classList.remove('active');
        }
    });

    if (!menuItemFound) {
        // console.warn('未找到要激活的菜单项 for section:', sectionId);
        // 尝试激活 dashboard 作为回退
        const dashboardItem = document.querySelector('.sidebar-nav li[data-section="dashboard"]');
        if(dashboardItem) dashboardItem.classList.add('active');
    }

    // 更新 URL hash
    window.location.hash = sectionId;

    // 刷新特定部分的内容，例如仪表盘
    if (sectionId === 'dashboard') {
        // console.log('已激活仪表盘，无需再次刷新系统状态');
        // if (window.systemStatus && typeof window.systemStatus.refreshSystemStatus === 'function') {
        //     window.systemStatus.refreshSystemStatus();
        // }
    }
    // console.log('内容区域切换完成:', sectionId);
}

/**
 * 根据URL hash显示对应的区域
 */
function showSectionFromHash() {
    const hash = window.location.hash.substring(1); // 移除 '#' 号
    if (hash) {
        // console.log('从URL Hash加载区域:', hash);
        showSection(hash);
    } else {
        // console.log('URL Hash为空，默认显示dashboard区域');
        showSection('dashboard'); // 默认显示仪表盘
    }
}

/**
 * 切换加载状态
 * @param {boolean} isLoading - 是否正在加载
 * @param {string} elementId - 目标元素ID
 * @param {string} originalText - 原始文本（可选）
 */
function toggleLoadingState(isLoading, elementId, originalText = null) {
    const element = document.getElementById(elementId);
    if (!element) {
        // console.warn(`未找到元素 ${elementId} 来切换加载状态`);
        return;
    }

    if (isLoading) {
        element.disabled = true;
        // 可以考虑保存原始文本，如果按钮文本被修改了
        if (originalText && !element.dataset.originalText) {
            element.dataset.originalText = element.innerHTML;
        }
        element.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 加载中...';
    } else {
        element.disabled = false;
        if (element.dataset.originalText) {
            element.innerHTML = element.dataset.originalText;
        } else if (originalText) { // 如果没有保存的原始文本，但传入了，也使用
            element.innerHTML = originalText;
        }
        // 如果按钮文本没有被修改为 "加载中..."，则不需要恢复
    }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    // console.log('DOM已加载，正在初始化应用...');
    initApp();
    
    // 检查URL参数，处理消息提示等
    const urlParams = new URLSearchParams(window.location.search);
    
    // 如果有message参数，显示相应的提示
    if (urlParams.has('message')) {
        const message = urlParams.get('message');
        let type = 'info';
        
        if (urlParams.has('type')) {
            type = urlParams.get('type');
        }
        
        showAlert(message, type);
    }
});

// 导出核心函数和变量 (如果需要在其他模块直接使用)
window.core = {
    initApp,
    checkSession,
    loadSystemConfig,
    showAdminInterface,
    hideLoadingIndicator,
    showLoginModal,
    showAlert,
    showConfirm,
    showLoading,
    hideLoading,
    showSection,
    showSectionFromHash,
    formatDateTime,
    debounce,
    throttle,
    toggleLoadingState
};

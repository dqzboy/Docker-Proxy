/**
 * 导航菜单加载模块
 * 负责从config加载并渲染前端导航菜单
 */

// 用于跟踪菜单是否已加载
let menuLoaded = false;

// 立即执行初始化函数
(function() {
    console.log('[菜单模块] 初始化开始');
    try {
        // 页面加载完成后执行，但不在这里调用加载函数
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[菜单模块] DOM内容加载完成，等待loadMenu或loadNavMenu调用');
            // 不在这里调用，避免重复加载
        });
        console.log('[菜单模块] 初始化完成，等待调用');
    } catch (error) {
        console.error('[菜单模块] 初始化失败:', error);
    }
})();

// 加载导航菜单
async function loadNavMenu() {
    if (menuLoaded) {
        console.log('[菜单模块] 菜单已加载，跳过');
        return;
    }
    
    console.log('[菜单模块] loadNavMenu() 函数被调用');
    const navMenu = document.getElementById('navMenu');
    if (!navMenu) {
        console.error('[菜单模块] 无法找到id为navMenu的元素，菜单加载失败');
        return;
    }

    try {
        console.log('[菜单模块] 正在从/api/config获取菜单配置...');
        
        // 从API获取配置
        const response = await fetch('/api/config');
        console.log('[菜单模块] API响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`获取配置失败: ${response.status} ${response.statusText}`);
        }
        
        const config = await response.json();
        console.log('[菜单模块] 成功获取配置:', config);
        
        // 确保menuItems存在且是数组
        if (!config.menuItems || !Array.isArray(config.menuItems) || config.menuItems.length === 0) {
            console.warn('[菜单模块] 配置中没有菜单项或格式不正确', config);
            navMenu.innerHTML = '<span class="no-menu" style="color: #ff6b6b; font-size: 14px;">未设置菜单</span>';
            menuLoaded = true;
            return;
        }
        
        // 渲染菜单
        renderNavMenu(navMenu, config.menuItems);
        menuLoaded = true;
        
    } catch (error) {
        console.error('[菜单模块] 加载导航菜单失败:', error);
        navMenu.innerHTML = `<span class="menu-error" style="color: #ff6b6b; font-size: 14px;">菜单加载失败: ${error.message}</span>`;
    }
}

// 渲染导航菜单
function renderNavMenu(navMenuElement, menuItems) {
    try {
        console.log('[菜单模块] 开始渲染导航菜单，菜单项数量:', menuItems.length);
        
        // 清空现有内容
        navMenuElement.innerHTML = '';
        
        // 移动设备菜单切换按钮
        const menuToggle = document.createElement('div');
        menuToggle.id = 'menuToggle';
        menuToggle.className = 'menu-toggle';
        menuToggle.innerHTML = '<i class="fas fa-bars"></i>';
        menuToggle.style.color = '#333'; // 设置为深色
        menuToggle.style.fontSize = '28px'; // 增大菜单图标
        navMenuElement.appendChild(menuToggle);
        
        // 菜单项容器
        const menuList = document.createElement('ul');
        menuList.className = 'nav-list';
        menuList.style.display = 'flex';
        menuList.style.listStyle = 'none';
        menuList.style.margin = '0';
        menuList.style.padding = '0';
        
        // 添加菜单项
        menuItems.forEach((item, index) => {
            console.log(`[菜单模块] 渲染菜单项 #${index+1}:`, item);
            const menuItem = document.createElement('li');
            menuItem.style.marginLeft = '25px'; // 增加间距
            
            const link = document.createElement('a');
            link.href = item.link || '#';
            link.textContent = item.text || '未命名菜单';
            
            // 使用内联样式确保文字颜色可见，并增大字体
            link.style.color = '#333'; // 黑色文字
            link.style.textDecoration = 'none';
            link.style.fontSize = '16px'; // 从14px增大到16px
            link.style.fontWeight = 'bold';
            link.style.padding = '8px 15px'; // 增大内边距
            link.style.borderRadius = '4px';
            link.style.transition = 'background-color 0.3s, color 0.3s';
            
            // 添加鼠标悬停效果
            link.addEventListener('mouseover', function() {
                this.style.backgroundColor = '#3d7cf4'; // 蓝色背景
                this.style.color = '#fff'; // 白色文字
            });
            
            // 鼠标移出时恢复原样
            link.addEventListener('mouseout', function() {
                this.style.backgroundColor = 'transparent';
                this.style.color = '#333';
            });
            
            if (item.newTab) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            
            menuItem.appendChild(link);
            menuList.appendChild(menuItem);
        });
        
        navMenuElement.appendChild(menuList);
        
        // 绑定移动端菜单切换事件
        menuToggle.addEventListener('click', () => {
            console.log('[菜单模块] 菜单切换按钮被点击');
            navMenuElement.classList.toggle('active');
        });
        
        console.log(`[菜单模块] 成功渲染了 ${menuItems.length} 个导航菜单项`);
    } catch (error) {
        console.error('[菜单模块] 渲染导航菜单失败:', error);
        navMenuElement.innerHTML = `<span class="menu-error" style="color: #ff6b6b; font-size: 14px;">菜单渲染失败: ${error.message}</span>`;
    }
}

// 添加loadMenu函数，作为loadNavMenu的别名，确保与index.html中的调用匹配
function loadMenu() {
    console.log('[菜单模块] 调用loadMenu() - 转发到loadNavMenu()');
    loadNavMenu();
} 
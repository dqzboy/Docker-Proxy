const MenuItem = require('../models/MenuItem');

async function initMenuItems() {
    const count = await MenuItem.countDocuments();
    if (count === 0) {
        await MenuItem.insertMany([
            {
                text: '首页',
                link: '/',
                icon: 'fa-home',
                order: 1
            },
            {
                text: '文档',
                link: '/docs',
                icon: 'fa-book',
                order: 2
            }
            // 添加更多默认菜单项...
        ]);
        console.log('默认菜单项已初始化');
    }
}

module.exports = initMenuItems;
// 网络测试相关功能

// 创建networkTest对象
const networkTest = {
    // 初始化函数
    init: function() {
        console.log('初始化网络测试模块...');
        this.initNetworkTest();
        return Promise.resolve();
    },

    // 初始化网络测试界面
    initNetworkTest: function() {
        const domainSelect = document.getElementById('domainSelect');
        const testType = document.getElementById('testType');
        
        // 填充域名选择器
        if (domainSelect) {
            domainSelect.innerHTML = `
                <option value="">选择预定义域名</option>
                <option value="gcr.io">gcr.io</option>
                <option value="ghcr.io">ghcr.io</option>
                <option value="quay.io">quay.io</option>
                <option value="k8s.gcr.io">k8s.gcr.io</option>
                <option value="registry.k8s.io">registry.k8s.io</option>
                <option value="mcr.microsoft.com">mcr.microsoft.com</option>
                <option value="docker.elastic.co">docker.elastic.co</option>
                <option value="registry-1.docker.io">registry-1.docker.io</option>
            `;
        }
        
        // 填充测试类型选择器
        if (testType) {
            testType.innerHTML = `
                <option value="ping">Ping</option>
                <option value="traceroute">Traceroute</option>
            `;
        }
        
        // 绑定测试按钮点击事件
        const testButton = document.querySelector('#network-test button');
        if (testButton) {
            testButton.addEventListener('click', this.runNetworkTest);
        }
    },

    // 运行网络测试
    runNetworkTest: function() {
        const domain = document.getElementById('domainSelect').value;
        const testType = document.getElementById('testType').value;
        const resultsDiv = document.getElementById('testResults');

        // 验证选择了域名
        if (!domain) {
            core.showAlert('请选择目标域名', 'error');
            return;
        }

        resultsDiv.innerHTML = '测试中，请稍候...';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

        fetch('/api/network-test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domain, type: testType }),
            signal: controller.signal
        })
        .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error('网络测试失败');
            }
            return response.text();
        })
        .then(result => {
            resultsDiv.textContent = result;
        })
        .catch(error => {
            console.error('网络测试出错:', error);
            if (error.name === 'AbortError') {
                resultsDiv.textContent = '测试超时，请稍后再试';
            } else {
                resultsDiv.textContent = '测试失败: ' + error.message;
            }
        });
    }
};

// 全局公开网络测试模块
window.networkTest = networkTest;

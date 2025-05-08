// 网络测试相关功能

// 创建networkTest对象
const networkTest = {
    // 初始化函数
    init: function() {
        // console.log('初始化网络测试模块...');
        this.initNetworkTestControls(); // Renamed for clarity
        this.displayInitialResultsMessage();
        return Promise.resolve(); // Keep if other inits expect a Promise
    },

    displayInitialResultsMessage: function() {
        const resultsDiv = document.getElementById('testResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = '<p class="text-muted text-center p-3">请选择参数并开始测试。</p>';
        }
    },

    // 初始化网络测试界面控件和事件
    initNetworkTestControls: function() {
        const domainSelect = document.getElementById('domainSelect');
        const testTypeSelect = document.getElementById('testType'); // Corrected ID reference
        const startTestButton = document.getElementById('startTestBtn'); // Use ID
        const clearResultsButton = document.getElementById('clearTestResultsBtn');
        const resultsDiv = document.getElementById('testResults');

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
                <option value="google.com">google.com (测试用)</option>
                <option value="cloudflare.com">cloudflare.com (测试用)</option>
                <option value="custom">自定义域名</option>
            `;
            
            // 添加选择变化事件，显示/隐藏自定义域名输入框
            domainSelect.addEventListener('change', () => {
                const customDomainContainer = document.getElementById('customDomainContainer');
                if (customDomainContainer) {
                    customDomainContainer.style.display = domainSelect.value === 'custom' ? 'block' : 'none';
                }
            });
        }
        
        // 填充测试类型选择器
        if (testTypeSelect) {
            testTypeSelect.innerHTML = `
                <option value="ping">Ping (ICMP)</option>
                <option value="traceroute">Traceroute</option>
            `;
        }
        
        // 绑定开始测试按钮点击事件
        if (startTestButton) {
            // Bind the function correctly, preserving 'this' context if necessary, 
            // or ensure runNetworkTest doesn't rely on 'this' from the event handler.
            // Using an arrow function or .bind(this) if runNetworkTest uses 'this.someOtherMethod'
            startTestButton.addEventListener('click', () => this.runNetworkTest()); 
        } else {
            // console.error('未找到开始测试按钮 (ID: startTestBtn)');
        }

        // 绑定清空结果按钮点击事件
        if (clearResultsButton && resultsDiv) {
            clearResultsButton.addEventListener('click', () => {
                resultsDiv.innerHTML = '<p class="text-muted text-center p-3">结果已清空。</p>'; 
                // Optionally, remove loading class if it was somehow stuck
                resultsDiv.classList.remove('loading'); 
            });
        } else {
            if (!clearResultsButton) { /* console.error('未找到清空结果按钮 (ID: clearTestResultsBtn)'); */ }
            if (!resultsDiv) { /* console.error('未找到测试结果区域 (ID: testResults)'); */ }
        }
    },

    // 运行网络测试
    runNetworkTest: async function() { // Changed to async for await
        let domain = document.getElementById('domainSelect').value;
        const testType = document.getElementById('testType').value;
        const resultsDiv = document.getElementById('testResults');
        const startTestButton = document.getElementById('startTestBtn');

        // 处理自定义域名
        if (domain === 'custom') {
            const customDomain = document.getElementById('customDomain')?.value?.trim();
            if (!customDomain) {
                core.showAlert('请输入自定义域名进行测试。', 'warning');
                return;
            }
            domain = customDomain;
        } else if (!domain) {
            core.showAlert('请选择目标域名进行测试。', 'warning');
            return;
        }

        if (!testType) {
            core.showAlert('请选择测试类型。', 'warning');
            return;
        }

        resultsDiv.innerHTML = ''; // Clear previous content before adding loading class
        resultsDiv.classList.add('loading');
        if(startTestButton) startTestButton.disabled = true; // Disable button during test

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            // logger.warn('Network test aborted due to timeout.');
        }, 60000); // 60秒超时

        try {
            const response = await fetch('/api/network-test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add any necessary auth headers if your API requires them
                    // 'Authorization': 'Bearer ' + localStorage.getItem('authToken'), 
                },
                body: JSON.stringify({ domain, type: testType }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                let detail = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    detail = errorJson.message || errorJson.error || errorText;
                } catch (e) { /* ignore parsing error, use raw text */ }
                throw new Error(`网络连接正常，但测试执行失败 (状态: ${response.status}): ${detail}`);
            }
            const result = await response.text();
            // Format the plain text result in a <pre> tag for better display
            resultsDiv.innerHTML = `<pre>${result}</pre>`;
        } catch (error) {
            clearTimeout(timeoutId); // Ensure timeout is cleared on any error
            // console.error('网络测试出错:', error);
            let errorMessage = '测试失败: ' + error.message;
            if (error.name === 'AbortError') {
                errorMessage = '测试请求超时 (60秒)。请检查网络连接或目标主机状态。';
            }
             resultsDiv.innerHTML = `<pre class="text-danger">${errorMessage}</pre>`;
        } finally {
            resultsDiv.classList.remove('loading');
            if(startTestButton) startTestButton.disabled = false; // Re-enable button
        }
    }
};

// 全局公开网络测试模块 (或者 integrate with app.js module system if you have one)
// Ensure this is called after the DOM is ready, e.g., in app.js or a DOMContentLoaded listener
// For now, let's assume app.js handles calling networkTest.init()
window.networkTest = networkTest;

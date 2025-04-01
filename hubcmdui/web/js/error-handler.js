// 客户端错误收集器

(function() {
  // 保存原始控制台方法
  const originalConsoleError = console.error;
  
  // 重写console.error以捕获错误
  console.error = function(...args) {
    // 调用原始方法
    originalConsoleError.apply(console, args);
    
    // 提取错误信息
    const errorMessage = args.map(arg => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      } else if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      } else {
        return String(arg);
      }
    }).join(' ');
    
    // 向服务器报告错误
    reportErrorToServer({
      message: errorMessage,
      source: 'console.error',
      type: 'console'
    });
  };
  
  // 全局错误处理
  window.addEventListener('error', function(event) {
    reportErrorToServer({
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error ? event.error.stack : null,
      type: 'uncaught'
    });
  });
  
  // Promise错误处理
  window.addEventListener('unhandledrejection', function(event) {
    const message = event.reason instanceof Error 
      ? event.reason.message 
      : String(event.reason);
      
    const stack = event.reason instanceof Error 
      ? event.reason.stack 
      : null;
      
    reportErrorToServer({
      message: message,
      stack: stack,
      type: 'promise'
    });
  });
  
  // 向服务器发送错误报告
  function reportErrorToServer(errorData) {
    // 添加额外信息
    const data = {
      ...errorData,
      userAgent: navigator.userAgent,
      page: window.location.href,
      timestamp: new Date().toISOString()
    };
    
    // 发送错误报告到服务器
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      // 使用keepalive以确保在页面卸载时仍能发送
      keepalive: true
    }).catch(err => {
      // 不记录这个错误，避免无限循环
    });
  }
})();

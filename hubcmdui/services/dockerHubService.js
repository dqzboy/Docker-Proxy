/**
 * Docker Hub 服务模块
 */
const axios = require('axios');
const logger = require('../logger');
const pLimit = require('p-limit');
const axiosRetry = require('axios-retry');

// 配置并发限制，最多5个并发请求
const limit = pLimit(5);

// 优化HTTP请求配置
const httpOptions = {
  timeout: 15000, // 15秒超时
  headers: {
    'User-Agent': 'DockerHubSearchClient/1.0',
    'Accept': 'application/json'
  }
};

// 配置Axios重试
axiosRetry(axios, {
  retries: 3, // 最多重试3次
  retryDelay: (retryCount) => {
    console.log(`[INFO] 重试 Docker Hub 请求 (${retryCount}/3)`);
    return retryCount * 1000; // 重试延迟，每次递增1秒
  },
  retryCondition: (error) => {
    // 只在网络错误或5xx响应时重试
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           (error.response && error.response.status >= 500);
  }
});

// 搜索仓库
async function searchRepositories(term, page = 1, requestCache = null) {
  const cacheKey = `search_${term}_${page}`;
  let cachedResult = null;
  
  // 安全地检查缓存
  if (requestCache && typeof requestCache.get === 'function') {
    cachedResult = requestCache.get(cacheKey);
  }
  
  if (cachedResult) {
    console.log(`[INFO] 返回缓存的搜索结果: ${term} (页码: ${page})`);
    return cachedResult;
  }
  
  console.log(`[INFO] 搜索Docker Hub: ${term} (页码: ${page})`);
  
  try {
    // 使用更安全的直接请求方式，避免pLimit可能的问题
    const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}&page=${page}&page_size=25`;
    const response = await axios.get(url, httpOptions);
    const result = response.data;
    
    // 将结果缓存（如果缓存对象可用）
    if (requestCache && typeof requestCache.set === 'function') {
      requestCache.set(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    logger.error('搜索Docker Hub失败:', error.message);
    // 重新抛出错误以便上层处理
    throw new Error(error.message || '搜索Docker Hub失败');
  }
}

// 获取所有标签
async function getAllTags(imageName, isOfficial) {
  const fullImageName = isOfficial ? `library/${imageName}` : imageName;
  logger.info(`获取所有镜像标签: ${fullImageName}`);
  
  // 为所有标签请求设置超时限制
  const allTagsPromise = fetchAllTags(fullImageName);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('获取所有标签超时')), 30000)
  );
  
  try {
    // 使用Promise.race确保请求不会无限等待
    const allTags = await Promise.race([allTagsPromise, timeoutPromise]);
    
    // 过滤掉无效平台信息
    const cleanedTags = allTags.map(tag => {
      if (tag.images && Array.isArray(tag.images)) {
        tag.images = tag.images.filter(img => !(img.os === 'unknown' && img.architecture === 'unknown'));
      }
      return tag;
    });
    
    return {
      count: cleanedTags.length,
      results: cleanedTags,
      all_pages_loaded: true
    };
  } catch (error) {
    logger.error(`获取所有标签失败: ${error.message}`);
    throw error;
  }
}

// 获取特定页的标签
async function getTagsByPage(imageName, isOfficial, page, pageSize) {
  const fullImageName = isOfficial ? `library/${imageName}` : imageName;
  logger.info(`获取镜像标签: ${fullImageName}, 页码: ${page}, 页面大小: ${pageSize}`);
  
  const tagsUrl = `https://hub.docker.com/v2/repositories/${fullImageName}/tags?page=${page}&page_size=${pageSize}`;
  
  try {
    const tagsResponse = await axios.get(tagsUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
      }
    });
    
    // 检查响应数据有效性
    if (!tagsResponse.data || typeof tagsResponse.data !== 'object') {
      logger.warn(`镜像 ${fullImageName} 返回的数据格式不正确`);
      return { count: 0, results: [] };
    }
    
    if (!tagsResponse.data.results || !Array.isArray(tagsResponse.data.results)) {
      logger.warn(`镜像 ${fullImageName} 没有返回有效的标签数据`);
      return { count: 0, results: [] };
    }
    
    // 过滤掉无效平台信息
    const cleanedResults = tagsResponse.data.results.map(tag => {
      if (tag.images && Array.isArray(tag.images)) {
        tag.images = tag.images.filter(img => !(img.os === 'unknown' && img.architecture === 'unknown'));
      }
      return tag;
    });
    
    return {
      ...tagsResponse.data,
      results: cleanedResults
    };
  } catch (error) {
    logger.error(`获取标签列表失败: ${error.message}`, {
      url: tagsUrl,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    throw error;
  }
}

// 获取标签数量
async function getTagCount(name, isOfficial, requestCache) {
  const cacheKey = `tag_count_${name}_${isOfficial}`;
  const cachedResult = requestCache?.get(cacheKey);
  
  if (cachedResult) {
    console.log(`[INFO] 返回缓存的标签计数: ${name}`);
    return cachedResult;
  }
  
  const fullImageName = isOfficial ? `library/${name}` : name;
  const apiUrl = `https://hub.docker.com/v2/repositories/${fullImageName}/tags/?page_size=1`;
  
  try {
    const result = await limit(async () => {
      const response = await axios.get(apiUrl, httpOptions);
      return {
        count: response.data.count,
        recommended_mode: response.data.count > 500 ? 'paginated' : 'full'
      };
    });
    
    if (requestCache) {
      requestCache.set(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    throw error;
  }
}

// 递归获取所有标签
async function fetchAllTags(fullImageName, page = 1, allTags = [], maxPages = 10) {
  if (page > maxPages) {
    logger.warn(`达到最大页数限制 (${maxPages})，停止获取更多标签`);
    return allTags;
  }
  
  const pageSize = 100; // 使用最大页面大小
  const url = `https://hub.docker.com/v2/repositories/${fullImageName}/tags?page=${page}&page_size=${pageSize}`;
  
  try {
    logger.info(`获取标签页 ${page}/${maxPages}...`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
      }
    });
    
    if (!response.data.results || !Array.isArray(response.data.results)) {
      logger.warn(`页 ${page} 没有有效的标签数据`);
      return allTags;
    }
    
    allTags.push(...response.data.results);
    logger.info(`已获取 ${allTags.length}/${response.data.count || 'unknown'} 个标签`);
    
    // 检查是否有下一页
    if (response.data.next && allTags.length < response.data.count) {
      // 添加一些延迟以避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetchAllTags(fullImageName, page + 1, allTags, maxPages);
    }
    
    logger.success(`成功获取所有 ${allTags.length} 个标签`);
    return allTags;
  } catch (error) {
    logger.error(`递归获取标签失败 (页码 ${page}): ${error.message}`);
    
    // 如果已经获取了一些标签，返回这些标签而不是抛出错误
    if (allTags.length > 0) {
      return allTags;
    }
    
    // 如果没有获取到任何标签，则抛出错误
    throw error;
  }
}

// 统一的错误处理函数
function handleAxiosError(error, res, message) {
  let errorDetails = '';
  
  if (error.response) {
    // 服务器响应错误的错误处理函数
    const status = error.response.status;
    errorDetails = `状态码: ${status}`;
    
    if (error.response.data && error.response.data.message) {
      errorDetails += `, 信息: ${error.response.data.message}`;
    }
    
    console.error(`[ERROR] ${message}: ${errorDetails}`);
    
    res.status(status).json({
      error: `${message} (${errorDetails})`,
      details: error.response.data
    });
  } else if (error.request) {
    // 请求已发送但没有收到响应
    if (error.code === 'ECONNRESET') {
      errorDetails = '连接被重置，这可能是由于网络不稳定或服务端断开连接';
    } else if (error.code === 'ECONNABORTED') {
      errorDetails = '请求超时，服务器响应时间过长';
    } else {
      errorDetails = `${error.code || '未知错误代码'}: ${error.message}`;
    }
    
    console.error(`[ERROR] ${message}: ${errorDetails}`);
    
    res.status(503).json({
      error: `${message} (${errorDetails})`,
      retryable: true
    });
  } else {
    // 其他错误
    errorDetails = error.message;
    console.error(`[ERROR] ${message}: ${errorDetails}`);
    console.error(`[ERROR] 错误堆栈: ${error.stack}`);
    
    res.status(500).json({
      error: `${message} (${errorDetails})`,
      retryable: true
    });
  }
}

module.exports = {
  searchRepositories,
  getAllTags,
  getTagsByPage,
  getTagCount,
  fetchAllTags,
  handleAxiosError
};

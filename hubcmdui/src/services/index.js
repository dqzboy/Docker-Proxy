import axios from 'axios'
import i18n from '../i18n'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
})

// =====================================================================
// H1 配套：默认密码会话触发 403 NEED_CHANGE_PASSWORD 时的全局锁屏兜底
//
// 登录页 Login.vue 自带更丰富的「带默认凭证提示」dialog（首次登录即拦截）。
// 这里专门处理「点稍后进入主界面后再发起的 API 请求」场景——
// 后端 requireFreshPassword 会把所有非白名单接口返 403，没拦截的话 dashboard /
// 列表会静默卡死，用户完全搞不清状况。
//
// 关键设计：
//  - 用动态 import 加载 router / element-plus：避免 services ↔ router ↔ views
//    形成循环依赖（services 已被 Login.vue / Landing.vue 等视图静态引入）。
//  - _pwdDialogShown 闸门：并发 403（dashboard 一启动就拉 5 个接口）只弹一次。
//  - 先弹窗说明原因，用户确认后再进入用户中心，避免毫无解释地切换页面。
//  - 当前已在 user 中心页时不重复 push：避免 vue-router 4 的 NavigationDuplicated。
// =====================================================================
let _pwdDialogShown = false
const _loadRouter = () => import('../router').then(m => m.default)
const _loadElMsgBox = () => import('element-plus').then(m => m.ElMessageBox)

async function _handleDefaultPasswordLockout() {
  try {
    const [router, { ElMessageBox }] = await Promise.all([
      _loadRouter(),
      _loadElMsgBox()
    ])
    const t = i18n.global.t
    await ElMessageBox.alert(
      t('login.passwordRequired'),
      t('login.securityTitle'),
      {
        confirmButtonText: t('login.changePasswordNow'),
        showClose: false,
        type: 'warning'
      }
    )
    if (router.currentRoute?.value?.name !== 'user') {
      // 用户确认了解原因后再进入修改密码页面。
      try {
        await router.push({ name: 'user', query: { forceChange: '1' } })
      } catch (e) { /* 静默吞掉 */ }
    }
  } catch (e) {
    // 拦截器自身失败不应影响主流程；闸门仍需在 finally 重置，否则后续 403 全静音
  } finally {
    _pwdDialogShown = false
  }
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      // 会话过期，交给调用方处理
    }
    // 默认密码会话触发 403 + NEED_CHANGE_PASSWORD：全局兜底拦截
    if (
      err?.response?.status === 403 &&
      err.response.data?.code === 'NEED_CHANGE_PASSWORD' &&
      !_pwdDialogShown
    ) {
      _pwdDialogShown = true
      _handleDefaultPasswordLockout()
    }
    return Promise.reject(err)
  }
)

// ============ 鉴权 ============
// 取码时服务端会下发 captchaId，登录/重置时须原样回传，便于服务端校验。
// 验证码已与 session 解耦，避免并发请求抢走 session cookie 导致校验失败。
let _captchaId = null
export const getCaptcha = () => api.get('/captcha').then(r => {
  _captchaId = r.data && r.data.captchaId
  return r.data
})
export const login = (payload) => {
  const { username, password, captcha } = payload || {}
  return api.post('/login', { username, password, captcha, captchaId: _captchaId }).then(r => r.data)
}
export const logout = () => api.post('/logout').then(r => r.data)
export const checkSession = () => api.get('/check-session').then(r => r.data)
export const changePassword = (currentPassword, newPassword) =>
  api.post('/change-password', { currentPassword, newPassword }).then(r => r.data)
export const changeUsername = (newUsername, password) =>
  api.post('/change-username', { newUsername, password }).then(r => r.data)
export const getUserInfo = () => api.get('/user-info').then(r => r.data)
export const requestResetToken = (username, captcha) =>
  api.post('/request-reset-token', { username, captcha, captchaId: _captchaId }).then(r => r.data)
export const resetPassword = (token, newPassword, confirmPassword) =>
  api.post('/reset-password', { token, newPassword, confirmPassword }).then(r => r.data)
export const validateResetToken = (token) =>
  api.post('/validate-reset-token', { token }).then(r => r.data)

// ============ 配置 / 菜单 / Registry ============
export const getConfig = () => api.get('/config').then(r => r.data)
// 站点锁定信息（GitHub 地址等，后端加密存储且不可更改）
export const getSiteInfo = () => api.get('/site').then(r => r.data)
// 前台落地页（/）展示开关：公开读、后管写（requireLogin）
export const getLandingVisible = () => api.get('/site/landing-visible').then(r => r.data)
export const setLandingVisible = (visible) => api.post('/site/landing-visible', { visible }).then(r => r.data)
export const saveConfig = (cfg) => api.post('/config', cfg).then(r => r.data)
export const getMenuItems = () => api.get('/menu/items').then(r => r.data)
export const saveMenuItems = (menuItems) =>
  api.post('/menu/items', { menuItems }).then(r => r.data)
export const getRegistryConfigs = () => api.get('/config/registry-configs').then(r => r.data)
export const getEnabledRegistryConfigs = () =>
  api.get('/config/registry-configs/enabled').then(r => r.data)
export const updateRegistryConfig = (registryId, cfg) =>
  api.put(`/config/registry-configs/${registryId}`, cfg).then(r => r.data)
export const batchUpdateRegistryConfigs = (configs) =>
  api.post('/config/registry-configs', { configs }).then(r => r.data)

// ============ Hubcmd UI 运行参数 ============
export const getRuntimeSettings = () => api.get('/runtimeSettings').then(r => r.data)
export const updateRuntimeSettings = (settings) =>
  api.put('/runtimeSettings', { settings }).then(r => r.data)
export const resetRuntimeSettings = () =>
  api.post('/runtimeSettings/defaults').then(r => r.data)
export const restartManagementUi = () =>
  api.post('/runtimeSettings/restart-ui').then(r => r.data)

// ============ 系统 / 网络测试 ============
export const getSystemResources = () => api.get('/system-resources').then(r => r.data)
// 资源指标历史（后端落库，跨设备/跨会话统一；默认近 24 小时）
export const getMetricsHistory = (hours = 24) =>
  api.get('/metrics/history', { params: { hours } }).then(r => r.data)
export const getSystemResourceDetails = () =>
  api.get('/system-resource-details').then(r => r.data)
export const getDiskSpace = () => api.get('/disk-space').then(r => r.data)
export const networkTest = (payload) =>
  api.post('/network-test', payload).then(r => r.data)
export const getNetworkTraffic = (hours = 24) =>
  api.get('/network-traffic', { params: { hours } }).then(r => r.data)
export const getProxyStats = () => api.get('/goProxy/stats').then(r => r.data)

// ============ Docker 容器 ============
export const getDockerStatus = () => api.get('/docker/status').then(r => r.data)
export const getContainerStatus = (id) => api.get(`/docker/status/${id}`).then(r => r.data)
export const getStoppedContainers = () => api.get('/docker/stopped').then(r => r.data)
export const startContainer = (id) => api.post(`/docker/containers/${id}/start`).then(r => r.data)
export const stopContainer = (id) => api.post(`/docker/containers/${id}/stop`).then(r => r.data)
export const restartContainer = (id) => api.post(`/docker/containers/${id}/restart`).then(r => r.data)
export const deleteContainer = (id) => api.post(`/docker/containers/${id}/remove`).then(r => r.data)
export const updateContainer = (id, image) =>
  api.post(`/docker/containers/${id}/update`, { image }).then(r => r.data)
export const getContainerLogs = (id) => api.get(`/docker/logs-poll/${id}`).then(r => r.data)

// ============ 镜像搜索（多 Registry） ============
export const getRegistryList = () => api.get('/registry/list').then(r => r.data)
export const searchAllRegistries = (term, page = 1, limit = 10) =>
  api.get('/registry/search-all', { params: { term, page, limit } }).then(r => r.data)
export const searchRegistry = (registryId, term, page = 1, limit = 25) =>
  api.get(`/registry/search/${registryId}`, { params: { term, page, limit } }).then(r => r.data)
export const getImageTags = (registryId, name, page = 1, limit = 100, sourceRepository = '') =>
  api.get(`/registry/tags/${registryId}`, { params: { name, page, limit, sourceRepository } }).then(r => r.data)
export const getTagCount = (registryId, name, sourceRepository = '') =>
  api.get(`/registry/tag-count/${registryId}`, { params: { name, sourceRepository } }).then(r => r.data)

// ============ Docker Hub 搜索 ============
export const searchDockerHub = (term, page = 1, limit = 25) =>
  api.get('/dockerhub/search', { params: { term, page, limit } }).then(r => r.data)
export const getDockerHubTags = (owner, repo, page = 1, limit = 25) =>
  api.get(`/dockerhub/tags/${owner}/${repo}`, { params: { page, limit } }).then(r => r.data)

// ============ 文档（公开） ============
export const getPublishedDocs = () => api.get('/documentation/published').then(r => r.data)
export const getPublicDoc = (id) => api.get(`/documentation/${id}`).then(r => r.data)

// ============ 文档（后台管理） ============
export const listDocuments = () => api.get('/documentation/documents').then(r => r.data)
export const getDocument = (id) => api.get(`/documentation/documents/${id}`).then(r => r.data)
export const createDocument = (doc) => api.post('/documentation/documents', doc).then(r => r.data)
export const saveDocument = (id, doc) =>
  api.put(`/documentation/documents/${id}`, doc).then(r => r.data)
export const deleteDocument = (id) => api.delete(`/documentation/documents/${id}`).then(r => r.data)
export const togglePublish = (id) =>
  api.put(`/documentation/toggle-publish/${id}`).then(r => r.data)

// ============ Go 代理 ============
export const getGoConfig = () => api.get('/goProxy/config').then(r => r.data)
export const saveGoConfig = (cfg) => api.put('/goProxy/config', cfg).then(r => r.data)
export const reloadGoProxy = () => api.post('/goProxy/reload').then(r => r.data)
export const goProxyStatus = () => api.get('/goProxy/status').then(r => r.data)

// ============ 缓存管理（go-proxy 磁盘缓存） ============
export const getCacheConfig = () => api.get('/cache').then(r => r.data)
export const saveCacheConfig = (cfg) => api.put('/cache', cfg).then(r => r.data)
export const clearCache = () => api.post('/cache/clear').then(r => r.data)

// ============ IP 访问控制（代理层） ============
export const getIpAccess = () => api.get('/ipAccess').then(r => r.data)
export const saveIpAccess = (cfg) => api.put('/ipAccess', cfg).then(r => r.data)

// ============ 监控 ============
export const getMonitoringConfig = () => api.get('/monitoring-config').then(r => r.data)
export const saveMonitoringConfig = (cfg) =>
  api.post('/monitoring-config', cfg).then(r => r.data)
export const toggleMonitoring = (isEnabled) =>
  api.post('/toggle-monitoring', { isEnabled }).then(r => r.data)
export const getStoppedContainersForMonitor = () =>
  api.get('/stopped-containers').then(r => r.data)
export const testNotification = (cfg) =>
  api.post('/test-notification', cfg).then(r => r.data)

export default api

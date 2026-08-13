import { ref } from 'vue'
import { checkSession } from '../services'

// 全局共享的登录态（单例）：AdminShell 与 Login 共用。
// - authed：是否已登录
// - ready：是否已完成首次会话检查（用于避免刷新 /admin 时闪现登录页）
const authed = ref(false)
const ready = ref(false)
let pendingPromise = null

function isAuthenticated(res) {
  // 兼容旧版兼容层的 { authenticated }，新接口统一使用 { success }。
  return !!(res && (res.success === true || res.authenticated === true))
}

async function startRefresh() {
  try {
    const res = await checkSession()
    authed.value = isAuthenticated(res)
  } catch (_) {
    authed.value = false
  } finally {
    ready.value = true
  }
  return authed.value
}

async function refresh(options = {}) {
  const force = options && options.force === true

  // 普通检查复用正在执行的请求，避免组件间重复请求。
  if (!force && pendingPromise) return pendingPromise

  // 登录成功后的强制检查必须等登录前的旧检查结束，再发起一轮全新的请求。
  // 否则会复用旧的 401 结果，导致接口提示登录成功但页面仍停留在登录表单。
  if (force && pendingPromise) {
    try {
      await pendingPromise
    } catch (_) {}
  }

  // 等待期间可能已有另一个强制刷新启动，直接复用它即可。
  if (pendingPromise) return pendingPromise

  const currentPromise = startRefresh()
  pendingPromise = currentPromise
  try {
    return await currentPromise
  } finally {
    if (pendingPromise === currentPromise) pendingPromise = null
  }
}

export function useAuth() {
  return { authed, ready, refresh }
}

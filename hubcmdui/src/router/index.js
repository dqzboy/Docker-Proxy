import { createRouter, createWebHistory } from 'vue-router'
import { ElMessageBox } from 'element-plus'

import Landing from '../views/Landing.vue'
import Login from '../views/Login.vue'
import AdminShell from '../views/AdminShell.vue'
import i18n from '../i18n'
import { useAuth } from '../composables/useAuth'

const routes = [
  // 公开落地页（镜像搜索 / 文档教程）
  { path: '/', name: 'landing', component: Landing },

  // 登录页（兼容旧链接 /admin/login）；已登录用户进入会自动跳转到 /admin
  { path: '/admin/login', name: 'admin-login', component: Login },

  // 后台管理：由 AdminShell 在「未登录」时原地展示登录页（URL 保持 /admin，不再跳转 /admin/login?redirect=...）
  {
    path: '/admin',
    component: AdminShell,
    children: [
      // 把 /admin 本身作为系统看板，避免额外跳到 /admin/dashboard 导致地址栏出现额外段
      { path: '', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      // 兼容旧链接：/admin/dashboard → /admin
      { path: 'dashboard', redirect: { name: 'dashboard' } },
      { path: 'basic', name: 'basic', component: () => import('../views/BasicConfig.vue') },
      {
        path: 'settings',
        name: 'runtimeSettings',
        component: () => import('../views/RuntimeSettings.vue'),
        meta: { requiresFreshPassword: true }
      },
      { path: 'docker', name: 'docker', component: () => import('../views/Docker.vue') },
      { path: 'goproxy', name: 'goproxy', component: () => import('../views/GoProxy.vue') },
      { path: 'cache', name: 'cache', component: () => import('../views/CacheManagement.vue') },
      { path: 'ipaccess', name: 'ipaccess', component: () => import('../views/IpAccess.vue') },
      { path: 'documents', name: 'documents', component: () => import('../views/Documents.vue') },
      { path: 'menu', name: 'menu', component: () => import('../views/Menu.vue') },
      { path: 'network', name: 'network', component: () => import('../views/NetworkTest.vue') },
      { path: 'traffic', name: 'traffic', component: () => import('../views/NetworkTraffic.vue') },
      { path: 'monitoring', name: 'monitoring', component: () => import('../views/Monitoring.vue') },
      { path: 'user', name: 'user', component: () => import('../views/UserCenter.vue') }
    ]
  },

  // 兜底
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 默认密码用户进入敏感页面前先说明原因，再引导到用户中心。
// 该守卫负责交互体验；后端 requireFreshPassword 仍保留为不可绕过的安全兜底。
router.beforeEach(async (to) => {
  if (!to.matched.some(record => record.meta.requiresFreshPassword)) return true

  const { authed, ready, requireChangePassword, refresh } = useAuth()
  if (!ready.value) await refresh()

  if (!authed.value || !requireChangePassword.value) return true

  const t = i18n.global.t
  await ElMessageBox.alert(
    t('login.passwordRequired'),
    t('login.securityTitle'),
    {
      confirmButtonText: t('login.changePasswordNow'),
      closeOnClickModal: false,
      closeOnPressEscape: false,
      showClose: false,
      type: 'warning'
    }
  )

  return { name: 'user', query: { forceChange: '1' } }
})

export default router

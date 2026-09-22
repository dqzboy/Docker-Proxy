<template>
  <el-container class="admin-root">
    <!-- 侧边栏 -->
    <el-aside width="216px" class="admin-aside">
      <div class="brand">
        <span class="brand-logo">
          <img v-if="logo" :src="logo" alt="Docker 镜像加速服务" />
          <img v-else src="/images/docker-proxy.svg" alt="Docker 镜像加速服务" />
        </span>
        <span class="brand-text">
          <span class="brand-name">{{ t('layout.brandName') }}</span>
          <span class="brand-sub">{{ t('layout.brandSub') }}</span>
        </span>
      </div>
      <nav class="side-nav">
        <router-link
          v-for="item in nav"
          :key="item.name"
          :to="{ name: item.name }"
          class="side-link"
          :class="{ active: isActive(item) }"
          :title="t('nav.' + item.name)"
        >
          <el-icon class="side-icon"><component :is="item.icon" /></el-icon>
          <span class="side-label">{{ t('nav.' + item.name) }}</span>
        </router-link>
      </nav>
      <div class="aside-foot">
        <div class="foot-tip">{{ t('layout.footer', { year }) }}</div>
        <a
          v-if="githubUrl"
          class="foot-github"
          :href="githubUrl"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('layout.github')"
        >
          <svg class="gh-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>{{ t('layout.github') }}</span>
        </a>
      </div>
    </el-aside>

    <!-- 主区域 -->
    <el-container class="admin-body">
      <el-header class="admin-header">
        <div class="header-title">{{ currentTitle }}</div>
        <div class="header-right">
          <!-- 语言切换 -->
          <LangSwitch />
          <!-- 主题切换 -->
          <el-dropdown trigger="click" @command="onThemeCmd">
            <span class="theme-toggle" :title="themeLabel">
              <el-icon>
                <Sunny v-if="effective === 'light'" />
                <Moon v-else-if="effective === 'dark'" />
                <Monitor v-else />
              </el-icon>
              <span class="theme-text">{{ themeLabel }}</span>
              <el-icon class="caret"><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="light">
                  <el-icon><Sunny /></el-icon> {{ t('layout.themeLight') }}
                </el-dropdown-item>
                <el-dropdown-item command="dark">
                  <el-icon><Moon /></el-icon> {{ t('layout.themeDark') }}
                </el-dropdown-item>
                <el-dropdown-item command="auto">
                  <el-icon><Monitor /></el-icon> {{ t('layout.themeAuto') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <span class="header-user">
            <el-icon><User /></el-icon>
            <span v-if="username">{{ username }}</span>
          </span>
          <el-button text :icon="SwitchButton" @click="onLogout">{{ t('layout.logout') }}</el-button>
        </div>
      </el-header>

      <el-main class="admin-main">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import {
  Odometer, Cpu, Connection, Document, Operation,
  Histogram, Monitor, User, SwitchButton,
  Sunny, Moon, CaretBottom, Setting, DataLine, Lock, Tools, Files
} from '@element-plus/icons-vue'
import { getConfig, getUserInfo, logout, getSiteInfo } from '../services'
import { useTheme } from '../composables/useTheme'
import { useAuth } from '../composables/useAuth'
import LangSwitch from '../components/LangSwitch.vue'

const nav = [
  { name: 'dashboard', title: '系统看板', icon: Odometer },
  { name: 'basic', title: '基本配置', icon: Setting },
  { name: 'runtimeSettings', title: '系统参数', icon: Tools },
  { name: 'docker', title: '容器管理', icon: Cpu },
  { name: 'goproxy', title: '代理管理', icon: Connection },
  { name: 'cache', title: '缓存管理', icon: Files },
  { name: 'ipaccess', title: 'IP 访问控制', icon: Lock },
  { name: 'documents', title: '文档管理', icon: Document },
  { name: 'menu', title: '菜单管理', icon: Operation },
  { name: 'network', title: '网络测试', icon: Histogram },
  { name: 'traffic', title: '流量监控', icon: DataLine },
  { name: 'monitoring', title: '监控配置', icon: Monitor },
  { name: 'user', title: '用户中心', icon: User }
]

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const logo = ref('')
const username = ref('')
const year = ref(new Date().getFullYear())
const githubUrl = ref('')
const { mode, setMode } = useTheme()
// 全局登录态单例：退出时直接置为 false，AdminShell 会立即从后台布局切回登录页（无需刷新）
const { authed } = useAuth()

const effective = ref(typeof localStorage !== 'undefined' ? localStorage.getItem('hubcmdui.applied') || 'dark' : 'dark')
function refreshApplied() {
  if (typeof localStorage === 'undefined') return
  const v = localStorage.getItem('hubcmdui.applied') || 'dark'
  effective.value = v
}
// 跨 tab 同步
let storageHandler
onMounted(() => {
  refreshApplied()
  storageHandler = (e) => { if (e.key === 'hubcmdui.applied') refreshApplied() }
  window.addEventListener('storage', storageHandler)
})
onBeforeUnmount(() => {
  if (storageHandler) window.removeEventListener('storage', storageHandler)
})

const themeLabel = computed(() => {
  if (mode.value === 'light') return t('layout.themeLight')
  if (mode.value === 'dark') return t('layout.themeDark')
  return t('layout.themeAutoFull', {
    mode: effective.value === 'dark' ? t('layout.themeDark') : t('layout.themeLight')
  })
})

function onThemeCmd(cmd) {
  setMode(cmd)
  refreshApplied()
  ElMessage.success(t('layout.themeSwitched'))
}

const currentTitle = computed(() => {
  const item = nav.find(n => isActive(n))
  return item ? t('nav.' + item.name) : t('layout.brandName')
})

// 精确匹配：避免 vue-router 默认的"包含匹配"（前缀命中）导致「系统看板」在所有 /admin/* 子路由都高亮
function isActive(item) {
  return route.name === item.name
}

async function onLogout() {
  try {
    await logout()
  } catch (_) {
    /* 即使后端登出失败，前端也强制回到登录态 */
  }
  // 立即将全局登录态置为未登录，AdminShell 据此切换回 Login 视图
  authed.value = false
  // 地址栏保持干净：停留在 /admin，由 AdminShell 渲染 Login
  if (route.fullPath !== '/admin') {
    router.replace('/admin')
  }
}

onMounted(async () => {
  try {
    const cfg = await getConfig()
    logo.value = (cfg && cfg.logo) || ''
  } catch (_) {}
  try {
    const u = await getUserInfo()
    username.value = (u && (u.username || u.name)) || ''
  } catch (_) {}
  try {
    const site = await getSiteInfo()
    githubUrl.value = (site && site.githubUrl) || ''
  } catch (_) {}
})
</script>

<style scoped>
/* 整体占满视口且自身不滚动：侧栏与顶栏因此固定，只有内容区独立滚动 */
.admin-root { height: 100vh; overflow: hidden; background: var(--bg-page); }

.admin-aside {
  width: 216px;
  flex: 0 0 216px;
  background: var(--aside-bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
  transition: width .2s ease, flex-basis .2s ease;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.brand-logo img { height: 30px; width: auto; display: block; }
.brand-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.brand-name { font-size: 14px; font-weight: 700; color: var(--fg); letter-spacing: .2px; white-space: nowrap; }
.brand-sub { font-size: 11px; color: var(--muted-2); letter-spacing: .5px; }
.side-nav { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.side-link {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: 8px;
  color: var(--fg-2); text-decoration: none;
  font-size: 14px; transition: all .15s ease;
  cursor: pointer;
}
.side-link:hover { background: var(--bg-hover); color: var(--fg); }
.side-link.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.side-icon { font-size: 16px; }
.aside-foot { padding: 12px 18px; border-top: 1px solid var(--border); }
.foot-tip { color: var(--muted-2); font-size: 11px; }
.foot-github {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  color: var(--accent, #3D7CF4);
  font-size: 12px;
  text-decoration: none;
  transition: opacity .15s ease;
}
.foot-github:hover { opacity: .8; text-decoration: underline; }
.gh-icon { display: block; }

.admin-body { height: 100vh; display: flex; flex-direction: column; }

.admin-header {
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px 0 26px; height: 56px;
  flex: 0 0 auto;
  z-index: 5;
}
.header-title { font-size: 15px; font-weight: 600; color: var(--fg); }
.header-right { display: flex; align-items: center; gap: 14px; color: var(--fg-2); font-size: 13px; }
.header-user { display: flex; align-items: center; gap: 6px; }

.theme-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 8px;
  background: var(--bg-hover); color: var(--fg-2);
  cursor: pointer; transition: all .15s ease; font-size: 13px;
  border: 1px solid var(--border);
}
.theme-toggle:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.theme-text { font-weight: 500; }
.caret { font-size: 10px; opacity: .7; }

.admin-main { flex: 1; overflow-y: auto; background: var(--bg-page); padding: 20px 20px 20px 26px; }

/* 中小屏自动收为图标栏，给主内容释放横向空间。 */
@media (max-width: 1200px) {
  .admin-aside {
    width: 72px !important;
    flex-basis: 72px;
  }
  .brand { justify-content: center; padding: 16px 8px; }
  .brand-text, .side-label, .foot-tip, .foot-github span { display: none; }
  .side-nav { padding: 12px 8px; }
  .side-link { justify-content: center; gap: 0; padding: 10px 8px; }
  .side-icon { font-size: 18px; }
  .aside-foot { display: flex; justify-content: center; padding: 12px 8px; }
  .foot-github { margin-top: 0; }
}

@media (max-width: 720px) {
  .admin-aside {
    width: 64px !important;
    flex-basis: 64px;
  }
  .admin-header { padding: 0 12px 0 18px; }
  .admin-main { padding: 16px 12px 16px 18px; }
  .header-right { gap: 8px; }
  .theme-text, .caret, .header-user span { display: none; }
}
</style>

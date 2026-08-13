<template>
  <div class="login-wrap">
    <!-- 原登录页背景图 /images/login-bg.jpg（忠实还原旧 UI 观感） -->
    <div class="login-bg" :style="{ backgroundImage: 'url(/images/login-bg.jpg)' }"></div>
    <!-- 低透明度渐变蒙版，让照片透出 -->
    <div class="login-scrim"></div>

    <el-card class="login-card" shadow="never">
      <div class="login-card-head">
        <LangSwitch variant="icon" />
      </div>
      <!-- 品牌区：使用项目官方 logo 图片 -->
      <div class="brand">
        <img class="brand-logo" src="/images/docker-proxy.png" :alt="t('layout.brandName')" />
        <h1 class="brand-title">HubCmdUI</h1>
        <p class="brand-sub">{{ t('login.brandSub') }}</p>
      </div>

      <el-form :model="form" label-position="top" @submit.prevent="onSubmit">
        <el-form-item :label="t('login.username')" class="field">
          <el-input
            v-model="form.username"
            :placeholder="t('common.pleaseInput') + ' ' + t('login.username')"
            :prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <el-form-item :label="t('login.password')" class="field">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="t('common.pleaseInput') + ' ' + t('login.password')"
            :prefix-icon="Lock"
            size="large"
          />
        </el-form-item>

        <el-form-item :label="t('login.captcha')" class="field">
          <div class="captcha-row">
            <el-input
              v-model="form.captcha"
              :placeholder="t('login.captchaPlaceholder')"
              :prefix-icon="Key"
              size="large"
            />
            <div
              class="captcha-box"
              :class="{ error: captchaError, loading: captchaLoading }"
              :title="t('login.captchaPlaceholder')"
              @click="loadCaptcha"
            >
              <template v-if="captchaLoading">
                <el-icon class="captcha-icon spin"><Loading /></el-icon>
                <span class="captcha-hint">{{ t('login.loadingCaptcha') }}</span>
              </template>
              <template v-else-if="captchaError">
                <el-icon class="captcha-icon"><Warning /></el-icon>
                <span class="captcha-hint">{{ t('login.captchaRetry') }}</span>
              </template>
              <template v-else>
                <span class="captcha-code">{{ captchaText }}</span>
              </template>
            </div>
          </div>
        </el-form-item>

        <el-button type="primary" :loading="loading" native-type="submit" class="submit-btn">
          {{ t('login.loginBtn') }}
        </el-button>
      </el-form>

      <div class="login-foot">
        <i class="fas fa-shield-halved"></i>
        {{ t('login.encryptedHint') }}
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { User, Lock, Key, Loading, Warning } from '@element-plus/icons-vue'
import { getCaptcha, login } from '../services'
import { useAuth } from '../composables/useAuth'
import LangSwitch from '../components/LangSwitch.vue'

const props = defineProps({
  // 登录成功后跳转目标（来自 AdminShell 传入，保持 URL 干净）
  redirect: { type: String, default: '' }
})

// 通知父级（AdminShell）登录已完成，让它处理跳转与状态切换
const emit = defineEmits(['logged-in'])

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { refresh } = useAuth()
const form = ref({ username: '', password: '', captcha: '' })
const captchaText = ref('')
const captchaLoading = ref(false)
const captchaError = ref(false)
const loading = ref(false)

async function loadCaptcha() {
  captchaLoading.value = true
  captchaError.value = false
  try {
    const data = await getCaptcha()
    if (data && data.captcha) {
      captchaText.value = data.captcha
      captchaError.value = false
    } else {
      throw new Error('empty captcha')
    }
  } catch (e) {
    captchaText.value = ''
    captchaError.value = true
  } finally {
    captchaLoading.value = false
  }
}

async function onSubmit() {
  if (loading.value) return
  if (!form.value.username || !form.value.password || !form.value.captcha) {
    ElMessage.warning(t('login.pleaseFill'))
    return
  }
  loading.value = true
  try {
    const data = await login(form.value)
    if (data && data.success) {
      // 登录后必须强制发起一轮新的会话检查，不能复用登录前尚未结束的 401 请求。
      const authenticated = await refresh({ force: true })
      if (!authenticated) {
        ElMessage.error(t('login.sessionVerifyFailed'))
        loadCaptcha()
        return
      }

      ElMessage.success(t('login.loginSuccess'))

      // 使用默认密码登录：弹出安全警告，引导用户尽快修改
      if (data.requireChangePassword) {
        await ElMessageBox.confirm(
          `<div class="security-msg">
            <div class="security-msg-icon">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 class="security-msg-title">${t('login.securityTitle')}</h3>
            <p class="security-msg-subtitle">${t('login.securitySub')}</p>
            <div class="security-msg-card">
              <div class="security-msg-row">
                <span class="security-msg-label">${t('login.securityDefaultAccount')}</span>
                <span class="security-msg-value">root</span>
              </div>
              <div class="security-msg-row">
                <span class="security-msg-label">${t('login.securityDefaultPassword')}</span>
                <span class="security-msg-value">admin@123</span>
              </div>
            </div>
            <p class="security-msg-desc">
              ${t('login.securityDesc')}
            </p>
          </div>          `,
          t('login.securityTitle'),
          {
            dangerouslyUseHTMLString: true,
            customClass: 'security-message-box',
            confirmButtonText: t('login.changePasswordNow'),
            cancelButtonText: t('login.later'),
            confirmButtonClass: 'security-confirm-btn',
            cancelButtonClass: 'security-cancel-btn',
            closeOnClickModal: false,
            closeOnPressEscape: false,
            showClose: false
          }
        ).then(() => {
          router.push({ name: 'user' })
        }).catch(() => {})
      }

      // 通知父级处理跳转到具体子路由（如果 intended 不在 /admin 本身）
      emit('logged-in')
    } else {
      ElMessage.error((data && data.error) || t('login.loginFailed'))
      loadCaptcha()
    }
  } catch (e) {
    const msg = e.response && e.response.data && e.response.data.error
    ElMessage.error(msg || '登录失败')
    loadCaptcha()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  loadCaptcha()

  // /admin 下的登录组件由 AdminShell 统一检查会话，避免重复请求。
  // 只有兼容入口 /admin/login 独立渲染 Login 时才主动检查。
  if (route.name === 'admin-login') {
    const authenticated = await refresh()
    if (authenticated) {
      const target = props.redirect || route.query.redirect || '/admin'
      router.replace(target)
    }
  }
})
</script>

<style scoped>
.login-wrap {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 24px;
}

/* 原背景图，铺满全屏 */
.login-bg {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  z-index: 0;
}

/* 渐变蒙版 + 轻微模糊，照片透出（还原 apple-admin.css 的 .login-modal::before） */
.login-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(0, 20, 60, 0.32) 0%,
    rgba(0, 113, 227, 0.18) 55%,
    rgba(0, 0, 0, 0.30) 100%
  );
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  z-index: 1;
}

/* 毛玻璃卡片，浮在蒙版之上 */
.login-card {
  position: relative;
  z-index: 2;
  width: 400px;
  max-width: 100%;
  background: rgba(255, 255, 255, 0.94);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  padding: 4px 6px;
}

/* 语言切换器容器：卡片右上角对齐 */
.login-card-head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 36px;     /* 锁高，避免 icon-only 按钮跳变影响下方品牌区对齐 */
  margin-bottom: 4px;
}

/* ============ 品牌区 ============ */
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 14px 0 26px;
  text-align: center;
}
.brand-logo {
  height: 64px;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 6px 14px rgba(0, 80, 200, 0.18));
}
.brand-title {
  font-size: 24px;
  font-weight: 800;
  margin: 6px 0 0;
  letter-spacing: -0.02em;
  color: var(--fg);
}
.brand-sub {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  letter-spacing: 0.2px;
}

/* ============ 表单字段 ============ */
.field {
  margin-bottom: 18px;
}
.field :deep(.el-form-item__label) {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  letter-spacing: 0.4px;
  padding-bottom: 6px;
  line-height: 1.2;
}
.field :deep(.el-input__wrapper) {
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(203, 213, 225, 0.9) inset;
  padding: 2px 14px;
  transition: box-shadow 0.18s ease, background 0.18s ease;
}
.field :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow: 0 0 0 1px #3D7CF4 inset, 0 0 0 4px rgba(61, 124, 244, 0.15);
}
.field :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.95) inset;
}
.field :deep(.el-input__inner) {
  height: 44px;
  font-size: 14px;
  color: #1f2937;
}
.field :deep(.el-input__inner::placeholder) {
  color: #9aa5b1;
}
/* 密码框显示/隐藏小眼睛 hover 色 */
.field :deep(.el-input__password) {
  color: #9aa5b1;
}
.field :deep(.el-input__password:hover) {
  color: #3D7CF4;
}

.captcha-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
.captcha-box {
  flex: 0 0 auto;
  min-width: 108px;
  height: 44px;
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 11px;
  cursor: pointer;
  user-select: none;
  position: relative;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(135deg, #0a84ff, #0066d6);
  box-shadow: 0 4px 12px rgba(10, 132, 255, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
}
.captcha-box::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.06) 2px, rgba(255,255,255,0.06) 4px),
    repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.05) 9px);
  pointer-events: none;
}
.captcha-box:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(10, 132, 255, 0.45);
}
.captcha-box.error {
  background: linear-gradient(135deg, #ff9f43, #f36c21);
  box-shadow: 0 4px 12px rgba(243, 108, 33, 0.32);
}
.captcha-box.error:hover {
  box-shadow: 0 6px 16px rgba(243, 108, 33, 0.42);
}
.captcha-box.loading {
  background: linear-gradient(135deg, #8e9aaf, #6b7280);
  box-shadow: 0 4px 12px rgba(107, 114, 128, 0.28);
}
.captcha-code {
  position: relative;
  z-index: 1;
  font-weight: 800;
  font-size: 20px;
  font-family: 'SF Mono', 'JetBrains Mono', 'Menlo', 'Consolas', monospace;
  letter-spacing: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.captcha-icon {
  position: relative;
  z-index: 1;
  font-size: 16px;
}
.captcha-hint {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.4px;
  opacity: 0.95;
}
@keyframes captcha-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spin {
  animation: captcha-spin 1s linear infinite;
}

.submit-btn {
  width: 100%;
  margin-top: 4px;
  height: 46px;
  font-size: 15px;
  letter-spacing: 6px;
  font-weight: 600;
  border-radius: 11px;
  background: linear-gradient(135deg, #3D7CF4, #2f6ae0);
  border: none;
  box-shadow: 0 8px 20px rgba(61, 124, 244, 0.32);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(61, 124, 244, 0.42);
}
.submit-btn:active {
  transform: translateY(0);
}

.login-foot {
  margin-top: 18px;
  text-align: center;
  font-size: 12px;
  color: #9aa5b1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.login-foot i {
  color: #34c759;
  font-size: 13px;
}

</style>

<!-- 非 scoped：深色模式下让登录卡片背景/边框也走主题变量，
     否则 .brand-title/.brand-sub 改成 var(--fg)/var(--muted) 后在浅色卡片上反而会看不清 -->
<style>
:root.dark .login-card {
  background: rgba(30, 41, 59, 0.94) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55) !important;
}
:root.dark .login-wrap .field :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.7) !important;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.45) inset !important;
}
:root.dark .login-wrap .field :deep(.el-input__wrapper.is-focus) {
  background: rgba(15, 23, 42, 0.92) !important;
  box-shadow: 0 0 0 1px var(--accent) inset, 0 0 0 4px rgba(34, 197, 94, 0.18) !important;
}
:root.dark .login-foot {
  color: var(--muted-2);
}
:root.dark .login-foot i {
  color: #4ade80;
}
</style>

<template>
  <div class="page">
    <div class="page-head">
      <div class="head-left">
        <h2>{{ t('nav.cache') }}</h2>
        <p class="muted">{{ t('cache.subtitle') }}</p>
      </div>
      <div class="head-actions">
        <el-button :loading="refreshing" plain class="head-btn head-btn--ghost" @click="onRefresh">
          <el-icon><Refresh /></el-icon>
          <span>{{ t('common.refresh') }}</span>
        </el-button>
        <el-popconfirm
          width="280"
          :confirm-button-text="t('cache.confirmClear')"
          :cancel-button-text="t('common.cancel')"
          icon-color="#e6a23c"
          :icon="WarningFilled"
          :title="t('cache.clearConfirmTitle')"
          @confirm="onClear"
        >
          <template #reference>
            <el-button :loading="clearing" type="danger" plain class="head-btn head-btn--danger">
              <el-icon><Delete /></el-icon>
              <span>{{ t('cache.clearCache') }}</span>
            </el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>

    <el-alert
      v-if="statusNote"
      :title="statusNote"
      type="warning"
      :closable="false"
      show-icon
      class="connect-note"
    />

    <el-card shadow="never" class="block">
      <template #header>
        <div class="block-head">
          <div class="block-icon block-icon-stat">
            <el-icon><DataLine /></el-icon>
          </div>
          <div class="block-titles">
            <div class="block-title">{{ t('cache.statsTitle') }}</div>
            <div class="block-desc">{{ t('cache.statsDesc') }}</div>
          </div>
          <el-tag
            :type="stats.enabled ? 'success' : 'info'"
            effect="dark"
            size="small"
            class="head-tag"
          >
            {{ stats.enabled ? t('cache.statusOn') : t('cache.statusOff') }}
          </el-tag>
        </div>
      </template>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-ic stat-ic--green"><el-icon><TrendCharts /></el-icon></div>
          <div class="stat-body">
            <div class="stat-val">{{ formatRate(stats.hitRate) }}</div>
            <div class="stat-lbl">{{ t('cache.hitRate') }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-ic stat-ic--blue"><el-icon><CircleCheck /></el-icon></div>
          <div class="stat-body">
            <div class="stat-val">{{ stats.hits }}</div>
            <div class="stat-lbl">{{ t('cache.hits') }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-ic stat-ic--orange"><el-icon><Warning /></el-icon></div>
          <div class="stat-body">
            <div class="stat-val">{{ stats.misses }}</div>
            <div class="stat-lbl">{{ t('cache.misses') }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-ic stat-ic--purple"><el-icon><Download /></el-icon></div>
          <div class="stat-body">
            <div class="stat-val">{{ formatBytes(stats.bytesServed) }}</div>
            <div class="stat-lbl">{{ t('cache.bytesServed') }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-ic stat-ic--teal"><el-icon><Files /></el-icon></div>
          <div class="stat-body">
            <div class="stat-val">{{ stats.entries }}</div>
            <div class="stat-lbl">{{ t('cache.entries') }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-ic stat-ic--slate"><el-icon><Coin /></el-icon></div>
          <div class="stat-body">
            <div class="stat-val">{{ formatBytes(stats.sizeBytes) }}</div>
            <div class="stat-lbl">{{ t('cache.sizeBytes') }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="block-head">
          <div class="block-icon block-icon-cfg">
            <el-icon><Setting /></el-icon>
          </div>
          <div class="block-titles">
            <div class="block-title">{{ t('cache.settingsTitle') }}</div>
            <div class="block-desc">{{ t('cache.settingsDesc') }}</div>
          </div>
        </div>
      </template>

      <div class="toggle-row" :class="{ 'toggle-row--on': form.enabled }">
        <div class="toggle-left">
          <div class="form-label toggle-label">
            <el-icon class="toggle-ic"><Switch /></el-icon>
            {{ t('cache.enableCache') }}
          </div>
          <p class="form-hint">{{ t('cache.enableHint') }}</p>
        </div>
        <el-switch v-model="form.enabled" class="toggle-switch" />
      </div>

      <el-form :model="form" label-position="top" class="cfg-form" :disabled="!form.enabled">
        <div class="form-grid two">
          <el-form-item :label="t('cache.backend')" required>
            <el-select v-model="form.backend" style="width: 100%">
              <el-option :label="t('cache.backendDisk')" value="disk" />
              <el-option :label="t('cache.backendS3')" value="s3" />
            </el-select>
            <div class="hint">{{ t('cache.backendHint') }}</div>
          </el-form-item>

          <!-- disk 后端：本地目录 + 配额 -->
          <template v-if="form.backend === 'disk'">
            <el-form-item :label="t('cache.dir')" required>
              <el-input v-model="form.dir" :placeholder="t('cache.dirPlaceholder')" />
              <div class="hint">{{ t('cache.dirHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('cache.maxSizeGB')">
              <el-input-number v-model="form.maxSizeGB" :min="1" :step="5" style="width: 100%" />
              <div class="hint">{{ t('cache.maxSizeHint') }}</div>
            </el-form-item>
          </template>

          <!-- s3 后端：兼容 MinIO / Ceph / 阿里云 OSS / 腾讯云 COS / 华为云 OBS -->
          <template v-else-if="form.backend === 's3'">
            <el-form-item :label="t('cache.provider')" required>
              <el-select v-model="form.provider" style="width: 100%">
                <el-option v-for="p in s3Providers" :key="p.value" :label="p.label" :value="p.value" />
              </el-select>
              <div class="hint">{{ t('cache.providerHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('cache.endpoint')" required>
              <el-input v-model="form.endpoint" :placeholder="t('cache.endpointPlaceholder')" />
              <div class="hint">{{ t('cache.endpointHint') }}</div>
            </el-form-item>
            <el-form-item :label="t('cache.region')">
              <el-input v-model="form.region" :placeholder="t('cache.regionPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('cache.bucket')" required>
              <el-input v-model="form.bucket" :placeholder="t('cache.bucketPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('cache.accessKey')" required>
              <el-input v-model="form.accessKey" :placeholder="t('cache.accessKeyPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('cache.secretKey')" required>
              <el-input v-model="form.secretKey" type="password" show-password :placeholder="t('cache.secretKeyPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('cache.pathStyle')">
              <el-switch v-model="form.pathStyle" />
              <div class="hint">{{ t('cache.pathStyleHint') }}</div>
            </el-form-item>
          </template>

          <el-form-item :label="t('cache.blobTTL')">
            <el-input-number v-model="form.blobTTL" :min="0" :step="3600" style="width: 100%" />
            <div class="hint">{{ t('cache.blobTTLHint') }}</div>
          </el-form-item>
          <el-form-item :label="t('cache.manifestTTL')">
            <el-input-number v-model="form.manifestTTL" :min="0" :step="300" style="width: 100%" />
            <div class="hint">{{ t('cache.manifestTTLHint') }}</div>
          </el-form-item>
          <el-form-item :label="t('cache.tagsTTL')">
            <el-input-number v-model="form.tagsTTL" :min="0" :step="300" style="width: 100%" />
            <div class="hint">{{ t('cache.tagsTTLHint') }}</div>
          </el-form-item>
        </div>
      </el-form>

      <div class="block-actions">
        <el-button type="primary" :loading="saving" @click="onSave">
          <el-icon><Document /></el-icon> {{ t('cache.saveSettings') }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Refresh, Delete, Setting, Document, WarningFilled, DataLine,
  TrendCharts, CircleCheck, Warning, Download, Files, Coin, Switch
} from '@element-plus/icons-vue'
import { getCacheConfig, saveCacheConfig, clearCache } from '../services'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const refreshing = ref(false)
const clearing = ref(false)
const saving = ref(false)
const statusNote = ref('')

const stats = reactive({
  hits: 0,
  misses: 0,
  hitRate: 0,
  bytesServed: 0,
  entries: 0,
  sizeBytes: 0,
  enabled: false
})

const form = reactive({
  enabled: false,
  backend: 'disk',
  dir: '/app/cache',
  maxSizeGB: 50,
  blobTTL: 0,
  manifestTTL: 3600,
  tagsTTL: 300,
  // S3 兼容后端（MinIO / Ceph / 阿里云 OSS / 腾讯云 COS / 华为云 OBS）
  provider: 'custom',
  endpoint: '',
  region: '',
  bucket: '',
  accessKey: '',
  secretKey: '',
  pathStyle: false
})

// 厂商预设：与后端 s3VendorPresets 对应，标签走 i18n。
const s3Providers = computed(() => [
  { value: 'minio', label: t('cache.providerMinio') },
  { value: 'ceph', label: t('cache.providerCeph') },
  { value: 'aliyun', label: t('cache.providerAliyun') },
  { value: 'tencent', label: t('cache.providerTencent') },
  { value: 'huawei', label: t('cache.providerHuawei') },
  { value: 'custom', label: t('cache.providerCustom') }
])

function parseConfig(c) {
  if (!c) return
  form.enabled = !!c.enabled
  form.backend = c.backend || 'disk'
  form.dir = c.dir || '/app/cache'
  form.maxSizeGB = typeof c.max_size_gb === 'number' ? c.max_size_gb : 50
  form.blobTTL = typeof c.blob_ttl === 'number' ? c.blob_ttl : 0
  form.manifestTTL = typeof c.manifest_ttl === 'number' ? c.manifest_ttl : 3600
  form.tagsTTL = typeof c.tags_ttl === 'number' ? c.tags_ttl : 300
  // S3 字段：secret_key 经后端脱敏为 ********，原样回填即可，保存时后端会保留原值。
  form.provider = c.provider || 'custom'
  form.endpoint = c.endpoint || ''
  form.region = c.region || ''
  form.bucket = c.bucket || ''
  form.accessKey = c.access_key || ''
  form.secretKey = c.secret_key || ''
  form.pathStyle = !!c.path_style
}

function applyStats(s) {
  if (!s) return
  stats.hits = s.hits || 0
  stats.misses = s.misses || 0
  stats.hitRate = typeof s.hitRate === 'number' ? s.hitRate : 0
  stats.bytesServed = s.bytesServed || 0
  stats.entries = s.entries || 0
  stats.sizeBytes = s.sizeBytes || 0
  stats.enabled = !!s.enabled
}

function buildPayload() {
  const p = {
    enabled: !!form.enabled,
    backend: form.backend,
    dir: form.dir,
    max_size_gb: Number(form.maxSizeGB) || 0,
    blob_ttl: Number(form.blobTTL) || 0,
    manifest_ttl: Number(form.manifestTTL) || 0,
    tags_ttl: Number(form.tagsTTL) || 0
  }
  if (form.backend === 's3') {
    p.provider = form.provider || 'custom'
    p.endpoint = form.endpoint
    p.region = form.region
    p.bucket = form.bucket
    p.access_key = form.accessKey
    // 若未改动，secretKey 为脱敏哨兵 ********，后端会保留磁盘上的真实密钥。
    p.secret_key = form.secretKey
    p.path_style = !!form.pathStyle
  }
  return p
}

async function load() {
  refreshing.value = true
  statusNote.value = ''
  try {
    const data = await getCacheConfig()
    parseConfig(data.config)
    applyStats(data.stats)
  } catch (e) {
    statusNote.value = t('cache.loadFailed') + (e.response?.data?.error || e.message)
    ElMessage.error(t('cache.loadFailed') + (e.response?.data?.error || e.message))
  } finally {
    refreshing.value = false
  }
}

async function onRefresh() {
  await load()
  if (!statusNote.value) ElMessage.success(t('cache.refreshed'))
}

async function onSave() {
  if (form.enabled) {
    if (form.backend === 'disk' && !form.dir) {
      ElMessage.warning(t('cache.errDirRequired'))
      return
    }
    if (form.backend === 's3' && (!form.endpoint || !form.bucket || !form.accessKey || !form.secretKey)) {
      ElMessage.warning(t('cache.errS3Required'))
      return
    }
  }
  saving.value = true
  try {
    await saveCacheConfig(buildPayload())
    ElMessage.success(t('cache.saved'))
    await load()
  } catch (e) {
    ElMessage.error(t('cache.saveFailed') + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function onClear() {
  clearing.value = true
  try {
    await clearCache()
    ElMessage.success(t('cache.cleared'))
    await load()
  } catch (e) {
    ElMessage.error(t('cache.clearFailed') + (e.response?.data?.error || e.message))
  } finally {
    clearing.value = false
  }
}

function formatBytes(n) {
  const num = Number(n) || 0
  if (num < 1024) return num + ' B'
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let v = num / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[i]
}

function formatRate(r) {
  const v = Number(r) || 0
  return v.toFixed(1) + '%'
}

onMounted(load)
</script>

<style scoped>
.page { color: var(--fg); }
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 12px;
}
.page-head h2 { margin: 0 0 4px; color: var(--fg); font-size: 20px; }
.muted { color: var(--muted); margin: 0; font-size: 13px; }
.head-actions { display: flex; gap: 10px; align-items: center; }
.head-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 500;
}
.head-btn .el-icon { font-size: 14px; }
.head-btn--ghost {
  color: var(--fg-2);
  background: var(--bg-card-2);
  border-color: var(--border);
}
.head-btn--ghost:hover {
  color: var(--accent);
  background: var(--bg-card);
  border-color: var(--accent);
}
.head-btn--danger {
  color: #f56c6c;
  background: var(--bg-card-2);
  border-color: var(--border);
}
.head-btn--danger:hover {
  color: #fff;
  background: #f56c6c;
  border-color: #f56c6c;
}

.connect-note { margin-bottom: 16px; }

.block {
  background: var(--bg-card);
  border-color: var(--border);
  margin-bottom: 16px;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.block-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 20px;
  flex-shrink: 0;
}
.block-icon-stat { background: linear-gradient(135deg, #36cfc9, #13c2c2); }
.block-icon-cfg { background: linear-gradient(135deg, #4a8cff, #3D7CF4); }
.block-titles { flex: 1; min-width: 0; }
.block-title { font-size: 16px; font-weight: 600; color: var(--fg); }
.block-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }
.head-tag { margin-left: auto; }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--bg-card-2);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.stat-ic {
  width: 38px; height: 38px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 19px;
  color: #fff;
  flex-shrink: 0;
}
.stat-ic--green { background: linear-gradient(135deg, #52c41a, #389e0d); }
.stat-ic--blue { background: linear-gradient(135deg, #4a8cff, #3D7CF4); }
.stat-ic--orange { background: linear-gradient(135deg, #faad14, #d48806); }
.stat-ic--purple { background: linear-gradient(135deg, #9254de, #722ed1); }
.stat-ic--teal { background: linear-gradient(135deg, #36cfc9, #08979d); }
.stat-ic--slate { background: linear-gradient(135deg, #8c9bb5, #5b6b86); }
.stat-body { min-width: 0; }
.stat-val {
  font-size: 20px;
  font-weight: 700;
  color: var(--fg);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat-lbl { font-size: 12px; color: var(--muted); margin-top: 2px; }

.toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  background: var(--bg-card-2);
  border-radius: 12px;
  margin-bottom: 18px;
  position: relative;
  transition: border-color .18s ease, background .18s ease;
}
.toggle-row--on {
  background: rgba(82, 196, 26, 0.06);
  border-color: rgba(82, 196, 26, 0.32);
}
.toggle-row--on::before {
  content: '';
  position: absolute;
  left: 0; top: 10px; bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #52c41a, #389e0d);
}
.toggle-left { flex: 1; min-width: 0; padding-left: 8px; }
.toggle-left .toggle-label { margin: 0; }
.toggle-left .form-hint { margin-top: 4px; }
.toggle-ic { color: var(--accent); font-size: 15px; margin-right: 2px; }
.toggle-switch :deep(.el-switch__core) { border-color: var(--border-strong); }

.cfg-form { margin-top: 4px; }
.cfg-form .el-form-item :deep(.el-form-item__label) { font-weight: 500; color: var(--fg-2); padding-bottom: 4px; }
.form-grid { display: grid; gap: 16px; }
.form-grid.two { grid-template-columns: 1fr 1fr; }
.hint { color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.4; }
.block-actions { display: flex; justify-content: flex-end; margin-top: 18px; }

@media (max-width: 1100px) {
  .stat-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 700px) {
  .page-head { flex-direction: column; align-items: flex-start; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .form-grid.two { grid-template-columns: 1fr; }
}
</style>

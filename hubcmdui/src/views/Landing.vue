<template>
  <!-- 关闭态：完全空白，不展示任何内容（连顶栏语言切换也不保留） -->
  <div v-if="landingVisible === false" class="landing-closed-empty"></div>
  <!-- 开启态：完整落地页；loading 态(null)Vue 自动不渲染任何分支，避免内容闪烁 -->
  <div v-else-if="landingVisible === true" class="landing">
    <div class="topbar-float">
      <LangSwitch variant="nav" />
      <div class="theme-toggle-wrap">
        <button
          class="hd-pill theme-btn"
          type="button"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="themeOpen = !themeOpen"
        >
          <span class="theme-ic">
            <svg v-if="mode === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <svg v-else-if="mode === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </span>
          <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div v-if="themeOpen" class="theme-menu" @mousedown.prevent>
          <button class="theme-item" :class="{ active: mode === 'light' }" type="button" @click="pickTheme('light')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
            <span>{{ t('layout.themeLight') }}</span>
            <svg v-if="mode === 'light'" class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
          <button class="theme-item" :class="{ active: mode === 'dark' }" type="button" @click="pickTheme('dark')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            <span>{{ t('layout.themeDark') }}</span>
            <svg v-if="mode === 'dark'" class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
          <button class="theme-item" :class="{ active: mode === 'auto' }" type="button" @click="pickTheme('auto')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><path d="M8 21h8M12 17v4" /></svg>
            <span>{{ t('layout.themeAuto') }}</span>
            <svg v-if="mode === 'auto'" class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
        </div>
      </div>
      <div v-if="themeOpen" class="theme-backdrop" @click="themeOpen = false"></div>
    </div>
    <!-- ============== 顶部导航（Glassmorphism 胶囊菜单） ============== -->
    <header class="hd">
      <div class="hd-inner">
        <a href="/" class="hd-logo">
          <img
            :src="logoUrl"
            alt="PROXY"
            class="hd-logo-img"
            @error="logoUrl = defaultLogo"
          />
          <span class="hd-logo-text">PROXY</span>
        </a>
        <nav class="hd-nav">
          <a href="/" class="hd-pill active" :aria-label="t('landing.home')">
            <svg class="pill-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 11.5 12 4l9 7.5"/>
              <path d="M5 10v10h14V10"/>
            </svg>
            <span>{{ t('landing.home') }}</span>
          </a>
          <a
            v-for="m in menuItems"
            v-show="menuReady"
            :key="m.text || m.link"
            class="hd-pill"
            :class="{ 'hd-pill--default': isDefaultItem(m) }"
            :href="m.link"
            :target="m.newTab ? '_blank' : '_self'"
            rel="noopener noreferrer"
            :aria-label="m.text"
          >
            <!-- 图标：按 m.icon 选用 iconMap 中的 SVG；无匹配则兜底显示通用链接图标 -->
            <span class="pill-ic" v-html="getMenuIconSvg(m)" aria-hidden="true"></span>
            <span>{{ m.text }}</span>
          </a>
          <!-- 菜单数据加载前显示 skeleton 占位（与真实菜单同高 36px / 同 padding 范围），
               加载完成后 v-show=false 隐藏，避免菜单区从「无」到「有」的视觉跳动 -->
          <span v-if="!menuReady" class="hd-pill hd-skel" aria-hidden="true"></span>
          <span v-if="!menuReady" class="hd-pill hd-skel" aria-hidden="true"></span>
        </nav>
      </div>
    </header>

    <!-- ============== Hero（普通块级，滚动时正常随页面滚走，不跟随） ============== -->
    <section class="hero">
      <h1 class="hero-title">Docker {{ t('landing.heroTitle') }}</h1>
      <p class="hero-sub">
        {{ t('landing.heroSub') }}
      </p>
    </section>

    <!-- ============== Tab 容器（独立 sticky，固定在 header 下方；hero 滚走，tab 行保持） ============== -->
    <div class="tab-container">
      <div class="tab-row">
        <button
          v-for="tabBtn in tabs"
          :key="tabBtn.id"
          class="tab"
          :class="{ active: tab === tabBtn.id }"
          @click="tab = tabBtn.id"
        >
          <i :class="['fas', tabBtn.icon]"></i>
          <span>{{ tabBtn.label }}</span>
        </button>
      </div>
    </div>

    <!-- ============== Tab: 镜像加速 ============== -->
    <div v-show="tab === 'accelerate'" class="content-card">
      <!-- Hero 风格加速区：与「镜像搜索」同款视觉语言（Hero 卡 + 56px 大输入 + 渐变 CTA） -->
      <div class="accel-hero">
        <div class="accel-hero__head">
          <h2 class="accel-hero__title">
            <svg class="hero-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
            {{ t('landing.accelerate') }}
          </h2>
          <p class="accel-hero__sub">{{ t('landing.accelSub') }}</p>
        </div>
        <!-- 复用 .search-bar：与「镜像搜索」输入框完全一致的 56px / focus ring / 渐变 CTA -->
        <div class="search-bar">
          <div class="search-bar__lead" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>
            </svg>
          </div>
          <input
            v-model="imageInput"
            type="text"
            class="search-bar__input"
            :placeholder="t('landing.imageInputPlaceholder')"
            @keyup.enter="generateCommands"
          />
          <button class="search-bar__cta" @click="generateCommands">
            <i class="fas fa-bolt"></i> {{ t('landing.getAccelCmd') }}
          </button>
        </div>
        <div class="search-hint">
          <span v-if="registriesReady">{{ t('landing.supportedRegistries', { names: registryHintNames }) }}</span>
          <span v-else class="search-hint__skel" aria-hidden="true"></span>
          <span class="dot">·</span>
          <span v-if="registriesReady">{{ t('landing.inputExample', { example: registryExampleHint }) }}</span>
          <span v-else class="search-hint__skel search-hint__skel--short" aria-hidden="true"></span>
        </div>
      </div>

      <div v-if="accel" class="result-wrap">
        <h2 class="result-title"><i class="fas fa-terminal"></i> {{ t('landing.accelCmdTitle') }}</h2>
        <div v-if="accel.detected" class="detect-badge" :style="accel.badgeStyle">
          <i class="fas fa-check-circle"></i> {{ t('landing.detected') }}<strong>{{ accel.detectedName }}</strong>{{ t('landing.image') }}
        </div>
        <div v-for="(c, i) in accel.commands" :key="c.type" class="cmd-card" :class="`cmd-${c.type}`">
          <div class="cmd-side"></div>
          <div class="cmd-main">
            <div class="cmd-head">
              <div class="cmd-step">
                <div class="cmd-num">{{ i + 1 }}</div>
                <div class="cmd-meta">
                  <div class="cmd-title">{{ c.label }}</div>
                  <div v-if="c.hint" class="cmd-hint">{{ c.hint }}</div>
                </div>
              </div>
              <button class="copy-btn" @click="copyCmd(c.text)">
                <i class="fas fa-copy"></i> {{ t('common.copy') }}
              </button>
            </div>
            <div class="cmd-code">
              <span class="cmd-prompt">$</span>
              <code>{{ c.text }}</code>
            </div>
          </div>
        </div>

        <!-- 快捷执行：操作系统一键复制 -->
        <div class="quick-exec">
          <div class="quick-title">
            <i class="fas fa-bolt"></i>
            {{ t('landing.quickExecTitle') }}
          </div>
          <div class="quick-grid">
            <div
              v-for="q in quickCmds"
              :key="q.os"
              class="quick-item"
              @click="copyCmd(q.text)"
            >
              <i :class="['fab', q.icon]"></i>
              <span>{{ q.os }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-hint">
        <i class="fas fa-rocket"></i>
        <p>{{ t('landing.enterImageToStart', { cmd: t('landing.getAccelCmd') }) }}</p>
      </div>

      <!-- 特性卡（获取到加速命令后自动隐藏，回到空态时重新显示） -->
      <div class="features" v-if="!accel">
        <div class="feature-card">
          <i class="fas fa-tachometer-alt"></i>
          <h3>{{ t('landing.fastPull') }}</h3>
          <p>{{ t('landing.fastPullDesc') }}</p>
        </div>
        <div class="feature-card">
          <i class="fas fa-shield-alt"></i>
          <h3>{{ t('landing.stableReliable') }}</h3>
          <p>{{ t('landing.stableReliableDesc') }}</p>
        </div>
        <div class="feature-card">
          <i class="fas fa-magic"></i>
          <h3>{{ t('landing.easyToUse') }}</h3>
          <p>{{ t('landing.easyToUseDesc') }}</p>
        </div>
      </div>
    </div>

    <!-- ============== Tab: 镜像搜索 ============== -->
    <div v-show="tab === 'search'" class="content-card">
      <!-- Hero 风格搜索区：分段控件 + 大号输入框 + 渐变 CTA -->
      <div class="search-hero">
        <div class="search-hero__head">
          <h2 class="search-hero__title">
            <svg class="hero-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/>
              <path d="m20 20-3.5-3.5"/>
            </svg>
            {{ t('landing.crossPlatformSearch') }}
          </h2>
          <p class="search-hero__sub">{{ t('landing.searchSub') }}</p>
        </div>

        <!-- 分段控件：平台选择 -->
        <div class="seg" role="tablist" :aria-label="t('landing.selectRegistryPlatform')">
          <button
            class="seg-item seg-item--all"
            :class="{ active: searchScope === 'all' }"
            role="tab"
            :aria-selected="searchScope === 'all'"
            @click="changeScope('all')"
          >
            <svg class="seg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
            </svg>
            <span>{{ t('common.all') }}</span>
          </button>
          <button
            v-for="r in registries"
            :key="r.id"
            class="seg-item"
            :class="{ active: searchScope === r.id }"
            role="tab"
            :aria-selected="searchScope === r.id"
            :style="searchScope === r.id ? { '--seg-active-bg': r.color, '--seg-active-fg': '#fff' } : null"
            @click="changeScope(r.id)"
          >
            <i :class="r.icon || 'fas fa-cube'" aria-hidden="true"></i>
            <span>{{ registryAbbr(r) }}</span>
          </button>
        </div>

        <!-- 大号搜索输入框 + 渐变 CTA -->
        <div class="search-bar">
          <div class="search-bar__lead" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <path d="m20 20-3.5-3.5"/>
            </svg>
          </div>
          <input
            v-model="searchInput"
            type="text"
            class="search-bar__input"
            :placeholder="searchPlaceholder"
            @keyup.enter="searchImages()"
          />
          <button class="search-bar__cta" :disabled="searching" @click="searchImages()">
            <i v-if="!searching" class="fas fa-bolt"></i>
            <i v-else class="fas fa-spinner fa-spin"></i>
            <span>{{ searching ? t('landing.searching') : t('landing.searchImagesBtn') }}</span>
          </button>
        </div>

        <div class="search-hint">
          <span>{{ t('landing.keywordHint') }}</span>
          <span class="dot">·</span>
          <span>{{ t('landing.searchExample') }}</span>
        </div>
      </div>

      <!-- ============ 标签详情视图 ============ -->
      <div v-if="tagView" class="tag-view">
        <div class="tag-breadcrumb">
          <a href="javascript:void(0)" @click="closeTagView"><i class="fas fa-arrow-left"></i> {{ t('landing.backToResults') }}</a>
        </div>
        <div class="tag-header">
          <h2 class="tag-title">
            <span class="registry-badge" :style="{ background: currentReg?.color || '#666' }">
              <i :class="currentReg?.icon || 'fas fa-cube'"></i>
            </span>
            {{ tagView.imageName }}
          </h2>
          <p class="image-description">{{ tagView.description }}</p>
          <div class="image-meta">
            <span v-if="tagView.stars" class="meta-chip"><i class="fas fa-star"></i> {{ fmtCount(tagView.stars) }} {{ t('landing.stars') }}</span>
            <span v-if="tagView.pulls" class="meta-chip"><i class="fas fa-download"></i> {{ fmtCount(tagView.pulls) }} {{ t('landing.downloads') }}</span>
            <span class="meta-chip"><i class="fas fa-tags"></i> {{ fmtCount(tagView.count) }} {{ t('landing.tagsCount') }}</span>
          </div>
        </div>

        <div v-if="tagView.loading" class="loading-indicator">
          <i class="fas fa-spinner fa-spin"></i> {{ t('landing.loadingTags') }}
        </div>
        <div v-else-if="tagView.error" class="error-state" role="alert" aria-live="polite">
          <div class="error-icon-wrap">
            <i class="fas fa-exclamation-circle"></i>
          </div>
          <h3 class="error-title">{{ t('landing.loadTagsFailed') }}</h3>
          <p class="error-desc">{{ tagView.error }}</p>
          <p class="error-hint">{{ t('landing.errorHint') }}</p>
          <button class="retry-btn" @click="loadTagsPage(tagView.page)">
            <i class="fas fa-redo"></i> {{ t('landing.reload') }}
          </button>
        </div>
        <template v-else>
          <!-- 数据降级提示：回退到 GitHub release、或部分元数据读取失败时，
               必须让用户知道当前列表不是 registry 的一手数据 -->
          <div v-if="tagView.source === 'github-release'" class="tag-degraded-banner" role="status">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ t('landing.tagsDegradedFallback') }}</span>
          </div>
          <div v-else-if="tagView.metadataFailed" class="tag-degraded-banner is-partial" role="status">
            <i class="fas fa-exclamation-triangle"></i>
            <span>{{ t('landing.tagsDegradedPartial', { count: tagView.metadataFailed }) }}</span>
          </div>
          <div class="tag-actions">
            <div class="tag-search-container">
              <span class="tag-search-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7"/>
                  <path d="m20 20-3.5-3.5"/>
                </svg>
              </span>
              <input type="text" v-model="tagFilter" :placeholder="t('landing.searchTagPlaceholder')" />
              <button class="reset-search-btn" @click="tagFilter = ''"><i class="fas fa-times"></i> {{ t('common.reset') }}</button>
            </div>
          </div>
          <div class="tag-search-stats">
            <p>
              {{ t('landing.foundTagsPrefix') }}<strong>{{ fmtCount(tagView.count) }}</strong>{{ t('landing.tagsUnit') }}{{ t('landing.currentPagePrefix') }}<strong>{{ tagView.page }}</strong> / <strong>{{ tagView.totalPages }}</strong>{{ t('landing.pageUnit') }}<template v-if="tagFilter">{{ t('landing.matchPrefix') }}<strong>{{ filteredTags.length }}</strong>{{ t('landing.matchUnit') }}</template>
            </p>
          </div>
          <div class="tag-table-container">
            <table class="tag-table">
              <thead>
                <tr><th>TAG</th><th>OS/ARCH</th><th>{{ t('landing.thSize') }}</th><th>{{ t('landing.thUpdateTime') }}</th><th>{{ t('common.actions') }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(tag, i) in filteredTags" :key="i" :data-tag="tagNameOf(tag)">
                  <td><span class="tag-name-cell">{{ tagNameOf(tag) }}</span></td>
                  <td class="arch-cell">
                    <div v-if="tagOsArchList(tag).length" class="arch-list">
                      <span v-for="(a, ai) in shownArchList(tag)" :key="ai" class="arch-chip">{{ a }}</span>
                      <button
                        v-if="tagOsArchList(tag).length > 3"
                        type="button"
                        class="arch-toggle"
                        @click="toggleArch(tag)"
                        >{{ expandedArch[tagNameOf(tag)] ? t('landing.collapse') : '+' + (tagOsArchList(tag).length - 3) }}</button>
                    </div>
                    <span v-else class="arch-unknown">{{ t('landing.unknown') }}</span>
                  </td>
                  <td>{{ tagSizeOf(tag) }}</td>
                  <td>{{ tagDateOf(tag) }}</td>
                  <td>
                    <button class="tag-use-btn" @click="useTag(tag)"><i class="fas fa-rocket"></i> {{ t('common.use') }}</button>
                  </td>
                </tr>
                <tr v-if="!filteredTags.length"><td colspan="5" class="no-tags-message">{{ t('landing.noTagsThisPage') }}</td></tr>
              </tbody>
            </table>
          </div>

          <!-- 标签分页 -->
          <div v-if="tagView.totalPages > 1" class="pager">
            <button class="pager-btn" :disabled="tagView.page <= 1" @click="goTagPage(tagView.page - 1)">
              <i class="fas fa-chevron-left"></i> {{ t('landing.prevPage') }}
            </button>
            <span class="pager-info">{{ t('landing.pageInfo', { page: tagView.page, total: tagView.totalPages }) }}</span>
            <button class="pager-btn" :disabled="tagView.page >= tagView.totalPages" @click="goTagPage(tagView.page + 1)">
              {{ t('landing.nextPage') }} <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        </template>
      </div>

      <!-- ============ 搜索结果 ============ -->
      <template v-else>
        <div v-loading="searching" class="search-results" ref="resultsRef">
          <div v-if="searchResults.length" class="result-summary">
            {{ t('landing.foundAboutPrefix') }}<strong>{{ fmtCount(searchTotal) }}</strong>{{ t('landing.relatedImagesUnit') }}
          </div>
          <div v-if="searchResults.length" class="result-list">
            <div v-for="(r, i) in searchResults" :key="i" class="search-result-item">
              <div class="result-header">
                <div class="title-badge">
                  <span
                    class="registry-badge"
                    :style="{ background: (regInfo(r.registryId)?.color) || '#666' }"
                  >
                    <i :class="(regInfo(r.registryId)?.icon) || 'fas fa-cube'"></i>
                  </span>
                  <h3 class="result-name">{{ r.fullName || r.name }}</h3>
                  <span v-if="r.isOfficial" class="official-badge"><i class="fas fa-check-circle"></i> {{ t('landing.official') }}</span>
                </div>
                <div class="result-stats">
                  <span v-if="r.stars || r.star_count" class="stats">
                    <i class="fas fa-star"></i> {{ fmtCount(r.stars || r.star_count) }}
                  </span>
                  <span v-if="r.pulls || r.pull_count" class="stats">
                    <i class="fas fa-download"></i> {{ fmtCount(r.pulls || r.pull_count) }}
                  </span>
                </div>
              </div>
              <div class="result-description-box">
                <div class="result-description" v-html="renderDescription(r.description)"></div>
              </div>
              <!-- 镜像名（原版默认地址，参考老版呈现） -->
              <div class="result-pull-command">
                <code>{{ upstreamRefFor(r) }}</code>
                <button class="copy-small-btn" @click="copyCmd(upstreamRefFor(r))" :title="t('landing.copyImageNameTitle')"><i class="fas fa-copy"></i></button>
              </div>
              <div class="result-actions">
                <button class="action-btn primary" @click="useImage(r)">
                  <i class="fas fa-rocket"></i> {{ t('landing.useThisImage') }}
                </button>
                <button v-if="canViewTags(r)" class="action-btn secondary" @click="openTags(r)">
                  <i class="fas fa-tags"></i> {{ t('landing.viewTags') }}
                </button>
              </div>
            </div>
          </div>
          <div v-else-if="searchInput" class="empty">
            <i class="fas fa-search"></i>
            <p>{{ t('landing.noMatch', { kw: searchInput }) }}</p>
            <div v-if="showNoResultTip" class="no-result-tip">
              <i class="fas fa-lightbulb"></i>
              <div class="no-result-tip-body">
                <strong>{{ t('landing.noResultTipTitle') }}</strong>
                <p>{{ t('landing.noResultTip') }}</p>
              </div>
            </div>
          </div>
          <div v-else class="empty">
            <i class="fas fa-search"></i>
            <p>{{ t('landing.enterKeywordToSearch') }}</p>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="searchTotalPages > 1" class="pager">
          <button class="pager-btn" :disabled="searchPage <= 1" @click="goSearchPage(searchPage - 1)">
            <i class="fas fa-chevron-left"></i> {{ t('landing.prevPage') }}
          </button>
          <span class="pager-info">{{ t('landing.pageInfo', { page: searchPage, total: searchTotalPages }) }}</span>
          <button class="pager-btn" :disabled="searchPage >= searchTotalPages" @click="goSearchPage(searchPage + 1)">
            {{ t('landing.nextPage') }} <i class="fas fa-chevron-right"></i>
          </button>
        </div>

        <!-- 特性卡（搜索出结果后自动隐藏，清空搜索回到初始态时重新显示） -->
        <div class="features" v-if="!searchResults.length && !searchInput">
          <div class="feature-card">
            <i class="fas fa-search"></i>
            <h3>{{ t('landing.quickSearch') }}</h3>
            <p>{{ t('landing.quickSearchDesc') }}</p>
          </div>
          <div class="feature-card">
            <i class="fas fa-tag"></i>
            <h3>{{ t('landing.versionMgmt') }}</h3>
            <p>{{ t('landing.versionMgmtDesc') }}</p>
          </div>
          <div class="feature-card">
            <i class="fas fa-rocket"></i>
            <h3>{{ t('landing.oneClickDeploy') }}</h3>
            <p>{{ t('landing.oneClickDeployDesc') }}</p>
          </div>
        </div>
      </template>
    </div>

    <!-- ============== Tab: 使用教程 ============== -->
    <div v-show="tab === 'docs'" class="content-card">
      <div v-loading="docsLoading" class="docs-layout">
        <div v-if="docs.length" class="docs-grid">
          <aside class="docs-aside">
            <h3 class="docs-list-title">{{ t('landing.docList') }}</h3>
            <ul class="docs-list">
              <li
                v-for="d in docs"
                :key="d.id"
                class="docs-item"
                :class="{ active: currentDoc && currentDoc.id === d.id }"
                @click="loadDoc(d)"
              >
                <i class="fas fa-book"></i>
                <span>{{ d.title }}</span>
              </li>
            </ul>
          </aside>
          <article class="docs-content">
            <div v-if="currentDoc" class="docs-eyebrow">
              <i class="fas fa-book-open"></i> {{ t('landing.docs') }}
            </div>
            <h1 v-if="currentDoc" class="docs-h1">{{ currentDoc.title }}</h1>
            <div
              v-if="currentDoc"
              class="docs-body markdown-body"
              v-html="renderMd(currentDoc.content)"
            ></div>
            <div v-else class="empty">
              <i class="fas fa-book-open"></i>
              <p>{{ t('landing.selectDocHint') }}</p>
            </div>
          </article>
        </div>
        <div v-else class="empty">
          <i class="fas fa-book"></i>
          <p>{{ t('landing.noDocs') }}</p>
        </div>
      </div>
    </div>

    <!-- ============== 页脚 ============== -->
    <footer class="ft">
      <p>
        Copyright © {{ year }}
        <a :href="githubUrl" target="_blank" rel="noopener noreferrer">Docker-Proxy</a>
        All Rights Reserved.
        <a :href="githubUrl" target="_blank" rel="noopener noreferrer">GitHub</a>
      </p>
    </footer>

    <!-- ============== 返回顶部 ============== -->
    <transition name="bt-fade">
      <button
        v-show="showBackTop"
        class="back-top"
        @click="scrollToTop"
        :title="t('landing.backToTop')"
        :aria-label="t('landing.backToTop')"
      >
        <i class="fas fa-arrow-up"></i>
      </button>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import {
  getConfig,
  getEnabledRegistryConfigs,
  getMenuItems,
  searchAllRegistries,
  searchRegistry,
  getImageTags,
  getPublishedDocs,
  getPublicDoc,
  getSiteInfo,
  getLandingVisible
} from '../services'
import { getMenuIconSvg as getMenuIconSvgFromLib } from '../lib/menuIcons'
import LangSwitch from '../components/LangSwitch.vue'
import { useTheme } from '../composables/useTheme'
import { sanitizeHtml } from '../lib/safeHtml'

marked.setOptions({
  breaks: true,
  gfm: true
})

const router = useRouter()
const { t } = useI18n()

// ===== 公开页主题切换（复用全局单例 useTheme，与后台共享 mode 状态 + localStorage） =====
const { mode, setMode } = useTheme()
const themeOpen = ref(false)
const themeLabel = computed(() => {
  if (mode.value === 'light') return t('layout.themeLight')
  if (mode.value === 'dark') return t('layout.themeDark')
  return t('layout.themeAuto')
})
function pickTheme(m) {
  setMode(m)
  themeOpen.value = false
}

const year = new Date().getFullYear()
const defaultLogo = '/images/docker-proxy.svg'
const logoUrl = ref(defaultLogo)

const tabs = computed(() => [
  { id: 'accelerate', label: t('landing.accelerate'), icon: 'fa-rocket' },
  { id: 'search', label: t('landing.searchImages'), icon: 'fa-search' },
  { id: 'docs', label: t('landing.docs'), icon: 'fa-book' }
])

// tab 持久化：刷新页面后保留用户上一次的 tab 位置，避免「搜索/教程」页被强制回弹到「加速」页。
// 同步从 localStorage 读取，初次渲染就是目标值，无 tab 闪烁。
const TAB_STORAGE_KEY = 'hubcmdui_landing_tab'
const VALID_TAB_IDS = tabs.value.map(t => t.id)
function loadStoredTab() {
  try {
    const v = localStorage.getItem(TAB_STORAGE_KEY)
    if (v && VALID_TAB_IDS.includes(v)) return v
  } catch { /* localStorage 可能被禁用，忽略 */ }
  return 'accelerate'
}
const tab = ref(loadStoredTab())
// tab 切换时同步到 localStorage（带 try/catch 防止隐私模式抛错）
watch(tab, (v) => {
  try { localStorage.setItem(TAB_STORAGE_KEY, v) } catch { /* ignore */ }
})

// 前台导航菜单（后台「菜单管理」维护，公开接口读取）
const menuItems = ref([])
// 菜单数据加载完成标记：用于 skeleton 占位与真实菜单的无闪烁切换
const menuReady = ref(false)
async function loadMenu() {
  try {
    const items = await getMenuItems()
    menuItems.value = Array.isArray(items) ? items : []
  } catch {
    menuItems.value = []
  } finally {
    // 无论成功/失败都标记 ready：失败时菜单区空但仍显示 skeleton 占位，
    // 避免在数据未到达时菜单区"凭空消失"再"突然出现"的闪烁
    menuReady.value = true
  }
}

// 判断某个菜单项是否属于 GitHub 入口：用于渲染官方 GitHub SVG
// 依据：菜单文本等于 "GitHub" / 链接包含 "github.com" / 后台存储的 icon='github'（用户改文字后仍可识别）
function isGithubItem(m) {
  if (!m) return false
  const text = String(m.text || '').trim().toLowerCase()
  const link = String(m.link || '').toLowerCase()
  const icon = String(m.icon || '').trim().toLowerCase()
  return text === 'github' || link.includes('github.com') || icon === 'github'
}

// 判断某个菜单项是否属于内置默认项：用于给内置默认项加白底 pill 样式以与用户自建项区分
// 内置默认项 = GitHub 入口 + 介绍入口（数据库 createDefaultMenuItems 写入的初始数据）
// 识别依据（按优先级）：菜单文本 / 链接 / icon 三者任一命中即视为默认项；
// 这样既能在用户保留 icon 的情况下识别（DB 插入时已带 icon='github' / 'book-open'），
// 也能在用户改文本后仍通过 link 识别（默认 link 包含 github.com/dqzboy/docker-proxy 或 docker-proxy-desc.vercel.app）
function isDefaultItem(m) {
  if (!m) return false
  const text = String(m.text || '').trim()
  const link = String(m.link || '').toLowerCase()
  const icon = String(m.icon || '').trim().toLowerCase()
  // GitHub 默认入口
  if (text === 'GitHub' || link.includes('github.com/dqzboy/docker-proxy')) return true
  // 介绍默认入口（指向 docker-proxy-desc.vercel.app）
  if (text === '介绍' || link.includes('docker-proxy-desc.vercel.app')) return true
  // 兜底：icon 命中默认图标（用户改文本/链接后仍可识别）
  if (icon === 'github' || icon === 'book-open') return true
  return false
}

// 渲染菜单项的图标 SVG：优先用 m.icon，无匹配则按 link 识别 GitHub，再兜底用 link 图标
// 图标库与后台菜单管理共享 src/lib/menuIcons.js
function getMenuIconSvg(m) {
  if (!m) return getMenuIconSvgFromLib('')
  const key = String(m.icon || '').trim()
  if (key) return getMenuIconSvgFromLib(key)
  if (isGithubItem(m)) return getMenuIconSvgFromLib('github')
  return getMenuIconSvgFromLib('link')
}

// ===== 镜像加速 =====
const imageInput = ref('')
const accel = ref(null)
const registries = ref([])
// Registry 平台列表加载完成标记：用于「支持 XXX / 输入示例：YYY」提示的 skeleton 占位
const registriesReady = ref(false)

// 操作系统一键复制：根据当前 accel 渲染三个 OS 块的命令
const quickCmds = computed(() => {
  if (!accel.value || !accel.value.commands) return []
  const cmds = accel.value.commands
  const proxy = (cmds[0] && cmds[0].text) || ''
  const rename = (cmds[2] && cmds[2].text) || ''
  const rmi = (cmds[3] && cmds[3].text) || ''
  return [
    {
      os: 'Linux',
      icon: 'fa-linux',
      text: [proxy, rename, rmi].filter(Boolean).join('\n')
    },
    {
      os: 'Windows',
      icon: 'fa-windows',
      text: [proxy, rename, rmi].filter(Boolean).join('\r\n')
    },
    {
      os: 'Mac',
      icon: 'fa-apple',
      text: [proxy, rename, rmi].filter(Boolean).join('\n')
    }
  ]
})

function detectRegistry(image) {
  const m = (image || '').trim()
  // 常见 Registry 平台检测
  // 注：Docker Hub 走代理时 prefix = registry-1.docker.io（实际 upstream），
  // 这样 `docker pull ${prefix}/${path}` 才会命中用户的 daemon.json 镜像配置
  const map = [
    { name: 'Docker Hub', pattern: /^([^/]+\.)?(docker\.io|library)\//i, prefix: 'registry-1.docker.io', color: '#2496ed' },
    { name: 'GitHub Container Registry', pattern: /^ghcr\.io\//i, prefix: 'ghcr.io', color: '#333' },
    { name: 'Google Container Registry', pattern: /^gcr\.io\//i, prefix: 'gcr.io', color: '#4285F4' },
    { name: 'Amazon ECR', pattern: /\.dkr\.ecr\..*\.amazonaws\.com\//i, prefix: 'ecr', color: '#FF6A00' },
    { name: 'Azure Container Registry', pattern: /azurecr\.io\//i, prefix: 'azure', color: '#0078D4' },
    { name: 'Quay.io', pattern: /^quay\.io\//i, prefix: 'quay.io', color: '#40B4E5' },
    { name: 'Kubernetes', pattern: /^(registry\.k8s\.io|k8s\.gcr\.io)\//i, prefix: 'registry.k8s.io', color: '#326CE5' },
    { name: 'Red Hat Registry', pattern: /^(registry\.redhat\.io|registry\.access\.redhat\.com)\//i, prefix: 'redhat', color: '#EE0000' }
  ]
  for (const r of map) {
    if (r.pattern.test(m)) {
      return {
        name: r.name,
        prefix: r.prefix,
        color: r.color,
        badge: '#fff',
        path: m.replace(r.pattern, '')
      }
    }
  }
  // 默认 Docker Hub：使用 registry-1.docker.io 作为代理拉取前缀
  return {
    name: 'Docker Hub',
    prefix: 'registry-1.docker.io',
    color: '#2496ed',
    badge: '#fff',
    path: m.includes('/') ? m : `library/${m}`
  }
}

// 根据镜像名推测它属于哪个后台 Registry（返回 registryId + 仓库路径）
function detectImage(image) {
  const m = (image || '').trim()
  const rules = [
    { id: 'docker-hub', re: /^([^/]+\.)?(docker\.io|library)\//i },
    { id: 'ghcr', re: /^ghcr\.io\//i },
    { id: 'gcr', re: /^gcr\.io\//i },
    { id: 'quay', re: /^quay\.io\//i },
    { id: 'k8s', re: /^(registry\.k8s\.io|k8s\.gcr\.io)\//i },
    { id: 'mcr', re: /^mcr\.microsoft\.com\//i },
    { id: 'elastic', re: /^docker\.elastic\.co\//i },
    { id: 'nvcr', re: /^nvcr\.io\//i }
  ]
  for (const r of rules) {
    if (r.re.test(m)) {
      return { registryId: r.id, path: m.replace(r.re, '') }
    }
  }
  // 默认 Docker Hub（官方镜像补 library/ 前缀）
  return { registryId: 'docker-hub', path: m.includes('/') ? m : `library/${m}` }
}

// 去掉代理地址里的协议头与末尾斜杠，得到可直接拼到 docker pull 的主机名
function normalizeProxyHost(url) {
  return (url || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

// Docker Hub 官方镜像（无命名空间的顶级镜像）必须带 library/ 前缀，
// 否则上游 registry-1.docker.io 找不到该仓库（nginx ≠ library/nginx）。
function ensureLibrary(path) {
  if (!path) return path
  // 已含命名空间（包括已是 library/xxx）则不重复添加，保证幂等
  return path.includes('/') ? path : `library/${path}`
}

// 生成「代理拉取镜像全名」：优先用后台配置的代理地址(proxyUrl)，
// 未配置时退回该 Registry 的上游前缀(prefix)，保证命令不失效。
function resolveProxyPull(registryId, imagePath) {
  const reg = registries.value.find(r => r.id === registryId)
  // Docker Hub 官方镜像补 library/ 前缀（含 tag 的整体路径一并处理）
  const finalPath = registryId === 'docker-hub' ? ensureLibrary(imagePath) : imagePath
  if (reg) {
    const host = normalizeProxyHost(reg.proxyUrl)
    if (host) {
      return { image: `${host}/${finalPath}`, name: reg.name, color: reg.color, badge: '#fff' }
    }
    const prefix = normalizeProxyHost(reg.prefix)
    return {
      image: prefix ? `${prefix}/${finalPath}` : finalPath,
      name: reg.name, color: reg.color, badge: '#fff'
    }
  }
  // 未在后台配置中的 registry（ECR / Azure / RedHat 等），退回上游默认前缀
  const up = detectRegistry(finalPath.includes('/') ? finalPath : `library/${finalPath}`)
  return { image: `${up.prefix}/${up.path}`, name: up.name, color: up.color, badge: '#fff' }
}

function resolveUpstreamPull(registryId, imagePath, pullCommand) {
  if (pullCommand) return pullCommand
  const reg = registries.value.find(r => r.id === registryId)
  const defaultHosts = {
    ghcr: 'ghcr.io', quay: 'quay.io', gcr: 'gcr.io', k8s: 'registry.k8s.io',
    mcr: 'mcr.microsoft.com', elastic: 'docker.elastic.co', nvcr: 'nvcr.io'
  }
  if (registryId === 'docker-hub') return imagePath
  const prefix = defaultHosts[registryId] || normalizeProxyHost(reg?.prefix)
  if (prefix && imagePath.startsWith(`${prefix}/`)) return imagePath
  return prefix ? `${prefix}/${imagePath}` : imagePath
}

function upstreamRefFor(r) {
  const id = r.registryId || searchScope.value
  return resolveUpstreamPull(id, r.fullName || r.name, r.pullCommand)
}

function getProxyDomain() {
  // 优先取配置里的 proxyDomain
  return cfg.value?.proxyDomain || window.location.host || 'your-proxy-domain.com'
}

function setAccel(registryId, imagePath, originalImage) {
  const rp = resolveProxyPull(registryId, imagePath)
  const proxyImage = rp.image
  accel.value = {
    detected: true,
    detectedName: rp.name,
    badgeStyle: { background: rp.color, color: rp.badge },
    commands: [
      { type: 'proxy', label: t('landing.proxyPull'), text: `docker pull ${proxyImage}`, hint: '' },
      { type: 'original', label: t('landing.originalPull'), text: `docker pull ${originalImage}`, hint: t('landing.originalPullHint') },
      { type: 'rename', label: t('landing.renameImage'), text: `docker tag ${proxyImage} ${originalImage}`, hint: t('landing.renameHint') },
      { type: 'rmi', label: t('landing.removeProxy'), text: `docker rmi ${proxyImage}`, hint: t('landing.rmiHint') }
    ]
  }
}

function generateCommands() {
  const img = (imageInput.value || '').trim()
  if (!img) {
    ElMessage.warning(t('landing.pleaseEnterImage'))
    return
  }
  const d = detectImage(img)
  setAccel(d.registryId, d.path, img)
}

function copyCmd(text) {
  if (text == null || text === '') {
    ElMessage.warning(t('landing.nothingToCopy'))
    return
  }
  const str = String(text)
  // 优先用现代 Clipboard API（仅在 HTTPS / localhost 等安全上下文可用）
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(str)
      .then(() => ElMessage.success(t('landing.copiedToClipboard')))
      .catch(() => fallbackCopy(str))
    return
  }
  // HTTP 等非安全上下文：用隐藏 textarea + execCommand('copy') 兜底
  fallbackCopy(str)
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // 离屏放置，避免页面跳动
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.padding = '0'
    ta.style.border = 'none'
    ta.style.outline = 'none'
    ta.style.boxShadow = 'none'
    ta.style.background = 'transparent'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    // 备份并恢复用户原有选区
    const sel = document.getSelection()
    const prevRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    ta.focus({ preventScroll: true })
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (prevRange && sel) {
      sel.removeAllRanges()
      sel.addRange(prevRange)
    }
    if (ok) ElMessage.success(t('landing.copiedToClipboard'))
    else ElMessage.error(t('landing.copyFailedManual'))
  } catch (e) {
    ElMessage.error(t('landing.copyFailedReason', { reason: e?.message || e }))
  }
}

// ===== 镜像搜索 =====
const searchInput = ref('')
const searchScope = ref('all')
const searching = ref(false)
const searchResults = ref([])
const searchPage = ref(1)
// 搜索结果每页大小（聚合 / 单 Registry 统一为 20）
const SEARCH_PAGE_SIZE = 20
const searchTotalPages = ref(0)
// 搜索命中的镜像总数（用于结果统计展示）
const searchTotal = ref(0)
// 标签详情视图：null 表示不展示，否则为当前查看的镜像标签数据
const tagView = ref(null)
const tagFilter = ref('')
// 标签列表分页：每页固定 50 条（数量大时全展开很慢）
const TAG_PAGE_SIZE = 20

// 搜索结果容器引用（翻页/切换平台后平滑滚动到结果顶部）
const resultsRef = ref(null)

// 返回顶部按钮：页面滚动超过阈值后显示
const showBackTop = ref(false)
function onScroll() { showBackTop.value = window.scrollY > 400 }
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }

function fmtCount(n) {
  if (!n) return '0'
  if (n > 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n > 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}

// 渲染镜像描述：将 Markdown 内联语法（链接、加粗、代码）转成 HTML，链接默认新标签打开
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function renderDescription(text) {
  const raw = String(text || '').trim()
  if (!raw) return '<span class="desc-empty">' + t('landing.noDescription') + '</span>'
  try {
    // Docker Hub 仓库描述来自第三方，必须在写入 v-html 之前先做黑名单
    // 清洗：阻断 <script>/on*/javascript: 等 XSS 通道。
    const html = marked.parseInline(raw, { breaks: false })
    return sanitizeHtml(html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" '))
  } catch (e) {
    return escapeHtml(raw)
  }
}

// 补全镜像全名：优先用 fullName，否则按 namespace/name 拼接（docker-hub 官方镜像显示 library/xxx）
function withFullName(it) {
  const fn = it.fullName ||
    (it.namespace && !String(it.name || '').includes('/') ? `${it.namespace}/${it.name}` : it.name)
  return { ...it, fullName: fn }
}

const currentReg = computed(() => {
  if (searchScope.value === 'all') return null
  return registries.value.find(r => r.id === searchScope.value) || null
})

// 根据 registryId 取注册表信息（用于结果卡片徽标配色）
function regInfo(id) {
  return registries.value.find(r => r.id === id) || null
}

const searchPlaceholder = computed(() => {
  if (searchScope.value === 'all') return t('landing.searchPlaceholderAll')
  return t('landing.searchPlaceholderScope', { reg: registryAbbr(currentReg.value) || '' })
})

const EXACT_MATCH_REGISTRIES = ['ghcr', 'gcr', 'k8s', 'mcr', 'elastic', 'nvcr']

const showNoResultTip = computed(() => {
  if (searching.value || searchResults.value.length) return false
  if (!(searchInput.value || '').trim()) return false
  if (searchScope.value === 'all') return true
  return EXACT_MATCH_REGISTRIES.includes(searchScope.value)
})

async function searchImages(page = 1) {
  const kw = (searchInput.value || '').trim()
  if (!kw) {
    ElMessage.warning(t('landing.pleaseEnterKeyword'))
    return
  }
  // 切换关键词时回到第一页
  if (page === 1) {
    searchPage.value = 1
    tagView.value = null
  }
  searchPage.value = page
  searching.value = true
  try {
    if (searchScope.value === 'all') {
      // 聚合搜索：响应结构 { registries: [{ registry, registryName, count, results: [...] }] }
      const resp = await searchAllRegistries(kw, page, SEARCH_PAGE_SIZE)
      const list = []
      if (resp && typeof resp === 'object') {
        if (Array.isArray(resp.registries)) {
          for (const r of resp.registries) {
            const regName = r.registryName || r.registry
            if (Array.isArray(r.results)) {
              for (const it of r.results) {
                list.push({ ...withFullName(it), registry: regName, registryId: r.registry })
              }
            }
          }
        }
        // 兼容历史格式 { dockerHub: [...], ghcr: [...] }
        if (!list.length) {
          for (const reg of registries.value) {
            const arr = resp[reg.id] || resp[`${reg.id}Results`] || []
            if (Array.isArray(arr)) {
              for (const it of arr) list.push({ ...it, registry: reg.name })
            }
          }
        }
        if (!list.length && Array.isArray(resp)) list.push(...resp)
        if (!list.length && resp.results) list.push(...resp.results)
      }
      // 聚合搜索：跨平台把官方镜像整体排到最前面（非官方保持原相对顺序）
      list.sort((a, b) => (b.isOfficial ? 1 : 0) - (a.isOfficial ? 1 : 0));
      searchResults.value = list
      // 聚合搜索：以各 Registry 中最大的 count 作为总页数基准。
      // 翻页节奏：每翻一页 = 每个启用 Registry 自己往后翻 1 页（每页 perRegistryLimit 条）；
      // 用 max(count) / perRegistryLimit 算出「最深 Registry 还能翻多少页」，保证能翻到结果最多的平台末尾。
      const perLimit = resp?.perRegistryLimit || SEARCH_PAGE_SIZE
      const maxCount = (resp?.registries || []).reduce((m, r) => Math.max(m, r.count || 0), 0)
      searchTotal.value = maxCount
      searchTotalPages.value = Math.ceil(maxCount / perLimit)
    } else {
      // 单 Registry 搜索：响应结构 { registry, registryName, count, results: [...] }
      const resp = await searchRegistry(searchScope.value, kw, page, SEARCH_PAGE_SIZE)
      const regName = currentReg.value?.name || resp?.registryName || resp?.registry || ''
      let list = []
      if (Array.isArray(resp?.results)) list = resp.results
      else if (Array.isArray(resp)) list = resp
      else if (resp?.items && Array.isArray(resp.items)) list = resp.items
      searchResults.value = list.map(it => ({ ...withFullName(it), registry: regName, registryId: searchScope.value }))
      const total = resp?.count || list.length
      searchTotal.value = total
      searchTotalPages.value = Math.ceil(total / SEARCH_PAGE_SIZE)
    }
  } catch (e) {
    const msg = e?.response?.data?.error || e.message
    ElMessage.error(t('landing.searchFailedReason', { reason: msg }))
  } finally {
    searching.value = false
  }
}

// 切换 Registry 平台（或「全部」）：若有搜索关键词，则重新搜索该平台下的镜像；
// 而不是沿用上一平台的搜索结果、仅把地址改成新平台。
async function changeScope(newScope) {
  if (newScope === searchScope.value) return
  searchScope.value = newScope
  if ((searchInput.value || '').trim()) {
    await searchImages(1)
    await nextTick()
    scrollResultsTop()
  } else {
    // 尚未搜索：仅清空旧结果，显示引导态
    searchResults.value = []
    searchTotal.value = 0
    searchTotalPages.value = 0
    searchPage.value = 1
  }
}

// 监听搜索关键词：清空输入时立即清空上一次的搜索结果与分页状态，
// 避免「输入框已空但还显示老结果」的不一致体验。
watch(searchInput, (val) => {
  if ((val || '').trim() === '') {
    searchResults.value = []
    searchTotal.value = 0
    searchTotalPages.value = 0
    searchPage.value = 1
    // 若正在查看某镜像的标签详情，回到搜索结果视图
    tagView.value = null
  }
})

// 监听镜像加速输入框：清空输入时立即隐藏上一次生成的加速命令，
// 避免「输入框已空但还显示老命令」的不一致体验。
watch(imageInput, (val) => {
  if ((val || '').trim() === '') {
    accel.value = null
  }
})

// 翻页/切换平台后，平滑滚动到搜索结果顶部（避开顶部 sticky 导航，避免手动往上翻）
function scrollResultsTop() {
  const el = resultsRef.value
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - 90
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
}

async function goSearchPage(p) {
  if (p < 1 || p > searchTotalPages.value || p === searchPage.value) return
  await searchImages(p)
  await nextTick()
  scrollResultsTop()
}

// 所有已支持标签拉取的 Registry 都展示「查看标签」按钮
// （docker-hub / quay 走专用接口；ghcr/gcr/k8s/mcr/elastic/nvcr 走统一的 OCI tags 接口，含 Bearer Token 挑战）
function canViewTags(r) {
  const id = r.registryId || searchScope.value
  const ociRegistries = ['ghcr', 'gcr', 'k8s', 'mcr', 'elastic', 'nvcr']
  if (ociRegistries.includes(id)) return true
  return r.tagsAvailable !== false && ['docker-hub', 'quay'].includes(id)
}

// 使用此镜像：跳到镜像加速页，直接按后台代理地址生成加速命令（不再回环解析）
function useImage(r) {
  const id = r.registryId || currentReg.value?.id || 'docker-hub'
  const full = r.fullName || r.name
  const originalImage = resolveUpstreamPull(id, full, r.pullCommand)
  imageInput.value = originalImage
  tab.value = 'accelerate'
  setAccel(id, full, originalImage)
  ElMessage.success(t('landing.selectedImage', { name: full }))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 打开标签详情视图
async function openTags(r) {
  const id = r.registryId || searchScope.value
  const name = r.fullName || r.name
  const rp = resolveProxyPull(id, name)
  const pullPrefix = rp.image
  tagView.value = {
    imageName: name,
    registryId: id,
    sourceRepository: r.sourceRepository || '',
    description: r.description || t('landing.noDescription'),
    stars: r.stars || r.star_count || 0,
    pulls: r.pulls || r.pull_count || 0,
    prefix: pullPrefix,
    tags: [],
    count: 0,
    page: 1,
    pageSize: TAG_PAGE_SIZE,
    totalPages: 0,
    loading: true,
    error: ''
  }
  tagFilter.value = ''
  await loadTagsPage(1)
}

// 加载指定页的标签
async function loadTagsPage(p) {
  if (!tagView.value) return
  tagView.value = { ...tagView.value, page: p, loading: true, error: '' }
  const id = tagView.value.registryId
    const name = tagView.value.imageName
    const sourceRepository = tagView.value.sourceRepository || ''
  try {
    const data = await getImageTags(id, name, p, TAG_PAGE_SIZE, sourceRepository)
    const tags = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : [])
    const total = data?.count || tags.length
    tagView.value = {
      ...tagView.value,
      tags,
      count: total,
      totalPages: Math.max(1, Math.ceil(total / TAG_PAGE_SIZE)),
      // 后端可能在 registry 不可达时回退到 GitHub release，或本页部分标签
      // 元数据读取失败。这两个字段驱动页面顶部的「降级提示」banner，
      // 不传的话用户会误以为看到的是 registry 的一手数据。
      source: data?.source || 'registry',
      metadataFailed: data?.metadataFailed || 0,
      loading: false
    }
  } catch (e) {
    tagView.value = {
      ...tagView.value,
      loading: false,
      error: e?.response?.data?.error || e.message || t('landing.loadTagsErrorFallback')
    }
  }
}

// 标签翻页
async function goTagPage(p) {
  if (!tagView.value) return
  if (p < 1 || p > tagView.value.totalPages || p === tagView.value.page) return
  await loadTagsPage(p)
  // 滚到标签表格顶部（避开顶部 sticky 导航）
  await nextTick()
  const el = document.querySelector('.tag-table-container')
  if (el) {
    const y = el.getBoundingClientRect().top + window.scrollY - 90
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }
}

function closeTagView() {
  tagView.value = null
}

// 过滤标签（前端按名称模糊匹配）
const filteredTags = computed(() => {
  if (!tagView.value) return []
  const kw = (tagFilter.value || '').toLowerCase().trim()
  const tags = tagView.value.tags || []
  if (!kw) return tags
  return tags.filter(t => {
    const name = typeof t === 'string' ? t : (t.name || '')
    return name.toLowerCase().includes(kw)
  })
})

function tagNameOf(t) {
  return typeof t === 'string' ? t : (t.name || t)
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}
function tagSizeOf(t) {
  if (typeof t === 'object' && Number.isFinite(t.size)) {
    return formatBytes(t.size)
  }
  return '-'
}
function tagDateOf(t) {
  if (typeof t === 'object' && t.lastUpdated) {
    const d = new Date(t.lastUpdated)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('zh-CN')
  }
  return '-'
}
function tagOsArchList(t) {
  if (typeof t === 'object' && Array.isArray(t.images) && t.images.length) {
    const seen = new Set()
    const list = []
    for (const img of t.images) {
      // 跳过 Docker Hub 的 attestation / 签名清单（os/architecture 为 unknown）
      const osRaw = (img.os || '').toLowerCase()
      const archRaw = (img.architecture || '').toLowerCase()
      if (!osRaw || !archRaw || osRaw === 'unknown' || archRaw === 'unknown') continue
      const variant = img.variant ? String(img.variant).toLowerCase() : ''
      const label = variant ? `${osRaw}/${archRaw}/${variant}` : `${osRaw}/${archRaw}`
      if (!seen.has(label)) {
        seen.add(label)
        list.push(label)
      }
    }
    return list
  }
  return []
}

// 每个 tag 的 OS/ARCH 展开状态（按 tag 名记录），默认折叠多余项
const expandedArch = reactive({})

// 默认显示前 3 个，展开后显示全部
function shownArchList(t) {
  const all = tagOsArchList(t)
  if (expandedArch[tagNameOf(t)]) return all
  return all.slice(0, 3)
}

function toggleArch(t) {
  const key = tagNameOf(t)
  expandedArch[key] = !expandedArch[key]
}

// 使用指定标签：跳到加速页，按后台代理地址生成 镜像:tag 的加速命令
function useTag(tag) {
  const name = tagNameOf(tag)
  const full = `${tagView.value.imageName}:${name}`
  const id = tagView.value.registryId
  const originalImage = resolveUpstreamPull(id, full)
  imageInput.value = originalImage
  tab.value = 'accelerate'
  setAccel(id, full, originalImage)
  ElMessage.success(t('landing.selectedImage', { name: full }))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ===== 使用教程 =====
const docs = ref([])
const currentDoc = ref(null)
const docsLoading = ref(false)

async function loadDocs() {
  docsLoading.value = true
  try {
    docs.value = await getPublishedDocs()
    if (docs.value.length && !currentDoc.value) {
      loadDoc(docs.value[0])
    }
  } catch (e) {
    ElMessage.error(t('landing.docLoadFailedReason', { reason: e?.response?.data?.error || e.message }))
  } finally {
    docsLoading.value = false
  }
}

async function loadDoc(d) {
  const id = d.id
  try {
    currentDoc.value = await getPublicDoc(id)
  } catch (e) {
    ElMessage.error(t('landing.docReadFailedReason', { reason: e?.response?.data?.error || e.message }))
  }
}

function renderMd(md) {
  if (!md) return ''
  try {
    // marked 不会自己 sanitize。文档内容来源是后端管理员，但会被
    // 拥有合法 session 的用户编辑，且历史上未见 XSS 防护代码，因此
    // 输出后再过一次 sanitizeHtml 把 <script>/on*/javascript: 一并清洗。
    return sanitizeHtml(marked.parse(md))
  } catch {
    return md
  }
}

async function loadRegistries() {
  try {
    // 拉取后台「Registry 平台配置」中已启用的列表，前台 chip 只展示启用的
    const items = await getEnabledRegistryConfigs()
    registries.value = (Array.isArray(items) ? items : [])
      .filter(r => r && r.registryId)
      .map(r => ({
        id: r.registryId,
        name: r.name || r.registryId,
        icon: r.icon || 'fas fa-cube',
        color: r.color || '#5a6a80',
        prefix: r.prefix || '',
        // 后台「代理地址」：用户配置的代理服务地址（如 hub.example.com），优先用于生成加速命令
        proxyUrl: (r.proxyUrl || '').trim()
      }))
    // 当前 scope 失效则回退到 all
    if (searchScope.value !== 'all' && !registries.value.some(r => r.id === searchScope.value)) {
      searchScope.value = 'all'
    }
  } catch {
    // 兜底：拉不到时给一个最简列表，保证 UI 仍可交互
    registries.value = [{ id: 'docker-hub', name: 'Docker Hub', icon: 'fab fa-docker', color: '#2496ED' }]
  } finally {
    // 标记 Registry 列表就绪：让「支持 XXX」提示从 skeleton 切换到真实内容，避免闪烁
    registriesReady.value = true
  }
}

// Registry 显示缩写：优先用稳定的 registry_id 命中标准缩写，
// 命中不到再用 name 兜底（兼容用户改过 name 的情况），都没有则回退原 name。
// 缩写遵循业界通用写法（GHCR/GCR/MCR/NVCR 等），Docker Hub / Quay / K8s / Elastic 保留原名。
const REGISTRY_ABBR = {
  'docker-hub': 'Docker Hub',
  'ghcr': 'GHCR',
  'gcr': 'GCR',
  'k8s': 'K8s',
  'mcr': 'MCR',
  'nvcr': 'NVCR',
  'quay': 'Quay',
  'elastic': 'Elastic'
}
const REGISTRY_ABBR_BY_NAME = {
  'docker hub': 'Docker Hub',
  'github container registry': 'GHCR',
  'google container registry': 'GCR',
  'kubernetes registry': 'K8s',
  'microsoft container registry': 'MCR',
  'nvidia container registry': 'NVCR',
  'quay.io': 'Quay',
  'quay': 'Quay',
  'elastic container registry': 'Elastic'
}
function registryAbbr(r) {
  if (!r) return ''
  const id = String(r.id || r.registryId || '').toLowerCase()
  if (REGISTRY_ABBR[id]) return REGISTRY_ABBR[id]
  const nm = String(r.name || '').trim().toLowerCase()
  if (REGISTRY_ABBR_BY_NAME[nm]) return REGISTRY_ABBR_BY_NAME[nm]
  return r.name || ''
}

// 提示文案：根据后台启用的 Registry 动态生成，避免写死平台名
const registryHintNames = computed(() => {
  const names = registries.value.map(r => registryAbbr(r)).filter(Boolean)
  if (!names.length) return 'Docker Hub'
  if (names.length <= 6) return names.join(' / ')
  return names.slice(0, 6).join(' / ') + t('landing.registryEtc', { n: names.length })
})

const registryExampleHint = computed(() => {
  const exs = registries.value
    .slice(0, 3)
    .map(r => (r.prefix ? `${r.prefix}/owner/repo` : 'nginx'))
  if (!exs.length) return 'nginx'
  return exs.join('、')
})

const cfg = ref(null)
const githubUrl = ref('https://github.com/dqzboy/Docker-Proxy')
async function loadCfg() {
  try {
    cfg.value = await getConfig()
    if (cfg.value?.logo) logoUrl.value = cfg.value.logo
  } catch {
    /* ignore */
  }
}
// 页脚 GitHub 地址：来自数据库锁定配置（加密存储、不可更改），读取失败回退默认值
async function loadSite() {
  try {
    const site = await getSiteInfo()
    if (site && site.githubUrl) githubUrl.value = site.githubUrl
  } catch {
    /* ignore */
  }
}

// 前台落地页（/）展示开关：
//  - 初始值为 null（未加载），template 用三态 v-if 控制渲染：null=不渲染任何分支（避免内容闪烁）、
//    true=完整落地页、false=完全空白（不展示任何内容，连语言切换也不保留）。
//  - API 请求在 setup 顶层立即发起（不等 onMounted），最大化压缩可见窗口；
//    失败按"开启"处理（fail-open），与后端默认保持一致。
const landingVisible = ref(null)
;(async () => {
  try {
    const r = await getLandingVisible()
    landingVisible.value = !!(r && r.visible)
  } catch {
    landingVisible.value = true
  }
})()

function goAdmin() {
  router.push('/admin/login')
}

onMounted(() => {
  loadCfg()
  loadSite()
  loadRegistries()
  loadMenu()
  loadDocs()
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.landing {
  min-height: 100vh;
  background: #f7f9fc;
  color: #2a3749;
  font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  /* 改用 block 布局：彻底消除 flex item 与 position:sticky 的兼容性问题。
     顶部导航 .hd 用负 margin 出血；.hero / .tab-container / .content-card
     各自 width:100% + max-width:1200px + margin:0 auto 居中。 */
  padding: 0 30px 40px;
}

/* ============== 语言切换器（固定右上角，整页可见） ============== */
.topbar-float {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ===== 公开页主题切换（与 .hd-pill 同款视觉） ===== */
.theme-toggle-wrap {
  position: relative;
  z-index: 1002; /* 高于下方透明遮罩，保证按钮与菜单始终可点击 */
}
.hd-pill.theme-btn {
  gap: 6px;
  cursor: pointer;
  padding: 0 12px;
}
.theme-ic {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.theme-ic svg { width: 100%; height: 100%; display: block; }
.theme-btn .caret {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  opacity: 0.85;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.theme-btn .caret svg { width: 100%; height: 100%; display: block; }

.theme-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 168px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 10px 34px rgba(15, 23, 42, 0.14);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1001;
}
.theme-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--fg-2);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}
.theme-item svg { width: 16px; height: 16px; flex-shrink: 0; }
.theme-item:hover { background: var(--bg-hover); }
.theme-item.active {
  color: var(--accent);
  font-weight: 600;
  background: var(--accent-soft, rgba(61, 124, 244, 0.08));
}
.theme-item .check { margin-left: auto; width: 16px; height: 16px; }

.theme-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

/* ============== 顶部导航（Glassmorphism 胶囊菜单） ============== */
.hd {
  /* 让顶部导航"出血"到视口左右边缘：父 .landing 有 padding: 0 30px，
     用负 margin 抵消父级 padding。.landing 改为 block 后 .hd 自身就是
     普通块级元素，不再需要 align-self: stretch。
     内部 .hd-inner 仍是 max-width:1200px 居中，不影响内容布局。 */
  margin: 0 -30px;
  position: sticky;
  top: 0;
  z-index: 50;
  /* 半透明白 + 高斯模糊 + 饱和度增强 = Glassmorphism */
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 4px 16px rgba(15, 23, 42, 0.04);
}
.hd-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.hd-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #1e293b;
  font-weight: 800;
  font-size: 17px;
  letter-spacing: 0.2px;
  padding: 0 6px;
  border-radius: 10px;
  transition: background .18s ease;
}
.hd-logo:hover { background: rgba(61, 124, 244, 0.08); }
.hd-logo-img {
  height: 40px;
  width: auto;
  max-width: 210px;
  display: block;
}
.hd-logo-text { display: none; }

/* ============== 菜单 skeleton 占位 ============== */
/* 与真实 .hd-pill 等高（36px）+ 同 padding，灰底脉冲动画，加载前占位避免菜单区跳动 */
.hd-skel {
  pointer-events: none;
  background: linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%);
  background-size: 200% 100%;
  animation: hd-skel-shimmer 1.4s ease-in-out infinite;
  color: transparent !important;
  width: 76px;
}
.hd-skel:nth-child(odd) { width: 64px; }
@keyframes hd-skel-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.hd-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px;
  background: rgba(241, 245, 249, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.6);
  border-radius: 999px;
}
.hd-pill {
  --pill-fg: #475569;
  --pill-bg: transparent;
  --pill-border: transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  color: var(--pill-fg);
  background: var(--pill-bg);
  border: 1px solid var(--pill-border);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
  line-height: 1;
  cursor: pointer;
  transition: color .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  white-space: nowrap;
  user-select: none;
}
.hd-pill .pill-ic { width: 16px; height: 16px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
.hd-pill .pill-ic svg { width: 100%; height: 100%; display: block; }
.hd-pill:hover {
  color: #1e3a8a;
  background: #fff;
  border-color: rgba(61, 124, 244, 0.25);
  box-shadow: 0 2px 8px rgba(61, 124, 244, 0.12);
}
.hd-pill:focus-visible {
  outline: 2px solid #3D7CF4;
  outline-offset: 2px;
}
.hd-pill.active {
  color: #fff;
  background: linear-gradient(135deg, #1e3a8a 0%, #3D7CF4 100%);
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(61, 124, 244, 0.35);
}
.hd-pill.active:hover { transform: translateY(-1px); }
/* 内置默认项 pill：白底 + 浅边框 + 深色文字，用于与用户自建菜单项区分（仅 GitHub / 介绍等系统内置项生效） */
.hd-pill--default {
  --pill-fg: #1e293b;
  background: #fff;
  border-color: rgba(226, 232, 240, 0.9);
}
.hd-pill--default:hover { color: #1e293b; border-color: #1e293b; }
.hd-pill--default .pill-ic { fill: currentColor; }

/* ============== Hero ============== */
.hero {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
  padding: 40px 0 24px;
}
.hero-title {
  font-size: 32px;
  font-weight: 700;
  color: #2a3749;
  margin: 0 0 12px;
}
.hero-sub {
  font-size: 15px;
  color: #5a6a80;
  margin: 0;
}

/* ============== Tab 容器（独立 sticky：长内容滚动时贴在 header 下方；hero 滚走，tab 行始终可达） ============== */
/* 设计要点：
   1) position: sticky + top: 64px（紧贴 .hd 底部）；
   2) z-index: 45（低于 .hd 的 50，避免覆盖顶部导航的菜单/按钮）；
   3) 背景透明 + 无白卡：与 .landing 浅灰底色融合，避免与下方内容区域产生"色块"断层；
   4) tab 按钮自身处理 hover/active 视觉（圆角淡蓝高亮），不再用白卡+内 padding 的"按钮组"形态。 */
.tab-container {
  position: sticky;
  top: 64px;
  z-index: 45;
  width: 100%;
  max-width: 1200px;
  background: #fff;            /* 恢复白卡：与下方 .content-card 同色但有圆角+阴影，形成独立「按钮组」视觉 */
  border-radius: 12px;
  padding: 6px;                /* 内边距包住三个 tab 按钮，圆角衔接 */
  margin: 0 auto 16px;
  box-shadow: 0 2px 4px rgba(11, 31, 77, 0.04);
}
.tab-row {
  display: flex;
  gap: 4px;
}
.tab {
  flex: 1;
  padding: 12px 18px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 15px;
  color: #5a6a80;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all .2s;
}
.tab:hover { color: #3D7CF4; background: rgba(61, 124, 244, 0.04); }
.tab.active {
  background: rgba(61, 124, 244, 0.1);
  color: #3D7CF4;
  font-weight: 600;
}

/* ============== 内容卡片 ============== */
/* ============== 内容卡片 ============== */
.content-card {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto 24px;
  background: #fff;
  border-radius: 12px;
  padding: 24px 28px 32px;
  box-shadow: 0 2px 4px rgba(11, 31, 77, 0.04);
}

/* ============== 输入组 ============== */
.input-group {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
}
.text-input {
  flex: 1;
  height: 44px;
  padding: 0 16px;
  border: 1px solid #e2e8f0;
  border-right: none;
  border-radius: 8px 0 0 8px;
  font-size: 14px;
  outline: none;
  transition: border-color .2s;
  color: #2a3749;
  background: #fff;
}
.text-input:focus { border-color: #3D7CF4; }
.text-input::placeholder { color: #8896ab; }
.primary-btn {
  height: 44px;
  padding: 0 24px;
  background: #3D7CF4;
  color: #fff;
  border: none;
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background .2s;
  white-space: nowrap;
}
.primary-btn:hover { background: #2F62C9; }
.primary-btn:active { transform: scale(.98); }

/* ============== 镜像加速结果 ============== */
.result-wrap { margin-top: 8px; }
.result-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #2a3749;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.result-title i { color: #3D7CF4; }
.detect-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  margin-bottom: 16px;
}

/* 步骤卡（Stepper）：左侧色条 + 数字徽章 + 等宽代码块 */
.cmd-card {
  --step-color: #3D7CF4;
  --step-bg: rgba(61, 124, 244, .08);
  --step-border: rgba(61, 124, 244, .22);
  position: relative;
  display: flex;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
  transition: border-color .2s, box-shadow .2s, transform .2s;
}
.cmd-card:hover {
  border-color: var(--step-border);
  box-shadow: 0 6px 18px rgba(11, 31, 77, 0.06);
  transform: translateY(-1px);
}
.cmd-side {
  width: 4px;
  flex-shrink: 0;
  background: var(--step-color);
}
.cmd-main {
  flex: 1;
  padding: 14px 16px 16px;
  min-width: 0;
}
.cmd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.cmd-step {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.cmd-num {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--step-color);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  font-family: 'SF Pro Display', -apple-system, sans-serif;
  box-shadow: 0 2px 6px rgba(0, 0, 0, .12);
  flex-shrink: 0;
}
.cmd-meta { min-width: 0; }
.cmd-title {
  font-size: 15px;
  font-weight: 600;
  color: #2a3749;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmd-hint {
  font-size: 12px;
  color: #8896ab;
  margin-top: 2px;
  line-height: 1.5;
}
.copy-btn {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: 5px 12px;
  font-size: 12px;
  color: #5a6a80;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  transition: all .18s;
}
.copy-btn:hover {
  background: var(--step-color);
  color: #fff;
  border-color: var(--step-color);
}
.cmd-code {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--step-bg);
  border: 1px solid var(--step-border);
  border-radius: 8px;
  padding: 10px 14px;
  font-family: 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
  font-size: 13px;
  color: #2a3749;
  overflow-x: auto;
  white-space: nowrap;
}
.cmd-prompt {
  color: var(--step-color);
  font-weight: 700;
  user-select: none;
  flex-shrink: 0;
}
.cmd-code code {
  flex: 1;
  min-width: 0;
  color: #2a3749;
  font-family: inherit;
}

/* 各步骤配色：步骤区分色（--step-color）保留蓝/灰/绿/红，但代码块背景/边框统一为中性灰，保持视觉一致 */
.cmd-card.cmd-proxy {
  --step-color: #3D7CF4;
  --step-bg: #f5f7fa;
  --step-border: #e6eaf0;
}
.cmd-card.cmd-original {
  --step-color: #5a6a80;
  --step-bg: #f5f7fa;
  --step-border: #e6eaf0;
}
.cmd-card.cmd-rename {
  --step-color: #10B981;
  --step-bg: #f5f7fa;
  --step-border: #e6eaf0;
}
.cmd-card.cmd-rmi {
  --step-color: #EF4444;
  --step-bg: #f5f7fa;
  --step-border: #e6eaf0;
}

/* ============== 快捷执行 ============== */
.quick-exec {
  margin-top: 16px;
  padding: 16px 18px;
  background: #f7faff;
  border: 1px solid #d6e4ff;
  border-radius: 8px;
}
.quick-title {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  color: #3D7CF4;
  line-height: 1.6;
  margin-bottom: 12px;
}
.quick-title i { color: #f5a623; margin-top: 2px; }
.quick-title strong { color: #3D7CF4; font-weight: 600; }
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.quick-item {
  background: #fff;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all .2s;
  font-size: 13px;
  color: #3D7CF4;
  font-weight: 500;
}
.quick-item:hover { border-color: #3D7CF4; box-shadow: 0 2px 8px rgba(61, 124, 244, .15); }
.quick-item i { font-size: 18px; color: #3D7CF4; }
@media (max-width: 700px) {
  .quick-grid { grid-template-columns: 1fr; }
}

/* ============== 空状态 ============== */
.empty {
  text-align: center;
  padding: 60px 20px;
  color: #8896ab;
}
.empty i { font-size: 40px; color: #c8d4e8; margin-bottom: 12px; }
.empty p { margin: 0; font-size: 14px; }
.empty-hint {
  text-align: center;
  padding: 40px 20px 20px;
  color: #8896ab;
}
.empty-hint i { font-size: 32px; color: #c8d4e8; display: block; margin-bottom: 8px; }

.no-result-tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 620px;
  margin: 18px auto 0;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #edf1f7;
  border-left: 3px solid #2496ed;
  border-radius: 10px;
  text-align: left;
}
.no-result-tip > i { color: #2496ed; font-size: 16px; margin-top: 2px; flex-shrink: 0; }
.no-result-tip-body { flex: 1; min-width: 0; }
.no-result-tip-body strong { display: block; font-size: 13px; color: #2a3749; margin-bottom: 4px; }
.no-result-tip-body p { margin: 0; font-size: 13px; line-height: 1.6; color: #6b7a90; }

/* ============== 特性卡 ============== */
.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 28px;
}
.feature-card {
  background: #fff;
  border: 1px solid #edf1f7;
  border-radius: 12px;
  padding: 28px 20px;
  text-align: center;
  transition: all .2s;
}
.feature-card:hover {
  border-color: #c8d4e8;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(11, 31, 77, 0.08);
}
.feature-card i {
  font-size: 32px;
  color: #3D7CF4;
  margin-bottom: 12px;
  display: block;
}
.feature-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  color: #2a3749;
}
.feature-card p {
  font-size: 13px;
  color: #5a6a80;
  margin: 0;
  line-height: 1.5;
}

/* ============== 搜索（Hero 风格 + 分段控件） ============== */
.search-hero {
  background: linear-gradient(180deg, #f7faff 0%, #ffffff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 22px 22px 20px;
  margin-bottom: 18px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 8px 24px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}
.search-hero::before {
  /* 顶部微光：让卡片有"光从上方照下"的层次感 */
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 70px;
  background: radial-gradient(ellipse at 50% 0%, rgba(61, 124, 244, 0.12), transparent 70%);
  pointer-events: none;
}
.search-hero__head { margin-bottom: 14px; position: relative; }
.search-hero__title {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 18px; font-weight: 700; color: #1e293b;
  margin: 0 0 4px;
}
.search-hero__title .hero-ic { width: 20px; height: 20px; color: #3D7CF4; }
.search-hero__sub { font-size: 13px; color: #64748b; margin: 0; }

/* ============== 镜像加速 Hero（与 .search-hero 同款视觉语言：渐变卡 + 顶部径向高光） ============== */
.accel-hero {
  background: linear-gradient(180deg, #f7faff 0%, #ffffff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 22px 22px 20px;
  margin-bottom: 18px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 8px 24px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}
.accel-hero::before {
  /* 顶部微光：与 .search-hero 一致，让卡片有"光从上方照下"的层次感 */
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 70px;
  background: radial-gradient(ellipse at 50% 0%, rgba(61, 124, 244, 0.12), transparent 70%);
  pointer-events: none;
}
.accel-hero__head { margin-bottom: 14px; position: relative; }
.accel-hero__title {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 18px; font-weight: 700; color: #1e293b;
  margin: 0 0 4px;
}
.accel-hero__title .hero-ic { width: 20px; height: 20px; color: #3D7CF4; }
.accel-hero__sub { font-size: 13px; color: #64748b; margin: 0; }

/* 分段控件（Segmented Control）：统一节奏，激活态用平台色或渐变 */
.seg {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 5px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  margin-bottom: 14px;
  position: relative;
}
.seg-item {
  --seg-active-bg: #fff;
  --seg-active-fg: #1e3a8a;
  display: inline-flex; align-items: center; gap: 7px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid transparent;
  background: transparent;
  color: #475569;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: color .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.seg-item .seg-ic, .seg-item i { width: 14px; height: 14px; font-size: 13px; }
.seg-item:hover { color: #1e3a8a; background: rgba(255, 255, 255, 0.6); }
.seg-item:focus-visible { outline: 2px solid #3D7CF4; outline-offset: 2px; }
.seg-item.active {
  color: var(--seg-active-fg);
  background: var(--seg-active-bg);
  border-color: rgba(15, 23, 42, 0.04);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}
.seg-item.active:hover { transform: translateY(-1px); }
/* 「全部」单独用品牌渐变高亮 */
.seg-item--all.active {
  background: linear-gradient(135deg, #2496ED 0%, #7c3aed 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 14px rgba(61, 124, 244, 0.32);
}

/* Hero 搜索框：图标 + 大号 input + 渐变 CTA */
.search-bar {
  display: flex; align-items: center; gap: 0;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  padding: 6px 6px 6px 0;
  transition: border-color .2s ease, box-shadow .2s ease;
  position: relative;
}
.search-bar:hover { border-color: #c7d6ee; }
.search-bar:focus-within {
  border-color: #3D7CF4;
  box-shadow: 0 0 0 4px rgba(61, 124, 244, 0.14);
}
.search-bar__lead {
  display: flex; align-items: center; justify-content: center;
  width: 56px; height: 56px;
  color: #94a3b8;
  flex-shrink: 0;
}
.search-bar__lead svg { width: 22px; height: 22px; }
.search-bar__input {
  flex: 1; min-width: 0;
  height: 56px;
  border: none; outline: none;
  background: transparent;
  font-size: 16px;
  color: #1e293b;
  font-family: inherit;
  padding: 0 8px;
}
.search-bar__input::placeholder { color: #94a3b8; }
.search-bar__cta {
  display: inline-flex; align-items: center; gap: 8px;
  height: 48px;
  padding: 0 22px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #1e3a8a 0%, #3D7CF4 100%);
  color: #fff;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(61, 124, 244, 0.32);
  transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.search-bar__cta:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(61, 124, 244, 0.42);
  filter: brightness(1.05);
}
.search-bar__cta:active:not(:disabled) { transform: translateY(0); }
.search-bar__cta:disabled { opacity: 0.7; cursor: not-allowed; }
.search-bar__cta i { font-size: 14px; }

.search-hint {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-top: 12px;
  font-size: 12.5px;
  color: #94a3b8;
}
.search-hint .dot { color: #cbd5e1; }

/* search-hint skeleton：与提示文字等高同字号，灰底脉冲，避免「空→提示内容」闪烁 */
.search-hint__skel {
  display: inline-block;
  width: 200px;
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%);
  background-size: 200% 100%;
  animation: hd-skel-shimmer 1.4s ease-in-out infinite;
}
.search-hint__skel--short { width: 140px; }

@media (max-width: 720px) {
  .search-bar { flex-wrap: wrap; padding: 6px; }
  .search-bar__lead { width: 48px; height: 48px; }
  .search-bar__input { width: 100%; height: 48px; padding: 0 4px; }
  .search-bar__cta { width: 100%; justify-content: center; height: 44px; }
  .seg { overflow-x: auto; flex-wrap: nowrap; }
  .seg-item { flex-shrink: 0; }
}
.search-results {
  min-height: 200px;
}
.result-summary {
  font-size: 13px;
  color: #5a6a80;
  margin-bottom: 12px;
}
.result-summary strong { color: #2a3749; font-weight: 600; }
.result-list { display: flex; flex-direction: column; gap: 8px; }
/* 搜索结果卡片（对齐老版） */
.search-result-item {
  padding: 18px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  transition: all .2s ease;
}
.search-result-item:hover {
  border-color: #3D7CF4;
  box-shadow: 0 4px 14px rgba(61, 124, 244, .12);
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.title-badge { display: flex; align-items: center; gap: 10px; min-width: 0; }
.registry-badge {
  width: 30px; height: 30px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; flex-shrink: 0;
}
.result-name {
  font-size: 16px; font-weight: 700; color: #2a3749; margin: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.official-badge {
  display: inline-flex; align-items: center; gap: 4px;
  background: rgba(50, 213, 131, .12); color: #1a9e63;
  border: 1px solid rgba(50, 213, 131, .3);
  padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap;
}
.result-stats {
  display: flex; align-items: center; gap: 14px;
  font-size: 13px; color: #8896ab; white-space: nowrap; flex-shrink: 0;
}
.result-stats .stats { display: inline-flex; align-items: center; gap: 4px; }
.result-description-box {
  background: linear-gradient(180deg, #f8fafc 0%, #f5f8ff 100%);
  border: 1px solid #e8edf5;
  border-radius: 10px;
  padding: 12px 14px;
  margin: 12px 0;
  position: relative;
}
.result-description-box::before {
  content: '';
  position: absolute;
  left: 0; top: 10px; bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #3D7CF4 0%, #60a5fa 100%);
  opacity: 0.6;
}
.result-description {
  color: #475569; font-size: 13px; line-height: 1.7;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.result-description :deep(a) {
  color: #3D7CF4; text-decoration: none;
  border-bottom: 1px dashed rgba(61, 124, 244, 0.45);
  transition: all .15s ease;
}
.result-description :deep(a:hover) { color: #1e3a8a; border-bottom-style: solid; }
.result-description :deep(code) {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px;
  background: rgba(61, 124, 244, 0.08); color: #2f6fe0;
  padding: 1px 5px; border-radius: 4px;
}
.result-description :deep(strong) { color: #334155; font-weight: 600; }
.result-description :deep(.desc-empty) { color: #94a3b8; font-style: italic; }
.result-pull-command {
  display: flex; align-items: center; gap: 10px;
  background: #f5f8ff; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 8px 12px; margin-bottom: 12px;
}
.result-pull-command code {
  flex: 1; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px; color: #2a3749; word-break: break-all;
}
.copy-small-btn {
  border: none; background: #3D7CF4; color: #fff; width: 30px; height: 30px;
  border-radius: 6px; cursor: pointer; flex-shrink: 0; transition: all .15s;
}
.copy-small-btn:hover { background: #2F62C9; }
.result-actions { display: flex; gap: 10px; }
.action-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: all .15s;
}
.action-btn.primary { background: #3D7CF4; color: #fff; }
.action-btn.primary:hover { background: #2F62C9; }
.action-btn.secondary { background: #fff; color: #3D7CF4; border-color: #3D7CF4; }
.action-btn.secondary:hover { background: #f0f7ff; }

/* 分页（对齐老版） */
.pager {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  margin: 18px 0;
}
.pager-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: #fff; color: #3D7CF4; border: 1px solid #e2e8f0;
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.pager-btn:hover:not(:disabled) { border-color: #3D7CF4; background: #f0f7ff; }
.pager-btn:disabled { color: #c8d4e8; cursor: not-allowed; border-color: #edf1f7; }
.pager-info { font-size: 13px; color: #5a6a80; }

/* 标签详情视图：返回链接做成胶囊 + 镜像信息卡 + 表格 + 分页 */
.tag-view { animation: fadeIn .3s ease; }

/* 返回链接：胶囊样式，hover 反色 */
.tag-breadcrumb { margin-bottom: 14px; }
.tag-breadcrumb a {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px 6px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #3D7CF4; font-size: 13px; font-weight: 600; text-decoration: none;
  transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
}
.tag-breadcrumb a:hover {
  background: #3D7CF4; color: #fff; border-color: #3D7CF4;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(61, 124, 244, 0.28);
}
.tag-breadcrumb a i { font-size: 11px; }

/* 镜像信息卡：渐变 + 顶部径向高光 + 圆角 + 阴影，与 Hero 卡同款语言 */
.tag-header {
  margin-bottom: 18px;
  padding: 20px 22px;
  background: linear-gradient(180deg, #f7faff 0%, #ffffff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 8px 24px rgba(15, 23, 42, 0.04);
  position: relative; overflow: hidden;
}
.tag-header::before {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 70px;
  background: radial-gradient(ellipse at 50% 0%, rgba(61, 124, 244, 0.12), transparent 70%);
  pointer-events: none;
}
.tag-title {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  font-size: 24px; font-weight: 800; color: #0f172a;
  margin: 0 0 8px; letter-spacing: -0.2px;
}
.tag-title .registry-badge { width: 36px; height: 36px; border-radius: 10px; font-size: 16px; }
.image-description { position: relative; color: #475569; font-size: 14px; margin: 0 0 14px; line-height: 1.65; }
.image-meta { position: relative; display: flex; flex-wrap: wrap; gap: 8px; }

/* Meta 芯片：星标 / 下载 / 标签数 */
.meta-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  background: rgba(61, 124, 244, 0.08);
  border: 1px solid rgba(61, 124, 244, 0.18);
  color: #2f6fe0;
  border-radius: 999px;
  font-size: 12.5px; font-weight: 600;
  white-space: nowrap;
}
.meta-chip i { font-size: 12px; opacity: 0.85; }

.loading-indicator { text-align: center; padding: 40px 0; color: #5a6a80; }
.loading-indicator i { margin-right: 8px; }
/* 错误状态：卡片化 + 图标徽章 + 清晰层级 */
.error-state {
  margin: 24px 0;
  padding: 32px 28px;
  text-align: center;
  background: linear-gradient(180deg, #fff5f5 0%, #ffffff 100%);
  border: 1px solid #fecaca;
  border-radius: 16px;
  box-shadow: 0 1px 0 rgba(220, 38, 38, 0.02), 0 8px 24px rgba(15, 23, 42, 0.04);
}
.error-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  background: rgba(239, 68, 68, 0.12);
  border-radius: 50%;
}
.error-icon-wrap i { font-size: 26px; color: #dc2626; }
.error-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: #991b1b;
}
.error-desc {
  max-width: 560px;
  margin: 0 auto 8px;
  font-size: 14px;
  line-height: 1.65;
  color: #b91c1c;
}
.error-hint {
  max-width: 480px;
  margin: 0 auto 18px;
  font-size: 13px;
  line-height: 1.6;
  color: #9ca3af;
}
.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 20px;
  background: #3D7CF4;
  color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background .18s ease, transform .18s ease, box-shadow .18s ease;
  box-shadow: 0 2px 6px rgba(61, 124, 244, 0.25);
}
.retry-btn:hover {
  background: #2f6fe0;
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(61, 124, 244, 0.32);
}
.retry-btn:active { transform: translateY(0); }
.retry-btn i { font-size: 12px; }

/* 标签搜索：带图标的圆角输入 + 重置按钮 */
.tag-actions { margin-bottom: 12px; }
.tag-search-container {
  display: flex; align-items: center; gap: 8px;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 4px 4px 4px 14px;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.tag-search-container:focus-within {
  border-color: #3D7CF4;
  box-shadow: 0 0 0 4px rgba(61, 124, 244, 0.14);
}
.tag-search-ic { display: inline-flex; color: #94a3b8; }
.tag-search-ic svg { width: 18px; height: 18px; }
.tag-search-container input {
  flex: 1; min-width: 0; height: 40px;
  border: none; outline: none; background: transparent;
  font-size: 14px; color: #2a3749; padding: 0 4px;
}
.tag-search-container input::placeholder { color: #94a3b8; }
.reset-search-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: #f1f5f9; color: #5a6a80; border: none;
  padding: 0 14px; height: 36px; border-radius: 10px;
  cursor: pointer; font-size: 12.5px; font-weight: 600;
  transition: background .15s ease, color .15s ease;
}
.reset-search-btn:hover { background: #e2e8f0; color: #1e293b; }
.reset-search-btn i { font-size: 11px; }

.tag-search-stats { font-size: 13px; color: #5a6a80; margin: 14px 0 10px; }
.tag-search-stats strong { color: #1e3a8a; font-weight: 700; }

/* 表格：圆角容器 + 表头渐变 + 行 hover */
.tag-table-container {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 6px 18px rgba(15, 23, 42, 0.04);
}
.tag-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tag-table thead th {
  text-align: left; padding: 12px 16px;
  background: linear-gradient(180deg, #f5f8ff 0%, #eef3fb 100%);
  color: #475569; font-weight: 700; font-size: 12.5px; letter-spacing: 0.2px;
  border-bottom: 1px solid #e2e8f0; white-space: nowrap;
}
.tag-table tbody td {
  padding: 12px 16px; border-bottom: 1px solid #edf1f7;
  color: #2a3749; vertical-align: middle;
}
.tag-table tbody tr { transition: background .15s ease; }
.tag-table tbody tr:hover { background: #f7faff; }
.tag-table tbody tr:last-child td { border-bottom: none; }
.tag-name-cell { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 700; color: #1e293b; }
.no-tags-message { text-align: center; color: #8896ab; padding: 28px 0; }
.arch-list { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.arch-chip {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 6px;
  font-size: 11px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 500; line-height: 1.6;
  background: rgba(61, 124, 244, .10);
  color: #2f6fe0;
  border: 1px solid rgba(61, 124, 244, .18);
  white-space: nowrap;
}
.arch-unknown {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 500; line-height: 1.6;
  background: #f1f5f9; color: #94a3b8;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}
.arch-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: 2px; padding: 1px 8px; min-height: 22px;
  border-radius: 6px; cursor: pointer;
  font-size: 11px; font-weight: 600; line-height: 1.4;
  color: #3D7CF4; background: rgba(61, 124, 244, .08);
  border: 1px dashed rgba(61, 124, 244, .35);
  transition: all .15s ease; white-space: nowrap;
}
.arch-toggle:hover { background: rgba(61, 124, 244, .16); border-style: solid; }

/* 「使用」按钮：品牌渐变 + 悬浮上浮 + 发光 */
.tag-use-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: linear-gradient(135deg, #1e3a8a 0%, #3D7CF4 100%);
  color: #fff; border: none; padding: 7px 14px;
  border-radius: 9px; font-size: 12px; font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(61, 124, 244, 0.28);
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  white-space: nowrap;
}
.tag-use-btn:hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 6px 16px rgba(61, 124, 244, 0.42); }
.tag-use-btn:active { transform: translateY(0); }
.tag-use-btn i { font-size: 11px; }

/* ============== 文档（左侧菜单 sticky 固定，右侧内容独立滚动） ============== */
.docs-layout { min-height: calc(100vh - 220px); } /* 给内容区留足高度，确保 sticky 菜单有可附着的滚动距离 */
.docs-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  align-items: start; /* 关键：让左侧 aside 按内容高度对齐，sticky 才能在右侧内容滚动时保持原位 */
}
/* sticky 偏移计算：
   .hd (top:0, ~64) + .tab-container (~60) + 呼吸距离 ~8 = 132px
   这样 .docs-aside 在 .tab-container 下方贴住，避免被 tab 行遮挡 */
.docs-aside {
  position: sticky;
  top: 132px; /* header(64) + tab-container(60) + 视觉间隔(8) */
  max-height: calc(100vh - 148px); /* 100vh - top(132) - 底部留白(16) */
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 12px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 6px 18px rgba(15, 23, 42, 0.04);
  /* 自定义细滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.docs-aside::-webkit-scrollbar { width: 6px; }
.docs-aside::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.docs-aside::-webkit-scrollbar-track { background: transparent; }

.docs-list-title {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  margin: 4px 8px 10px;
}
.docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.docs-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  color: #475569;
  border: 1px solid transparent;
  transition: background .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  line-height: 1.4;
}
.docs-item:hover {
  background: #f1f5f9;
  color: #1e3a8a;
}
.docs-item.active {
  background: linear-gradient(135deg, #1e3a8a 0%, #3D7CF4 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(61, 124, 244, 0.30);
  border-color: transparent;
}
.docs-item i { font-size: 13px; opacity: 0.9; flex-shrink: 0; }

/* 右侧文档内容：白卡 + 更好排版 */
.docs-content {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 28px 34px 36px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02), 0 6px 18px rgba(15, 23, 42, 0.04);
  min-width: 0; /* 防止 grid 子项被内容撑爆 */
}
.docs-eyebrow {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px; margin-bottom: 12px;
  background: rgba(61, 124, 244, 0.08);
  border: 1px solid rgba(61, 124, 244, 0.18);
  color: #2f6fe0;
  border-radius: 999px;
  font-size: 12px; font-weight: 600;
}
.docs-eyebrow i { font-size: 11px; }
.docs-h1 {
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #edf1f7;
  letter-spacing: -0.2px;
  line-height: 1.3;
}
.docs-body {
  font-size: 15px;
  line-height: 1.85;
  color: #334155;
  max-width: 820px;
}
.docs-body :deep(h1) { font-size: 24px; font-weight: 800; color: #0f172a; margin: 24px 0 12px; }
.docs-body :deep(h2) {
  font-size: 19px;
  font-weight: 700;
  color: #1e3a8a;
  margin: 28px 0 12px;
  padding-left: 12px;
  border-left: 3px solid #3D7CF4;
  line-height: 1.4;
}
.docs-body :deep(h3) { font-size: 16.5px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; }
.docs-body :deep(p) { margin: 12px 0; }
.docs-body :deep(ul), .docs-body :deep(ol) { padding-left: 26px; margin: 12px 0; }
.docs-body :deep(li) { margin: 5px 0; }
.docs-body :deep(code) {
  background: #f1f5f9;
  padding: 2px 7px;
  border-radius: 5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13.5px;
  color: #c7254e;
  border: 1px solid #e2e8f0;
}
.docs-body :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 18px 20px;
  border-radius: 12px;
  overflow-x: auto;
  margin: 14px 0;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.10);
  line-height: 1.6;
}
.docs-body :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: 13.5px;
  border: none;
}
.docs-body :deep(blockquote) {
  border-left: 4px solid #3D7CF4;
  background: #f7faff;
  padding: 12px 18px;
  margin: 14px 0;
  color: #475569;
  border-radius: 0 10px 10px 0;
}
.docs-body :deep(a) { color: #3D7CF4; text-decoration: none; font-weight: 500; }
.docs-body :deep(a:hover) { text-decoration: underline; }
.docs-body :deep(strong) { color: #0f172a; font-weight: 700; }
.docs-body :deep(table) { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
.docs-body :deep(table th), .docs-body :deep(table td) { border: 1px solid #e2e8f0; padding: 8px 12px; }
.docs-body :deep(table th) { background: #f7faff; }

/* ============== 页脚 ============== */
.ft {
  /* 改用 flex 居中：让页脚内容（无论多宽）始终在视口水平居中。
     父 .landing 宽度 = 视口宽 - 60px（padding），max-width 1200px 限制后
     .ft 实际宽度可能小于 .landing 内容区，需要 flex 显式居中而不是依赖
     块级 width:100% + text-align（后者只在 ft 撑满时居中）。 */
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 0 0;
  color: #8896ab;
  font-size: 13px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.ft p { margin: 0; text-align: center; }
.ft a {
  color: #3D7CF4;
  text-decoration: none;
  margin: 0 4px;
}
.ft a:hover { text-decoration: underline; }

/* ============== 返回顶部按钮 ============== */
.back-top {
  position: fixed;
  right: 28px;
  bottom: 32px;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid var(--border, #e3e8f0);
  background: #fff;
  color: #3D7CF4;
  font-size: 17px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(31, 45, 70, 0.14);
  z-index: 60;
  transition: transform .18s ease, box-shadow .2s ease, background .2s ease;
}
.back-top:hover {
  transform: translateY(-3px);
  background: #3D7CF4;
  color: #fff;
  box-shadow: 0 12px 30px rgba(61, 124, 244, 0.32);
}
.back-top:active { transform: translateY(-1px); }

/* 返回顶部按钮淡入淡出 */
.bt-fade-enter-active,
.bt-fade-leave-active { transition: opacity .25s ease, transform .25s ease; }
.bt-fade-enter-from,
.bt-fade-leave-to { opacity: 0; transform: translateY(12px); }

/* ============== 响应式 ============== */
@media (max-width: 768px) {
  .landing { padding: 0 12px 24px; }
  .hd { margin: 0 -12px; } /* 移动端父 padding 改为 12px，header 同步负 margin 保持全宽 */
  .hd-inner { padding: 10px 14px; gap: 8px; }
  .hd-nav { padding: 4px; gap: 4px; }
  .hd-pill { height: 32px; padding: 0 10px; font-size: 12.5px; }
  .hd-pill .pill-ic { width: 14px; height: 14px; }
  .hd-pill--default span { display: none; } /* 小屏隐藏默认项文字，保留图标（GitHub / 介绍） */
  .hd-pill--default { padding: 0; width: 32px; justify-content: center; }
  .hero { padding: 24px 0 16px; }
  .hero-title { font-size: 22px; }
  .input-group { flex-direction: column; }
  .text-input { border-right: 1px solid #e2e8f0; border-radius: 8px; }
  .primary-btn { border-radius: 8px; margin-top: 8px; justify-content: center; }
  .features { grid-template-columns: 1fr; }
  .docs-grid { grid-template-columns: 1fr; }
  /* 移动端单列：取消 sticky 与高度限制，让菜单自然流于内容之上 */
  .docs-aside { position: static; max-height: none; overflow: visible; }
  .docs-content { padding: 22px 20px 28px; }
  .docs-h1 { font-size: 22px; }
}

/* ========================================================================
 * 深色模式覆盖（非 scoped，依靠 :root.dark 触发，与 useTheme 联动）
 * 选择器前缀 :root.dark .landing 提升特异性，胜过上面 scoped 的
 * .landing .xxx[data-v-xxx]，因为非 scoped 在编译产物里靠后、且加上 :root.dark 多一份特异性
 * ======================================================================== */
:root.dark .landing {
  background: #0f172a;
  color: #e2e8f0;
}

/* === 顶部 header（Glassmorphism） === */
:root.dark .landing .hd {
  background: rgba(15, 23, 42, 0.72);
  border-bottom-color: rgba(51, 65, 85, 0.6);
}
:root.dark .landing .hd-pill {
  --pill-fg: #cbd5e1;
  background: rgba(30, 41, 59, 0.6);
  border-color: rgba(51, 65, 85, 0.6);
}
:root.dark .landing .hd-pill:hover {
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.9);
  border-color: #60a5fa;
}
:root.dark .landing .hd-pill--default { color: #cbd5e1; background: rgba(30, 41, 59, 0.6); border-color: rgba(51, 65, 85, 0.6); }
:root.dark .landing .hd-pill--default:hover { color: #f1f5f9; background: rgba(30, 41, 59, 0.9); border-color: #60a5fa; }
:root.dark .landing .hd-logo { color: #f1f5f9; }
:root.dark .landing .hd-logo:hover { background: rgba(96, 165, 250, 0.12); }
:root.dark .landing .hd-pill--active {
  color: #f1f5f9;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  border-color: transparent;
}

/* === Tab 栏 === */
:root.dark .landing .tab-container {
  background: #1e293b;
  border: 1px solid #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .tab { color: #94a3b8; }
:root.dark .landing .tab:hover { color: #60a5fa; background: rgba(96, 165, 250, 0.08); }
:root.dark .landing .tab.active { color: #60a5fa; background: rgba(96, 165, 250, 0.12); }

/* === Hero 标题与副标题 === */
:root.dark .landing .hero-title { color: #f1f5f9; }
:root.dark .landing .hero-sub { color: #94a3b8; }

/* === 内容卡片 === */
:root.dark .landing .content-card {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .result-title { color: #f1f5f9; }

/* === 镜像加速 tab：Hero 卡 === */
:root.dark .landing .accel-hero,
:root.dark .landing .search-hero {
  background: linear-gradient(180deg, #1e3a5f 0%, #1e293b 100%);
  border-color: #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .accel-hero__title,
:root.dark .landing .search-hero__title { color: #f1f5f9; }
:root.dark .landing .accel-hero__title .hero-ic,
:root.dark .landing .search-hero__title .hero-ic { color: #60a5fa; }
:root.dark .landing .accel-hero__sub,
:root.dark .landing .search-hero__sub { color: #94a3b8; }

/* === 分段控件（seg） === */
:root.dark .landing .seg {
  background: #172033;
  border-color: #334155;
}
:root.dark .landing .seg-item { color: #94a3b8; }
:root.dark .landing .seg-item:hover { color: #cbd5e1; background: rgba(96, 165, 250, 0.06); }
:root.dark .landing .seg-item.active {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* === 输入框 / 按钮 === */
:root.dark .landing .search-bar {
  background: #1e293b;
  border-color: #334155;
}
:root.dark .landing .search-bar:hover { border-color: #475569; }
:root.dark .landing .search-bar:focus-within { border-color: #60a5fa; box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18); }
:root.dark .landing .search-bar__input { color: #f1f5f9; }
:root.dark .landing .search-bar__input::placeholder { color: #64748b; }
:root.dark .landing .search-bar__lead { color: #64748b; }
:root.dark .landing .search-bar__cta {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 4px 14px rgba(96, 165, 250, 0.32);
}
:root.dark .landing .search-bar__cta:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%);
  box-shadow: 0 6px 18px rgba(96, 165, 250, 0.42);
}

/* === 镜像加速 tab：步骤卡 === */
:root.dark .landing .step-card {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .step {
  --step-bg: #172033;
  --step-border: #334155;
  background: var(--step-bg);
  border-color: var(--step-border);
  color: #e2e8f0;
}
:root.dark .landing .step .step-label { color: #cbd5e1; }
:root.dark .landing .step .step-copy-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
}
:root.dark .landing .step .step-copy-btn:hover { box-shadow: 0 4px 12px rgba(96, 165, 250, 0.42); }
/* step 状态变体（成功/错误，浅色下用 #f5f7fa 灰底） */
:root.dark .landing .step-success,
:root.dark .landing .step-error {
  --step-bg: #172033;
  --step-border: #334155;
  background: var(--step-bg);
  border-color: var(--step-border);
  color: #e2e8f0;
}

/* === 镜像加速 tab：Quick start 卡 === */
:root.dark .landing .quick-card {
  background: linear-gradient(180deg, #1e3a5f 0%, #1e293b 100%);
  border-color: #334155;
}
:root.dark .landing .quick-card .quick-title { color: #f1f5f9; }
:root.dark .landing .quick-card .quick-title strong { color: #60a5fa; }
:root.dark .landing .quick-card .quick-title i { color: #fbbf24; }
:root.dark .landing .quick-item {
  background: #1e293b;
  border-color: #475569;
}
:root.dark .landing .quick-item:hover { border-color: #60a5fa; box-shadow: 0 2px 8px rgba(96, 165, 250, 0.18); }
:root.dark .landing .quick-item i { color: #60a5fa; }
:root.dark .landing .quick-item .quick-item-title { color: #f1f5f9; }

/* === 镜像加速 tab：特性卡（高速拉取/稳定可靠/简单易用） === */
:root.dark .landing .feature-card {
  background: linear-gradient(180deg, #1e3a5f 0%, #1e293b 100%);
  border-color: #334155;
}
:root.dark .landing .feature-card:hover { border-color: #60a5fa; box-shadow: 0 4px 14px rgba(96, 165, 250, 0.18); }
:root.dark .landing .feature-card h3 { color: #f1f5f9; }
:root.dark .landing .feature-card p { color: #94a3b8; }

/* === 镜像搜索 tab：tab 切换按钮 === */
:root.dark .landing .registry-badge { background: #475569; }

/* === 镜像搜索 tab：搜索输入行 === */
:root.dark .landing .text-input {
  background: #1e293b;
  border-color: #334155;
  color: #f1f5f9;
}
:root.dark .landing .text-input:focus { border-color: #60a5fa; }
:root.dark .landing .text-input::placeholder { color: #64748b; }
:root.dark .landing .primary-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 2px 6px rgba(96, 165, 250, 0.28);
}
:root.dark .landing .primary-btn:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%);
  box-shadow: 0 6px 14px rgba(96, 165, 250, 0.42);
}

/* === 搜索结果卡 === */
:root.dark .landing .search-result-item {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .search-result-item:hover { border-color: #475569; }
:root.dark .landing .search-result-item .result-summary { color: #94a3b8; }
:root.dark .landing .search-result-item .result-summary strong { color: #f1f5f9; }
:root.dark .landing .result-icon-wrap {
  background: linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
}
:root.dark .landing .result-card .result-title { color: #f1f5f9; }
:root.dark .landing .result-card .result-title i { color: #60a5fa; }
/* .result-description v-html 内子元素的深色适配已迁移到下方独立 <style> 块 */
:root.dark .landing .pull-cmd {
  background: #172033;
  border-color: #334155;
  color: #f1f5f9;
}
:root.dark .landing .copy-small-btn { background: #3b82f6; color: #fff; }
:root.dark .landing .copy-small-btn:hover { background: #60a5fa; }
:root.dark .landing .action-btn.secondary {
  background: #1e293b;
  color: #60a5fa;
  border-color: #60a5fa;
}
:root.dark .landing .action-btn.secondary:hover { background: rgba(96, 165, 250, 0.12); }

/* === 镜像搜索 tab：分页按钮 === */
:root.dark .landing .pager-btn {
  background: #1e293b;
  color: #60a5fa;
  border-color: #334155;
}
:root.dark .landing .pager-btn:hover:not(:disabled) {
  border-color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}
:root.dark .landing .pager-btn:disabled { color: #475569; border-color: #334155; }
:root.dark .landing .pager-info { color: #94a3b8; }

/* === 镜像详情 / 标签表 === */
:root.dark .landing .image-detail-card {
  background: linear-gradient(180deg, #1e3a5f 0%, #1e293b 100%);
  border-color: #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .image-detail-card .image-description { color: #cbd5e1; }
:root.dark .landing .image-tag {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgba(96, 165, 250, 0.3);
  color: #93c5fd;
}
:root.dark .landing .image-tag-link { color: #93c5fd; }
:root.dark .landing .tag-table {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 6px 18px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .tag-table thead th {
  background: linear-gradient(180deg, #172033 0%, #1e293b 100%);
  color: #cbd5e1;
  border-bottom-color: #334155;
}
:root.dark .landing .tag-table tbody td { border-bottom-color: #334155; color: #e2e8f0; }
:root.dark .landing .tag-table tbody tr:hover { background: rgba(96, 165, 250, 0.06); }
:root.dark .landing .tag-name-cell { color: #f1f5f9; }
:root.dark .landing .arch-chip {
  background: rgba(96, 165, 250, 0.15);
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.3);
}
:root.dark .landing .arch-toggle {
  background: #172033;
  color: #94a3b8;
  border-color: #334155;
}
:root.dark .landing .arch-toggle:hover { background: rgba(96, 165, 250, 0.15); color: #cbd5e1; }
:root.dark .landing .tag-use-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.42);
}
:root.dark .landing .tag-use-btn:hover {
  filter: brightness(1.1);
  box-shadow: 0 6px 16px rgba(96, 165, 250, 0.5);
}
:root.dark .landing .tag-search-container input {
  background: #1e293b;
  border-color: #60a5fa;
  color: #f1f5f9;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}
:root.dark .landing .tag-search-container input::placeholder { color: #64748b; }
:root.dark .landing .reset-search-btn { background: #334155; color: #94a3b8; }
:root.dark .landing .reset-search-btn:hover { background: #475569; color: #f1f5f9; }
:root.dark .landing .tag-search-stats { color: #94a3b8; }
:root.dark .landing .tag-search-stats strong { color: #93c5fd; }

/* === 使用教程 tab / docs 网格 ===
   注意：深色覆盖已迁移到下方独立 <style> 块（v-html 子元素无 [data-v-xxx]，
   必须在非 scoped 块里才能命中）。原 scoped 块里的 :root.dark 规则全部移除。 */

/* === 错误提示卡 === */
:root.dark .landing .error-card {
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, #1e293b 100%);
  border-color: #7f1d1d;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .error-icon-wrap { background: rgba(239, 68, 68, 0.2); }
:root.dark .landing .error-icon-wrap i { color: #fca5a5; }
:root.dark .landing .error-title { color: #fca5a5; }
:root.dark .landing .error-msg { color: #fca5a5; }
:root.dark .landing .retry-btn { background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%); color: #fff; }
:root.dark .landing .retry-btn:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%);
  box-shadow: 0 6px 14px rgba(96, 165, 250, 0.42);
}

/* === 空状态 / 提示文字 === */
:root.dark .landing .empty { color: #94a3b8; }
:root.dark .landing .empty i { color: #475569; }
:root.dark .landing .empty-hint { color: #94a3b8; }
:root.dark .landing .empty-hint i { color: #475569; }
:root.dark .landing .no-tags-message { color: #94a3b8; }
:root.dark .landing .loading-indicator { color: #94a3b8; }
:root.dark .landing .search-hint { color: #94a3b8; }
:root.dark .landing .search-hint .dot { color: #475569; }

/* === 模态弹窗 === */
:root.dark .landing .modal-card {
  background: #1e293b;
  border: 1px solid #334155;
  color: #f1f5f9;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
:root.dark .landing .modal-link {
  border: 1px solid #334155;
  background: #172033;
  color: #60a5fa;
}
:root.dark .landing .modal-link:hover { border-color: #60a5fa; }
:root.dark .landing .modal-action-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 12px 30px rgba(96, 165, 250, 0.42);
}
:root.dark .landing .modal-backdrop { background: rgba(0, 0, 0, 0.6); }

/* === 主题菜单（沿用变量） === */
:root.dark .landing .theme-menu {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.5);
}
:root.dark .landing .theme-item { color: #cbd5e1; }
:root.dark .landing .theme-item:hover { background: rgba(96, 165, 250, 0.1); }
:root.dark .landing .theme-item.active { color: #60a5fa; background: rgba(96, 165, 250, 0.15); }
:root.dark .landing .theme-btn {
  color: #cbd5e1;
  background: rgba(30, 41, 59, 0.6);
  border-color: rgba(51, 65, 85, 0.6);
}
:root.dark .landing .theme-btn:hover {
  color: #f1f5f9;
  background: rgba(30, 41, 59, 0.9);
  border-color: #60a5fa;
}

/* === lang 切换器（nav 变体在 Landing 已对齐 .hd-pill） === */
:root.dark .landing .lang-toggle--nav { color: #cbd5e1; }
:root.dark .landing .lang-toggle--nav:hover {
  color: #f1f5f9;
  background: rgba(30, 41, 59, 0.9);
  border-color: #60a5fa;
}

/* === Element Plus 下拉菜单（深色适配，仅 Landing 范围，避免影响登录/后台） === */
:root.dark .landing .el-popper .el-dropdown-menu {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.5);
}
:root.dark .landing .el-popper .el-dropdown-menu .el-dropdown-item { color: #cbd5e1; }
:root.dark .landing .el-popper .el-dropdown-menu .el-dropdown-item:hover {
  background: rgba(96, 165, 250, 0.1);
  color: #93c5fd;
}
:root.dark .landing .el-popper .el-dropdown-menu .el-dropdown-item.is-active {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.15);
  font-weight: 600;
}
</style>

<!--
  ============================================================================
  深色模式覆盖（独立非 scoped 块）
  ============================================================================
  关键：必须独立成块、不加 scoped，否则 Vue 会给所有选择器末尾加 [data-v-xxx]，
  导致 v-html 渲染的内容（table th、h2、p、ul li、strong 等子元素自身没有该属性）
  全部不命中。独立非 scoped 块不会加属性选择器，v-html 子元素正常匹配。
  触发条件：与 useTheme 联动，<html class="dark"> 时命中。
  ============================================================================
-->
<style>
/* === 使用教程 tab / docs 网格 === */
/* 侧边栏：注意 .docs-item 在 .docs-aside 里（不是 .docs-content），上一版写错 class 名了 */
:root.dark .landing .docs-aside {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 6px 18px rgba(0, 0, 0, 0.3);
  scrollbar-color: #475569 transparent;
}
:root.dark .landing .docs-aside::-webkit-scrollbar-thumb { background: #475569; }
:root.dark .landing .docs-list-title { color: #64748b; }
:root.dark .landing .docs-item { color: #cbd5e1; }
:root.dark .landing .docs-item:hover {
  background: rgba(96, 165, 250, 0.08);
  color: #93c5fd;
}
:root.dark .landing .docs-item.active {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 6px 16px rgba(96, 165, 250, 0.3);
}
:root.dark .landing .docs-content {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2), 0 6px 18px rgba(0, 0, 0, 0.3);
}
:root.dark .landing .docs-eyebrow {
  background: rgba(96, 165, 250, 0.12);
  border-color: rgba(96, 165, 250, 0.3);
  color: #93c5fd;
}
:root.dark .landing .docs-h1 { color: #f1f5f9; border-bottom-color: #334155; }

/* 文档正文：v-html 渲染的元素无 [data-v-xxx]，必须用非 scoped 块才能命中 */
:root.dark .landing .docs-body { color: #cbd5e1; }
:root.dark .landing .docs-body h1 { color: #f1f5f9; }
:root.dark .landing .docs-body h2 { color: #60a5fa; border-left-color: #60a5fa; }
:root.dark .landing .docs-body h3 { color: #f1f5f9; }
:root.dark .landing .docs-body p { color: #cbd5e1; }
:root.dark .landing .docs-body a { color: #60a5fa; }
:root.dark .landing .docs-body strong { color: #f1f5f9; }
:root.dark .landing .docs-body ul li,
:root.dark .landing .docs-body ol li { color: #cbd5e1; }
:root.dark .landing .docs-body code {
  background: #172033;
  color: #fca5a5;
  border-color: #334155;
}
:root.dark .landing .docs-body pre {
  background: #020617;
  color: #e2e8f0;
  border-color: #334155;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
:root.dark .landing .docs-body blockquote {
  border-left-color: #60a5fa;
  background: rgba(96, 165, 250, 0.08);
  color: #cbd5e1;
}
:root.dark .landing .docs-body table { border-color: #334155; }
:root.dark .landing .docs-body table th,
:root.dark .landing .docs-body table td { border-color: #334155; }
:root.dark .landing .docs-body table th {
  background: rgba(96, 165, 250, 0.15);
  color: #f1f5f9;
}
:root.dark .landing .docs-body table tbody tr:nth-child(even) { background: rgba(148, 163, 184, 0.04); }
:root.dark .landing .docs-body table tbody tr:hover { background: rgba(96, 165, 250, 0.08); }
:root.dark .landing .docs-body hr { border-color: #334155; }
:root.dark .landing .docs-body img { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4); }

/* === 搜索结果描述（v-html 渲染） === */
:root.dark .landing .result-description a { color: #60a5fa; border-bottom-color: rgba(96, 165, 250, 0.45); }
:root.dark .landing .result-description a:hover { color: #93c5fd; }
:root.dark .landing .result-description code { background: #172033; color: #fca5a5; border-color: #334155; }
:root.dark .landing .result-description strong { color: #f1f5f9; }
:root.dark .landing .result-description .desc-empty { color: #94a3b8; }

/* ============== 前台被后台关闭后：完全空白容器（保持主题背景色，不展示任何内容） ============== */
.landing-closed-empty {
  min-height: 100vh;
  background: #f7f9fc;
}
:root.dark .landing-closed-empty {
  background: #0b1220;
}
</style>

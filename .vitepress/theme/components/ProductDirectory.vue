<script setup>
// 产品目录：清单来自 data/products.json，摘要与版本来自各产品内容包，标题来自 data/site.json。
// 组件不携带任何对外文案；图标文件缺失时回落字母标记，不显示破图。
import { onMounted, ref } from 'vue'
import registry from '../../../data/products.json'
import site from '../../../data/site.json'
import { useProductContent } from '../composables/useContent.js'

const STATUS_LABEL = { dormant: '低频更新', maintenance: '维护中', unreleased: '未发布' }
const ACTION_LABEL = {
  manual: '下载',
  'browser-auto': '安装',
  'built-in-updater': '安装',
  'continuous-deploy': '访问',
  none: '获取'
}

function monogram(name) {
  return [...name].find((ch) => /[A-Za-z]/.test(ch))?.toUpperCase() ?? name.slice(0, 1)
}

function links(product) {
  const base = `/${product.id}/`
  const sections = product.sections ?? []
  const out = [{ text: '概览', link: base }]
  const entry = ['install', 'quickstart', 'config'].find((s) => sections.includes(s))
  if (entry) out.push({ text: ACTION_LABEL[product.updateMechanism] ?? '开始使用', link: `${base}${entry}` })
  if (sections.includes('features')) out.push({ text: '功能', link: `${base}features` })
  if (sections.includes('changelog')) out.push({ text: '更新说明', link: `${base}changelog` })
  return out
}

const cards = registry.products
  .filter((p) => p.visibility !== 'internal')
  .map((p) => {
    const content = useProductContent(p.id).value
    return {
      ...p,
      tagline: content?.copy?.['overview.title']?.default ?? null,
      summary: content?.copy?.['overview.summary']?.default ?? null,
      factor: content?.facts?.['form.factor']?.value ?? null,
      scope: content?.facts?.['form.scope']?.value ?? null,
      version: content?.facts?.['version.current']?.value ?? null,
      statusLabel: STATUS_LABEL[p.status] ?? null,
      links: links(p)
    }
  })

// 图标文件还没到位是常态（各产品标记另行生成）：加载失败就切字母标记，不留破图。
// 404 往往在水合之前就发生了，@error 会漏掉，所以挂载时再按 naturalWidth 补判一次。
const brokenLogo = ref({})
const logoEls = {}
function trackLogo(id, el) {
  if (el) logoEls[id] = el
}
onMounted(() => {
  for (const [id, el] of Object.entries(logoEls)) {
    if (el.complete && !el.naturalWidth) brokenLogo.value[id] = true
  }
})
</script>

<template>
  <section id="products" class="hub-directory">
    <h2 class="heading">{{ site.directory.title }}</h2>
    <p class="note">{{ site.directory.note }}</p>

    <div class="grid">
      <a
        v-for="card in cards"
        :key="card.id"
        class="card"
        :href="`/${card.id}/`"
        :style="card.brand?.accent ? { '--accent': card.brand.accent } : undefined"
      >
        <div class="head">
          <img
            v-if="card.brand?.logo && !brokenLogo[card.id]"
            :ref="(el) => trackLogo(card.id, el)"
            class="logo"
            :src="card.brand.logo"
            :alt="card.name"
            loading="lazy"
            @error="brokenLogo[card.id] = true"
          />
          <span v-else class="logo monogram">{{ monogram(card.name) }}</span>
          <div class="heading-text">
            <h3>{{ card.name }}</h3>
            <p v-if="card.tagline" class="tagline">{{ card.tagline }}</p>
          </div>
        </div>

        <p class="summary">{{ card.summary ?? '该产品内容包暂不可用，页面只保留链接目录。' }}</p>

        <p class="scope">{{ card.scope ?? '该产品未登记可用范围' }}</p>

        <p class="meta">
          <span v-if="card.factor" class="chip factor">{{ card.factor }}</span>
          <span v-if="card.version" class="chip">v{{ card.version }}</span>
          <span v-if="card.statusLabel" class="chip muted">{{ card.statusLabel }}</span>
        </p>

        <p class="links">
          <span v-for="link in card.links" :key="link.link" class="link">{{ link.text }}</span>
        </p>
      </a>
    </div>
  </section>
</template>

<style scoped>
.hub-directory {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px 48px;
}
.heading {
  margin: 0;
  font-size: 28px;
  line-height: 36px;
  letter-spacing: -0.2px;
  color: var(--vp-c-text-1);
}
.note {
  margin: 10px 0 28px;
  max-width: 640px;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
/* 整张卡是一个链接：主题给 .vp-doc a 加的下划线与字重会渗进来，这里按更高优先级压掉。 */
.grid .card,
.grid .card * {
  color: inherit;
  font-weight: inherit;
  text-decoration: none;
}
.grid .card:hover .heading-text h3 {
  color: var(--accent, var(--vp-c-brand-1));
}
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.2s, transform 0.2s;
}
.card:hover {
  border-color: var(--accent, var(--vp-c-brand-1));
  transform: translateY(-2px);
  text-decoration: none;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: contain;
  flex-shrink: 0;
}
.monogram {
  display: grid;
  place-items: center;
  background: var(--accent, var(--vp-c-brand-1));
  color: #fff;
  font-size: 20px;
  font-weight: 700;
}
.heading-text h3 {
  margin: 0;
  font-size: 17px;
  line-height: 24px;
  letter-spacing: 0;
  color: var(--vp-c-text-1);
}
.tagline {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.summary {
  margin: 0;
  flex: 1;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}
.scope {
  margin: 0;
  font-size: 12.5px;
  line-height: 20px;
  color: var(--vp-c-text-3);
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
}
.chip.muted {
  color: var(--vp-c-text-3);
}
.chip.factor {
  border: 1px solid var(--accent, var(--vp-c-brand-1));
  background: transparent;
  color: var(--accent, var(--vp-c-brand-1));
  font-weight: 600;
}
.grid .links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 0;
  font-size: 13px;
  color: var(--vp-c-brand-1);
}
@media (max-width: 768px) {
  .hub-directory {
    padding: 0 24px 32px;
  }
}
</style>

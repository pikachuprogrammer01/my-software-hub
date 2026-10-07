<script setup>
// 版本号与下载直链只来自线上 update.json 快照（.vitepress/release.json 由构建期同步写入），
// 且快照只属于它声明的那一个产品：别的产品不能借用它的直链。
import { computed } from 'vue'
import release from '../../release.json'
import registry from '../../../data/products.json'
import { useProductContent } from '../composables/useContent.js'

const props = defineProps({
  productId: { type: String, default: 'table-flow' },
  variant: { type: String, default: 'block' }
})

const content = useProductContent(props.productId)
const product = registry.products.find((item) => item.id === props.productId)
// 旧快照没有 product 字段时视为不可比，避免把 table-flow 的直链发给别的产品。
const directLink = release.product === props.productId && release.version && release.url ? release : null
const builtInUpdater = product?.updateMechanism === 'built-in-updater'
const version = computed(() => content.value?.facts?.['version.current']?.value)
// 未接发布基础设施的产品（updateMechanism: none）只给「获取方式」，不承诺任何更新提示；
// 直链与措辞同样来自内容包，组件不写死 URL 也不写死文案。
// 有 Releases 的取 releasesUrl，只有源码仓的取 repoUrl。
const download = computed(() => {
  const url = content.value?.facts?.['download.releasesUrl']?.value ?? content.value?.facts?.['download.repoUrl']?.value
  if (!url) return null
  return { url, label: content.value?.copy?.['download.label']?.default, note: content.value?.copy?.['download.note']?.default }
})
</script>

<template>
  <div class="release" :class="variant">
    <template v-if="builtInUpdater">
      <p class="notes">
        <template v-if="version">当前版本 v{{ version }}。</template>
        新版本由应用内更新器检查并提示；首次安装请前往安装页获取对应平台的 ZIP。
      </p>
      <p v-if="content?.update?.summary" class="notes">{{ content.update.summary }}</p>
      <p v-else class="warn">该产品内容包暂不可用，更新说明无法显示。</p>
    </template>

    <template v-else-if="directLink">
      <a class="vp-btn" :href="directLink.url" target="_blank" rel="noopener">
        免费下载 v{{ directLink.version }}
      </a>
      <p v-if="content?.update?.summary || directLink.notes" class="notes">
        {{ content?.update?.summary || directLink.notes }}
      </p>
      <p v-if="directLink.fetchedAt" class="fetched">
        版本信息取自扩展同款更新清单（同步于 {{ directLink.fetchedAt.slice(0, 10) }}）
      </p>
    </template>

    <template v-else-if="download">
      <a class="vp-btn" :href="download.url" target="_blank" rel="noopener">
        {{ download.label }}
      </a>
      <p v-if="download.note" class="notes">{{ download.note }}</p>
      <p v-if="content?.facts?.['verifiedAt']?.value" class="fetched">
        本页事实人工核对于 {{ content.facts['verifiedAt'].value }}
      </p>
    </template>

    <template v-else>
      <p class="warn">
        <template v-if="version">当前版本 v{{ version }}。</template>
        该产品既没有可用的更新清单快照，也没有登记获取地址，因此本页不显示下载按钮。
      </p>
      <p v-if="!content" class="warn">该产品内容包暂不可用。</p>
    </template>
  </div>
</template>

<style scoped>
.release {
  margin: 18px 0 8px;
}
.vp-btn {
  display: inline-block;
  padding: 8px 18px;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}
.vp-btn:hover {
  text-decoration: none;
  opacity: 0.92;
}
.notes {
  margin: 10px 0 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}
.fetched {
  margin: 6px 0 0;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}
.warn {
  color: var(--vp-c-warning-1);
}
</style>

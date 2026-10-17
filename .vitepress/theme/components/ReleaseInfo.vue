<script setup>
// 下载直链只来自内容包 facts：源里是 {version} 模板，构建期由线上 update.json 的快照
// 填充版本号后写进内容包，组件既不写死 URL 也不写死版本号。
import { computed } from 'vue'
import registry from '../../../data/products.json'
import { useProductContent } from '../composables/useContent.js'

const props = defineProps({
  productId: { type: String, default: 'table-flow' },
  variant: { type: String, default: 'block' }
})

const content = useProductContent(props.productId)
const product = registry.products.find((item) => item.id === props.productId)
// 有更新清单快照的产品（manual 更新方式）给最新版直链按钮。
const directLink = computed(() => {
  const url = content.value?.facts?.['download.zipUrl']?.value
  return url ? { url } : null
})
const builtInUpdater = product?.updateMechanism === 'built-in-updater'
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
        新版本由应用内更新器检查并提示；首次安装请前往安装页获取对应平台的 ZIP。
      </p>
      <p v-if="content?.update?.summary" class="notes">{{ content.update.summary }}</p>
      <p v-else class="warn">该产品内容包暂不可用，更新说明无法显示。</p>
    </template>

    <template v-else-if="directLink">
      <a class="vp-btn" :href="directLink.url" target="_blank" rel="noopener">
        免费下载 latest
      </a>
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

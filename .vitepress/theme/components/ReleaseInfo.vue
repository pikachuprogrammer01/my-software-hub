<script setup>
// 版本号与下载直链只来自线上 update.json（.vitepress/release.json 由构建期同步写入），
// 页面文案一律写在 markdown 里，本组件不承载任何产品介绍文字。
import release from '../../release.json'

const contentPackages = import.meta.glob('../../../data/generated/*/content-latest.v1.json', {
  eager: true,
  import: 'default'
})

const props = defineProps({
  productId: { type: String, default: 'table-flow' },
  variant: { type: String, default: 'block' }
})

const contentEntry = Object.entries(contentPackages).find(([file]) =>
  file.endsWith(`/${props.productId}/content-latest.v1.json`)
)
const productContent = contentEntry?.[1]
const ready = Boolean(release.version && release.url)
</script>

<template>
  <div class="release" :class="variant">
    <template v-if="ready">
      <a class="vp-btn" :href="release.url" target="_blank" rel="noopener">
        免费下载 v{{ release.version }}
      </a>
      <p v-if="productContent?.update?.summary || release.notes" class="notes">
        {{ productContent?.update?.summary || release.notes }}
      </p>
      <p v-if="release.fetchedAt" class="fetched">
        版本信息取自扩展同款更新清单（同步于 {{ release.fetchedAt.slice(0, 10) }}）
      </p>
      <p v-if="productContent?.contentRevision" class="fetched">
        内容 revision：{{ productContent.contentRevision }}
      </p>
    </template>
    <template v-else>
      <p class="warn">下载地址暂未同步，请稍后再试或查看发布仓 Releases 页。</p>
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

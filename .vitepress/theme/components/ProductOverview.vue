<script setup>
// 产品首页概览：标题/摘要/更新摘要全部来自该产品的内容包，组件不携带任何文案。
import { useProductContent } from '../composables/useContent.js'

const props = defineProps({ productId: { type: String, required: true } })
const content = useProductContent(props.productId)
</script>

<template>
  <div v-if="content" class="product-overview">
    <p v-if="content.copy?.['overview.title']?.default" class="title">{{ content.copy['overview.title'].default }}</p>
    <p class="summary">{{ content.copy?.['overview.summary']?.default }}</p>
    <p class="revision">内容 revision：{{ content.contentRevision }}</p>
  </div>
  <p v-else class="warn">该产品内容包暂不可用，页面只保留链接目录。</p>
</template>

<style scoped>
.title {
  font-weight: 600;
}
.summary {
  font-size: 1.1rem;
  margin: 0;
}
.revision {
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
}
.warn {
  color: var(--vp-c-warning-1);
}
</style>

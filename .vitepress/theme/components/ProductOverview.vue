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
    <dl v-if="content.facts?.['form.factor'] || content.facts?.['form.scope']" class="scope">
      <div v-if="content.facts?.['form.factor']" class="row">
        <dt>形态</dt>
        <dd>{{ content.facts['form.factor'].value }}</dd>
      </div>
      <div v-if="content.facts?.['form.scope']" class="row">
        <dt>可用范围</dt>
        <dd>{{ content.facts['form.scope'].value }}</dd>
      </div>
    </dl>
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
.scope {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 18px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
}
.row dt {
  flex-shrink: 0;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}
.row dd {
  margin: 0;
  font-size: 0.92rem;
  line-height: 24px;
  color: var(--vp-c-text-1);
}
.revision {
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
}
.warn {
  color: var(--vp-c-warning-1);
}
</style>

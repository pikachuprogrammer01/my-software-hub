<script setup>
const props = defineProps({ productId: { type: String, required: true } })
const packages = import.meta.glob('../../../data/generated/*/content-latest.v1.json', { eager: true, import: 'default' })
const entry = Object.entries(packages).find(([file]) => file.endsWith(`/${props.productId}/content-latest.v1.json`))
const content = entry?.[1]
const copy = content?.copy ?? {}
const facts = content?.facts ?? {}
const text = (id) => copy[id]?.default ?? ''
const monthly = facts['pricing.pro.monthly']
</script>

<template>
  <div v-if="content" class="product-overview">
    <p class="summary">{{ text('overview.summary') }}</p>
    <p v-if="monthly" class="fact">Pro 月付：{{ monthly.value }} {{ monthly.currency }}</p>
    <p class="revision">内容 revision：{{ content.contentRevision }} · 生成于 {{ content.generatedAt.slice(0, 10) }}</p>
  </div>
  <p v-else class="warn">该产品内容包暂不可用。</p>
</template>

<style scoped>
.summary { font-size: 1.1rem; }
.fact { color: var(--vp-c-text-2); }
.revision { color: var(--vp-c-text-3); font-size: 0.8rem; }
.warn { color: var(--vp-c-warning-1); }
</style>

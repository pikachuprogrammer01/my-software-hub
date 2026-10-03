<script setup>
// 承重事实（价格/版本/上限）只从内容包渲染：markdown 里写 <Fact> 占位符，
// 页面不再抄一遍数字，价格改动只需要改内容源一处。
import { computed } from 'vue'
import { useProductContent } from '../composables/useContent.js'

const props = defineProps({
  product: { type: String, required: true },
  id: { type: String, required: true },
  prefix: { type: String, default: '' },
  suffix: { type: String, default: '' },
  withPeriod: { type: Boolean, default: false }
})

const content = useProductContent(props.product)
const fact = computed(() => content.value?.facts?.[props.id])
const currencySign = { CNY: '¥' }
const periodLabel = { month: '月付', year: '年付' }

const text = computed(() => {
  const value = fact.value?.value
  if (value === undefined || value === null) return null
  const sign = fact.value?.currency ? currencySign[fact.value.currency] ?? `${fact.value.currency} ` : ''
  const period = props.withPeriod && fact.value?.period ? periodLabel[fact.value.period] ?? fact.value.period : ''
  return `${props.prefix}${sign}${value}${period}${fact.value?.unit ? ` ${fact.value.unit}` : ''}${props.suffix}`
})
</script>

<template>
  <span v-if="text !== null" class="fact" :data-content-revision="content?.contentRevision">{{ text }}</span>
  <span v-else class="fact-missing">（{{ id }} 暂不可用）</span>
</template>

<style scoped>
.fact-missing {
  color: var(--vp-c-warning-1);
  font-size: 0.85em;
}
</style>

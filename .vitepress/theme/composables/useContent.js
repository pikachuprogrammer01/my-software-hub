import { computed } from 'vue'

const packages = import.meta.glob('../../../data/generated/*/content-latest.v1.json', {
  eager: true,
  import: 'default'
})

/** 内容包按产品取；取不到就是取不到，不许回落到别的产品兜底。 */
export function useProductContent(productId) {
  return computed(() => {
    const entry = Object.entries(packages).find(([file]) => file.endsWith(`/${productId}/content-latest.v1.json`))
    return entry?.[1] ?? null
  })
}

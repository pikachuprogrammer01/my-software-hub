import { parseArgs, flagValue } from './lib/args.mjs'
import { readRegistry, readSource, validateRegistry, validateSource } from './content-lib.mjs'

const { flags } = parseArgs()
const only = flagValue(flags, 'product')

const registry = readRegistry()
const registryCheck = validateRegistry(registry)
if (!registryCheck.ok) {
  console.error('❌ data/products.json 不符合 products.v1 schema')
  for (const error of registryCheck.errors) console.error(`   ${error}`)
  process.exit(1)
}
console.log(`  ✅ data/products.json 通过 products.v1 schema（${registry.products.length} 个产品）`)

if (only && !registry.products.some((item) => item.id === only)) {
  console.error(`❌ 未知产品：${only}`)
  process.exit(2)
}

let failures = 0
for (const product of registry.products.filter((item) => !only || item.id === only)) {
  if (!product.contentSource) {
    console.log(`  ⏭️ ${product.id}: 尚无结构化内容源（manual/待接入）`)
    continue
  }
  try {
    const { source } = readSource(product.id)
    const result = validateSource(source, product)
    if (result.ok) console.log(`  ✅ ${product.id}: 内容源通过`)
    else {
      failures += 1
      console.error(`  ❌ ${product.id}:\n    ${result.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n    ')}`)
    }
  } catch (error) {
    failures += 1
    console.error(`  ❌ ${product.id}: ${error.message}`)
  }
}

console.log(`\n内容源校验：${failures ? '失败' : '通过'}`)
if (failures) process.exit(1)

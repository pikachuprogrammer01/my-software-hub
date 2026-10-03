import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { SITE_ROOT, readRegistry, readSource, validateSource } from './content-lib.mjs'

const only = process.argv.find((arg) => arg.startsWith('--product='))?.split('=')[1]
const registry = readRegistry()
const registrySchema = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'schema', 'products.v1.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
const validRegistry = ajv.compile(registrySchema)(registry)
if (!validRegistry) {
  console.error('❌ data/products.json 不符合 products.v1 schema')
  for (const error of ajv.errors ?? []) console.error(`   ${error.instancePath || '/'} ${error.message}`)
  process.exit(1)
}
if (new Set(registry.products.map((item) => item.id)).size !== registry.products.length) {
  console.error('❌ data/products.json 存在重复产品 ID')
  process.exit(1)
}
const products = registry.products.filter((item) => !only || item.id === only)
let failures = 0
for (const product of products) {
  if (!product.contentSource) { console.log(`  ⏭️ ${product.id}: 尚无结构化内容源（manual/待接入）`); continue }
  try {
    const { source } = readSource(product.id)
    const result = validateSource(source, product)
    if (result.ok) console.log(`  ✅ ${product.id}: 内容源通过`)
    else { failures++; console.error(`  ❌ ${product.id}:\n    ${result.errors.map((e) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n    ')}`) }
  } catch (error) { failures++; console.error(`  ❌ ${product.id}: ${error.message}`) }
}
console.log(`\n内容源校验：${failures ? '失败' : '通过'}`)
if (failures) process.exit(1)

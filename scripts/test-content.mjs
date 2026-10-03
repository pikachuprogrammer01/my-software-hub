import assert from 'node:assert/strict'
import { packageFromSource, readRegistry, readSource, validateSource } from './content-lib.mjs'

const registry = readRegistry()
const tableFlow = registry.products.find((item) => item.id === 'table-flow')
const { source } = readSource('table-flow')
assert.equal(validateSource(source, tableFlow).ok, true)

const first = packageFromSource(source, tableFlow)
const second = packageFromSource(source, tableFlow)
assert.equal(first.sha256, second.sha256, '相同内容的 hash 必须稳定')
assert.equal(first.contentRevision, second.contentRevision, '相同内容的 revision 必须稳定')

const factVariant = structuredClone(source)
factVariant.facts['pricing.pro.monthly'].variants = { 'table-flow-panel': 6 }
assert.equal(validateSource(factVariant, tableFlow).ok, false, 'facts 不得出现渠道变体')

const wrongProduct = structuredClone(source)
wrongProduct.product = 'wps-enhancer'
assert.equal(validateSource(wrongProduct, tableFlow).ok, false, '产品 ID 不匹配必须失败')

const html = structuredClone(source)
html.copy['overview.summary'].default = '<b>不允许 HTML</b>'
assert.equal(validateSource(html, tableFlow).ok, false, '内容包不得包含 HTML')

console.log('✅ 内容一致性单元测试通过')

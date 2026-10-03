import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SITE_ROOT, connectedProducts, payloadHash, readJson, semanticPayload } from './content-lib.mjs'
import { assertFixture } from './conformance-lib.mjs'

/** 跑 conformance 夹具：客户端按这张期望表实现，规则与夹具不同步时这里先红。 */
const FIXTURE_DIR = path.join(SITE_ROOT, 'conformance', 'fixtures')
if (!fs.existsSync(FIXTURE_DIR)) {
  console.error('❌ 缺少 conformance/fixtures，请先执行 node scripts/conformance-fixtures.mjs')
  process.exit(1)
}

const registry = Object.fromEntries(readJson(path.join(SITE_ROOT, 'data', 'products.json')).products.map((item) => [item.id, item]))
const computeHash = (pkg) => payloadHash(semanticPayload(pkg))
const names = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json')).sort()
const passed = []
const failures = []

for (const name of names) {
  const fixture = readJson(path.join(FIXTURE_DIR, name))
  const ownProduct = fixture.context?.ownProduct ?? fixture.input?.product ?? 'table-flow'
  const context = {
    ownProduct,
    budget: registry[ownProduct]?.budget,
    updateMechanism: fixture.context?.updateMechanism ?? registry[ownProduct]?.updateMechanism,
    cachedRevision: fixture.context?.cachedRevision ?? null,
    fallback: fixture.context?.fallback ?? null,
    releaseManifest: fixture.context?.releaseManifest ?? null,
    computeHash: fixture.context?.skipSha ? undefined : computeHash
  }
  try {
    const actual = assertFixture(fixture, context)
    if (fixture.expect.kind === 'discard' || fixture.expect.kind === 'fallback_offline') {
      assert.ok(actual.reason, `${name}: 被丢弃必须有原因，不能统一 return null`)
    }
    assert.ok(!JSON.stringify(actual).includes('<'), `${name}: 渲染结果里出现了 HTML`)
    passed.push(name)
    console.log(`  ✅ ${name} → ${actual.kind}${actual.warnings.length ? `（${actual.warnings.length} 条告警）` : ''}`)
  } catch (error) {
    failures.push({ name, error: error.message })
    console.error(`  ❌ ${name}: ${error.message}`)
  }
}

await checkFixtureIntegrity()

async function checkFixtureIntegrity() {
  const expected = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'conformance', 'fixtures', 'normal-table-flow.json'), 'utf8'))
  const current = readJson(path.join(SITE_ROOT, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  assert.equal(expected.input.contentRevision, current.contentRevision, '夹具还停在旧内容包上，请重新生成夹具')
  const products = new Set(names.map((name) => (name.startsWith('wps-') ? 'wps-enhancer' : 'table-flow')))
  assert.equal(products.has('wps-enhancer'), true, '缺少 WPS Enhancer 夹具')
  assert.equal(names.length >= 12, true, `夹具数量不足：${names.length}`)
  void connectedProducts
}

console.log(`\n客户端一致性夹具：${passed.length}/${names.length} 通过`)
if (failures.length) {
  for (const item of failures) console.error(`   · ${item.name}`)
  process.exit(1)
}
console.log('✅ 消费规则与夹具期望一致')

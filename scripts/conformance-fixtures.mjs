import fs from 'node:fs'
import path from 'node:path'
import { SITE_ROOT, generatedPaths, readJson } from './content-lib.mjs'
import { parseArgs } from './lib/args.mjs'

/**
 * 从真实内容包派生 conformance 夹具：客户端团队拿到的是能直接跑的期望表，
 * 而不是"请自行构造异常"。加 --check 时只校验已入库夹具是否仍与内容包一致。
 */
const FIXTURE_DIR = path.join(SITE_ROOT, 'conformance', 'fixtures')
const checkOnly = Boolean(parseArgs().flags.check)
const tableFlow = readJson(generatedPaths('table-flow').latest)
const wps = readJson(generatedPaths('wps-enhancer').latest)

const clone = (value) => structuredClone(value)
/** 夹具只锁语义字段：generatedAt / sourceRevision 每次构建都会变，抄进去就成了假漂移。 */
const sample = (value) => {
  const { generatedAt, sourceRevision, ...rest } = structuredClone(value)
  void generatedAt
  void sourceRevision
  return rest
}

const fixtures = [
  {
    name: 'normal-table-flow',
    note: '正常内容包：四层文案各取所需，缓存 key 用 version、失效靠 contentRevision。',
    input: sample(tableFlow),
    context: { cachedRevision: 'content-older00000', releaseManifest: { url: 'https://example.invalid/table-flow.zip' } },
    expect: { kind: 'render', revision: tableFlow.contentRevision, badge: tableFlow.update.badge, summary: tableFlow.update.summary, downloadPathShown: true }
  },
  {
    name: 'same-revision-no-refetch',
    note: 'ETag/revision 未变：判为"已是最新"，不得再显示更新提示。',
    input: sample(tableFlow),
    context: { cachedRevision: tableFlow.contentRevision },
    expect: { kind: 'unchanged', observed: 'latest' }
  },
  {
    name: 'wrong-product',
    note: 'URL 配错串到别的产品：丢弃并回退内置快照，不渲染。',
    input: { ...sample(tableFlow), product: 'wps-enhancer' },
    context: { ownProduct: 'table-flow', fallback: sample(tableFlow) },
    expect: { kind: 'discard', observed: 'format', offlineCopy: true, reason: 'product=wps-enhancer 与自身 table-flow 不符' }
  },
  {
    name: 'sha-mismatch',
    note: '发布副本被改过：SHA 对不上语义内容，必须丢弃而不是照渲染。',
    input: { ...sample(tableFlow), facts: { ...sample(tableFlow).facts, 'pricing.pro.monthly': { ...sample(tableFlow).facts['pricing.pro.monthly'], value: 99 } } },
    context: { ownProduct: 'table-flow', fallback: sample(tableFlow) },
    expect: { kind: 'discard', observed: 'format', offlineCopy: true, reason: '内容包 SHA-256 与语义内容不符' }
  },
  {
    name: 'network-failure',
    note: '拉取失败：用内置兜底快照并标注离线副本，不得静默消失（MUST 4/7）。',
    input: null,
    context: { ownProduct: 'table-flow', fallback: sample(tableFlow) },
    expect: { kind: 'fallback_offline', observed: 'network', offlineCopy: true, badge: tableFlow.update.badge }
  },
  {
    name: 'missing-optional-fields',
    note: '只有必需字段也可渲染：update.detail 等可选项缺失不影响其余层。',
    input: { schema: 1, product: 'table-flow', contentRevision: 'content-abcdef012345', sha256: null, facts: {}, update: { badge: '小更新', summary: '修了几处' } },
    context: { ownProduct: 'table-flow', skipSha: true },
    expect: { kind: 'render', badge: '小更新', summary: '修了几处', text: null, detail: null }
  },
  {
    name: 'unknown-enum-fallback',
    note: '未知 status 值：回落通用样式，禁止抛异常或整块不渲染（律 3）。',
    input: { ...sample(tableFlow), facts: { ...sample(tableFlow).facts, 'features.newThing': { status: 'sunset', effectiveFromVersion: '1.7.0' } }, sha256: null },
    context: { ownProduct: 'table-flow', skipSha: true },
    expect: { kind: 'render', warnings: ['未知 status=sunset'] }
  },
  {
    name: 'over-budget-summary',
    note: '超出面板 summary 预算（26）：这一层留空，不做截断——切半句比不显示更糟。',
    input: { ...sample(tableFlow), update: { ...sample(tableFlow).update, summary: '超'.repeat(40) }, sha256: null },
    context: { ownProduct: 'table-flow', skipSha: true },
    expect: { kind: 'render', summary: null, warnings: ['超过预算 26'] }
  },
  {
    name: 'html-in-copy',
    note: '文案混进 HTML：客户端只渲染纯文本，该层忽略。',
    input: { ...sample(tableFlow), update: { ...sample(tableFlow).update, text: '<b>加粗</b> 更新说明' }, sha256: null },
    context: { ownProduct: 'table-flow', skipSha: true },
    expect: { kind: 'render', text: null, warnings: ['含 HTML'] }
  },
  {
    name: 'higher-schema-version',
    note: 'schema 高于已知版本：按已知版本尽力渲染并告警，不得崩。',
    input: { ...sample(tableFlow), schema: 2, sha256: null },
    context: { ownProduct: 'table-flow', skipSha: true },
    expect: { kind: 'render_with_warning', schemaWarning: true, warnings: ['高于已知版本'] }
  },
  {
    name: 'facts-channel-variant',
    note: 'facts 里出现渠道变体属上游违约：忽略变体只取共享值，不因此不渲染。',
    input: { ...sample(tableFlow), facts: { ...sample(tableFlow).facts, 'pricing.pro.monthly': { ...sample(tableFlow).facts['pricing.pro.monthly'], variants: { 'table-flow-panel': 4 } } }, sha256: null },
    context: { ownProduct: 'table-flow', skipSha: true },
    expect: { kind: 'render', warnings: ['带渠道变体，已忽略'] }
  },
  {
    name: 'wps-long-text-settings',
    note: 'WPS 设置页允许较长文本（预算 300），仍不渲染 HTML。',
    input: sample(wps),
    context: { ownProduct: 'wps-enhancer', budgetKey: 'wps-enhancer', cachedRevision: 'content-older11111' },
    expect: { kind: 'render', revision: wps.contentRevision, summary: wps.update.summary }
  },
  {
    name: 'wps-no-second-upgrade-path',
    note: 'built-in-updater 产品：即使内容包/清单里带下载地址，也不显示第二条升级路径。',
    input: { ...sample(wps), url: 'https://example.invalid/wps.zip', sha256: null },
    context: { ownProduct: 'wps-enhancer', budgetKey: 'wps-enhancer', updateMechanism: 'built-in-updater', skipSha: true, releaseManifest: { url: 'https://example.invalid/wps.zip' } },
    expect: { kind: 'render', downloadPathShown: false, warnings: ['忽略内容包内的下载地址'] }
  }
]

if (checkOnly) {
  const onDisk = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json')).sort()
  const expected = fixtures.map((item) => `${item.name}.json`).sort()
  if (JSON.stringify(onDisk) !== JSON.stringify(expected)) {
    console.error(`❌ 夹具文件清单与生成规则不一致\n   磁盘：${onDisk.join(', ')}\n   期望：${expected.join(', ')}`)
    process.exit(1)
  }
  for (const item of fixtures) {
    const { subject, ...storedBody } = readJson(path.join(FIXTURE_DIR, `${item.name}.json`))
    void subject
    if (JSON.stringify(storedBody) !== JSON.stringify(item)) {
      console.error(`❌ 夹具内容漂移：${item.name}.json（请重新生成并提交）`)
      process.exit(1)
    }
  }
  console.log(`✅ ${fixtures.length} 个夹具与内容包保持一致`)
  process.exit(0)
}

fs.mkdirSync(FIXTURE_DIR, { recursive: true })
for (const item of fixtures) {
  fs.writeFileSync(path.join(FIXTURE_DIR, `${item.name}.json`), `${JSON.stringify({ ...item, subject: 'data/generated/<product>/content-latest.v1.json' }, null, 2)}\n`)
}
console.log(`✅ 已生成 ${fixtures.length} 个夹具：${path.relative(SITE_ROOT, FIXTURE_DIR)}`)

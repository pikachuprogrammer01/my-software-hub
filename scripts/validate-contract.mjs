import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv/dist/2020.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = path.join(here, '..', 'schema')
const BASE = 'https://gitee.com/pikachuprogrammer01/my-software-releases/raw'

const ajv = new Ajv({ strict: false, allErrors: true })
for (const f of fs.readdirSync(SCHEMA_DIR).filter((x) => x.endsWith('.v1.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8')))
}
const V = (id) => (data) => ajv.validate(id, data)
const check = V('https://gitee.com/pikachuprogrammer01/my-software-releases/schema/manifest.v1.json')
const checkFacts = V('https://gitee.com/pikachuprogrammer01/my-software-releases/schema/facts.v1.json')
const checkNotes = V('https://gitee.com/pikachuprogrammer01/my-software-releases/schema/release-notes.v1.json')
const checkProducts = V('https://gitee.com/pikachuprogrammer01/my-software-releases/schema/products.v1.json')

let pass = 0
const fails = []
function expect(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`) } else { fails.push(name); console.log(`  ❌ ${name} ${extra}`) }
}
function errs() { return ajv.errorsText(ajv.errors, { separator: '; ' }) }

async function live(branch) {
  try {
    const res = await fetch(`${BASE}/${branch}/update.json`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { json: await res.json(), src: '线上' }
  } catch (e) {
    // 离线兜底：2026-10-01 实测抓取的原文，仅用于本地复跑，不当真值
    const cache = {
      'table-flow': { version: '1.6.1', url: 'https://gitee.com/pikachuprogrammer01/my-software-releases/releases/download/table-flow-v1.6.1/table-flow-v1.6.1.zip', notes: 'v1.6.1：修复在线激活码提示『未登记/激活码无效』' },
      'wps-enhancer': { version: '1.1.0', urls: { 'macos-arm64': 'https://gitee.com/pikachuprogrammer01/my-software-releases/releases/download/wps-enhancer-v1.1.0/WPSEnhancer-macos-arm64.zip', 'windows-x86_64': 'https://gitee.com/pikachuprogrammer01/my-software-releases/releases/download/wps-enhancer-v1.1.0/WPSEnhancer-windows-x86_64.zip' }, notes: 'v1.1.0：独立仓首发；更新源切换至 my-software-releases 分支 wps-enhancer' }
    }
    return { json: cache[branch], src: `缓存（拉取失败：${e.message}）` }
  }
}

const STRICT = process.argv.includes('--strict')

console.log('\n【1】存量线上清单必须通过（冻结的成立前提）')
for (const b of ['table-flow', 'wps-enhancer']) {
  const { json, src } = await live(b)
  const ok = check(json)
  if (ok) { expect(`${b}/update.json 通过 manifest.v1（来源：${src}）`, true) }
  else if (src.startsWith('线上') && !STRICT) {
    // 线上真值与 schema 分叉 = 提供方改了形态。按契约只告警不阻断构建，
    // 否则 Gitee 一次格式调整就会砸掉站点发布。
    console.log(`  ⚠️  ${b}/update.json 未通过 manifest.v1（来源：线上）—— ${errs()}`)
    console.log('     按契约第七节：这是兼容性问题，告警不阻断。确认要失败请加 --strict')
  } else { expect(`${b}/update.json 通过 manifest.v1（来源：${src}）`, false, errs()) }
}

console.log('\n【2】破坏性形态必须被拒')
expect('预发布号 1.7.0-beta.1 被拒（护住客户端 parseInt 比较）', !check({ version: '1.7.0-beta.1', url: 'https://x/a.zip' }), errs())
expect('http 明文直链被拒', !check({ version: '1.7.0', url: 'http://x/a.zip' }))
expect('notes 超 200 字被拒', !check({ version: '1.7.0', url: 'https://x/a.zip', notes: '长'.repeat(201) }))
expect('空 urls 映射被拒', !check({ version: '1.7.0', urls: {} }))
expect('url 与 urls 并存被允许（客户端各取所需）', check({ version: '1.7.0', url: 'https://x/a.zip', urls: { 'macos-arm64': 'https://x/b.zip' } }), errs())
expect('无 url/urls 被允许（网站/内部工具无产物，收紧交 lint）', check({ version: '1.7.0' }), errs())

console.log('\n【3】facts.v1：冻结信封、放开载荷')
expect('新增未知 limits 键无需改 schema', checkFacts({
  schema: 1, product: 'table-flow', provenance: 'release-repo',
  limits: { maxPages: { value: 50, unit: '页' }, freePaging: { value: 3 }, brandNewFact: { value: 'x' } }
}), errs())
expect('provenance=manual 缺 verified_at 被拒', !checkFacts({
  schema: 1, product: 'auto-clicker-mac', provenance: 'manual', limits: { minOs: { value: '13.0' } }
}))
expect('manual + verified_at 通过', checkFacts({
  schema: 1, product: 'auto-clicker-mac', provenance: 'manual', verified_at: '2026-10-01',
  limits: { minOs: { value: '13.0' } }, pricing: [{ plan: 'free', amount: 0, currency: 'CNY', period: 'none', since: '1.0.0' }]
}), errs())
expect('涨价可表达为多条 pricing（¥4→¥5）', checkFacts({
  schema: 1, product: 'table-flow', provenance: 'release-repo', limits: { maxPages: { value: 50 } },
  pricing: [
    { plan: 'pro-month', amount: 4, currency: 'CNY', period: 'month', since: '1.3.0', until: '1.5.0' },
    { plan: 'pro-month', amount: 5, currency: 'CNY', period: 'month', since: '1.5.0' }
  ]
}), errs())

console.log('\n【4】release-notes.v1：append-only 与未知值容忍')
expect('未知 kind 通过校验（新增 kind 属兼容变更）', checkNotes({
  schema: 1, product: 'table-flow',
  releases: [{ version: '1.7.0', changes: [{ kind: 'deprecate', text: '某能力下线' }] }]
}), errs())
expect('未知 asset channel 通过校验', checkNotes({
  schema: 1, product: 'wps-enhancer',
  releases: [{ version: '1.2.0', assets: [{ channel: 'flatpak', url: 'https://x.flatpak' }] }]
}), errs())
expect('分层文案四层齐备通过', checkNotes({
  schema: 1, product: 'table-flow', revision: '2026-10-01a', latest: '1.6.1',
  releases: [{
    version: '1.6.1', published_at: '2026-09-26', badge: '激活修复', summary: '修复在线激活码提示未登记',
    title: '在线激活修复与免费额度加固',
    changes: [{ kind: 'fix', tier: 'all', breaking: false, text: '激活码按粘贴原文透传', detail: '仅站点渲染的长文说明……' }]
  }]
}), errs())
expect('changes 缺 kind 被拒', !checkNotes({ schema: 1, product: 'x', releases: [{ version: '1.0.0', changes: [{ text: 'a' }] }] }))

console.log('\n【5】products.v1：五产品真实注册表')
const registry = {
  schema: 1,
  products: [
    { id: 'table-flow', name: 'TableFlow', kind: 'browser-extension', visibility: 'featured', status: 'released', factsSource: 'release-repo', releaseBranch: 'table-flow', updateMechanism: 'manual', sections: ['overview', 'features', 'scope', 'install', 'update', 'pricing', 'changelog', 'faq', 'privacy'], budget: { badge: 12, summary: 26, text: 120 } },
    { id: 'wps-enhancer', name: 'WPS Enhancer', kind: 'desktop-app', visibility: 'listed', status: 'released', factsSource: 'release-repo', releaseBranch: 'wps-enhancer', updateMechanism: 'built-in-updater', sections: ['overview', 'features', 'system-requirements', 'install', 'update', 'changelog', 'faq', 'privacy'], budget: { badge: 12, summary: 60, text: 300 } },
    { id: 'auto-clicker-mac', name: 'Auto Clicker', kind: 'desktop-app', visibility: 'listed', status: 'dormant', factsSource: 'manual', releaseBranch: null, updateMechanism: 'none', sections: ['overview', 'install', 'changelog'], budget: { badge: 10, summary: 20, text: 60 } },
    { id: 'qoder-proxy', name: 'Qoder Proxy', kind: 'local-app-web-ui', visibility: 'listed', status: 'released', factsSource: 'manual', releaseBranch: null, updateMechanism: 'none', sections: ['overview', 'quickstart', 'config', 'changelog'], budget: { badge: 12, summary: 80, text: 2000 } },
    { id: 'automation', name: 'Automation', kind: 'internal', visibility: 'internal', status: 'maintenance', factsSource: 'manual', releaseBranch: null, updateMechanism: 'none', sections: ['overview'], budget: { badge: 12, summary: 40, text: 200 } }
  ]
}
expect('五产品注册表通过', checkProducts(registry), errs())
expect('未知 kind 通过（站点须回落通用模板）', checkProducts({ schema: 1, products: [{ ...registry.products[0], id: 'zephyr', kind: 'firmware-tool' }] }), errs())
expect('缺 updateMechanism 被拒', !checkProducts({ schema: 1, products: [{ id: 'x', name: 'X', kind: 'cli', visibility: 'listed', sections: ['overview'] }] }))
expect('id 含大写被拒（它是 URL 前缀）', !checkProducts({ schema: 1, products: [{ ...registry.products[0], id: 'TableFlow' }] }))

console.log(`\n${fails.length ? '❌' : '✅'} ${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { for (const f of fails) console.log(`   · ${f}`); process.exit(1) }

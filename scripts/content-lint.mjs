import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GENERATED_DIR, PRODUCTS_DIR, SITE_ROOT, connectedProducts, readJson, readRegistry } from './content-lib.mjs'

/**
 * 「当前态 / 历史态」分区 lint（PRODUCTS.md 第四节、CONTRACT.md 第六节）。
 * 只校已登记事实：未登记的裸数字不在这里判失败，而是由报告列出等人工确认，
 * 因为给一个查不到生效版本的事实编造 effectiveFromVersion 比留着更糟。
 */
const CURRENT = ['index.md', 'products']
// 发布面与 config.mts 的白名单一致：只有首页与 products/ 会成页。
const PUBLISHED = (rel) => rel === 'index.md' || rel.startsWith('products/')
const HISTORY_DIRS = ['docs']
// 每个产品都有自己的更新日志，按文件名判定，不能只认根目录那一个大写文件。
const HISTORY_FILE = /^changelog\.md$/i
const VERSION = /^\d+\.\d+\.\d+$/
const VERSION_GUARD = /(?<![\d.])\d+\.\d+\.\d+(?![\d.])/g

const packages = new Map()
for (const product of connectedProducts()) {
  const file = path.join(GENERATED_DIR, product.id, 'content-latest.v1.json')
  if (fs.existsSync(file)) packages.set(product.id, readJson(file))
}

/**
 * 逐字副本登记表：这些 md 与开发仓字节一致，不能塞占位符，所以豁免当前态 lint；
 * 作为交换，站地点必须仍是登记过的那一份——在这里被手改就是破坏单一来源。
 */
const mirrorsPath = path.join(SITE_ROOT, 'data/mirrors.json')
const mirrors = fs.existsSync(mirrorsPath) ? readJson(mirrorsPath).mirrors ?? [] : []
const MIRROR_PATHS = new Set(mirrors.map((m) => m.site))

function collectMarkdown(dir) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    if (name === 'node_modules' || name === '.vitepress' || name === 'dist') continue
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) out.push(...collectMarkdown(abs))
    else if (name.endsWith('.md')) out.push(path.relative(SITE_ROOT, abs))
  }
  return out
}

function inStrictZone(rel) {
  if (MIRROR_PATHS.has(rel)) return false
  if (HISTORY_FILE.test(path.basename(rel))) return false
  if (HISTORY_DIRS.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) return false
  return CURRENT.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
}

function stripFrontMatter(raw) {
  const block = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw)
  return block ? raw.replace(block[0], block[0].replace(/[^\n]/g, ' ')) : raw
}

/** 已登记事实的字面量：价格、带单位的上限、版本号。 */
function factPatterns() {
  const patterns = []
  for (const [product, pkg] of packages) {
    for (const [id, fact] of Object.entries(pkg.facts ?? {})) {
      if (fact?.value === undefined || fact.value === null) continue
      if (fact.currency) patterns.push({ label: `${product}/${id}`, re: /¥\s*\d+(\.\d+)?/g })
      else if (fact.unit) patterns.push({ label: `${product}/${id}`, re: new RegExp(`${fact.value}\\s*${fact.unit}`, 'g') })
      else if (typeof fact.value === 'string' && VERSION.test(fact.value)) {
        patterns.push({ label: `${product}/${id}`, re: new RegExp(`v?${fact.value.replace(/\./g, '\\.')}`, 'g') })
      }
    }
  }
  // 前后都不许再粘数字或点：否则 127.0.0.1 会被当成版本号 127.0.0 报成裸事实。
  patterns.push({ label: '任意 x.y.z 版本号', re: VERSION_GUARD })
  return patterns
}

const placeholderRe = /<(Fact|ProductOverview|ReleaseInfo)\b([^>]*)\/?>/g
const attrRe = /(product|product-id|id)="([^"]+)"/g

const violations = []
const placeholders = []
const historyHits = []

for (const rel of collectMarkdown(SITE_ROOT)) {
  const raw = fs.readFileSync(path.join(SITE_ROOT, rel), 'utf8')
  const body = stripFrontMatter(raw)
  // 组件占位符自身要先摘掉，否则 <Fact id="pricing.pro.monthly" /> 会被当成裸字面量。
  const withoutComponents = body.replace(/<[A-Z][A-Za-z]*\b[^>]*\/?>/g, '')

  for (const match of body.matchAll(placeholderRe)) {
    // 只在会发布的页面里解析占位符：内部文档里的 <Fact … /> 是文档示例，不是待渲染的占位符。
    if (!PUBLISHED(rel)) continue
    const attrs = {}
    for (const [, key, value] of match[2].matchAll(attrRe)) attrs[key] = value
    placeholders.push({ rel, product: attrs.product ?? attrs['product-id'], id: attrs.id })
  }

  if (!inStrictZone(rel)) {
    for (const { re, label } of factPatterns()) {
      const found = withoutComponents.match(new RegExp(re.source, re.flags))
      if (found && (label.includes('pricing') || label.includes('version.current'))) {
        historyHits.push(`${rel}: ${label} → ${found.slice(0, 3).join(', ')}`)
      }
    }
    continue
  }

  const lines = withoutComponents.split('\n')
  lines.forEach((line, index) => {
    for (const { re, label } of factPatterns()) {
      const scanner = new RegExp(re.source, re.flags)
      if (scanner.test(line)) violations.push({ rel, line: index + 1, label, text: line.trim().slice(0, 90) })
    }
  })
}

// 占位符指向不存在的事实 = 页面上会渲染"暂不可用"，必须在构建前失败。
for (const item of placeholders) {
  if (item.id && !packages.get(item.product)?.facts?.[item.id]) {
    violations.push({ rel: item.rel, line: 0, label: `占位符指向未知事实 ${item.product}/${item.id}`, text: '<Fact … />' })
  }
}

// 逐字副本豁免了占位符，代价是必须证明它仍是登记过的那一份。
for (const mirror of mirrors) {
  const abs = path.join(SITE_ROOT, mirror.site)
  if (!fs.existsSync(abs)) {
    violations.push({ rel: mirror.site, line: 0, label: `登记的逐字副本不存在（源：${mirror.source}）`, text: '文件被移动或删除，登记表要一起改' })
    continue
  }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
  if (sha !== mirror.siteSha256) {
    violations.push({ rel: mirror.site, line: 0, label: '逐字副本在站点侧被改动', text: `应回开发仓改再同步；当前 ${sha.slice(0, 12)}… != 登记 ${mirror.siteSha256.slice(0, 12)}…` })
  }
}

const unique = new Map()
for (const v of violations) unique.set(`${v.rel}:${v.line}:${v.label}`, v)

/**
 * 注册表是产品目录的唯一索引：登记了产品却没页面、写了页面却没登记、
 * 图标没按约定路径登记，都在这里挡住，而不是靠人记得"下一个产品要补文档"。
 */
const structure = []
for (const product of readRegistry().products.filter((p) => p.visibility !== 'internal')) {
  const dir = path.join(PRODUCTS_DIR, product.id)
  const rel = `products/${product.id}`
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)) : []
  if (!files.includes('index')) structure.push(`${rel}/index.md 不存在：对外产品必须有产品首页`)
  if (!product.contentSource) structure.push(`${product.id}: 没有 contentSource，目录卡片与 <Fact> 无源可渲染`)
  if (product.brand?.logo !== `/assets/${product.id}/icon.png`) {
    structure.push(`${product.id}: 图标未登记为约定路径 /assets/${product.id}/icon.png（图标文件可以后补，登记不能少）`)
  }
  // 形态与可用范围是用户挑产品时第一眼要看的东西：缺一条就等于页面上说不出"这能在什么上跑"。
  for (const field of ['form.factor', 'form.scope']) {
    if (!packages.get(product.id)?.facts?.[field]) {
      structure.push(`${product.id}: 内容源缺事实 ${field}（产品形态与可用范围必须对外声明）`)
    }
  }
  // updateMechanism: none 的产品，站点唯一的下载位就是内容源里登记的获取地址；
  // 键名写错或漏写会让页面静默退化成一条告警。
  if (product.updateMechanism === 'none') {
    const facts = packages.get(product.id)?.facts ?? {}
    if (!facts['download.releasesUrl'] && !facts['download.repoUrl']) {
      structure.push(`${product.id}: updateMechanism 为 none 却没登记 download.releasesUrl / download.repoUrl`)
    }
  }
  for (const section of product.sections ?? []) {
    if (!files.includes(section)) structure.push(`${product.id}: 登记了页面「${section}」却没有 ${rel}/${section}.md`)
  }
  for (const base of files) {
    if (base === 'index') continue
    if (!(product.sections ?? []).includes(base)) structure.push(`${rel}/${base}.md 存在，却没登记进 sections（这页不会出现在侧栏）`)
  }
}

if (historyHits.length) {
  console.log(`ℹ️ 历史态（更新日志）与未发布笔记保留原文事实字面量，按契约豁免：${historyHits.length} 处`)
  for (const hit of historyHits.slice(0, 6)) console.log(`   · ${hit}`)
}

if (unique.size) {
  console.error(`\n❌ 当前态页面出现裸事实字面量（${unique.size} 处），应改为 <Fact> 占位符：`)
  for (const v of unique.values()) console.error(`   ${v.rel}${v.line ? `:${v.line}` : ''}  [${v.label}]  ${v.text}`)
  process.exit(1)
}

if (structure.length) {
  console.error(`\n❌ 注册表与页面不一致（${structure.length} 处）：`)
  for (const row of structure) console.error(`   · ${row}`)
  process.exit(1)
}

console.log(`\n✅ 当前态页面零裸事实（扫描 ${placeholders.length} 个占位符，覆盖 ${packages.size} 个已接入产品；逐字副本 ${mirrors.length} 份哈希一致）`)
console.log('✅ 注册表与页面一一对应，图标按约定路径登记')

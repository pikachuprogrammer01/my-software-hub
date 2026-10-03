import fs from 'node:fs'
import path from 'node:path'
import { GENERATED_DIR, SITE_ROOT, connectedProducts, readJson } from './content-lib.mjs'

/**
 * 「当前态 / 历史态」分区 lint（PRODUCTS.md 第四节、CONTRACT.md 第六节）。
 * 只校已登记事实：未登记的裸数字不在这里判失败，而是由报告列出等人工确认，
 * 因为给一个查不到生效版本的事实编造 effectiveFromVersion 比留着更糟。
 */
const STRICT = ['index.md', 'content', 'products']
const HISTORY = ['CHANGELOG.md', 'docs']

const packages = new Map()
for (const product of connectedProducts()) {
  const file = path.join(GENERATED_DIR, product.id, 'content-latest.v1.json')
  if (fs.existsSync(file)) packages.set(product.id, readJson(file))
}

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
  if (HISTORY.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) return false
  if (rel.includes('CHANGELOG')) return false
  return STRICT.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
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
      else if (typeof fact.value === 'string' && /^\d+\.\d+\.\d+$/.test(fact.value)) {
        patterns.push({ label: `${product}/${id}`, re: new RegExp(`v?${fact.value.replace(/\./g, '\\.')}`, 'g') })
      }
    }
  }
  patterns.push({ label: '任意 x.y.z 版本号', re: /\b\d+\.\d+\.\d+\b/g })
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

const unique = new Map()
for (const v of violations) unique.set(`${v.rel}:${v.line}:${v.label}`, v)

if (historyHits.length) {
  console.log(`ℹ️ 历史/参考区（CHANGELOG 与 docs/）保留原文事实字面量，按契约豁免：${historyHits.length} 处`)
  for (const hit of historyHits.slice(0, 6)) console.log(`   · ${hit}`)
}

if (unique.size) {
  console.error(`\n❌ 当前态页面出现裸事实字面量（${unique.size} 处），应改为 <Fact> 占位符：`)
  for (const v of unique.values()) console.error(`   ${v.rel}${v.line ? `:${v.line}` : ''}  [${v.label}]  ${v.text}`)
  process.exit(1)
}

console.log(`\n✅ 当前态页面零裸事实（扫描 ${placeholders.length} 个占位符，覆盖 ${packages.size} 个已接入产品）`)

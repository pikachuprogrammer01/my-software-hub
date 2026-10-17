import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import Ajv from 'ajv/dist/2020.js'
import { RELEASE_SNAPSHOT_PRODUCT, SITE_ROOT } from './sync-release.mjs'

export { SITE_ROOT, RELEASE_SNAPSHOT_PRODUCT }

export const PRODUCTS_FILE = path.join(SITE_ROOT, 'data', 'products.json')
export const PRODUCTS_DIR = path.join(SITE_ROOT, 'products')
export const GENERATED_DIR = path.join(SITE_ROOT, 'data', 'generated')
export const SCHEMA_DIR = path.join(SITE_ROOT, 'schema')
export const RELEASE_SNAPSHOT_FILE = path.join(SITE_ROOT, '.vitepress', 'release.json')

const ajv = new Ajv({ allErrors: true, strict: false, formats: { 'date-time': true } })
const contentSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'content.v1.json'), 'utf8'))
const productsSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'products.v1.json'), 'utf8'))
const validateContent = ajv.compile(contentSchema)
const validateProducts = ajv.compile(productsSchema)

function formatErrors(errors) {
  return (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim())
}


export function readRegistry() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'))
}

/** 注册表本身也是契约的一部分：schema + 唯一 ID，缺一条就不该继续生成内容。 */
export function validateRegistry(registry = readRegistry()) {
  if (!validateProducts(registry)) return { ok: false, errors: formatErrors(validateProducts.errors) }
  const ids = (registry.products ?? []).map((item) => item.id)
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicated.length) return { ok: false, errors: [`重复产品 ID：${[...new Set(duplicated)].join(', ')}`] }
  if (!ids.length) return { ok: false, errors: ['注册表为空'] }
  return { ok: true, errors: [] }
}

export function readSource(product) {
  const registry = readRegistry().products.find((item) => item.id === product)
  if (!registry) throw new Error(`未知产品：${product}`)
  if (!registry.contentSource) return { registry, source: null }
  const file = path.join(SITE_ROOT, registry.contentSource)
  return { registry, source: JSON.parse(fs.readFileSync(file, 'utf8')) }
}

export function validateSource(source, registry) {
  if (!validateContent(source)) return { ok: false, errors: formatErrors(validateContent.errors) }
  const errors = []
  if (source.product !== registry.id) errors.push(`product 不匹配：${source.product} != ${registry.id}`)
  for (const [fieldId, fact] of Object.entries(source.facts ?? {})) {
    if (!fact.effectiveFromVersion) errors.push(`事实缺少 effectiveFromVersion：${fieldId}`)
    if (fact.variants || fact.channels) errors.push(`事实禁止渠道变体：${fieldId}`)
    if (/^(icon|color|accent|layout)(\.|$)/i.test(fieldId)) errors.push(`事实字段疑似视觉字段：${fieldId}`)
  }
  // 有线上清单的产品版本号由拉取快照注入；源里再写一个就一定会过期，直接拒绝。
  if (registry.releaseBranch === RELEASE_SNAPSHOT_PRODUCT && source.facts?.['version.current']) {
    errors.push(
      `version.current 不允许写进内容源：${registry.id} 的版本号由拉取的 update.json 快照注入（见 packageFromSource）`
    )
  }
  for (const [fieldId, copy] of Object.entries(source.copy ?? {})) {
    const values = [copy.default, ...Object.values(copy.variants ?? {})]
    if (values.some((value) => /<[^>]+>/.test(value))) errors.push(`文案禁止 HTML：${fieldId}`)
    if (fieldId.startsWith('facts.') || fieldId.startsWith('pricing.') || fieldId.startsWith('version.')) {
      errors.push(`共享事实必须放入 facts：${fieldId}`)
    }
    const budgetKey = budgetFieldOf(fieldId)
    if (budgetKey && registry.budget?.[budgetKey]) {
      const over = values.filter((value) => [...value].length > registry.budget[budgetKey])
      // 超长文案在客户端会被 ellipsis 截断成半句话，等于把残缺文案发出去。
      for (const value of over) errors.push(`文案超过 ${budgetKey} 预算（${registry.budget[budgetKey]}）：${fieldId}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

export function budgetFieldOf(fieldId) {
  if (fieldId.startsWith('update.badge')) return 'badge'
  if (fieldId.startsWith('update.summary')) return 'summary'
  if (fieldId.startsWith('update.text')) return 'text'
  return null
}

export function sourceRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SITE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'working-tree'
  }
}

export function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(sortKeys(payload))).digest('hex')
}

/**
 * 事实与文案都是"键 → 内容"的字典，书写顺序不该算语义。
 * 不排序的话，把一条 fact 挪个位置、或者由构建期注入的顺序不同，都会算出一个
 * 新 revision —— 历史里凭空多一份一模一样的包，漂移检查也会跟着红。
 */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  )
}

/** 只有语义内容参与 hash：时间与 Git 可用性变化不算漂移。 */
export function semanticPayload(pkg) {
  return { schema: pkg.schema, product: pkg.product, facts: pkg.facts, copy: pkg.copy, update: pkg.update ?? null }
}

export function revisionOf(hash) {
  return `content-${hash.slice(0, 12)}`
}

/**
 * 有线上更新清单可拉的产品，版本号一律从拉取快照取，不在内容源里写死：
 * 源里写死等于"每发一版都要回站点仓改一次"，且站点会悄悄停在旧版。
 * 快照由 `pnpm sync` 与 VitePress 配置加载时刷新，这里只读不拉，保证构建可复现。
 */
export function pulledVersionOf(registry) {
  if (registry?.releaseBranch !== RELEASE_SNAPSHOT_PRODUCT) return null
  try {
    const snapshot = JSON.parse(fs.readFileSync(RELEASE_SNAPSHOT_FILE, 'utf8'))
    const version = String(snapshot?.version ?? '')
    // 0.0.0 是拉取失败时的占位，不能当真值写进包。
    return /^\d+\.\d+\.\d+$/.test(version) && version !== '0.0.0' ? version : null
  } catch {
    return null
  }
}

export function packageFromSource(source, registry) {
  const pulledVersion = pulledVersionOf(registry)
  const facts = { ...source.facts }
  if (pulledVersion) {
    facts['version.current'] = {
      ...(facts['version.current'] ?? {}),
      value: pulledVersion,
      effectiveFromVersion: pulledVersion,
      source: 'release-repo'
    }
  }
  const base = {
    schema: 1,
    product: source.product,
    sourceRevision: sourceRevision(),
    generatedAt: new Date().toISOString(),
    facts,
    copy: source.copy
  }
  const update = {}
  for (const key of ['badge', 'summary', 'text', 'detail']) {
    const field = source.copy?.[`update.${key}`]
    if (field) update[key] = field.default
  }
  if (Object.keys(update).length) base.update = update
  const sha256 = payloadHash(semanticPayload(base))
  return { ...base, contentRevision: revisionOf(sha256), sha256 }
}

/**
 * 内容包自校验：SHA 必须由语义内容重新算出，revision 必须由该 SHA 派生。
 * 分发面上的包被手改后必须在这里失败，而不是被客户端照原样渲染。
 */
export function verifyPackage(pkg, expectedProduct = pkg?.product) {
  const errors = []
  if (!pkg || typeof pkg !== 'object') return { ok: false, errors: ['内容包不是对象'] }
  if (!validateContent(pkg)) errors.push(...formatErrors(validateContent.errors))
  if (expectedProduct && pkg.product !== expectedProduct) errors.push(`内容包产品归属错误：${pkg.product} != ${expectedProduct}`)
  const hash = payloadHash(semanticPayload(pkg))
  if (pkg.sha256 !== hash) errors.push(`内容包 SHA 不匹配：包内 ${pkg.sha256} != 重算 ${hash}`)
  if (pkg.contentRevision !== revisionOf(hash)) errors.push(`内容包 revision 与 SHA 不一致：${pkg.contentRevision}`)
  return { ok: errors.length === 0, errors }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * 原子写：先写临时文件再 rename，避免读到半截 JSON；
 * 内容一致时直接返回 unchanged，保证重复构建不改字节（历史不可变 + 幂等）。
 */
export function writeJsonIfChanged(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const next = `${JSON.stringify(value, null, 2)}\n`
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return { changed: false, file }
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, next)
  fs.renameSync(tmp, file)
  return { changed: true, file }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** 语义等价即视为同一 revision；比较不含 generatedAt / sourceRevision。 */
export function sameSemantics(a, b) {
  if (!a || !b) return false
  return payloadHash(semanticPayload(a)) === payloadHash(semanticPayload(b))
}

export function generatedPaths(product, revision) {
  const dir = path.join(GENERATED_DIR, product)
  return {
    dir,
    historyDir: path.join(dir, 'history'),
    revision: path.join(dir, 'history', `${revision}.json`),
    full: path.join(dir, 'content.v1.json'),
    latest: path.join(dir, 'content-latest.v1.json')
  }
}

export function connectedProducts(registry = readRegistry()) {
  return registry.products.filter((item) => item.contentSource)
}

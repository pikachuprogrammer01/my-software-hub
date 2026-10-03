import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import Ajv from 'ajv/dist/2020.js'
import { SITE_ROOT } from './sync-release.mjs'

export { SITE_ROOT }

export const PRODUCTS_FILE = path.join(SITE_ROOT, 'data', 'products.json')
export const PRODUCTS_DIR = path.join(SITE_ROOT, 'products')
export const GENERATED_DIR = path.join(SITE_ROOT, 'data', 'generated')

const ajv = new Ajv({ allErrors: true, strict: false, formats: { 'date-time': true } })
const schema = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'schema', 'content.v1.json'), 'utf8'))
const validateSchema = ajv.compile(schema)

export function readRegistry() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'))
}

export function readSource(product) {
  const registry = readRegistry().products.find((item) => item.id === product)
  if (!registry) throw new Error(`未知产品：${product}`)
  if (!registry.contentSource) return { registry, source: null }
  const file = path.join(SITE_ROOT, registry.contentSource)
  return { registry, source: JSON.parse(fs.readFileSync(file, 'utf8')) }
}

export function validateSource(source, registry) {
  if (!validateSchema(source)) return { ok: false, errors: validateSchema.errors ?? [] }
  const errors = []
  if (source.product !== registry.id) errors.push(`product 不匹配：${source.product} != ${registry.id}`)
  for (const [fieldId, fact] of Object.entries(source.facts ?? {})) {
    if (!fact.effectiveFromVersion) errors.push(`事实缺少 effectiveFromVersion：${fieldId}`)
    if (fact.variants || fact.channels) errors.push(`事实禁止渠道变体：${fieldId}`)
    if (/^(icon|color|accent|layout)(\.|$)/i.test(fieldId)) errors.push(`事实字段疑似视觉字段：${fieldId}`)
  }
  for (const [fieldId, copy] of Object.entries(source.copy ?? {})) {
    const values = [copy.default, ...Object.values(copy.variants ?? {})]
    if (values.some((value) => /<[^>]+>/.test(value))) errors.push(`文案禁止 HTML：${fieldId}`)
    if (fieldId.startsWith('facts.') || fieldId.startsWith('pricing.') || fieldId.startsWith('version.')) {
      errors.push(`共享事实必须放入 facts：${fieldId}`)
    }
    const budgetKey = fieldId.startsWith('update.badge') ? 'badge' : fieldId.startsWith('update.summary') ? 'summary' : fieldId.startsWith('update.text') ? 'text' : null
    if (budgetKey && registry.budget?.[budgetKey] && values.some((value) => [...value].length > registry.budget[budgetKey])) {
      errors.push(`文案超过 ${budgetKey} 预算：${fieldId}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

export function sourceRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SITE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return 'working-tree' }
}

export function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function packageFromSource(source, registry) {
  const now = new Date().toISOString()
  const base = { schema: 1, product: source.product, sourceRevision: sourceRevision(), generatedAt: now, facts: source.facts, copy: source.copy }
  const update = {}
  for (const key of ['badge', 'summary', 'text', 'detail']) {
    const field = source.copy?.[`update.${key}`]
    if (field) update[key] = field.default
  }
  if (Object.keys(update).length) base.update = update
  // Hash only semantic content. Timestamps and Git availability must not make
  // an unchanged source appear to drift on every build.
  const hash = payloadHash({ schema: base.schema, product: base.product, facts: base.facts, copy: base.copy, update: base.update ?? null })
  return { ...base, contentRevision: `content-${hash.slice(0, 12)}`, sha256: hash }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function generatedPaths(product, revision) {
  const dir = path.join(GENERATED_DIR, product)
  return {
    dir,
    revision: path.join(dir, 'history', `${revision}.json`),
    full: path.join(dir, 'content.v1.json'),
    latest: path.join(dir, 'content-latest.v1.json')
  }
}

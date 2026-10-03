import assert from 'node:assert/strict'
import { budgetFieldOf } from './content-lib.mjs'

/**
 * 客户端消费规则的可执行版本（参考实现）。
 * 目的不是给客户端直接用，而是让 conformance fixture 的"预期结果"能被机器验证：
 * 规则改了、夹具没跟着改，这里就红灯，不用靠文档自觉。
 * 规则来源：CONTRACT.md 第五节 MUST + PHONE-RUNTIME.md + 本仓内容包契约。
 */
const KNOWN_SCHEMA_MAJOR = [1]
const REQUIRED_FIELDS = ['schema', 'product']

export function consumePackage(input, context) {
  const { ownProduct, cachedRevision = null, fallback = null } = context
  const trace = { product: ownProduct, observed: null, warnings: [], dropped: [] }

  if (input === null || input === undefined || typeof input !== 'object') {
    return outcome('fallback_offline', fallback, { ...trace, observed: 'network', reason: '请求失败或响应不是 JSON' })
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in input)) return outcome('discard', fallback, { ...trace, observed: 'format', reason: `缺少必需字段 ${field}` })
  }
  if (!KNOWN_SCHEMA_MAJOR.includes(input.schema)) {
    // 高版本按已知版本尽力渲染 + 告警，不得崩（CONTRACT 第七节）
    const rendered = renderKnown(input, context, trace)
    return { ...rendered, kind: 'render_with_warning', revision: input.contentRevision, warnings: [...rendered.warnings, `schema=${input.schema} 高于已知版本`], schemaWarning: true }
  }
  if (input.product !== ownProduct) {
    return outcome('discard', fallback, { ...trace, observed: 'format', reason: `product=${input.product} 与自身 ${ownProduct} 不符` })
  }
  if (typeof input.sha256 === 'string' && typeof context.computeHash === 'function') {
    if (context.computeHash(input) !== input.sha256) {
      return outcome('discard', fallback, { ...trace, observed: 'format', reason: '内容包 SHA-256 与语义内容不符' })
    }
  }
  if (typeof input.contentRevision !== 'string' || !input.contentRevision.startsWith('content-')) {
    return outcome('discard', fallback, { ...trace, observed: 'format', reason: '缺少 contentRevision' })
  }
  if (input.contentRevision === cachedRevision) {
    return { ...outcome('unchanged', null, trace), observed: 'latest' }
  }
  return renderKnown(input, context, trace)
}

function renderKnown(input, context, trace) {
  const update = input.update ?? {}
  const out = { kind: 'render', badge: null, summary: null, text: null, detail: null, revision: input.contentRevision, warnings: [...trace.warnings], observed: 'content' }
  for (const layer of ['badge', 'summary', 'text', 'detail']) {
    const value = update[layer]
    if (typeof value !== 'string' || value.length === 0) continue
    if (/<[^>]+>/.test(value)) {
      trace.dropped.push(`${layer} 含 HTML`)
      out.warnings.push(`${layer} 含 HTML，已忽略`)
      continue
    }
    const budgetKey = budgetFieldOf(`update.${layer}`)
    const budget = budgetKey ? context.budget?.[budgetKey] : undefined
    // 任何客户端都不做截断：超预算说明内容源违约，直接不渲染这一层，而不是切半句
    if (typeof budget === 'number' && [...value].length > budget) {
      trace.dropped.push(`${layer} 超预算`)
      out.warnings.push(`${layer} 超过预算 ${budget}，本层留空`)
      continue
    }
    out[layer] = value
  }
  const facts = input.facts ?? {}
  for (const key of Object.keys(facts)) {
    const fact = facts[key]
    if (fact && typeof fact.status === 'string' && !['available', 'beta', 'planned', 'removed'].includes(fact.status)) {
      out.warnings.push(`未知 status=${fact.status}（${key}），按通用样式渲染`)
    }
    // facts 是共享事实，出现渠道变体说明上游违约：忽略变体只取 value，不因此不渲染
    if (fact && (fact.variants || fact.channels)) out.warnings.push(`facts.${key} 带渠道变体，已忽略`)
  }
  // built-in-updater 产品不能再给第二条升级路径，否则用户会覆盖回旧安装包
  const builtIn = context.updateMechanism === 'built-in-updater'
  const hasAsset = Boolean(context.releaseManifest?.url || context.releaseManifest?.urls || input.url || input.urls)
  out.downloadPathShown = !builtIn && hasAsset
  if (builtIn && (input.url || input.urls)) out.warnings.push('该产品由应用内更新器升级，忽略内容包内的下载地址')
  return out
}

function outcome(kind, fallback, trace) {
  return {
    kind,
    badge: fallback?.update?.badge ?? null,
    summary: fallback?.update?.summary ?? null,
    text: fallback?.update?.text ?? null,
    revision: fallback?.contentRevision ?? null,
    offlineCopy: kind === 'fallback_offline' || kind === 'discard' ? Boolean(fallback) : false,
    observed: trace.observed,
    reason: trace.reason ?? null,
    warnings: trace.warnings ?? [],
    dropped: trace.dropped ?? []
  }
}

export function assertFixture(fixture, context) {
  const actual = consumePackage(fixture.input, { ...context, ...(fixture.context ?? {}) })
  for (const [key, expected] of Object.entries(fixture.expect)) {
    if (key === 'warnings') {
      for (const warning of expected) assert.ok((actual.warnings ?? []).some((item) => item.includes(warning)), `${fixture.name}: 缺少告警 ${warning}`)
      continue
    }
    if (key === 'observed') {
      assert.equal(actual.observed, expected, `${fixture.name}: 失败原因不可观测（期望 ${expected}，实际 ${actual.observed}）`)
      continue
    }
    assert.deepEqual(actual[key], expected, `${fixture.name}: ${key} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual[key])}`)
  }
  return actual
}

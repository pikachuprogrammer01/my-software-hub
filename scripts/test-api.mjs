import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { SITE_ROOT } from './content-lib.mjs'
import { readBoundPort } from './lib/runtime-port.mjs'

const results = []
const startedProcesses = []

/** fetch 的 body 只能读一次：先取文本，再按需解析，失败信息里带上原文。 */
async function respond(res) {
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON 响应保留原文 */ }
  return { status: res.status, headers: res.headers, text, json }
}

function check(name, fn) {
  return (async () => {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`  ✅ ${name}`)
    } catch (error) {
      results.push({ name, ok: false, error })
      console.error(`  ❌ ${name}\n     ${String(error.message ?? error).split('\n').join('\n     ')}`)
    }
  })()
}

function hashTree(dir) {
  if (!fs.existsSync(dir)) return 'missing'
  const walk = (current) => {
    const rows = []
    for (const name of fs.readdirSync(current).sort()) {
      const abs = path.join(current, name)
      const stat = fs.statSync(abs)
      if (stat.isDirectory()) rows.push(...walk(abs))
      else rows.push(`${name}:${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 20)}`)
    }
    return rows
  }
  return crypto.createHash('sha256').update(walk(dir).join('|')).digest('hex')
}

function startServer(env, label) {
  const child = spawn(process.execPath, [path.join(SITE_ROOT, '.server-dist', 'index.js')], {
    cwd: SITE_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })
  startedProcesses.push(child)
  return { child, label, get output() { return output } }
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'unknown'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return await res.json()
      lastError = `HTTP ${res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`健康检查超时：${lastError}`)
}

async function stopServer(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) return handle.output
  handle.child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => { handle.child.kill('SIGKILL'); resolve() }, 8000)
    handle.child.once('exit', () => { clearTimeout(timer); resolve() })
  })
  return handle.output
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-api-test-'))
const dataDir = path.join(workDir, 'hub-data')
const reviewerTokenFile = path.join(workDir, 'reviewer.token')
fs.writeFileSync(reviewerTokenFile, 'test-reviewer-token\n')
const siteHashBefore = { products: hashTree(path.join(SITE_ROOT, 'products')), generated: hashTree(path.join(SITE_ROOT, 'data', 'generated')) }

const baselinePkg = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'data', 'generated', 'table-flow', 'content-latest.v1.json'), 'utf8'))
const wpsBaselinePkg = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'data', 'generated', 'wps-enhancer', 'content-latest.v1.json'), 'utf8'))

const serverA = startServer(
  {
    HOST: '127.0.0.1',
    PORT: '0',
    HUB_DATA_DIR: dataDir,
    HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist'),
    HUB_REVIEWER_TOKEN_FILE: reviewerTokenFile,
    HUB_SUBMITTER_TOKEN: 'test-submitter-token',
    HUB_RATE_LIMIT_PER_MIN: '40',
    HUB_MAX_BODY_BYTES: '4096',
    HUB_VERSION: 'test-1'
  },
  'A'
)

console.log('\n【1】启动与静态面')
// 端口由内核分配，从服务的端口文件里读，不预先抢端口
const bound = await readBoundPort(dataDir).catch((error) => {
  console.error(`❌ 服务未能启动：${error.message}\n${serverA.output}`)
  process.exit(1)
})
const baseUrl = bound.baseUrl
let health = null
try {
  health = await waitForHealth(baseUrl)
} catch (error) {
  console.error(`❌ 健康检查未通过：${error.message}\n${serverA.output}`)
  process.exit(1)
}

await check('健康检查返回运行状态且不含配置/凭证/提案正文', () => {
  assert.equal(health.status, 'ok')
  assert.equal(health.database.ok, true)
  assert.equal(health.database.migrationsApplied >= 1, true)
  const raw = JSON.stringify(health)
  assert.ok(!/token|secret|password|reviewer/i.test(raw), `健康响应出现凭证形态字段：${raw}`)
  assert.ok(!raw.includes('pending'), '健康响应不应带提案正文')
  assert.equal(health.version, 'test-1')
})

await check('首页与产品页由预构建静态文件提供', async () => {
  for (const [route, expect] of [['/', 200], ['/table-flow/', 200], ['/wps-enhancer/', 200], ['/features', 200], ['/pricing', 200], ['/reference/usage-guide', 200]]) {
    const res = await fetch(`${baseUrl}${route}`)
    assert.equal(res.status, expect, `${route} → ${res.status}`)
    if (expect === 200 && route !== '/reference/usage-guide') {
      const text = await res.text()
      assert.match(text, /<div id="app">|VPLayout|<h1/, `${route} 返回的不是 VitePress 页面`)
    }
  }
})

await check('深层 clean URL 直接返回 HTML，目录页不跳第二跳', async () => {
  const deep = await fetch(`${baseUrl}/reference/usage-guide`)
  assert.equal(deep.status, 200)
  const dir = await fetch(`${baseUrl}/table-flow/`)
  assert.equal(dir.status, 200)
  const noSlash = await fetch(`${baseUrl}/table-flow`, { redirect: 'manual' })
  assert.equal(noSlash.status, 301)
  assert.equal(noSlash.headers.get('location'), '/table-flow/')
})

await check('不存在的路径返回 404（含 404.html）', async () => {
  const res = await fetch(`${baseUrl}/definitely-not-a-page`)
  assert.equal(res.status, 404)
  const api = await fetch(`${baseUrl}/v1/nope`)
  assert.equal(api.status, 404)
  assert.equal((await api.json()).error.code, 'not_found')
})

await check('静态面不暴露数据库/密钥/目录列表/上级路径', async () => {
  for (const probe of ['/../package.json', '/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/assets/', '/db/', '/hub.sqlite', '/.env', '/data/products.json']) {
    const res = await fetch(`${baseUrl}${probe}`)
    assert.ok(res.status === 404 || res.status === 301, `${probe} → ${res.status}`)
    if (res.status === 301) {
      const followed = await fetch(`${baseUrl}${probe}`.replace(/\/$/, '') + '/')
      assert.equal(followed.status, 404, `${probe}/ 被当作目录渲染`)
    }
  }
})

console.log('\n【2】提案接收契约')

const validEnvelope = (overrides = {}) => ({
  proposal: {
    schema: 1,
    product: 'table-flow',
    fieldId: 'copy.overview.summary',
    value: '从网页表格里提取数据，导出前先看一眼。',
    source: 'table-flow-panel',
    createdAt: new Date().toISOString(),
    ...overrides
  },
  base: { contentRevision: baselinePkg.contentRevision, currentValue: baselinePkg.copy['overview.summary'].default }
})

await check('合法提案被接收并进入待处理区（202 不可信 / 201 可信）', async () => {
  const anonymous = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-anon-0001' },
    body: JSON.stringify(validEnvelope())
  }))
  assert.equal(anonymous.status, 202, anonymous.text)
  assert.equal(anonymous.json.proposal.trust, 'untrusted')
  assert.equal(anonymous.json.proposal.status, 'pending')

  const trusted = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-trst-0001', 'x-hub-submitter-token': 'test-submitter-token' },
    body: JSON.stringify(validEnvelope({ value: '可信提交的文案。' }))
  }))
  assert.equal(trusted.status, 201, trusted.text)
  assert.equal(trusted.json.proposal.trust, 'trusted')
})

await check('facts 渠道变体被拒（422 facts_channel_forbidden）', async () => {
  const res = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      proposal: { schema: 1, product: 'table-flow', fieldId: 'facts.pricing.pro.monthly', value: 6, channel: 'table-flow-panel', source: 'x', createdAt: new Date().toISOString() },
      base: { contentRevision: baselinePkg.contentRevision }
    })
  })
  assert.equal(res.status, 422)
  const body = await res.json()
  assert.equal(body.error.code, 'facts_channel_forbidden')
  assert.match(body.error.requestId ?? '', /^req-/)
})

await check('错误产品被拒（路径与本体不一致 400 / 未知产品 404）', async () => {
  const mismatch = await fetch(`${baseUrl}/v1/products/wps-enhancer/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.overview.summary', value: '串产品', source: 'x', createdAt: new Date().toISOString() } })
  })
  assert.equal(mismatch.status, 400)
  assert.equal((await mismatch.json()).error.code, 'bad_request')

  const unknown = await fetch(`${baseUrl}/v1/products/no-such-product/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'no-such-product', fieldId: 'copy.overview.summary', value: 'x', source: 'x', createdAt: new Date().toISOString() } })
  })
  assert.equal(unknown.status, 404)
  assert.equal((await unknown.json()).error.code, 'unknown_product')

  const notConnected = await fetch(`${baseUrl}/v1/products/auto-clicker-mac/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'auto-clicker-mac', fieldId: 'copy.overview.summary', value: 'x', source: 'x', createdAt: new Date().toISOString() } })
  })
  assert.equal(notConnected.status, 503, '未接入内容源的产品没有可验证基线，必须显式失败而不是照收')
})

await check('未知字段被拒（422 unknown_field）', async () => {
  const res = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.nope.missing', value: 'x', source: 'x', createdAt: new Date().toISOString() } })
  }))
  assert.equal(res.status, 422, res.text)
  assert.equal(res.json.error.code, 'unknown_field')
})

await check('HTML、超预算与信封不合规分别被拒', async () => {
  const html = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.overview.summary', value: '<b>HTML</b>', source: 'x', createdAt: new Date().toISOString() } })
  }))
  assert.equal(html.status, 400, html.text)
  assert.equal(html.json.error.code, 'schema_invalid')

  const overBudget = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.update.badge', value: '超'.repeat(30), source: 'x', createdAt: new Date().toISOString() } })
  }))
  assert.equal(overBudget.status, 422, overBudget.text)
  assert.equal(overBudget.json.error.code, 'copy_over_budget')

  const badSchema = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 2, product: 'table-flow', fieldId: 'copy.overview.summary', value: 'x', source: 'x', createdAt: new Date().toISOString() }, extra: 1 })
  }))
  assert.equal(badSchema.status, 400, badSchema.text)
  assert.equal(badSchema.json.error.code, 'schema_invalid')

  const notJson = await respond(await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{oops'
  }))
  assert.equal(notJson.status, 400, notJson.text)
  assert.equal(notJson.json.error.code, 'schema_invalid')
})

await check('请求体上限生效（413）', async () => {
  const res = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.overview.summary', value: 'x'.repeat(6000), source: 'x', createdAt: new Date().toISOString() } })
  })
  assert.equal(res.status, 413)
  assert.equal((await res.json()).error.code, 'payload_too_large')
})

await check('跨站写来源被拒（403 forbidden_origin）', async () => {
  const res = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify(validEnvelope())
  })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).error.code, 'forbidden_origin')
})

await check('限流生效（429 + Retry-After）', async () => {
  const rateData = path.join(workDir, 'rate-data')
  const handle = startServer({
    HOST: '127.0.0.1',
    PORT: '0',
    HUB_DATA_DIR: rateData,
    HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist'),
    HUB_RATE_LIMIT_PER_MIN: '3'
  }, 'rate')
  const base = (await readBoundPort(rateData)).baseUrl
  await waitForHealth(base)
  const codes = []
  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(`${base}/v1/products/table-flow/proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validEnvelope({ value: `第 ${i} 次` }))
    })
    codes.push(res.status)
    if (res.status === 429) assert.ok(Number(res.headers.get('retry-after')) >= 1, '429 必须给 Retry-After')
  }
  assert.ok(codes.includes(429), `未触发限流：${codes.join(',')}`)
  // 静态面不受 API 限流影响，提案失败不能砸页面
  const stillOk = await fetch(`${base}/`)
  assert.equal(stillOk.status, 200)
  await stopServer(handle)
})

console.log('\n【3】幂等、冲突与审计')

await check('同一幂等键重复提交不产生第二条提案', async () => {
  const first = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-dup-0001' },
    body: JSON.stringify(validEnvelope({ value: '只应落一次。' }))
  })
  assert.ok([201, 202].includes(first.status), String(first.status))
  const firstBody = await first.json()
  const second = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-dup-0001' },
    body: JSON.stringify(validEnvelope({ value: '重试带来不同正文也应被忽略。' }))
  })
  const secondBody = await second.json()
  assert.equal(secondBody.idempotentReplay, true)
  assert.equal(secondBody.proposal.id, firstBody.proposal.id)
  const list = await fetch(`${baseUrl}/v1/proposals`, { headers: { 'x-hub-reviewer-token': 'test-reviewer-token' } })
  const rows = (await list.json()).proposals.filter((row) => row.id === firstBody.proposal.id)
  assert.equal(rows.length, 1)
})

await check('字段级冲突检测：基础 revision 过期返回 409 并登记 conflict', async () => {
  const res = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-conflict-01' },
    body: JSON.stringify({ ...validEnvelope(), base: { contentRevision: 'content-000000000000', currentValue: baselinePkg.copy['overview.summary'].default } })
  })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.proposal.status, 'conflict')
  assert.equal(body.conflict.reason, 'stale_base')
  assert.ok(JSON.stringify(body.conflict.details).includes('content-000000000000'))
})

await check('字段旧值不符同样判冲突（不用写入时间取胜）', async () => {
  const res = await fetch(`${baseUrl}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-conflict-02' },
    body: JSON.stringify({ ...validEnvelope(), base: { contentRevision: baselinePkg.contentRevision, currentValue: '客户端记错的旧文案' } })
  })
  assert.equal(res.status, 409)
  const body = await res.json()
  const fieldConflict = body.conflict.details.find((item) => item.field === 'copy.overview.summary')
  assert.ok(fieldConflict, JSON.stringify(body.conflict))
  assert.equal(fieldConflict.actual, baselinePkg.copy['overview.summary'].default)
})

await check('审核身份与提交身份分离：缺审核凭证 401 / 未配置时 503', async () => {
  const noToken = await fetch(`${baseUrl}/v1/proposals`)
  assert.equal(noToken.status, 401)
  assert.equal((await noToken.json()).error.code, 'unauthenticated')
  const wrongToken = await fetch(`${baseUrl}/v1/proposals`, { headers: { 'x-hub-reviewer-token': 'nope' } })
  assert.equal(wrongToken.status, 401)
  const ok = await fetch(`${baseUrl}/v1/proposals?status=pending`, { headers: { 'x-hub-reviewer-token': 'test-reviewer-token' } })
  assert.equal(ok.status, 200)
  const list = await ok.json()
  assert.ok(list.count >= 1)
  assert.ok(list.proposals.every((row) => row.status === 'pending'))
})

await check('提案详情带审计轨迹', async () => {
  const list = await (await fetch(`${baseUrl}/v1/proposals`, { headers: { 'x-hub-reviewer-token': 'test-reviewer-token' } })).json()
  const target = list.proposals.find((row) => row.id)
  const detail = await fetch(`${baseUrl}/v1/proposals/${target.id}`, { headers: { 'x-hub-reviewer-token': 'test-reviewer-token' } })
  assert.equal(detail.status, 200)
  const body = await detail.json()
  assert.ok(body.audit.length >= 1, '缺少审计记录')
  assert.ok(body.audit.some((event) => event.action.startsWith('proposal.received')))
  assert.ok(body.audit.every((event) => event.requestId === null || /^req-/.test(event.requestId)))
})

await check('裁决只登记状态与发布任务，不移动 latest 也不写站点仓', async () => {
  const list = await (await fetch(`${baseUrl}/v1/proposals?status=pending`, { headers: { 'x-hub-reviewer-token': 'test-reviewer-token' } })).json()
  const target = list.proposals[0]
  const accept = await respond(await fetch(`${baseUrl}/v1/proposals/${target.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-reviewer-token': 'test-reviewer-token', 'x-hub-reviewer-id': 'pikachu' },
    body: JSON.stringify({ decision: 'accept', note: '文案更贴近实际' })
  }))
  assert.equal(accept.status, 200, accept.text)
  assert.equal(accept.json.proposal.status, 'accepted')
  assert.equal(accept.json.proposal.decision.decidedBy, 'pikachu', `裁决人未写进审计视图：${accept.text}`)
  assert.ok(accept.json.proposal.decision.decidedAt, '缺少裁决时间')

  const reject = await respond(await fetch(`${baseUrl}/v1/proposals/${target.id}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-reviewer-token': 'test-reviewer-token' },
    body: JSON.stringify({ decision: 'reject' })
  }))
  assert.equal(reject.status, 400, reject.text)
  assert.equal(target.status, 'pending')

  // 站点仓文案主源与发布副本必须原样不动
  assert.equal(hashTree(path.join(SITE_ROOT, 'products')), siteHashBefore.products, 'API 写入改动了站点仓内容源')
  assert.equal(hashTree(path.join(SITE_ROOT, 'data', 'generated')), siteHashBefore.generated, 'API 移动了 latest/生成包')

  const served = await fetch(`${baseUrl}/v1/products/table-flow/content`)
  assert.equal(served.status, 200)
  const servedBody = await served.json()
  assert.equal(servedBody.contentRevision, baselinePkg.contentRevision, '内容端点必须仍分发已验证发布副本，不从数据库拼装')
  assert.equal(servedBody.copy['overview.summary'].default, baselinePkg.copy['overview.summary'].default)
  const etag = served.headers.get('etag')
  assert.equal(etag, `"${baselinePkg.contentRevision}"`)
  const conditional = await fetch(`${baseUrl}/v1/products/table-flow/content`, { headers: { 'if-none-match': etag } })
  assert.equal(conditional.status, 304)
})

console.log('\n【4】OpenAPI 与运行时依赖')

await check('OpenAPI 文档可解析且覆盖全部实现路由', async () => {
  const doc = await (await fetch(`${baseUrl}/v1/openapi.json`)).json()
  assert.equal(doc.openapi, '3.1.0')
  const implemented = ['/', '/health', '/v1/openapi.json', '/v1/products/{productId}/proposals', '/v1/products/{productId}/content', '/v1/proposals', '/v1/proposals/{id}', '/v1/proposals/{id}/decision', '/v1/products/{productId}/proposals/count']
  const documented = Object.keys(doc.paths)
  for (const route of implemented.filter((item) => item !== '/')) {
    assert.ok(documented.includes(route), `OpenAPI 缺少 ${route}`)
  }
  assert.ok(JSON.stringify(doc.components.schemas.ErrorBody).includes('facts_channel_forbidden'))
  assert.ok(doc.components.securitySchemes.reviewerToken)
  assert.ok(doc.info.description.includes('站点仓'))
})

await check('服务运行期不依赖外网（代码面无出站请求）', () => {
  const files = []
  const walk = (dir) => { for (const name of fs.readdirSync(dir)) { const abs = path.join(dir, name); if (fs.statSync(abs).isDirectory()) walk(abs); else if (name.endsWith('.js')) files.push(abs) } }
  walk(path.join(SITE_ROOT, '.server-dist'))
  const offenders = files.filter((file) => {
    const src = fs.readFileSync(file, 'utf8')
    return /(^|[^.\w])fetch\s*\(|globalThis\.fetch|axios|undici/.test(src) && !/app\.fetch|createApp/.test(src)
  })
  assert.deepEqual(offenders, [], '运行期出现出站网络调用')
  const staticHtml = fs.readdirSync(path.join(SITE_ROOT, '.vitepress', 'dist')).filter((n) => n.endsWith('.html'))
  const runtimeFetch = staticHtml.filter((name) => /fetch\(['"]https?:\/\/gitee/.test(fs.readFileSync(path.join(SITE_ROOT, '.vitepress', 'dist', name), 'utf8')))
  assert.deepEqual(runtimeFetch, [], '静态页面在运行时抓取发布仓')
})

console.log('\n【5】进程重启后的一致性')
const outputA = await stopServer(serverA)
assert.match(outputA, /"event":"shutdown"/)

await check('优雅停止后 pid 文件被清理', () => {
  const pidFile = path.join(dataDir, 'run', 'hubd.pid')
  assert.ok(!fs.existsSync(pidFile), `pid 文件残留：${pidFile}`)
})

const serverB = startServer({
  HOST: '127.0.0.1',
  PORT: '0',
  HUB_DATA_DIR: dataDir,
  HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist'),
  HUB_SUBMITTER_TOKEN: 'test-submitter-token',
  HUB_VERSION: 'test-2'
}, 'B')
const base2 = (await readBoundPort(dataDir)).baseUrl
await waitForHealth(base2)

await check('重启后提案与裁决状态保留', async () => {
  const res = await fetch(`${base2}/v1/products/table-flow/proposals/count`)
  const body = await res.json()
  assert.ok(body.total >= 4, `重启后只剩 ${body.total} 条提案`)
  assert.ok(Object.keys(body.byStatusTrust).some((key) => key.startsWith('accepted')), 'accepted 状态丢失')
  assert.ok(Object.keys(body.byStatusTrust).some((key) => key.startsWith('conflict')), 'conflict 状态丢失')
})

await check('未配置审核身份时裁决端点返回 503（不假装可批准）', async () => {
  const res = await fetch(`${base2}/v1/proposals`)
  assert.equal(res.status, 503)
  const body = await res.json()
  assert.equal(body.error.code, 'service_unavailable')
  assert.equal(body.error.details.reason, 'reviewer_identity_not_configured')
})

await check('重启后同一幂等键仍只命中原提案', async () => {
  const res = await fetch(`${base2}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-dup-0001' },
    body: JSON.stringify(validEnvelope({ value: '重启后的重试' }))
  })
  const body = await res.json()
  assert.equal(body.idempotentReplay, true)
  const count = await (await fetch(`${base2}/v1/products/table-flow/proposals/count`)).json()
  const again = await fetch(`${base2}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-dup-0001' },
    body: JSON.stringify(validEnvelope({ value: '第三次重试' }))
  })
  await again.json()
  const countAfter = await (await fetch(`${base2}/v1/products/table-flow/proposals/count`)).json()
  assert.equal(countAfter.total, count.total, '幂等键在重启后仍然产生了新提案')
})

await check('WPS Enhancer 提案走同一契约且带自己的预算', async () => {
  const pkg = wpsBaselinePkg
  const long = '这'.repeat(301)
  const over = await fetch(`${base2}/v1/products/wps-enhancer/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'wps-enhancer', fieldId: 'copy.update.text', value: long, source: 'wps-settings', createdAt: new Date().toISOString() }, base: { contentRevision: pkg.contentRevision } })
  })
  assert.equal(over.status, 422)
  assert.equal((await over.json()).error.code, 'copy_over_budget')
  const ok = await fetch(`${base2}/v1/products/wps-enhancer/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'idem-wps-0001' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'wps-enhancer', fieldId: 'copy.install.summary', value: '按平台安装包安装。', source: 'wps-settings', createdAt: new Date().toISOString() }, base: { contentRevision: pkg.contentRevision, currentValue: pkg.copy['install.summary'].default } })
  })
  assert.ok([201, 202].includes(ok.status), await ok.text())
})

const outputB = await stopServer(serverB)
assert.match(outputB, /"event":"shutdown"/)

await check('数据库关闭后 WAL 已 checkpoint（备份面不会只拿到半截主库）', () => {
  const wal = path.join(dataDir, 'db', 'hub.sqlite-wal')
  const size = fs.existsSync(wal) ? fs.statSync(wal).size : 0
  assert.equal(size, 0, `WAL 残留 ${size} 字节`)
  assert.ok(fs.existsSync(path.join(dataDir, 'db', 'hub.sqlite')))
})

await check('重复启动被拒绝（防止双进程争抢同一库）', async () => {
  const handle = startServer({ HOST: '127.0.0.1', PORT: '0', HUB_DATA_DIR: dataDir, HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist') }, 'C')
  // 先起一个持有 pid 文件的实例
  await waitForHealth((await readBoundPort(dataDir)).baseUrl)
  const dup = startServer({ HOST: '127.0.0.1', PORT: '0', HUB_DATA_DIR: dataDir, HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist') }, 'D')
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 5000)
    dup.child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }) })
  })
  assert.notEqual(exited, 'timeout', '第二个实例没有退出')
  assert.equal(exited.code, 75)
  assert.match(dup.output, /拒绝重复启动/)
  await stopServer(handle)
})

const failed = results.filter((item) => !item.ok)
console.log(`\nAPI 与运行时测试：${results.length - failed.length}/${results.length} 通过`)
for (const child of startedProcesses) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}
fs.rmSync(workDir, { recursive: true, force: true })
if (failed.length) {
  for (const item of failed) console.error(`   · ${item.name}`)
  process.exit(1)
}
console.log('✅ 手机运行时（电脑侧）验证通过')

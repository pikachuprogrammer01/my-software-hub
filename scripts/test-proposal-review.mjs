import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { SITE_ROOT, generatedPaths, readJson } from './content-lib.mjs'
import { readBoundPort } from './lib/runtime-port.mjs'

/**
 * 提案处理器的端到端验证：HTTP 接收 → 审核登记 → 电脑侧受控变更进站点仓（默认 dry-run）
 * → 失败回退 → 导出/导入 → 重启后继续处理 pending 任务。
 * 所有内容源写入都发生在临时副本里，真实仓库不受影响。
 */
const results = []
const children = []

async function check(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✅ ${name}`)
  } catch (error) {
    results.push({ name, ok: false })
    console.error(`  ❌ ${name}\n     ${String(error.message ?? error).split('\n').join('\n     ')}`)
  }
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-review-test-'))
  for (const entry of ['scripts', 'schema', 'products', 'data', 'migrations', '.vitepress']) {
    const src = path.join(SITE_ROOT, entry)
    if (!fs.existsSync(src)) continue
    if (entry === '.vitepress') {
      fs.mkdirSync(path.join(dir, entry), { recursive: true })
      fs.copyFileSync(path.join(src, 'release.json'), path.join(dir, entry, 'release.json'))
      continue
    }
    fs.cpSync(src, path.join(dir, entry), { recursive: true })
  }
  fs.copyFileSync(path.join(SITE_ROOT, 'package.json'), path.join(dir, 'package.json'))
  fs.symlinkSync(path.join(SITE_ROOT, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}

function runScript(script, args, env) {
  const res = spawnSync(process.execPath, [path.join(SITE_ROOT, 'scripts', script), ...args], {
    cwd: SITE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 180000
  })
  return { code: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-review-run-'))
const dataDir = path.join(work, 'data')
const tokenFile = path.join(work, 'reviewer.token')
fs.writeFileSync(tokenFile, 'review-test-token\n')
const repo = sandbox()

const cliEnv = {
  HUB_DATA_DIR: dataDir,
  HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist'),
  HUB_SCHEMA_DIR: path.join(repo, 'schema'),
  HUB_CONTENT_DIR: path.join(repo, 'data', 'generated'),
  HUB_MIGRATIONS_DIR: path.join(repo, 'migrations'),
  HUB_REVIEWER_TOKEN_FILE: tokenFile
}

const server = spawn(process.execPath, [path.join(SITE_ROOT, '.server-dist', 'index.js')], {
  cwd: SITE_ROOT,
  env: { ...process.env, ...cliEnv, HOST: '127.0.0.1', PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
})
children.push(server)
let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk })
server.stderr.on('data', (chunk) => { serverOutput += chunk })

const base = (await readBoundPort(dataDir)).baseUrl
const deadline = Date.now() + 20000
let up = false
while (Date.now() < deadline && !up) {
  try {
    up = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) })).ok
  } catch {
    await new Promise((r) => setTimeout(r, 250))
  }
}
if (!up) {
  console.error(`❌ 测试服务未启动\n${serverOutput}`)
  process.exit(1)
}

const reviewer = { 'x-hub-reviewer-token': 'review-test-token' }

async function submit(fieldId, value, extra = {}) {
  const baseline = readJson(generatedPaths('table-flow').latest)
  const res = await fetch(`${base}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      proposal: { schema: 1, product: 'table-flow', fieldId, value, source: 'review-test', createdAt: new Date().toISOString(), ...extra },
      base: { contentRevision: baseline.contentRevision }
    })
  })
  const body = await res.json().catch(() => null)
  if (!body?.proposal) throw new Error(`提交失败 ${res.status}: ${JSON.stringify(body)}`)
  return body.proposal
}

console.log('\n【1】提案接收与审核登记')
let copyProposal = null
await check('copy 提案接收后由审核身份登记为 accepted 并建发布任务', async () => {
  copyProposal = await submit('copy.overview.summary', '从网页表格里提取数据，导出前可先预览。')
  assert.ok(['pending', 'conflict'].includes(copyProposal.status))
  const res = await fetch(`${base}/v1/proposals/${copyProposal.id}/decision`, {
    method: 'POST',
    headers: { ...reviewer, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'accept', note: '更贴近实际用法' })
  })
  assert.equal(res.status, 200, JSON.stringify(await res.json()))
})

await check('facts 提案可登记但不允许自动落地站点仓', async () => {
  const fact = await submit('facts.pricing.pro.monthly', 6)
  const decision = await fetch(`${base}/v1/proposals/${fact.id}/decision`, {
    method: 'POST',
    headers: { ...reviewer, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'accept' })
  })
  assert.equal(decision.status, 200)
  const applied = runScript('proposal-review.mjs', ['apply', '--id', fact.id], cliEnv)
  assert.equal(applied.code, 1, applied.output)
  assert.match(applied.output, /facts 提案不允许自动落地/)
  const drained = runScript('proposal-review.mjs', ['tasks', '--drain'], cliEnv)
  assert.match(drained.output, /⏸ .*facts 提案不允许自动落地/)
  assert.equal(drained.code, 0, `被规则挡住的任务不该把整体报成失败：${drained.output}`)
})

console.log('\n【2】受控变更：默认 dry-run，确认后才写站点仓副本')
const sourceFile = path.join(repo, 'products', 'table-flow', 'content.v1.source.json')
const latestFile = path.join(repo, 'data', 'generated', 'table-flow', 'content-latest.v1.json')

await check('apply 默认 dry-run，不改内容源也不移动 latest', () => {
  const sourceBefore = hashFile(sourceFile)
  const latestBefore = hashFile(latestFile)
  const out = runScript('proposal-review.mjs', ['apply', '--id', copyProposal.id], cliEnv)
  assert.equal(out.code, 0, out.output)
  assert.match(out.output, /dry-run/)
  assert.equal(hashFile(sourceFile), sourceBefore, 'dry-run 改了内容源')
  assert.equal(hashFile(latestFile), latestBefore, 'dry-run 移动了 latest')
})

await check('apply --real 写入内容源并重建内容包，任务转为 done', () => {
  const latestBefore = readJson(latestFile).contentRevision
  const out = runScript('proposal-review.mjs', ['apply', '--id', copyProposal.id, '--real'], cliEnv)
  assert.equal(out.code, 0, out.output)
  assert.match(out.output, /已写入站点仓内容源/)
  const source = readJson(sourceFile)
  assert.equal(source.copy['overview.summary'].default, '从网页表格里提取数据，导出前可先预览。')
  const after = readJson(latestFile)
  assert.notEqual(after.contentRevision, latestBefore, 'latest 未随受控变更更新')
  assert.equal(after.copy['overview.summary'].default, source.copy['overview.summary'].default)
  const tasks = runScript('proposal-review.mjs', ['tasks', '--json'], cliEnv)
  assert.equal(tasks.code, 0, tasks.output)
  const list = JSON.parse(tasks.output.slice(tasks.output.indexOf('[')))
  assert.ok(list.some((task) => task.status === 'done'), `任务未结案：${JSON.stringify(list)}`)
})

await check('重复 apply 幂等：文案已一致时不再改文件', () => {
  const sourceBefore = hashFile(sourceFile)
  const out = runScript('proposal-review.mjs', ['apply', '--id', copyProposal.id, '--real'], cliEnv)
  assert.equal(out.code, 0, out.output)
  assert.match(out.output, /已是目标文案/)
  assert.equal(hashFile(sourceFile), sourceBefore)
})

await check('下游校验失败时还原内容源并把任务标为 failed（保留可恢复状态）', async () => {
  // 人为让另一个产品坏掉，模拟"改了源但包生成不出来"
  const brokenPath = path.join(repo, 'products', 'wps-enhancer', 'content.v1.source.json')
  const broken = readJson(brokenPath)
  broken.copy['overview.summary'].default = '<script>坏掉</script>'
  fs.writeFileSync(brokenPath, `${JSON.stringify(broken, null, 2)}\n`)

  const second = await submit('copy.install.summary', '安装后在扩展栏即可使用。')
  const decision = await fetch(`${base}/v1/proposals/${second.id}/decision`, {
    method: 'POST',
    headers: { ...reviewer, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'accept' })
  })
  assert.equal(decision.status, 200)

  const before = hashFile(sourceFile)
  const out = runScript('proposal-review.mjs', ['apply', '--id', second.id, '--real'], cliEnv)
  assert.equal(out.code, 1, out.output)
  assert.match(out.output, /已还原内容源/)
  assert.equal(hashFile(sourceFile), before, '失败后内容源没有还原')
  const taskState = JSON.parse((() => { const t = runScript('proposal-review.mjs', ['tasks', '--json', '--status', 'failed'], cliEnv); return t.output.slice(t.output.indexOf('[')) })())
  assert.ok(taskState.some((task) => /已还原内容源/.test(task.lastError ?? '')), JSON.stringify(taskState))

  // 修好后可以按同一任务继续处理，不需要重复批准
  const fixed = readJson(brokenPath)
  fixed.copy['overview.summary'].default = 'WPS 桌面端增强工具。'
  fs.writeFileSync(brokenPath, `${JSON.stringify(fixed, null, 2)}\n`)
  const retry = runScript('proposal-review.mjs', ['apply', '--id', second.id, '--real'], cliEnv)
  assert.equal(retry.code, 0, retry.output)
  assert.match(retry.output, /已写入站点仓内容源/)
})

console.log('\n【3】文件队列与重启')
await check('导出 JSON 文件队列可被另一个空库导入且不改主源', () => {
  const outDir = path.join(work, 'queue')
  const exported = runScript('proposal-review.mjs', ['export', '--out', outDir, '--json'], cliEnv)
  assert.equal(exported.code, 0, exported.output)
  const files = JSON.parse(exported.output.slice(exported.output.indexOf('[')))
  assert.ok(files.length >= 2, `导出文件太少：${files.length}`)
  const statuses = new Set(files.map((file) => file.split(path.sep).at(-2)))
  assert.ok(statuses.has('accepted') || statuses.has('pending'), '导出文件未按状态分层：' + files[0])
  assert.ok([...statuses].every((name) => ['pending', 'accepted', 'rejected'].includes(name)), '导出目录状态名异常：' + [...statuses].join(','))
  const sample = readJson(files[0])
  assert.equal(sample.proposal.schema, 1)
  assert.ok(sample._hub.id.startsWith('prop-'))
  assert.ok(!JSON.stringify(sample).includes('review-test-token'), '导出内容泄漏了凭证')

  const otherData = path.join(work, 'other-data')
  const env = { ...cliEnv, HUB_DATA_DIR: otherData }
  const imported = runScript('proposal-review.mjs', ['import', outDir, '--json'], env)
  assert.equal(imported.code, 0, imported.output)
  const summary = JSON.parse(imported.output.slice(imported.output.indexOf('{')))
  assert.ok(summary.imported >= 2, JSON.stringify(summary))
  const listed = runScript('proposal-review.mjs', ['list', '--json'], env)
  const rows = JSON.parse(listed.output.slice(listed.output.indexOf('[')))
  assert.equal(rows.length, summary.imported)
  assert.ok(rows.every((row) => row.trust === 'untrusted'), '导入的提案不应被当作可信提交')
  const again = runScript('proposal-review.mjs', ['import', outDir, '--json'], env)
  const second = JSON.parse(again.output.slice(again.output.indexOf('{')))
  assert.equal(second.imported, 0, '重复导入产生了新记录')
  assert.ok(second.skipped >= 2, JSON.stringify(second))
})

await check('进程重启后 pending 任务仍可继续处理', async () => {
  const proposal = await submit('copy.update.badge', '新徽章')
  await fetch(`${base}/v1/proposals/${proposal.id}/decision`, {
    method: 'POST',
    headers: { ...reviewer, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'accept' })
  })
  server.kill('SIGTERM')
  await new Promise((resolve) => server.once('exit', resolve))
  const pending = runScript('proposal-review.mjs', ['tasks', '--json'], cliEnv)
  const tasks = JSON.parse(pending.output.slice(pending.output.indexOf('[')))
  assert.ok(tasks.some((task) => task.status === 'pending'), JSON.stringify(tasks))
  const dry = runScript('proposal-review.mjs', ['tasks', '--drain'], cliEnv)
  assert.equal(dry.code, 0, dry.output)
  assert.match(dry.output, /dry-run：将把 copy\.update\.badge/)
  const sourceBeforeDrain = hashFile(sourceFile)
  const drained = runScript('proposal-review.mjs', ['tasks', '--drain', '--real'], cliEnv)
  assert.equal(drained.code, 0, drained.output)
  assert.match(drained.output, /copy\.update\.badge 已写入站点仓内容源/)
  assert.notEqual(hashFile(sourceFile), sourceBeforeDrain, 'dry-run 之后仍没有落地')
  const after = runScript('proposal-review.mjs', ['tasks', '--json'], cliEnv)
  const tasksAfter = JSON.parse(after.output.slice(after.output.indexOf('[')))
  const badgeTask = tasksAfter.find((task) => /copy\.update\.badge/.test(task.lastError ?? ''))
  assert.ok(badgeTask && badgeTask.status === 'done', 'badge 任务未结案：' + JSON.stringify(badgeTask))
  const factsTask = tasksAfter.find((task) => /facts 提案不允许自动落地/.test(task.lastError ?? ''))
  assert.ok(factsTask && factsTask.status === 'pending', 'facts 任务应保持待人工而不是被假装完成：' + JSON.stringify(factsTask))
})

server.kill('SIGKILL')
fs.rmSync(work, { recursive: true, force: true })
fs.rmSync(repo, { recursive: true, force: true })

const failed = results.filter((item) => !item.ok)
console.log(`\n提案处理器测试：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  for (const item of failed) console.error(`   · ${item.name}`)
  process.exit(1)
}
console.log('✅ 提案处理器（dry-run/回退/导入导出/任务续处理）通过')

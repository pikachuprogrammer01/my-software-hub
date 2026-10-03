import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, flagValue } from './lib/args.mjs'
import { SITE_ROOT, readJson, verifyPackage } from './content-lib.mjs'

const { flags, positional } = parseArgs()
const command = positional[0]
const dryRun = !flags.real
const actor = flagValue(flags, 'actor') ?? `${process.env.USER ?? 'operator'}@${process.env.HOSTNAME ?? 'local'}`

if (!['list', 'show', 'accept', 'reject', 'apply', 'tasks', 'export', 'import'].includes(command ?? '')) {
  console.log(`用法：node scripts/proposal-review.mjs <命令> [参数]

  list [--status pending|accepted|rejected|conflict] [--product <id>]
  show <proposalId>
  accept <proposalId> [--note <说明>]
  reject <proposalId> [--note <说明>]
  apply [--id <proposalId>] [--real]     把已批准的 copy 提案写进站点仓内容源（默认 dry-run）
  tasks [--drain] [--real]               查看/继续处理发布任务（重启后可恢复）
  export --out <目录>                     导出 JSON 文件队列（离线交接格式）
  import <文件或目录>                      从 JSON 文件队列导入提案

环境变量与手机服务一致：HUB_DATA_DIR / HUB_STATIC_DIR / HUB_SCHEMA_DIR / HUB_MIGRATIONS_DIR。
不加 --real 一律不改文件；facts 提案永远不自动落地（事实主源在发布仓）。`)
  process.exit(command ? 2 : 0)
}

const reviewModulePath = path.join(SITE_ROOT, '.server-dist', 'review.js')
if (!fs.existsSync(reviewModulePath)) {
  console.error('❌ 找不到 .server-dist/review.js，请先执行：pnpm api:build（或 node scripts/api-build.mjs）')
  process.exit(1)
}

const review = await import(reviewModulePath)
const deps = review.resolve({
  ...process.env,
  HUB_STATIC_DIR: process.env.HUB_STATIC_DIR ?? path.join(SITE_ROOT, '.vitepress', 'dist'),
  HUB_DATA_DIR: process.env.HUB_DATA_DIR ?? path.join(SITE_ROOT, '.hub-data')
})

function describe(row) {
  return {
    id: row.id,
    product: row.product,
    fieldId: row.fieldId,
    zone: row.zone,
    channel: row.channel,
    value: JSON.parse(row.valueJson),
    baseRevision: row.baseRevision,
    trust: row.trust,
    status: row.status,
    origin: row.origin,
    submitter: row.submitter,
    createdAt: row.createdAt,
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote
  }
}

if (flags.json) {
  // 机器可读输出：给发布 CI 与后续脚本用
  console.log(JSON.stringify(await run(), null, 2))
} else {
  await runHuman()
}
deps.store.close()

async function run() {
  switch (command) {
    case 'list':
      return review.listProposals(deps, { status: flagValue(flags, 'status'), product: flagValue(flags, 'product') }).map(describe)
    case 'show': {
      const id = positional[1]
      const rows = review.listProposals(deps).filter((row) => row.id === id)
      if (!rows.length) throw new Error(`找不到提案：${id}`)
      return describe(rows[0])
    }
    case 'accept':
    case 'reject': {
      const id = positional[1]
      if (!id) throw new Error(`${command} 需要提案 ID`)
      return describe(review.decide(deps, id, command === 'accept' ? 'accept' : 'reject', actor, flagValue(flags, 'note')).proposal)
    }
    case 'apply': {
      const id = flagValue(flags, 'id') ?? positional[1]
      if (id) return [review.applyToSiteRepo(deps, id, { dryRun, actor })]
      return review.drainTasks(deps, { dryRun, actor })
    }
    case 'tasks': {
      if (flags.drain) return review.drainTasks(deps, { dryRun, actor })
      return review.listTasks(deps).map((task) => ({ id: task.id, product: task.product, proposalId: task.proposalId, status: task.status, attempts: task.attempts, lastError: task.lastError }))
    }
    case 'export': {
      const out = flagValue(flags, 'out') ?? path.join(SITE_ROOT, 'proposals')
      return review.exportQueue(deps, out)
    }
    case 'import': {
      const target = positional[1]
      if (!target) throw new Error('import 需要文件或目录路径')
      return review.importQueue(deps, target)
    }
    default:
      throw new Error(`未知命令：${command}`)
  }
}

async function runHuman() {
  if (command === 'list') {
    const rows = await run()
    if (!rows.length) console.log('（没有匹配的提案）')
    for (const row of rows) console.log(`${row.id}  ${row.status}/${row.trust}  ${row.product}  ${row.fieldId}${row.channel ? `[${row.channel}]` : ''}  ${JSON.stringify(row.value).slice(0, 60)}`)
    return
  }
  if (command === 'show') {
    const row = await run()
    console.log(JSON.stringify(row, null, 2))
    return
  }
  if (command === 'accept' || command === 'reject') {
    const row = await run()
    console.log(`✅ ${row.id} → ${row.status}（裁决人 ${row.decidedBy}）`)
    console.log('   下一步：node scripts/proposal-review.mjs apply --id ' + row.id + (row.zone === 'copy' ? '' : '  ← facts 提案需人工经发布仓受控变更'))
    return
  }
  if (command === 'tasks') {
    const rows = await run()
    if (!rows.length) console.log('（没有待处理发布任务）')
    for (const task of rows) console.log(`${task.id ?? task.proposalId}  ${task.status}  ${task.product ?? ''}  attempts=${task.attempts ?? 0}${task.lastError ? `  ${task.lastError}` : ''}${task.detail ? `  ${task.detail}` : ''}${task.ok === false ? '  ❌' : ''}`)
    return
  }
  if (command === 'export') {
    const files = await run()
    console.log(`✅ 已导出 ${files.length} 个提案文件（JSON 仅为交接格式，数据库仍是运行期主存储）`)
    for (const file of files.slice(0, 20)) console.log(`   · ${path.relative(SITE_ROOT, file)}`)
    return
  }
  if (command === 'import') {
    const result = await run()
    console.log(`✅ 导入 ${result.imported} 条，跳过 ${result.skipped} 条（已存在）`)
    for (const error of result.errors) console.error(`   ❌ ${error}`)
    if (result.errors.length) process.exitCode = 1
    return
  }
  if (command === 'apply') {
    const results = await run()
    if (!results.length) console.log('（没有待落地提案）')
    for (const item of results) {
      console.log(`${item.ok ? '✅' : '❌'} ${item.detail}`)
    }
    if (dryRun) console.log('\ndry-run：未修改站点仓内容源。确认无误后加 --real。')
    else {
      const broken = connectedGenerated().filter((item) => !item.ok)
      for (const item of broken) console.error(`❌ ${item.product}：${item.reason}`)
      if (broken.length) process.exit(1)
    }
    if (results.some((item) => !item.ok)) process.exit(1)
  }
}

/** 落地后必须再次确认发布副本自校验通过，避免把内容源改成功但包写坏。 */
function connectedGenerated() {
  const registry = readJson(path.join(SITE_ROOT, 'data', 'products.json'))
  return registry.products
    .filter((item) => item.contentSource)
    .map((item) => {
      const file = path.join(SITE_ROOT, 'data', 'generated', item.id, 'content-latest.v1.json')
      if (!fs.existsSync(file)) return { product: item.id, ok: false, reason: '缺少 latest 内容包' }
      const check = verifyPackage(readJson(file), item.id)
      return { product: item.id, ok: check.ok, reason: check.errors.join('; ') }
    })
}

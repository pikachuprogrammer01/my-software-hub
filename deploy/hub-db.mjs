import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

// 运维脚本必须自包含：部署包里没有仓库的 scripts/lib，不能 import 它。
function parseArgs(argv = process.argv.slice(2)) {
  const flags = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq > 1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next
      index += 1
    } else {
      flags[key] = true
    }
  }
  return { flags, positional }
}

function flagValue(flags, key) {
  const value = flags[key]
  return typeof value === 'string' && value.length ? value : undefined
}

/**
 * 数据库运维入口：备份用 SQLite 在线备份 API（WAL 写入中也不会只复制主库），
 * 恢复先校验再替换，且永远保留替换前的现场。
 */
const { flags, positional } = parseArgs()
const command = positional[0] ?? flags.command
const dataDir = path.resolve(flagValue(flags, 'data-dir') ?? process.env.HUB_DATA_DIR ?? '')
if (!dataDir) fail('缺少 --data-dir（或 HUB_DATA_DIR）')
const dbFile = flagValue(flags, 'db') ?? path.join(dataDir, 'db', 'hub.sqlite')
// 仓库布局：<root>/deploy/hub-db.mjs 与 <root>/migrations 同级；
// 部署包布局：<release>/scripts/hub-db.mjs 与 <release>/migrations 同级。
const here = path.dirname(new URL(import.meta.url).pathname)
const migrationsDir = flagValue(flags, 'migrations') ?? path.resolve(here, '..', 'migrations')

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

function open(file, { readonly = false } = {}) {
  if (!fs.existsSync(file)) fail(`找不到数据库文件：${file}`)
  return new Database(file, { readonly })
}

function integrity(db, label) {
  const row = db.pragma('integrity_check')
  const result = row?.[0]?.integrity_check ?? 'unknown'
  if (result !== 'ok') fail(`${label} 完整性检查失败：${result}`)
  return result
}

function journalTags(dir) {
  const journal = path.join(dir, 'meta', '_journal.json')
  if (!fs.existsSync(journal)) fail(`找不到迁移清单：${journal}`)
  return JSON.parse(fs.readFileSync(journal, 'utf8')).entries.map((entry) => entry.tag)
}

function appliedTags(db) {
  try {
    return db.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name LIKE \'__drizzle_migrations%\'').all().length
  } catch {
    return 0
  }
}

/** 统计一律用业务键（产品/字段/状态），自增 id 换库就变，不能用来证明恢复成功。 */
function stats(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name))
  const counts = {}
  if (tables.has('proposals')) {
    for (const row of db.prepare('SELECT product, status, trust, COUNT(*) AS n FROM proposals GROUP BY product, status, trust').all()) {
      counts[`${row.product}/${row.status}/${row.trust}`] = Number(row.n)
    }
  }
  if (tables.has('audit_events')) counts.auditEvents = Number(db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n)
  if (tables.has('publish_tasks')) {
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM publish_tasks GROUP BY status').all()) counts[`tasks/${row.status}`] = Number(row.n)
  }
  if (tables.has('idempotency_records')) counts.idempotencyRecords = Number(db.prepare('SELECT COUNT(*) AS n FROM idempotency_records').get().n)
  const newest = tables.has('proposals') ? db.prepare('SELECT MAX(created_at) AS v FROM proposals').get().v ?? null : null
  const ids = tables.has('proposals') ? db.prepare('SELECT id FROM proposals ORDER BY created_at').all().map((row) => row.id) : []
  return { tables: [...tables].sort(), counts, newestProposalAt: newest, proposalIds: ids.sort(), drizzleMigrations: appliedTags(db) }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

switch (command) {
  case 'backup': {
    const out = flagValue(flags, 'out') ?? path.join(dataDir, 'backups', `hub-${stamp()}.sqlite`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const db = open(dbFile)
    integrity(db, '主库')
    await db.backup(out)
    const backupDb = new Database(out, { readonly: true })
    integrity(backupDb, '备份副本')
    const snapshot = stats(backupDb)
    backupDb.close()
    db.close()
    fs.writeFileSync(`${out}.sha256`, `${sha256(out)}  ${path.basename(out)}\n`)
    fs.writeFileSync(`${out}.meta.json`, `${JSON.stringify({ createdAt: new Date().toISOString(), source: dbFile, journalTags: fileSystemTags(), stats: snapshot, sha256: sha256(out) }, null, 2)}\n`)
    // 备份面不留 WAL 碎片，复制出去的必须是一个自洽的库
    const wal = `${out}-wal`
    if (fs.existsSync(wal)) fs.rmSync(wal, { force: true })
    console.log(`✅ 备份完成：${out}（提案 ${snapshot.proposalIds.length} 条，审计 ${snapshot.counts.auditEvents ?? 0} 条）`)
    console.log(`   校验和：${fs.readFileSync(`${out}.sha256`, 'utf8').trim()}`)
    break
  }
  case 'restore': {
    const from = flagValue(flags, 'from') ?? positional[1]
    if (!from || !fs.existsSync(from)) fail('restore 需要 --from <备份文件>')
    if (!flags.force) assertServiceStopped()
    const sourceDb = open(from, { readonly: true })
    integrity(sourceDb, '备份文件')
    const sourceStats = stats(sourceDb)
    const sourceTags = sourceStats.drizzleMigrations
    sourceDb.close()
    const shipped = fileSystemTags().length
    if (sourceTags > shipped) {
      fail(`拒绝降级数据库：备份库已应用 ${sourceTags} 个迁移，当前代码只提供 ${shipped} 个。
   恢复步骤：
     1) hubctl rollback <含这些迁移的版本>   # 或安装更新的部署包，让代码追上数据库
     2) 确认 node scripts/hub-db.mjs verify 通过后再执行 restore
     3) 若确实要回到旧库：restore --from <升级前的更早备份>`)
    }
    const metaFile = `${from}.meta.json`
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
      if (meta.sha256 && meta.sha256 !== sha256(from)) fail('备份文件与随附校验和不一致，拒绝恢复')
      if (Array.isArray(meta.journalTags) && meta.journalTags.length > shipped) {
        fail(`拒绝降级数据库：备份记录 ${meta.journalTags.length} 个迁移，本机代码只有 ${shipped} 个。
   恢复步骤：
     1) hubctl rollback <含这些迁移的版本>   # 让代码追上数据库，而不是把数据库降到代码以下
     2) 或者 restore --from <升级前的更早备份>`)
      }
    }
    const safeDir = path.join(dataDir, 'db', `replaced-${stamp()}`)
    if (fs.existsSync(dbFile)) {
      fs.mkdirSync(safeDir, { recursive: true })
      for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(dbFile + suffix)) fs.copyFileSync(dbFile + suffix, path.join(safeDir, path.basename(dbFile + suffix)))
      }
      fs.rmSync(path.join(safeDir, `${path.basename(dbFile)}-wal`), { force: true })
    }
    fs.mkdirSync(path.dirname(dbFile), { recursive: true })
    fs.copyFileSync(from, dbFile)
    const restored = open(dbFile)
    integrity(restored, '恢复后的库')
    const restoredStats = stats(restored)
    restored.close()
    const sameBusinessKeys = JSON.stringify(sourceStats.counts) === JSON.stringify(restoredStats.counts)
    const sameIds = JSON.stringify(sourceStats.proposalIds) === JSON.stringify(restoredStats.proposalIds)
    console.log(`✅ 已恢复到 ${dbFile}`)
    console.log(`   替换前的现场保留在：${fs.existsSync(safeDir) ? safeDir : '（原本没有数据库文件）'}`)
    console.log(`   备份统计：${JSON.stringify(sourceStats.counts)}`)
    console.log(`   恢复统计：${JSON.stringify(restoredStats.counts)}`)
    if (!sameBusinessKeys || !sameIds) fail('恢复后业务键统计与备份不一致，请检查是否恢复到错误的库')
    break
  }
  case 'verify': {
    const db = open(dbFile)
    integrity(db, '主库')
    const snapshot = stats(db)
    const journal = fileSystemTags()
    console.log(`✅ 数据库正常：${dbFile}`)
    console.log(`   表：${snapshot.tables.join(', ')}`)
    console.log(`   迁移：库内 ${snapshot.drizzleMigrations} 个，代码清单 ${journal.length} 个（${journal.join(' → ') || '无'}）`)
    console.log(`   统计：${JSON.stringify(snapshot.counts)}`)
    if (snapshot.drizzleMigrations > journal.length) fail('库内迁移数多于代码清单：当前部署包比数据库旧，请升级或回滚数据库')
    db.close()
    break
  }
  case 'stats': {
    const db = open(dbFile)
    const snapshot = stats(db)
    db.close()
    console.log(flags.plain ? JSON.stringify(snapshot) : JSON.stringify(snapshot, null, 2))
    break
  }
  default:
    console.log(`用法：node hub-db.mjs <backup|restore|verify|stats> [选项]

  backup  [--data-dir <目录>] [--out <文件>]        SQLite 在线备份（含 sha256 与统计元数据）
  restore --from <备份> --data-dir <目录> [--force]  先校验再替换；迁移不兼容时拒绝降级
  verify  [--data-dir <目录>]                        integrity_check + 迁移兼容性 + 业务统计
  stats   [--data-dir <目录>]                        输出业务键统计（JSON）

服务运行中时 restore 会被拒绝，除非显式 --force。`)
    if (command) fail(`未知命令：${command}`)
}

function fileSystemTags() {
  try {
    return journalTags(migrationsDir)
  } catch {
    return []
  }
}

function assertServiceStopped() {
  const pidFile = path.join(dataDir, 'run', 'hubd.pid')
  if (!fs.existsSync(pidFile)) return
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
  if (!Number.isInteger(pid)) return
  try {
    process.kill(pid, 0)
    fail(`服务仍在运行（pid=${pid}）。先执行 hubctl stop，再恢复数据库。`)
  } catch {
    // 陈旧 pid 文件不阻塞恢复
  }
}

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

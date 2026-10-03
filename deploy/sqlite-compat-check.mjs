import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const results = []

/**
 * 驱动兼容性试验：SQLite 驱动必须在真正要跑服务的设备上通过，
 * 不能拿电脑（macOS/Linux glibc）编译出来的原生模块冒充 Android 产物。
 * 未通过时停止安装并报告，禁止静默改用别的数据库。
 */
async function step(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    results.push({ name, ok: false, detail })
    console.error(`  ❌ ${name} — ${detail}`)
  }
  return results.at(-1)?.ok === true
}

function report(summary) {
  const failed = results.filter((item) => !item.ok)
  console.log(`\n驱动兼容性试验：${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) {
    console.error('❌ 目标设备上的 SQLite 驱动不满足要求。按规范：先做独立兼容性试验并停下，不得静默改换数据库。')
    console.error(`   失败项：${failed.map((item) => `${item.name}（${item.detail}）`).join('; ')}`)
    console.error('   Termux 常见前置：pkg update && pkg install nodejs make clang python3 binutils')
    console.error('   然后在本目录重新安装生产依赖（npm install --omit=dev），依赖必须在设备上编译。')
    process.exit(1)
  }
  console.log(`✅ ${summary}`)
}

console.log('【设备与运行时】')
console.log(`  node=${process.version} platform=${process.platform} arch=${process.arch}`)
console.log(`  os=${os.type()} ${os.release()} 内存=${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)}GB`)

await step('Node 版本满足要求（>=22.5）', () => {
  const [major, minor] = process.version.slice(1).split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 5)) throw new Error(`当前 ${process.version}，需要 >= 22.5`)
  return process.version
})

let Database = null
const loaded = await step('加载本机编译的 better-sqlite3', () => {
  Database = require('better-sqlite3')
  if (typeof Database !== 'function') throw new Error('模块导出形态异常')
  const version = require('better-sqlite3/package.json').version
  return `better-sqlite3@${version}`
})
if (!loaded) report('未完成')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-sqlite-compat-'))
const dbFile = path.join(dir, 'compat.sqlite')
let db = null

const created = await step('建库并启用 WAL', () => {
  db = new Database(dbFile)
  const mode = db.pragma('journal_mode = WAL')
  const value = String(Object.values(mode?.[0] ?? {})[0] ?? '')
  if (value.toLowerCase() !== 'wal') throw new Error(`journal_mode=${value}`)
  db.pragma('synchronous = FULL')
  db.pragma('busy_timeout = 5000')
  return 'journal_mode=wal, synchronous=FULL, busy_timeout=5000'
})
if (!created) {
  report('未完成')
}

await step('建表与唯一索引', () => {
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, k TEXT NOT NULL, n INTEGER NOT NULL)')
  db.exec('CREATE UNIQUE INDEX t_k_idx ON t (k)')
  return `sqlite_version=${db.prepare('SELECT sqlite_version() AS v').get().v}`
})

await step('事务写入与回滚', () => {
  const insert = db.prepare('INSERT INTO t (id, k, n) VALUES (?, ?, ?)')
  db.transaction((rows) => { for (const row of rows) insert.run(...row) })([['a', 'k1', 1], ['b', 'k2', 2]])
  try {
    db.transaction(() => {
      insert.run('c', 'k3', 3)
      throw new Error('故意失败')
    })()
  } catch {
    // 期望回滚
  }
  const count = Number(db.prepare('SELECT COUNT(*) AS n FROM t').get().n)
  if (count !== 2) throw new Error(`事务未回滚，行数=${count}`)
  return '提交与回滚都正确'
})

await step('唯一约束拒绝重复幂等键', () => {
  let rejected = false
  try {
    db.prepare('INSERT INTO t (id, k, n) VALUES (?, ?, ?)').run('d', 'k1', 4)
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('唯一索引未生效，幂等保证不成立')
  return 'ok'
})

await step('Drizzle 迁移表形态可用', () => {
  db.exec('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)')
  db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run('x'.repeat(64), 1)
  return `记录 ${Number(db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get().n)} 条迁移`
})

await step('关闭后重开，数据仍在（进程重启场景）', () => {
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
  db = new Database(dbFile)
  const rows = db.prepare('SELECT id FROM t ORDER BY id').all().map((row) => row.id).join(',')
  if (rows !== 'a,b') throw new Error(`重开后内容不符：${rows}`)
  return rows
})

const backupFile = path.join(dir, 'backup.sqlite')
await step('在线备份 API（WAL 一致性备份的前提）', async () => {
  await db.backup(backupFile)
  const backup = new Database(backupFile, { readonly: true })
  const check = backup.pragma('integrity_check')
  const rows = backup.prepare('SELECT id FROM t ORDER BY id').all().map((row) => row.id).join(',')
  backup.close()
  if (String(Object.values(check?.[0] ?? {})[0] ?? '').toLowerCase() !== 'ok') throw new Error('备份完整性检查失败')
  if (rows !== 'a,b') throw new Error(`备份内容不符：${rows}`)
  return '备份可读且行数一致'
})

await step('私有文件系统可写且支持文件锁', () => {
  const probe = path.join(dir, 'lock.sqlite')
  const one = new Database(probe)
  const two = new Database(probe)
  one.pragma('busy_timeout = 2000')
  one.exec('CREATE TABLE IF NOT EXISTS lockprobe (x INTEGER)')
  one.prepare('BEGIN IMMEDIATE').run()
  let blocked = false
  try {
    two.prepare('BEGIN IMMEDIATE').run()
  } catch {
    blocked = true
  }
  one.prepare('COMMIT').run()
  one.close()
  two.close()
  if (!blocked) throw new Error('第二个连接未被拒绝：文件锁在该文件系统上不可靠（/sdcard 挂载就是这样）')
  return '两个连接争抢同一库时按预期阻塞'
})

if (db) {
  try { db.close() } catch { /* 已关闭 */ }
}
fs.rmSync(dir, { recursive: true, force: true })
report('本机驱动可用：可以继续 hubctl install')

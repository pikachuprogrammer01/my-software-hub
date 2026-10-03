import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

export type Store = {
  raw: Database.Database
  db: BetterSQLite3Database<typeof schema>
  dbFile: string
  transaction: <T>(fn: (tx: BetterSQLite3Database<typeof schema>) => T) => T
  /** SQLite 在线备份：WAL 写入中也不会只复制主库文件。 */
  backupTo: (targetFile: string) => Promise<string>
  appliedMigrations: () => { id: number; hash: string; createdAt: number }[]
  checkpoint: () => void
  close: () => void
}

export function openStore(options: { dbFile: string; migrationsDir: string }): Store {
  fs.mkdirSync(path.dirname(options.dbFile), { recursive: true })
  const raw = new Database(options.dbFile)
  // WAL + FULL：手机随时可能断电或被系统杀进程，宁可牺牲吞吐也不丢已确认的提案。
  raw.pragma('journal_mode = WAL')
  raw.pragma('synchronous = FULL')
  raw.pragma('busy_timeout = 5000')
  raw.pragma('foreign_keys = ON')

  const db = drizzle(raw, { schema })
  if (!fs.existsSync(path.join(options.migrationsDir, 'meta', '_journal.json'))) {
    throw new Error(`找不到迁移清单：${path.join(options.migrationsDir, 'meta', '_journal.json')}`)
  }
  migrate(db, { migrationsFolder: options.migrationsDir })

  return {
    raw,
    db,
    dbFile: options.dbFile,
    transaction: (fn) => db.transaction(fn),
    backupTo: (targetFile) => {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true })
      return raw.backup(targetFile).then(() => targetFile)
    },
    appliedMigrations: () =>
      (
        raw
          .prepare('SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id')
          .all() as { id: number | string; hash: string; created_at: number | string }[]
      ).map((row) => ({ id: Number(row.id), hash: String(row.hash), createdAt: Number(row.created_at) })),
    checkpoint: () => {
      raw.pragma('wal_checkpoint(TRUNCATE)')
    },
    close: () => {
      try {
        raw.pragma('wal_checkpoint(TRUNCATE)')
      } catch {
        // 已经关闭或库被替换时不必再报错，close 才是真正的结局
      }
      raw.close()
    }
  }
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
/** 仓库根（开发态 = server/ 的上一级；部署态 = 版本目录） */
export const PROJECT_ROOT = path.resolve(here, '..')

export type ServerConfig = {
  env: string
  host: string
  port: number
  dataDir: string
  staticDir: string
  contentDir: string
  schemaDir: string
  migrationsDir: string
  dbFile: string
  allowedOrigins: string[]
  rateLimitPerMinute: number
  maxBodyBytes: number
  requestTimeoutMs: number
  version: string
  reviewerToken: string | null
  submitterTokens: string[]
}

function absPath(value: string | undefined, fallback: string, label: string): string {
  const resolved = value && value.length ? value : fallback
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${label} 必须是绝对路径（当前：${resolved}）。Termux 私有目录形如 /data/data/com.termux/files/home/hub-data`)
  }
  // 共享存储在 Android 上由 sdcardfs/FUSE 挂载，SQLite 的文件锁与 WAL 在其上不可靠。
  if (/\/(sdcard|storage)[/$]/.test(resolved)) {
    throw new Error(`${label} 不能落在 /sdcard 或 /storage 共享存储：数据库与依赖必须放在 Termux 私有文件系统`)
  }
  return resolved
}

function readToken(env: NodeJS.ProcessEnv, tokenKey: string, fileKey: string): string | null {
  const inline = env[tokenKey]
  if (inline && inline.trim().length) return inline.trim()
  const file = env[fileKey]
  if (file && fs.existsSync(file)) {
    const value = fs.readFileSync(file, 'utf8').trim()
    if (value.length) return value
  }
  return null
}

function positiveInt(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} 必须是正整数（当前：${raw}）`)
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.HOST && env.HOST.length ? env.HOST : '127.0.0.1'
  const dataDir = absPath(env.HUB_DATA_DIR, path.join(PROJECT_ROOT, '.hub-data'), 'HUB_DATA_DIR')
  const staticDir = absPath(env.HUB_STATIC_DIR, path.join(PROJECT_ROOT, '.vitepress', 'dist'), 'HUB_STATIC_DIR')
  const envName = env.NODE_ENV ?? 'development'

  if (!fs.existsSync(staticDir)) {
    throw new Error(`HUB_STATIC_DIR 不存在：${staticDir}\n  站点必须先由电脑侧 vitepress build 产出静态文件，手机不做构建。`)
  }

  return {
    env: envName,
    host,
    port: positiveInt(env.PORT, 8787, 'PORT'),
    dataDir,
    staticDir,
    contentDir: absPath(env.HUB_CONTENT_DIR, path.join(PROJECT_ROOT, 'data', 'generated'), 'HUB_CONTENT_DIR'),
    schemaDir: absPath(env.HUB_SCHEMA_DIR, path.join(PROJECT_ROOT, 'schema'), 'HUB_SCHEMA_DIR'),
    migrationsDir: absPath(env.HUB_MIGRATIONS_DIR, path.join(PROJECT_ROOT, 'migrations'), 'HUB_MIGRATIONS_DIR'),
    dbFile: path.join(dataDir, 'db', 'hub.sqlite'),
    allowedOrigins: (env.HUB_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    rateLimitPerMinute: positiveInt(env.HUB_RATE_LIMIT_PER_MIN, 30, 'HUB_RATE_LIMIT_PER_MIN'),
    maxBodyBytes: positiveInt(env.HUB_MAX_BODY_BYTES, 16384, 'HUB_MAX_BODY_BYTES'),
    requestTimeoutMs: positiveInt(env.HUB_REQUEST_TIMEOUT_MS, 10000, 'HUB_REQUEST_TIMEOUT_MS'),
    version: env.HUB_VERSION ?? readPackageVersion(PROJECT_ROOT),
    reviewerToken: readToken(env, 'HUB_REVIEWER_TOKEN', 'HUB_REVIEWER_TOKEN_FILE'),
    submitterTokens: (readToken(env, 'HUB_SUBMITTER_TOKEN', 'HUB_SUBMITTER_TOKEN_FILE') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  }
}

function readPackageVersion(root: string): string {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? '0.0.0')
  } catch {
    // 部署包里没有 package.json 时，版本号由 HUB_VERSION 提供
    return '0.0.0'
  }
}

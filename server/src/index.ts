import fs from 'node:fs'
import path from 'node:path'
import { serve, type ServerType } from '@hono/node-server'
import { loadConfig } from './config.js'
import { openStore } from './db/index.js'
import { ContentStore } from './content.js'
import { createApp } from './app.js'

const config = loadConfig()
const store = openStore({ dbFile: config.dbFile, migrationsDir: config.migrationsDir })
const content = new ContentStore(config.contentDir, config.schemaDir)
const app = createApp({ config, store, content })

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true })
const runDir = path.join(config.dataDir, 'run')
fs.mkdirSync(runDir, { recursive: true })
const pidFile = path.join(runDir, 'hubd.pid')

function otherInstanceRunning(): number | null {
  if (!fs.existsSync(pidFile)) return null
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
    return pid === process.pid ? null : pid
  } catch {
    return null // 陈旧 pid 文件：进程已不在
  }
}

const running = otherInstanceRunning()
if (running !== null) {
  console.error(JSON.stringify({ level: 'fatal', message: `已有实例在运行（pid=${running}），拒绝重复启动`, pidFile }))
  store.close()
  process.exit(75)
}
fs.writeFileSync(pidFile, `${process.pid}\n`)

const server: ServerType = serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
})

// 手机网络环境不稳：慢请求要超时断掉，而不是堆积在单进程里
;(server as unknown as { requestTimeout: number; keepAliveTimeout: number }).requestTimeout = config.requestTimeoutMs
;(server as unknown as { requestTimeout: number; keepAliveTimeout: number }).keepAliveTimeout = Math.max(5000, config.requestTimeoutMs)

function boundPort(): number {
  const address = server.address()
  // PORT=0 时 config.port 仍是 0，运维与测试要的是内核实际分配的那个
  return typeof address === 'object' && address ? address.port : config.port
}

function announce(): void {
  const port = boundPort()
  fs.writeFileSync(path.join(runDir, 'hubd.port'), `${port}\n`)
  console.log(JSON.stringify({
    level: 'info',
    event: 'start',
    version: config.version,
    env: config.env,
    node: process.version,
    host: config.host,
    port,
    listen: `${config.host}:${port}`,
    lanReachable: config.host === '0.0.0.0',
    dataDir: config.dataDir,
    staticDir: config.staticDir,
    dbFile: config.dbFile,
    migrationsApplied: store.appliedMigrations().length,
    reviewerIdentityConfigured: config.reviewerToken !== null,
    submitterTokensConfigured: config.submitterTokens.length > 0
  }))
}

if (server.listening) announce()
else server.once('listening', announce)
if (config.env === 'production' && !config.reviewerToken) {
  console.warn(JSON.stringify({ level: 'warn', message: '未配置审核身份：提案接口仍可接收，但裁决端点会返回 503，需要在电脑侧经站点仓受控变更处理' }))
}

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }))
  const force = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', message: '优雅停止超时，强制退出' }))
    process.exit(1)
  }, 5000)
  force.unref()
  server.close(() => {
    try {
      store.close() // 关闭前 checkpoint WAL，备份面不留半截日志
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: `关闭数据库失败：${error instanceof Error ? error.message : String(error)}` }))
    }
    try {
      if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) {
        fs.rmSync(pidFile, { force: true })
        fs.rmSync(path.join(runDir, 'hubd.port'), { force: true })
      }
    } catch {
      // pid 文件已被新实例覆盖时不删除别人的文件
    }
    clearTimeout(force)
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({ level: 'error', event: 'uncaught', message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined }))
  shutdown('uncaughtException')
})

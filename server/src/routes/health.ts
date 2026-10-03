import type { Context, Hono } from 'hono'
import type { ServerConfig } from '../config.js'
import type { Store } from '../db/index.js'
import type { ContentStore } from '../content.js'
import type { AppEnv } from '../http/middleware.js'

const startedAt = Date.now()

/**
 * 健康检查只报运行状态：不返回配置、凭证、提案正文或环境变量。
 * 内容 revision 是发布副本的指纹，用来核对部署是否切换成功。
 */
export function registerHealth(app: Hono<AppEnv>, deps: { config: ServerConfig; store: Store; content: ContentStore }): void {
  app.get('/health', (c: Context<AppEnv>) => {
    let migrationsApplied = 0
    let dbOk = false
    try {
      migrationsApplied = deps.store.appliedMigrations().length
      deps.store.raw.prepare('SELECT 1').get()
      dbOk = true
    } catch {
      dbOk = false
    }
    const contentProducts = deps.content
      .registry()
      .filter((product) => product.contentSource)
      .map((product) => ({ id: product.id, revision: deps.content.latestPackage(product.id)?.contentRevision ?? null }))

    const payload = {
      status: dbOk ? 'ok' : 'degraded',
      service: 'my-software-hub',
      version: deps.config.version,
      env: deps.config.env,
      node: process.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database: { ok: dbOk, migrationsApplied },
      contentProducts
    }
    return c.json(payload, dbOk ? 200 : 503)
  })
}

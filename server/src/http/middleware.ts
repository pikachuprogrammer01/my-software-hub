import crypto from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { ApiError, ERROR_CODES } from './errors.js'

export type AppEnv = { Variables: { requestId: string; clientIp: string } }

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function newRequestId(): string {
  return `req-${crypto.randomUUID()}`
}

/** 只接受形态合法的传入 request id，避免把任意字符串写进审计。 */
export function resolveRequestId(header: string | undefined): string {
  return header && ID_RE.test(header) ? header : newRequestId()
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function socketIp(env: unknown): string {
  const source = env as
    | { incoming?: { socket?: { remoteAddress?: string } }; outgoingMessage?: { socket?: { remoteAddress?: string } } }
    | undefined
  return source?.incoming?.socket?.remoteAddress ?? source?.outgoingMessage?.socket?.remoteAddress ?? 'unknown'
}

export const requestContext: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = resolveRequestId(c.req.header('x-request-id'))
  c.set('requestId', requestId)
  c.set('clientIp', socketIp(c.env))
  await next()
  c.header('X-Request-Id', requestId)
}

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
}

/**
 * 写操作默认只允许同源；额外来源必须显式白名单。
 * 站点 HTML 与资源的读取不受此限制（浏览器导航本来就带不上可比 Origin）。
 */
export function originGuard(options: { extraOrigins: string[]; host: string; port: number }): MiddlewareHandler<AppEnv> {
  const sameOrigin = (hostname: string) => [
    `http://${hostname}:${options.port}`,
    `http://${options.host}:${options.port}`,
    `http://127.0.0.1:${options.port}`,
    `http://localhost:${options.port}`
  ]
  return async (c, next) => {
    const method = c.req.method
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await next()
      return
    }
    const origin = c.req.header('origin')
    if (!origin) {
      await next()
      return
    }
    const hostHeader = (c.req.header('host') ?? '').replace(/:\d+$/, '')
    const allowed = new Set([...sameOrigin(hostHeader), ...options.extraOrigins])
    if (!allowed.has(origin)) {
      throw new ApiError(ERROR_CODES.forbidden_origin, '来源不在允许列表内', {
        details: { reason: 'cross_origin_write_blocked', hint: '用 HUB_ALLOWED_ORIGINS 显式登记额外来源' }
      })
    }
    await next()
  }
}

type Bucket = { count: number; resetAt: number }

/**
 * 固定窗口限流：按 客户端 IP + 方法 + 路径 计数。
 * 进程重启清零，因此它只用于挡滥用，不是配额账本。
 */
export function rateLimit(options: { perMinute: number }): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, Bucket>()
  return async (c, next) => {
    const now = Date.now()
    const key = `${c.get('clientIp')}|${c.req.method}|${c.req.path}`
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 })
      if (buckets.size > 4096) {
        for (const [staleKey, stale] of buckets) if (stale.resetAt <= now) buckets.delete(staleKey)
      }
      c.header('X-RateLimit-Limit', String(options.perMinute))
      await next()
      return
    }
    bucket.count += 1
    c.header('X-RateLimit-Limit', String(options.perMinute))
    c.header('X-RateLimit-Remaining', String(Math.max(0, options.perMinute - bucket.count)))
    if (bucket.count > options.perMinute) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      c.header('Retry-After', String(retryAfter))
      throw new ApiError(ERROR_CODES.rate_limited, `请求过于频繁，请在 ${retryAfter} 秒后重试`, { retryAfterSeconds: retryAfter })
    }
    await next()
  }
}

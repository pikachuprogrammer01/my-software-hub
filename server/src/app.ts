import { Hono } from 'hono'
import type { ServerConfig } from './config.js'
import type { Store } from './db/index.js'
import type { ContentStore } from './content.js'
import { ApiError, ERROR_CODES, errorBody } from './http/errors.js'
import { originGuard, rateLimit, requestContext, securityHeaders, type AppEnv } from './http/middleware.js'
import { staticHandler } from './http/static.js'
import { createProposalRoutes } from './routes/proposals.js'
import { registerHealth } from './routes/health.js'
import { buildOpenApi } from './openapi.js'

export type AppDeps = { config: ServerConfig; store: Store; content: ContentStore }

/**
 * 静态面与 API 面在同进程但分开注册：API 路由内部出错只会影响那一个请求，
 * 站点文件仍由静态处理器返回，绝不因提案失败而让页面报错。
 */
export function createApp(deps: AppDeps): Hono<AppEnv> {
  const { config } = deps
  const app = new Hono<AppEnv>()

  app.use('*', requestContext)
  app.use('*', securityHeaders)
  app.use('*', originGuard({ extraOrigins: config.allowedOrigins, host: config.host, port: config.port }))
  // 限流要早于路由注册，否则 /v1 处理器已经在链前、绕过了它
  app.use('/v1/*', rateLimit({ perMinute: config.rateLimitPerMinute }))

  app.onError((error, c) => {
    const requestId = c.get('requestId')
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.message, requestId, error.details), error.status as 400, {
        ...(error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {})
      })
    }
    // 未知异常不外泄堆栈，但必须带着 request id 记进 stderr，运维能回溯。
    console.error(JSON.stringify({ level: 'error', requestId, message: error instanceof Error ? error.message : String(error) }))
    return c.json(errorBody(ERROR_CODES.internal, '服务内部错误，请携带 requestId 反馈', requestId), 500)
  })

  registerHealth(app, deps)
  app.get('/v1/openapi.json', (c) => c.json(buildOpenApi(config)))
  app.route('/', createProposalRoutes(deps))

  // /v1 下未匹配的路径要给 JSON 404，不能让静态面用 HTML 冒充
  app.all('/v1/*', (c) => c.json(errorBody(ERROR_CODES.not_found, `没有这个接口：${c.req.path}`, c.get('requestId')), 404))

  app.all('*', staticHandler({ staticDir: config.staticDir }))

  return app
}

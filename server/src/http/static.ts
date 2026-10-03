import fs from 'node:fs'
import path from 'node:path'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './middleware.js'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
}

/** 静态面只应有构建产物；数据库、密钥与环境文件即使被误放进目录也不给读。 */
const BLOCKED_EXT = new Set(['.sqlite', '.sqlite3', '.db', '.wal', '.shm', '.env', '.key', '.pem', '.crt', '.log', '.gz', '.bak'])

export type StaticResolution = { file: string; status: number; redirect?: string }

function sanitize(rawPath: string): string | null {
  let decoded = rawPath
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  if (!decoded.startsWith('/')) decoded = `/${decoded}`
  const normalized = path.posix.normalize(decoded)
  const segments = normalized.split('/').filter(Boolean)
  if (segments.some((segment) => segment.startsWith('.'))) return null
  if (segments.some((segment) => segment === '..' || segment.includes('\\'))) return null
  // 结尾斜杠要保留：/table-flow/ 是目录页，去掉斜杠会让它变成需要再跳一次的 /table-flow
  return `/${segments.join('/')}${normalized.endsWith('/') && segments.length ? '/' : ''}`
}

/**
 * clean URL 解析：/table-flow/ → table-flow/index.html；/features → features.html。
 * 解析不到就 404，不做任何"猜测式回落"，否则坏链接会被静默渲染成首页。
 */
export function resolveStaticFile(staticDir: string, rawPath: string): StaticResolution | null {
  const clean = sanitize(rawPath)
  if (clean === null) return null
  const target = path.resolve(staticDir, `.${clean}`)
  if (target !== path.resolve(staticDir) && !target.startsWith(path.resolve(staticDir) + path.sep)) return null

  const candidates: { file: string; status: number; redirect?: string }[] = []
  if (clean.endsWith('/')) {
    candidates.push({ file: path.join(target, 'index.html'), status: 200 })
  } else {
    candidates.push({ file: `${target}.html`, status: 200 })
    candidates.push({ file: path.join(target, 'index.html'), status: 301, redirect: `${clean}/` })
    candidates.push({ file: target, status: 200 })
  }

  for (const candidate of candidates) {
    const ext = path.extname(candidate.file)
    if (ext && BLOCKED_EXT.has(ext)) continue
    if (!fs.existsSync(candidate.file)) continue
    let stat: fs.Stats
    try {
      stat = fs.statSync(candidate.file)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    return candidate
  }
  return null
}

export function staticHandler(options: { staticDir: string }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      await next()
      return
    }
    const resolution = resolveStaticFile(options.staticDir, new URL(c.req.url).pathname)
    if (resolution === null) {
      const notFoundPage = path.join(options.staticDir, '404.html')
      if (fs.existsSync(notFoundPage)) {
        return c.body(await fs.promises.readFile(notFoundPage), 404, {
          'content-type': MIME['.html'] ?? 'text/html; charset=utf-8',
          'cache-control': 'no-cache'
        })
      }
      return c.json({ error: { code: 'not_found', message: '没有这个资源', requestId: c.get('requestId') } }, 404)
    }

    if (resolution.redirect) return c.redirect(resolution.redirect, 301)
    const ext = path.extname(resolution.file)
    const body = await fs.promises.readFile(resolution.file)
    const cache = ext === '.html' || resolution.file.endsWith('index.html') ? 'no-cache' : /(^|\/)assets\//.test(resolution.file) ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
    const headers = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': cache,
      'content-length': String(body.byteLength)
    }
    return new Response(c.req.method === 'HEAD' ? null : body, { status: 200, headers })
  }
}

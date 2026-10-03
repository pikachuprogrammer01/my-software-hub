import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SITE_ROOT = path.dirname(here)
export const RELEASE_FILE = path.join(SITE_ROOT, '.vitepress', 'release.json')

/** 扩展与站点共用同一份更新清单，站点不自行拼版本号与下载直链。 */
export const UPDATE_MANIFEST_URL =
  'https://gitee.com/pikachuprogrammer01/my-software-releases/raw/table-flow/update.json'

const FALLBACK = { version: '0.0.0', url: '', notes: '', fetchedAt: null }

export function readRelease() {
  try {
    return { ...FALLBACK, ...JSON.parse(fs.readFileSync(RELEASE_FILE, 'utf8')) }
  } catch {
    return FALLBACK
  }
}

function isValid(v) {
  return /^\d+\.\d+\.\d+$/.test(String(v ?? ''))
}

/**
 * 开发/构建启动时拉一次线上清单。拉不到就沿用本地 release.json 并明确告警，
 * 避免"网络抖一下 → 站点首页显示 v0.0.0 或旧版"这类静默错报。
 */
export async function syncRelease({ timeoutMs = 8000 } = {}) {
  const current = readRelease()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(UPDATE_MANIFEST_URL, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!isValid(json.version)) throw new Error(`版本号形态异常：${json.version}`)
    if (!String(json.url ?? '').startsWith('https://')) throw new Error('下载地址不是 https')
    const next = {
      version: json.version,
      url: json.url,
      notes: typeof json.notes === 'string' ? json.notes.trim() : '',
      fetchedAt: new Date().toISOString()
    }
    fs.mkdirSync(path.dirname(RELEASE_FILE), { recursive: true })
    fs.writeFileSync(RELEASE_FILE, `${JSON.stringify(next, null, 2)}\n`)
    if (next.version !== current.version) {
      console.log(`[site] 版本跟随线上 update.json：v${current.version} → v${next.version}`)
    }
    return next
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    if (!isValid(current.version)) {
      console.error(`[site] 拉取失败（${reason}）且本地无可用版本号，下载按钮将禁用`)
      return current
    }
    console.warn(`[site] 未能拉取线上 update.json（${reason}），沿用本地缓存 v${current.version}`)
    return current
  } finally {
    clearTimeout(timer)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = await syncRelease()
  console.log(JSON.stringify(release, null, 2))
}

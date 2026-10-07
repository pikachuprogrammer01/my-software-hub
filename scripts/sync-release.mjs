import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SITE_ROOT = path.dirname(here)
export const RELEASE_FILE = path.join(SITE_ROOT, '.vitepress', 'release.json')

/**
 * 扩展与站点共用同一份更新清单，站点不自行拼版本号与下载直链。
 * HUB_UPDATE_MANIFEST_URL 只给测试与离线镜像用，默认值就是线上真值。
 */
export const UPDATE_MANIFEST_URL =
  process.env.HUB_UPDATE_MANIFEST_URL ??
  'https://gitee.com/pikachuprogrammer01/my-software-releases/raw/table-flow/update.json'

/**
 * 站点只同步这一个产品的 update.json 快照；渲染层与漂移检查都以此判定"哪个产品
 * 才有下载直链可比"，避免把 table-flow 的直链当成别的产品的事实。
 */
export const RELEASE_SNAPSHOT_PRODUCT = 'table-flow'

const FALLBACK = { product: RELEASE_SNAPSHOT_PRODUCT, version: '0.0.0', url: '', notes: '', fetchedAt: null }

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
    const facts = {
      product: RELEASE_SNAPSHOT_PRODUCT,
      version: json.version,
      url: json.url,
      notes: typeof json.notes === 'string' ? json.notes.trim() : ''
    }
    // fetchedAt 只在版本事实真的变化时前进：每次构建都刷时间戳会让工作树永远脏，
    // 而这个文件是"版本事实缓存"，不是"上次运行时间"。
    if (current.fetchedAt && JSON.stringify({ ...current, fetchedAt: null }) === JSON.stringify({ ...facts, fetchedAt: null })) {
      return current
    }
    const next = { ...facts, fetchedAt: new Date().toISOString() }
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

/**
 * 直接跑本文件时才打印快照。判定要过 realpath：macOS 上 /var 与 /tmp 都是软链，
 * 只比字符串会让 `pnpm sync` 在临时目录里静默变成空操作（退出码 0、什么都没写）。
 */
function isCliEntry() {
  if (!process.argv[1]) return false
  const self = fileURLToPath(import.meta.url)
  const target = path.resolve(process.argv[1])
  if (target === self) return true
  try {
    return fs.realpathSync(target) === fs.realpathSync(self)
  } catch {
    return false
  }
}

if (isCliEntry()) {
  const release = await syncRelease()
  console.log(JSON.stringify(release, null, 2))
}

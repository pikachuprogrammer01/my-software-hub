import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SITE_ROOT = path.dirname(here)
export const RELEASE_FILE = path.join(SITE_ROOT, '.vitepress', 'releases.json')

/**
 * 扩展与站点共用同一份更新清单，站点不自行拼版本号与下载直链。
 * HUB_UPDATE_MANIFEST_BASE 只给测试与离线镜像用，默认值就是线上真值。
 */
export const UPDATE_MANIFEST_BASE =
  process.env.HUB_UPDATE_MANIFEST_BASE ??
  'https://gitee.com/pikachuprogrammer01/my-software-releases/raw'

/** 每个有发布仓分支的产品各有一份清单：<base>/<branch>/update.json */
export function manifestUrlOf(branch) {
  // data: / file: 这类测试与离线镜像地址不能再拼路径段，直接当整份清单用。
  if (/^(data|file):/.test(UPDATE_MANIFEST_BASE)) return UPDATE_MANIFEST_BASE
  return `${UPDATE_MANIFEST_BASE}/${branch}/update.json`
}

const placeholder = (product) => ({ product, version: '0.0.0', url: '', urls: null, notes: '', fetchedAt: null })

/** 读整张快照表；文件缺失或损坏都退回空表，调用方按产品各自退回占位。 */
export function readReleases() {
  try {
    const raw = JSON.parse(fs.readFileSync(RELEASE_FILE, 'utf8'))
    const products = raw?.products && typeof raw.products === 'object' ? raw.products : {}
    return { products }
  } catch {
    return { products: {} }
  }
}

export function readRelease(product) {
  return { ...placeholder(product), ...(readReleases().products?.[product] ?? {}) }
}

function isValid(v) {
  return /^\d+\.\d+\.\d+$/.test(String(v ?? ''))
}

async function fetchManifest(branch, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(manifestUrlOf(branch), { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!isValid(json.version)) throw new Error(`版本号形态异常：${json.version}`)
    // 浏览器扩展只给一条 url，桌面应用按平台给 urls；两种都接受，但必须都是 https。
    const single = typeof json.url === 'string' ? json.url : ''
    const many = json.urls && typeof json.urls === 'object' ? json.urls : null
    const all = [single, ...Object.values(many ?? {})].filter(Boolean)
    if (!all.length) throw new Error('清单里没有下载地址')
    if (all.some((url) => !String(url).startsWith('https://'))) throw new Error('下载地址不是 https')
    return {
      version: json.version,
      url: single,
      urls: many,
      notes: typeof json.notes === 'string' ? json.notes.trim() : ''
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 开发/构建启动时按产品各拉一次线上清单。某个产品拉不到就沿用本地快照并明确告警，
 * 避免"网络抖一下 → 站点显示 v0.0.0 或旧版"这类静默错报。
 * fetchedAt 只在版本事实真的变化时前进：每次构建都刷时间戳会让工作树永远脏，
 * 而这个文件是"版本事实缓存"，不是"上次运行时间"。
 */
export async function syncRelease({ branches, timeoutMs = 8000 } = {}) {
  const registry = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'data', 'products.json'), 'utf8'))
  const targets = branches ?? [...new Set(registry.products.map((item) => item.releaseBranch).filter(Boolean))]
  const snapshot = readReleases()
  let dirty = false

  await Promise.all(
    targets.map(async (branch) => {
      const current = { ...placeholder(branch), ...(snapshot.products[branch] ?? {}) }
      try {
        const facts = { product: branch, ...(await fetchManifest(branch, timeoutMs)) }
        const unchanged =
          current.fetchedAt && JSON.stringify({ ...current, fetchedAt: null }) === JSON.stringify({ ...facts, fetchedAt: null })
        if (unchanged) return
        snapshot.products[branch] = { ...facts, fetchedAt: new Date().toISOString() }
        dirty = true
        if (current.version !== facts.version) {
          console.log(`[site] ${branch} 版本跟随线上 update.json：v${current.version} → v${facts.version}`)
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        if (!isValid(current.version) || current.version === '0.0.0') {
          // 拉不到又没有可用缓存：删掉这一条，渲染层会退化成"无下载直链"而不是报错。
          console.error(`[site] ${branch} 拉取失败（${reason}）且本地无可用版本号`)
          if (snapshot.products[branch]) {
            delete snapshot.products[branch]
            dirty = true
          }
        } else {
          console.warn(`[site] ${branch} 未能拉取线上 update.json（${reason}），沿用本地缓存 v${current.version}`)
        }
      }
    })
  )

  if (dirty) {
    fs.mkdirSync(path.dirname(RELEASE_FILE), { recursive: true })
    fs.writeFileSync(RELEASE_FILE, `${JSON.stringify(snapshot, null, 2)}\n`)
  }
  return snapshot
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
  const snapshot = await syncRelease()
  console.log(JSON.stringify(snapshot, null, 2))
}

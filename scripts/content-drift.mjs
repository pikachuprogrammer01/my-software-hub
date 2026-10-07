import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, flagValue } from './lib/args.mjs'
import {
  GENERATED_DIR,
  SITE_ROOT,
  connectedProducts,
  generatedPaths,
  packageFromSource,
  payloadHash,
  readJson,
  readSource,
  semanticPayload,
  verifyPackage,
  RELEASE_SNAPSHOT_PRODUCT
} from './content-lib.mjs'

const { flags } = parseArgs()
const only = flagValue(flags, 'product')

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function diffFacts(expected, actual) {
  const rows = []
  const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})])
  for (const key of keys) {
    const left = JSON.stringify(expected?.[key] ?? null)
    const right = JSON.stringify(actual?.[key] ?? null)
    if (left !== right) rows.push(`${key}: source=${left} latest=${right}`)
  }
  return rows
}

let failures = 0
const products = connectedProducts().filter((item) => !only || item.id === only)

for (const product of products) {
  const latestPath = path.join(GENERATED_DIR, product.id, 'content-latest.v1.json')
  try {
    if (!fs.existsSync(latestPath)) throw new Error('缺少 latest 内容包')
    const actual = readJson(latestPath)
    const expected = packageFromSource(readSource(product.id).source, product)

    // 包内 SHA 必须由自身语义推出，否则分发面上是一份被改过的包。
    const selfCheck = verifyPackage(actual, product.id)
    if (!selfCheck.ok) throw new Error(`内容包自校验失败：${selfCheck.errors.join('; ')}`)

    if (actual.product !== product.id) throw new Error('latest 产品归属错误')

    // 事实比较只看语义：sourceRevision / generatedAt 随提交与时间变化，
    // 不能用来跳过漂移判定（旧实现正是这样漏掉了漂移）。
    const semanticDrift = payloadHash(semanticPayload(actual)) !== payloadHash(semanticPayload(expected))
    if (semanticDrift) {
      const rows = diffFacts(expected.facts, actual.facts)
      const copyRows = diffFacts(expected.copy, actual.copy)
      throw new Error(`source 与 latest 漂移\n      ${(rows.length ? rows : copyRows).join('\n      ') || '（语义差异无法定位到单字段）'}`)
    }

    // latest 必须指向真实存在的不可变 history revision。
    const revisionPath = generatedPaths(product.id, actual.contentRevision).revision
    if (!fs.existsSync(revisionPath)) throw new Error(`latest 指向的 revision 不存在：${actual.contentRevision}`)
    if (!sameFileSemantics(revisionPath, actual)) throw new Error(`history revision 与 latest 不一致：${actual.contentRevision}`)

    // .vitepress/release.json 只同步 table-flow 的 update.json，别的版本事实不能拿它比对。
    if (product.releaseBranch === RELEASE_SNAPSHOT_PRODUCT) {
      const releaseFile = path.join(SITE_ROOT, '.vitepress', 'release.json')
      const current = actual.facts?.['version.current']?.value
      if (fs.existsSync(releaseFile)) {
        const release = readJson(releaseFile)
        // 只有真从发布仓同步来的版本号才可比；0.0.0 是拉取失败的占位。
        if (release.version && release.version !== '0.0.0' && current && current !== release.version) {
          throw new Error(`内容事实 v${current} 与 update.json v${release.version} 不一致`)
        }
      }
    }

    console.log(`✅ ${product.id}: latest 可追溯（${actual.contentRevision}）`)
  } catch (error) {
    failures += 1
    console.error(`❌ ${product.id}: ${error.message}`)
  }
}

function sameFileSemantics(file, pkg) {
  try {
    return payloadHash(semanticPayload(readJson(file))) === payloadHash(semanticPayload(pkg))
  } catch {
    return false
  }
}

/**
 * 逐字副本的源仓在构建机上未必存在：在就比哈希，不在就只声明"未核对"。
 * 源仓跑到前面只告警不阻断——副本里可能刻意不含未发布功能（见登记表的 whyBehind）。
 */
const mirrorsFile = path.join(SITE_ROOT, 'data/mirrors.json')
if (fs.existsSync(mirrorsFile)) {
  console.log('\n逐字副本（镜像）核对')
  for (const mirror of readJson(mirrorsFile).mirrors ?? []) {
    const siteFile = path.join(SITE_ROOT, mirror.site)
    if (!fs.existsSync(siteFile)) {
      console.error(`❌ ${mirror.site}: 登记表指向的文件不存在`)
      failures += 1
      continue
    }
    const siteSha = sha256File(siteFile)
    if (siteSha !== mirror.siteSha256) {
      console.error(`❌ ${mirror.site}: 与登记哈希不一致，站点侧被改过（应回开发仓改再同步）`)
      failures += 1
      continue
    }
    const sourceFile = path.join(SITE_ROOT, '..', mirror.source)
    if (!fs.existsSync(sourceFile)) {
      console.log(`ℹ️ ${mirror.site}: 源仓不在本机，未核对（登记同步于 ${mirror.syncedAt}）`)
      continue
    }
    if (sha256File(sourceFile) === siteSha) {
      console.log(`✅ ${mirror.site}: 与 ${mirror.source} 逐字节一致`)
    } else {
      console.log(`⚠️  ${mirror.site}: 源仓 ${mirror.source} 已跑到前面（同步于 ${mirror.syncedAt}）${mirror.whyBehind ? `——${mirror.whyBehind}` : ''}`)
    }
  }
}

if (failures) {
  console.error(`\n漂移检查：${failures} 项失败`)
  process.exit(1)
}
console.log(`\n漂移检查：${products.length} 个产品通过`)

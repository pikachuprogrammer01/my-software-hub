import path from 'node:path'
import fs from 'node:fs'
import { parseArgs, flagValue } from './lib/args.mjs'
import {
  connectedProducts,
  generatedPaths,
  packageFromSource,
  readJson,
  readSource,
  sameSemantics,
  validateSource,
  verifyPackage,
  writeJsonIfChanged
} from './content-lib.mjs'

const { flags } = parseArgs()
const only = flagValue(flags, 'product')
const dryRun = Boolean(flags['dry-run'])

if (only && !connectedProducts().some((item) => item.id === only)) {
  console.error(`❌ 未知或尚未接入内容源的产品：${only}`)
  process.exit(2)
}

const products = connectedProducts().filter((item) => !only || item.id === only)
const results = []

for (const registry of products) {
  try {
    const { source } = readSource(registry.id)
    if (!source) throw new Error('缺少内容源')
    const checked = validateSource(source, registry)
    if (!checked.ok) throw new Error(`内容源校验失败：\n    ${checked.errors.join('\n    ')}`)

    const content = packageFromSource(source, registry)
    const paths = generatedPaths(registry.id, content.contentRevision)

    if (dryRun) {
      results.push({ product: registry.id, revision: content.contentRevision, action: 'dry-run' })
      console.log(`✅ ${registry.id}: 将生成 ${content.contentRevision}`)
      continue
    }

    // 历史 revision 一旦落地就不可变：同名不同语义说明包被改过，必须停手而不是覆盖。
    if (fs.existsSync(paths.revision)) {
      const existing = readJson(paths.revision)
      if (!sameSemantics(existing, content)) {
        throw new Error(`历史 revision 被改写：${path.basename(paths.revision)} 与 ${content.contentRevision} 语义不同`)
      }
    } else {
      writeJsonIfChanged(paths.revision, content)
    }

    const persisted = verifyPackage(readJson(paths.revision), registry.id)
    if (!persisted.ok) throw new Error(`落盘 revision 校验失败：\n    ${persisted.errors.join('\n    ')}`)

    // latest / full 只在语义变化时移动，且永远晚于校验成功。
    for (const target of [paths.full, paths.latest]) {
      const current = fs.existsSync(target) ? readJson(target) : null
      if (sameSemantics(current, content) && current?.contentRevision === content.contentRevision) continue
      writeJsonIfChanged(target, content)
    }

    const verified = verifyPackage(readJson(paths.latest), registry.id)
    if (!verified.ok) throw new Error(`latest 校验失败，已拒绝发布：\n    ${verified.errors.join('\n    ')}`)

    results.push({ product: registry.id, revision: content.contentRevision, sha256: content.sha256, action: 'ok' })
    console.log(`✅ ${registry.id}: ${path.relative(process.cwd(), paths.latest)} ← ${content.contentRevision}`)
  } catch (error) {
    // 单产品失败只摘除该产品，其他产品继续生成，latest 也不动。
    results.push({ product: registry.id, action: 'failed', error: error.message })
    console.error(`❌ ${registry.id}: ${error.message}`)
  }
}

const failures = results.filter((item) => item.action === 'failed')
if (failures.length) {
  console.error(`\n内容生成：${failures.length}/${results.length} 个产品失败`)
  process.exit(1)
}
console.log(`\n内容生成：${results.length} 个产品通过`)

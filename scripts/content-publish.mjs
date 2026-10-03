import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseArgs, flagValue } from './lib/args.mjs'
import { GENERATED_DIR, SITE_ROOT, generatedPaths, readJson, readRegistry, verifyPackage } from './content-lib.mjs'

const { flags } = parseArgs()
const product = flagValue(flags, 'product')
const revision = flagValue(flags, 'revision')
const toRemote = Boolean(flags.publish)
const stagingRoot = path.resolve(SITE_ROOT, flagValue(flags, 'staging') ?? path.join('data', 'publish'))
const configFile = flagValue(flags, 'config') ?? path.join('data', 'publish', 'release-config.json')

if (!product || !revision) {
  console.error('用法：node scripts/content-publish.mjs --product <id> --revision <revision> [--staging <dir>] [--publish]')
  console.error('默认 dry-run：只生成本地发布 staging 目录与发布计划，绝不写远程仓。')
  process.exit(2)
}

const registryProduct = readRegistry().products.find((item) => item.id === product)
if (!registryProduct) {
  console.error(`❌ 未知产品：${product}`)
  process.exit(2)
}
if (!registryProduct.releaseBranch) {
  console.error(`❌ ${product} 未登记发布仓分支（releaseBranch 为空），不允许发布`)
  process.exit(2)
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

function loadRevision(id, rev) {
  const file = generatedPaths(id, rev).revision
  if (!fs.existsSync(file)) {
    console.error(`❌ 找不到不可变 revision：${path.relative(SITE_ROOT, file)}`)
    console.error('   请先运行 node scripts/content-build.mjs')
    process.exit(1)
  }
  const value = readJson(file)
  const check = verifyPackage(value, id)
  if (!check.ok) {
    console.error(`❌ revision 自校验失败，拒绝发布：\n    ${check.errors.join('\n    ')}`)
    process.exit(1)
  }
  return { file, value }
}

/** 变更摘要只比较语义字段，避免把时间戳变化报成内容变更。 */
function summarize(previous, next) {
  const changed = []
  const zones = ['facts', 'copy']
  for (const zone of zones) {
    const keys = new Set([...Object.keys(previous?.[zone] ?? {}), ...Object.keys(next?.[zone] ?? {})])
    for (const key of keys) {
      const before = JSON.stringify(previous?.[zone]?.[key] ?? null)
      const after = JSON.stringify(next?.[zone]?.[key] ?? null)
      if (before !== after) changed.push({ zone, key, before, after })
    }
  }
  return {
    previousRevision: previous?.contentRevision ?? null,
    nextRevision: next.contentRevision,
    changeCount: changed.length,
    changes: changed
  }
}

const { value: content } = loadRevision(product, revision)
const publishedPointer = path.join(stagingRoot, product, 'published.json')
const previously = fs.existsSync(publishedPointer) ? readJson(publishedPointer) : null
const previousPkg = previously?.contentRevision
  ? (() => {
      const file = generatedPaths(product, previously.contentRevision).revision
      return fs.existsSync(file) ? readJson(file) : null
    })()
  : null

const files = [
  {
    path: `${product}/content.v1.json`,
    role: 'immutable-revision',
    source: generatedPaths(product, revision).revision
  },
  {
    path: `${product}/content-latest.v1.json`,
    role: 'latest-pointer',
    source: generatedPaths(product, revision).revision
  }
]

const stagingDir = path.join(stagingRoot, product, revision)
fs.mkdirSync(stagingDir, { recursive: true })
const staged = files.map((entry) => {
  const raw = fs.readFileSync(entry.source)
  const target = path.join(stagingDir, path.basename(entry.path))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, raw)
  return { path: entry.path, role: entry.role, localFile: path.relative(SITE_ROOT, target), bytes: raw.length, sha256: sha256(raw) }
})

const plan = {
  schema: 1,
  product,
  revision,
  contentSha256: content.sha256,
  targetBranch: registryProduct.releaseBranch,
  files: staged,
  summary: summarize(previousPkg, content),
  remoteWrite: false,
  remoteWriteReason: '默认 dry-run：未显式 --publish'
}
fs.writeFileSync(path.join(stagingDir, 'publish-plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
console.log(`✅ ${product}: 发布 staging 已生成 ${path.relative(SITE_ROOT, stagingDir)}`)
for (const entry of staged) console.log(`   · ${entry.path} ← ${entry.localFile} sha256=${entry.sha256.slice(0, 16)}…`)
console.log(`   变更：${plan.summary.changeCount} 个字段（上一 revision：${plan.summary.previousRevision ?? '无'}）`)

if (!toRemote) {
  console.log('\ndry-run：未写入任何远程仓。加 --publish 且提供发布配置才会尝试远程写入。')
  process.exit(0)
}

const configPath = path.resolve(SITE_ROOT, configFile)
if (!fs.existsSync(configPath)) {
  console.error(`\n❌ 拒绝远程写入：找不到发布配置 ${path.relative(SITE_ROOT, configPath)}`)
  console.error('   远程写入需要显式配置，不能凭猜测拼 URL 或凭证。本地 staging 已保留。')
  process.exit(3)
}
const config = readJson(configPath)
if (Array.isArray(config.credentials) || Object.keys(config).some((k) => /token|password|secret/i.test(k))) {
  console.error('\n❌ 发布配置里出现凭证字段：本适配器不接受仓库凭证，请改用 CI 秘密注入。')
  process.exit(3)
}
const command = config.products?.[product]?.command
if (!Array.isArray(command) || command.length === 0) {
  console.error(`\n❌ 发布配置缺少 products.${product}.command 数组，拒绝远程写入。`)
  process.exit(3)
}

const run = spawnSync(command[0], command.slice(1), {
  cwd: SITE_ROOT,
  encoding: 'utf8',
  env: {
    ...process.env,
    HUB_PRODUCT: product,
    HUB_REVISION: revision,
    HUB_TARGET_BRANCH: String(config.products?.[product]?.targetBranch ?? registryProduct.releaseBranch),
    HUB_STAGING_DIR: stagingDir,
    HUB_CONTENT_SHA256: content.sha256
  }
})
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.replace(/(https?:\/\/)\S*@\S*/g, '$1***@***')

if (run.status !== 0) {
  console.error(`\n❌ 远程写入失败（exit=${run.status ?? 'signal'}），latest 未移动：`)
  console.error(output.trim())
  process.exit(1)
}

fs.writeFileSync(publishedPointer, `${JSON.stringify({ product, contentRevision: revision, sha256: content.sha256, files: staged.map((s) => s.path), publishedAt: new Date().toISOString() }, null, 2)}\n`)
console.log(`\n✅ 远程写入完成，已记录发布指针 ${path.relative(SITE_ROOT, publishedPointer)}`)

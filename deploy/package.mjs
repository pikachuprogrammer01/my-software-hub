import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseArgs, flagValue } from '../scripts/lib/args.mjs'
import { SITE_ROOT, connectedProducts, generatedPaths, readJson, verifyPackage } from '../scripts/content-lib.mjs'

const { flags } = parseArgs()
const outRoot = path.resolve(SITE_ROOT, flagValue(flags, 'out') ?? path.join('deploy', 'out'))
const keepStaging = Boolean(flags['keep-staging'])

const RUNTIME_DEPENDENCIES = ['hono', '@hono/node-server', 'drizzle-orm', 'better-sqlite3', 'ajv']
/** 部署包里绝对不能出现的东西：运行数据、凭证、开发依赖、上一级仓库内容。 */
const FORBIDDEN_NAME_PATTERNS = [/\.sqlite($|-wal|-shm)/i, /\.env$/i, /token/i, /secret/i, /credential/i, /id_rsa/i, /^\.git$/, /node_modules/, /Automation/, /^\.hub-data$/, /^proposals$/]

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function gitCommit() {
  const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: SITE_ROOT, encoding: 'utf8' })
  return res.status === 0 ? res.stdout.trim() : 'not-a-git-checkout'
}

function readVersion(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'node_modules', file, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

const distDir = path.join(SITE_ROOT, '.server-dist')
const viteDist = path.join(SITE_ROOT, '.vitepress', 'dist')
if (!fs.existsSync(path.join(distDir, 'index.js'))) fail('缺少 .server-dist/index.js：先执行 pnpm api:build')
if (!fs.existsSync(path.join(viteDist, 'index.html'))) fail('缺少 .vitepress/dist/index.html：先执行 vitepress build')
if (!fs.existsSync(path.join(SITE_ROOT, 'api', 'openapi.v1.json'))) fail('缺少 api/openapi.v1.json：先执行 node scripts/export-openapi.mjs')

// 发布包不该在手机上重新生成内容，所以先确认内容包自身站得住。
for (const product of connectedProducts()) {
  const file = generatedPaths(product.id).latest
  if (!fs.existsSync(file)) fail(`缺少 ${product.id} 的 latest 内容包`)
  const check = verifyPackage(readJson(file), product.id)
  if (!check.ok) fail(`${product.id} 内容包自校验失败：${check.errors.join('; ')}`)
}

const pkgJson = readJson(path.join(SITE_ROOT, 'package.json'))
const version = flagValue(flags, 'version') ?? `${pkgJson.version}-g${gitCommit().slice(0, 8)}`
if (!/^[0-9A-Za-z._-]+$/.test(version)) fail(`版本标识不合法：${version}`)

const staging = path.join(outRoot, `hub-${version}`)
fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(staging, { recursive: true })

function copyTree(src, dest, { allowEmpty = false } = {}) {
  if (!fs.existsSync(src)) {
    if (allowEmpty) return
    fail(`缺少目录：${path.relative(SITE_ROOT, src)}`)
  }
  fs.cpSync(src, dest, { recursive: true })
}

copyTree(distDir, path.join(staging, 'api'))
copyTree(path.join(SITE_ROOT, 'migrations'), path.join(staging, 'migrations'))
copyTree(path.join(SITE_ROOT, 'schema'), path.join(staging, 'schema'))
copyTree(viteDist, path.join(staging, 'site'))
copyTree(path.join(SITE_ROOT, 'api'), path.join(staging, 'api-docs'))
fs.mkdirSync(path.join(staging, 'runtime', 'data'), { recursive: true })
fs.cpSync(path.join(SITE_ROOT, 'data', 'products.json'), path.join(staging, 'runtime', 'data', 'products.json'))
copyTree(path.join(SITE_ROOT, 'data', 'generated'), path.join(staging, 'runtime', 'data', 'generated'))
fs.mkdirSync(path.join(staging, 'scripts'), { recursive: true })
fs.copyFileSync(path.join(SITE_ROOT, 'deploy', 'hub-db.mjs'), path.join(staging, 'scripts', 'hub-db.mjs'))
fs.copyFileSync(path.join(SITE_ROOT, 'deploy', 'sqlite-compat-check.mjs'), path.join(staging, 'scripts', 'sqlite-compat-check.mjs'))
fs.copyFileSync(path.join(SITE_ROOT, 'deploy', 'hubctl'), path.join(staging, 'scripts', 'hubctl'))
fs.chmodSync(path.join(staging, 'scripts', 'hubctl'), 0o755)

const prodDependencies = {}
for (const name of RUNTIME_DEPENDENCIES) {
  const declared = pkgJson.dependencies?.[name]
  const installed = readVersion(name)
  if (!declared || !installed) fail(`依赖 ${name} 未安装或未声明（declared=${declared ?? '无'} installed=${installed ?? '无'}）`)
  prodDependencies[name] = installed
}

const releasePackageJson = {
  name: 'my-software-hub-runtime',
  version,
  private: true,
  type: 'module',
  description: '手机侧运行时：只装生产依赖，依赖必须在设备上编译安装',
  engines: { node: '>=22.5.0' },
  dependencies: prodDependencies
}
fs.writeFileSync(path.join(staging, 'package.json'), `${JSON.stringify(releasePackageJson, null, 2)}\n`)

// 锁文件由电脑生成，设备只按它安装；生成失败就退回精确版本而不谎称已锁定。
const lockDir = path.join(outRoot, `.lock-${version}`)
fs.mkdirSync(lockDir, { recursive: true })
fs.writeFileSync(path.join(lockDir, 'package.json'), `${JSON.stringify(releasePackageJson, null, 2)}\n`)
const lockRun = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], { cwd: lockDir, encoding: 'utf8', timeout: 240000 })
let locked = false
if (lockRun.status === 0 && fs.existsSync(path.join(lockDir, 'package-lock.json'))) {
  fs.copyFileSync(path.join(lockDir, 'package-lock.json'), path.join(staging, 'package-lock.json'))
  locked = true
}
fs.rmSync(lockDir, { recursive: true, force: true })

const files = []
const walk = (dir, prefix = '') => {
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (FORBIDDEN_NAME_PATTERNS.some((re) => re.test(rel))) fail(`部署包出现了禁止项：${rel}`)
    if (fs.statSync(abs).isDirectory()) walk(abs, rel)
    else files.push({ path: rel, sha256: sha256File(abs), bytes: fs.statSync(abs).size })
  }
}
walk(staging)

const migrationTags = fs
  .readdirSync(path.join(staging, 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => name.replace(/\.sql$/, ''))

const manifest = {
  schema: 1,
  version,
  builtAt: new Date().toISOString(),
  gitCommit: gitCommit(),
  node: { requiredMajor: Number(process.version.slice(1).split('.')[0]), buildMachine: { platform: process.platform, arch: process.arch } },
  lockedDependencies: locked,
  runtimeDependencies: prodDependencies,
  migrations: { folder: 'migrations', tags: migrationTags, journal: readJson(path.join(staging, 'migrations', 'meta', '_journal.json')).entries.map((entry) => entry.tag) },
  contentProducts: connectedProducts().map((product) => {
    const pkg = readJson(generatedPaths(product.id).latest)
    return { id: product.id, contentRevision: pkg.contentRevision, sha256: pkg.sha256 }
  }),
  defaults: { host: '127.0.0.1', port: 8787 },
  files,
  totalBytes: files.reduce((sum, item) => sum + item.bytes, 0),
  excludes: ['.hub-data（数据库与备份）', 'node_modules（必须在设备上安装）', '任何 token/secret/.env/登录态', 'proposals/ 文件队列', 'Git 目录', 'Automation 目录']
}
fs.writeFileSync(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
fs.writeFileSync(path.join(staging, 'RELEASE'), `${version}\ncommit=${manifest.gitCommit}\nbuilt=${manifest.builtAt}\nnode>=${manifest.node.requiredMajor}.0.0 需要内置 node:sqlite 或可编译 better-sqlite3\n`)
// manifest 自身要能被校验
const manifestHash = sha256File(path.join(staging, 'manifest.json'))

fs.writeFileSync(path.join(staging, 'manifest.sha256'), `${manifestHash}  manifest.json\n`)

const tarName = `hub-${version}.tar.gz`
const tarPath = path.join(outRoot, tarName)
fs.rmSync(tarPath, { force: true })
const tar = spawnSync('tar', ['-czf', tarPath, '-C', outRoot, `hub-${version}`], { encoding: 'utf8' })
if (tar.status !== 0) fail(`打包失败：${tar.stderr}`)
fs.writeFileSync(`${tarPath}.sha256`, `${sha256File(tarPath)}  ${tarName}\n`)
if (!keepStaging) fs.rmSync(staging, { recursive: true, force: true })

console.log(`✅ 部署包：${path.relative(SITE_ROOT, tarPath)}（${files.length} 个文件，${(manifest.totalBytes / 1024 / 1024).toFixed(2)} MB）`)
console.log(`   版本：${version}  commit=${manifest.gitCommit.slice(0, 8)}  依赖锁定=${locked ? 'package-lock.json' : '仅精确版本（npm 不可用）'}`)
console.log(`   迁移：${manifest.migrations.tags.join(', ')}`)
console.log(`   内容副本：${manifest.contentProducts.map((item) => `${item.id}@${item.contentRevision}`).join(', ')}`)
console.log(`   校验和：${(fs.readFileSync(`${tarPath}.sha256`, 'utf8') || '').trim()}`)
console.log(`   staging：${keepStaging ? path.relative(SITE_ROOT, staging) : '已清理（加 --keep-staging 保留）'}`)

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

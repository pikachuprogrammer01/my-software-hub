import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs } from './lib/args.mjs'
import { SITE_ROOT, connectedProducts, generatedPaths, readJson } from './content-lib.mjs'

/** 统一验证入口：契约 → 内容 → 夹具 → 发布 dry-run → 站点构建 → 内部文档不外泄。 */
const { flags } = parseArgs()
const skipSite = Boolean(flags['skip-site'])
const steps = []

const node = (file, args = []) => [process.execPath, [path.join(SITE_ROOT, 'scripts', file), ...args]]

function step(name, command, args, options = {}) {
  steps.push({ name, command, args, ...options })
}

step('契约校验（含线上 update.json 实拉）', ...node('validate-contract.mjs'))
step('内容源 schema 与规则', ...node('content-validate.mjs'))
step('内容包生成', ...node('content-build.mjs'))
step('漂移检查', ...node('content-drift.mjs'))
step('当前态裸事实 lint', ...node('content-lint.mjs'))
step('夹具与内容包同步', ...node('conformance-fixtures.mjs', ['--check']))
step('客户端一致性夹具', ...node('test-conformance.mjs'))
step('内容流水线测试', ...node('test-content.mjs'))
// 只对已接发布仓分支的产品跑发布 dry-run；未接分支的产品被拒绝这件事，
// 由 test-content.mjs 的「未接入发布分支的产品不允许发布」用例守住，不在这里重复一遍失败。
for (const product of connectedProducts().filter((item) => item.releaseBranch)) {
  const revision = readJson(generatedPaths(product.id).latest).contentRevision
  step(`发布适配器 dry-run（${product.id}）`, ...node('content-publish.mjs', ['--product', product.id, '--revision', revision]))
}
if (!skipSite) step('VitePress 构建', path.join(SITE_ROOT, 'node_modules', '.bin', 'vitepress'), ['build'], { cwd: SITE_ROOT })

const failed = []
console.log(`\n统一验证：${steps.length} 步${skipSite ? '（跳过站点构建）' : ''}`)
for (const item of steps) {
  const started = Date.now()
  const res = spawnSync(item.command, item.args, {
    cwd: item.cwd ?? SITE_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: item.timeout ?? 600000
  })
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (res.status === 0) {
    console.log(`  ✅ ${item.name}（${seconds}s）`)
    continue
  }
  const logFile = path.join(os.tmpdir(), `hub-verify-fail-${item.name.replace(/[\\/\s]/g, '_')}.log`)
  fs.writeFileSync(logFile, output)
  failed.push({ name: item.name, logFile })
  console.error(`  ❌ ${item.name}（${seconds}s，exit=${res.status ?? 'signal'}）`)
  // 只截尾部会把第一条真实错误切掉，先给首个失败块，再给全量日志位置
  const marker = output.indexOf('❌')
  if (marker >= 0) console.error(output.slice(marker, marker + 1600).split('\n').map((line) => `     ${line}`).join('\n'))
  console.error(output.trim().split('\n').slice(-10).map((line) => `     ${line}`).join('\n'))
  console.error(`     全量日志：${logFile}`)
}

if (!skipSite) {
  const dist = path.join(SITE_ROOT, '.vitepress', 'dist')
  const forbidden = [
    'phone-runtime.html', 'agent-continuation-prompt.html', 'agent-continuation-checklist.html',
    'client-integration.html', 'contract.html', 'products.html', 'readme.html', 'downloads.html',
    'site-design.html', 'requirements.html', 'vision.html', 'rename.html'
  ]
  const leaked = forbidden.filter((name) => fs.existsSync(path.join(dist, name)))
  if (leaked.length) {
    console.error(`  ❌ 内部文档出现在站点产物：${leaked.join(', ')}`)
    failed.push({ name: '站点排除名单' })
  } else {
    console.log('  ✅ 内部文档未进入站点产物')
  }
}

const total = steps.length + (skipSite ? 0 : 1)
console.log(`\n结果：${total - failed.length} 通过 / ${failed.length} 失败`)
if (failed.length) {
  for (const item of failed) console.error(`   · ${item.name}${item.logFile ? ` → ${item.logFile}` : ''}`)
  process.exit(1)
}
console.log('✅ 全部通过')

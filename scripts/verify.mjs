import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs, flagValue } from './lib/args.mjs'
import { SITE_ROOT, connectedProducts, generatedPaths, readJson } from './content-lib.mjs'

/**
 * 统一验证入口：一条命令跑完"契约 → 内容 → API/数据库 → 部署包 → 站点"。
 * 部署演练要真装依赖（npm ci + 起服务），默认跳过，加 --with-deploy 才跑。
 */
const { flags } = parseArgs()
const withDeploy = Boolean(flags['with-deploy'])
const steps = []

function step(name, command, args, options = {}) {
  steps.push({ name, command, args, ...options })
}

const node = (file, args = []) => [process.execPath, [path.join(SITE_ROOT, 'scripts', file), ...args]]

step('契约校验（含线上 update.json 实拉）', ...node('validate-contract.mjs'))
step('内容源 schema 与规则', ...node('content-validate.mjs'))
step('内容包生成', ...node('content-build.mjs'))
step('漂移检查', ...node('content-drift.mjs'))
step('当前态裸事实 lint', ...node('content-lint.mjs'))
step('shell 脚本 locale 安全性', ...node('lint-shell.mjs'))
step('内容流水线测试', ...node('test-content.mjs'))
step('API 编译', path.join(SITE_ROOT, 'node_modules', '.bin', 'tsc'), ['-p', 'server/tsconfig.json'])
step('OpenAPI 与实现一致', ...node('export-openapi.mjs', ['--check']))
step('HTTP/API/SQLite 运行时测试', ...node('test-api.mjs'))
step('提案处理器测试', ...node('test-proposal-review.mjs'))
step('夹具与内容包同步', ...node('conformance-fixtures.mjs', ['--check']))
step('客户端一致性夹具', ...node('test-conformance.mjs'))
for (const product of connectedProducts()) {
  const revision = readJson(generatedPaths(product.id).latest).contentRevision
  step(`发布适配器 dry-run（${product.id}）`, ...node('content-publish.mjs', ['--product', product.id, '--revision', revision]))
}
step('VitePress 构建', path.join(SITE_ROOT, 'node_modules', '.bin', 'vitepress'), ['build'], { cwd: SITE_ROOT })
const verifyOut = path.join(os.tmpdir(), `hub-verify-out-${process.pid}`)
if (withDeploy) {
  step('部署包打包', ...node('../deploy/package.mjs', ['--version', `verify-${Date.now()}`, '--out', verifyOut]))
  step('部署/备份/恢复/回滚演练', ...node('test-deploy.mjs'))
} else {
  steps.push({ name: '部署演练（打包 + 安装 + 备份恢复回滚）', skipped: '加 --with-deploy 才执行；出手机包前必须跑' })
}

const failed = []
console.log(`\n统一验证：${steps.filter((s) => !s.skipped).length} 步${withDeploy ? '' : '（部署演练未含）'}`)
for (const item of steps) {
  if (item.skipped) {
    console.log(`  ⏭️ ${item.name} — ${item.skipped}`)
    continue
  }
  const started = Date.now()
  const res = spawnSync(item.command, item.args, {
    cwd: item.cwd ?? SITE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(item.env ?? {}) },
    timeout: item.timeout ?? 900000
  })
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (res.status === 0) {
    console.log(`  ✅ ${item.name}（${seconds}s）`)
  } else {
    const logFile = path.join(os.tmpdir(), `hub-verify-fail-${item.name.replace(/[\/\s]/g, '_')}.log`)
    fs.writeFileSync(logFile, output)
    failed.push({ name: item.name, output, logFile })
    console.error(`  ❌ ${item.name}（${seconds}s，exit=${res.status ?? 'signal'}）`)
    // 只截尾部会把第一条真实错误切掉，这里显式把首个失败块和全量日志位置给出来
    const marker = output.indexOf('❌')
    if (marker >= 0) {
      console.error(output.slice(marker, marker + 1600).split('\n').map((line) => `     ${line}`).join('\n'))
    }
    console.error(`     全量日志：${logFile}`)
  }
}

// 构建产物里不能出现内部交接文档
if (!failed.length) {
  const dist = path.join(SITE_ROOT, '.vitepress', 'dist')
  const forbidden = ['membership-plan.html', 'android-deploy.html', 'client-integration.html', 'phone-runtime.html', 'agent-continuation-prompt.html', 'contract.html', 'products.html']
  const leaked = forbidden.filter((name) => fs.existsSync(path.join(dist, name)))
  if (leaked.length) {
    console.error(`  ❌ 内部交接文档出现在站点产物：${leaked.join(', ')}`)
    failed.push({ name: '站点排除名单', output: leaked.join(' ') })
  } else {
    console.log('  ✅ 内部交接文档未进入站点产物')
  }
}

fs.rmSync(verifyOut, { recursive: true, force: true })
console.log(`\n结果：${steps.filter((s) => !s.skipped).length - failed.length} 通过 / ${failed.length} 失败`)
if (failed.length) {
  for (const item of failed) console.error(`   · ${item.name}${item.logFile ? ` → ${item.logFile}` : ''}`)
  process.exit(1)
}
console.log('✅ 全部通过')

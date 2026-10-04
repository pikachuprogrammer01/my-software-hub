import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { SITE_ROOT, connectedProducts, generatedPaths, readJson } from './content-lib.mjs'
import { readBoundPort } from './lib/runtime-port.mjs'

/**
 * 电脑侧端到端演练部署脚本：打包 → 安装 → 启停 → 提案落库 → 备份 → 恢复 → 回滚。
 * 它证明的是脚本与产物正确，不等同于 Android 实机通过（Termux 仍需在设备上跑同一组命令）。
 */
const results = []
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-deploy-'))
const hubHome = path.join(work, 'home')
// 每次跑用独立的产物目录：写进共享的 deploy/out 时，收尾清扫会把并发跑的
// 另一份产物按同名规则删掉，表现为对方 install 突然校验失败并连带崩一片。
const outDir = path.join(work, 'deploy-out')
fs.mkdirSync(hubHome, { recursive: true })

function record(name, fn) {
  return (async () => {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`  ✅ ${name}`)
    } catch (error) {
      results.push({ name, ok: false })
      console.error(`  ❌ ${name}\n     ${String(error.message ?? error).split('\n').join('\n     ')}`)
    }
  })()
}

function hubctl(args, { env = {} } = {}) {
  const res = spawnSync('bash', [path.join(SITE_ROOT, 'deploy', 'hubctl'), ...args], {
    cwd: SITE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HUB_HOME: hubHome,
      HUB_DATA_DIR: path.join(hubHome, 'data'),
      HOST: '127.0.0.1',
      // 端口交给内核分配，跑起来后从 run/hubd.port 读实际值；
      // 预占端口再让服务去绑，会在两步之间被并发进程抢走（曾让整段演练连崩 12 项）
      PORT: '0',
      HUB_REVIEWER_TOKEN_FILE: path.join(work, 'reviewer.token'),
      ...env
    },
    timeout: 420000
  })
  return { code: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

fs.writeFileSync(path.join(work, 'reviewer.token'), 'deploy-test-reviewer-token\n')
let baseA = ''
async function refreshBaseA() {
  baseA = (await readBoundPort(path.join(hubHome, 'data'))).baseUrl
  return baseA
}

console.log('\n【1】部署打包')
const version1 = `9.0.1-t${process.pid}`
const packageRun = spawnSync(process.execPath, [path.join(SITE_ROOT, 'deploy', 'package.mjs'), '--version', version1, '--out', outDir], { cwd: SITE_ROOT, encoding: 'utf8', timeout: 300000 })
await record('打包脚本成功产出 tar 与校验和', () => {
  assert.equal(packageRun.status, 0, packageRun.stdout + packageRun.stderr)
  const tar = path.join(outDir, `hub-${version1}.tar.gz`)
  assert.ok(fs.existsSync(tar), '缺少 tar')
  assert.ok(fs.existsSync(`${tar}.sha256`), '缺少 tar sha256')
})

const tarPath = path.join(outDir, `hub-${version1}.tar.gz`)
const listRun = spawnSync('tar', ['-tzf', tarPath], { encoding: 'utf8' })
const tarEntries = listRun.stdout.split('\n').filter(Boolean)

await record('包内含静态站、API JS、迁移、schema、运行时数据与脚本', () => {
  const need = ['manifest.json', 'RELEASE', 'package.json', 'api/index.js', 'migrations/0000_init.sql', 'migrations/meta/_journal.json', 'schema/proposal.v1.json', 'site/index.html', 'runtime/data/products.json', 'scripts/hub-db.mjs', 'scripts/hubctl', 'api-docs/openapi.v1.json']
  for (const item of need) {
    assert.ok(tarEntries.some((entry) => entry.endsWith(`hub-${version1}/${item}`)), `缺少 ${item}`)
  }
  assert.ok(tarEntries.some((e) => e.endsWith('runtime/data/generated/table-flow/content-latest.v1.json')), '缺少内容包')
})

await record('包内不含数据库、密钥、node_modules 与电脑原生依赖', () => {
  const forbidden = tarEntries.filter((entry) => /\.sqlite(-wal|-shm)?$/i.test(entry) || /\.env$/i.test(entry) || /node_modules/i.test(entry) || /\.node$/i.test(entry) || /token|secret|credential|id_rsa/i.test(entry) || /Automation/.test(entry) || /(^|\/)proposals\//.test(entry))
  assert.deepEqual(forbidden, [], `出现禁止内容：${forbidden.slice(0, 5).join(', ')}`)
})

const manifest = JSON.parse(spawnSync('tar', ['-xzOf', tarPath, `hub-${version1}/manifest.json`], { encoding: 'utf8' }).stdout)

await record('清单含版本标识、逐文件 SHA-256、迁移标识与内容 revision', () => {
  assert.equal(manifest.version, version1)
  assert.ok(manifest.files.length > 20)
  assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)))
  assert.deepEqual(manifest.migrations.tags, ['0000_init'])
  const repoRevisions = connectedProducts().map((product) => readJson(generatedPaths(product.id).latest).contentRevision).sort()
  assert.deepEqual(manifest.contentProducts.map((item) => item.contentRevision).sort(), repoRevisions, '部署包内容副本与仓库生成包不一致')
  assert.equal(manifest.excludes.length >= 4, true)
})

await record('依赖锁定文件随包提供且只含生产依赖', () => {
  const lockRaw = spawnSync('tar', ['-xzOf', tarPath, `hub-${version1}/package-lock.json`], { encoding: 'utf8' }).stdout
  assert.ok(lockRaw.length > 10, 'package-lock.json 缺失或为空')
  const lock = JSON.parse(lockRaw)
  const packages = Object.keys(lock.packages ?? {})
  assert.ok(packages.some((name) => name.includes('better-sqlite3')), '锁文件缺少 better-sqlite3')
  assert.ok(!packages.some((name) => name.includes('vitepress')), '锁文件不应带开发依赖')
  assert.ok(manifest.lockedDependencies === true)
})

console.log('\n【2】安装与启动（真实 npm install，等价设备侧步骤）')
await record('hubctl install 校验清单、装依赖、备份并切换当前版本', () => {
  const res = hubctl(['install', tarPath])
  assert.equal(res.code, 0, res.output.slice(-3000))
  assert.match(res.output, /个文件全部匹配/)
  assert.match(res.output, /已切换当前版本/)
  assert.ok(fs.existsSync(path.join(hubHome, 'current')))
  assert.ok(fs.existsSync(path.join(hubHome, 'releases', `hub-${version1}`, 'node_modules', 'better-sqlite3')), '依赖未装在设备上')
})

await record('hubctl start 后健康检查通过', async () => {
  const res = hubctl(['start'])
  assert.equal(res.code, 0, res.output)
  await refreshBaseA()
  const health = await (await fetch(`${baseA}/health`)).json()
  assert.equal(health.status, 'ok')
  assert.equal(health.version, version1)
  assert.equal(health.database.migrationsApplied, 1)
})

await record('站点页面与 API 由同一进程提供', async () => {
  const home = await fetch(`${baseA}/`)
  assert.equal(home.status, 200)
  assert.match(await home.text(), /<div id="app">/)
  const deep = await fetch(`${baseA}/features`)
  assert.equal(deep.status, 200)
  const missing = await fetch(`${baseA}/no-such-page`)
  assert.equal(missing.status, 404)
  const doc = await fetch(`${baseA}/v1/openapi.json`)
  assert.equal(doc.status, 200)
})

await record('提案写入 SQLite 并可用审计追溯', async () => {
  const baseline = readJson(generatedPaths('table-flow').latest)
  const res = await fetch(`${baseA}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'deploy-idem-0001' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.overview.summary', value: '部署演练提交的文案。', source: 'deploy-test', createdAt: new Date().toISOString() }, base: { contentRevision: baseline.contentRevision } })
  })
  assert.ok([201, 202].includes(res.status), await res.text())
  const list = await (await fetch(`${baseA}/v1/proposals`, { headers: { 'x-hub-reviewer-token': 'deploy-test-reviewer-token' } })).json()
  assert.ok(list.count >= 1)
  const detail = await (await fetch(`${baseA}/v1/proposals/${list.proposals[0].id}`, { headers: { 'x-hub-reviewer-token': 'deploy-test-reviewer-token' } })).json()
  assert.ok(detail.audit.length >= 1)
})

await record('日志不含凭证值', () => {
  const log = fs.readFileSync(path.join(hubHome, 'data', 'logs', 'hubd.log'), 'utf8')
  assert.ok(!log.includes('deploy-test-reviewer-token'), '日志泄漏了审核 token')
  assert.match(log, /"event":"start"/)
})

console.log('\n【3】备份、进程重启与恢复')
let backupFile = ''
await record('hubctl backup 产出一致性备份与校验和', () => {
  const res = hubctl(['backup'])
  assert.equal(res.code, 0, res.output)
  const files = fs.readdirSync(path.join(hubHome, 'data', 'backups')).filter((name) => name.endsWith('.sqlite'))
  assert.ok(files.length >= 1, '没有备份文件')
  backupFile = path.join(hubHome, 'data', 'backups', files.sort().at(-1))
  assert.ok(fs.existsSync(`${backupFile}.sha256`))
  assert.ok(fs.existsSync(`${backupFile}.meta.json`))
  const meta = readJson(`${backupFile}.meta.json`)
  assert.ok(Object.keys(meta.stats.counts).length >= 1, '备份元数据缺少业务统计')
  assert.match(JSON.stringify(meta.stats.counts), /pending/)
})

await record('SIGKILL 后重启：提案仍在且幂等键不会重复写入', async () => {
  const pidFile = path.join(hubHome, 'data', 'run', 'hubd.pid')
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
  process.kill(pid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.equal(hubctl(['status']).code, 0)
  const start = hubctl(['start'])
  assert.equal(start.code, 0, start.output)
  await refreshBaseA()
  const count = await (await fetch(`${baseA}/v1/products/table-flow/proposals/count`)).json()
  const again = await fetch(`${baseA}/v1/products/table-flow/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'deploy-idem-0001' },
    body: JSON.stringify({ proposal: { schema: 1, product: 'table-flow', fieldId: 'copy.overview.summary', value: '崩溃后的重试', source: 'deploy-test', createdAt: new Date().toISOString() }, base: { contentRevision: readJson(generatedPaths('table-flow').latest).contentRevision } })
  })
  const body = await again.json()
  assert.equal(body.idempotentReplay, true, JSON.stringify(body))
  const countAfter = await (await fetch(`${baseA}/v1/products/table-flow/proposals/count`)).json()
  assert.equal(countAfter.total, count.total, '崩溃重启后重复请求产生了新提案')
})

await record('破坏数据后 restore：业务键与提案 ID 完整恢复', async () => {
  const before = await (await fetch(`${baseA}/v1/products/table-flow/proposals/count`)).json()
  hubctl(['stop'])
  // 人为破坏当前库，模拟误操作/损坏
  const dbFile = path.join(hubHome, 'data', 'db', 'hub.sqlite')
  fs.writeFileSync(dbFile, 'corrupted-by-test')
  fs.rmSync(`${dbFile}-wal`, { force: true })
  const restored = hubctl(['restore', '--from', backupFile])
  assert.equal(restored.code, 0, restored.output.slice(-3000))
  assert.match(restored.output, /已恢复到/)
  assert.match(restored.output, /恢复统计/)
  await refreshBaseA()
  const after = await (await fetch(`${baseA}/v1/products/table-flow/proposals/count`)).json()
  assert.equal(after.total, before.total, `恢复后提案数不符：${before.total} → ${after.total}`)
  const replaced = fs.readdirSync(path.join(hubHome, 'data', 'db')).filter((name) => name.startsWith('replaced-'))
  assert.ok(replaced.length >= 1, '替换前的现场没有被保留')
})

await record('迁移不兼容时 restore 拒绝降级数据库', async () => {
  const fakeMeta = `${backupFile}.meta.json`
  const meta = readJson(fakeMeta)
  const original = JSON.stringify(meta)
  meta.journalTags = ['0000_init', '0001_future', '0002_future2']
  fs.writeFileSync(fakeMeta, `${JSON.stringify(meta, null, 2)}\n`)
  const res = hubctl(['restore', '--from', backupFile])
  fs.writeFileSync(fakeMeta, original)
  assert.equal(res.code, 1, res.output)
  assert.match(res.output, /拒绝降级数据库/)
  assert.match(res.output, /hubctl rollback/)
  assert.match(res.output, /恢复未完成，重新拉起原服务/)
  await refreshBaseA()
  const alive = await (await fetch(`${baseA}/health`)).json()
  assert.equal(alive.status, 'ok', '被拒绝的恢复把服务留下了停机状态')
})

console.log('\n【4】部署回滚与局域网监听')
await record('安装第二个版本后 rollback 回到旧版本且内容 revision 不变', async () => {
  const version2 = `9.0.2-t${process.pid}`
  const build2 = spawnSync(process.execPath, [path.join(SITE_ROOT, 'deploy', 'package.mjs'), '--version', version2, '--out', outDir], { cwd: SITE_ROOT, encoding: 'utf8', timeout: 300000 })
  assert.equal(build2.status, 0, build2.stdout + build2.stderr)
  const tar2 = path.join(outDir, `hub-${version2}.tar.gz`)
  const installed = hubctl(['install', tar2])
  assert.equal(installed.code, 0, installed.output.slice(-3000))
  const started = hubctl(['start'])
  assert.equal(started.code, 0, started.output)
  await refreshBaseA()
  const healthNew = await (await fetch(`${baseA}/health`)).json()
  assert.equal(healthNew.version, version2)
  const rolled = hubctl(['rollback'])
  assert.equal(rolled.code, 0, rolled.output.slice(-3000))
  assert.match(rolled.output, /已回退/)
  await refreshBaseA()
  const healthOld = await (await fetch(`${baseA}/health`)).json()
  assert.equal(healthOld.version, version1, '回滚后仍在跑新版本')
  assert.deepEqual(healthOld.contentProducts.map((item) => item.revision), healthNew.contentProducts.map((item) => item.revision), '回滚改变了内容副本 revision')
  const proposals = await (await fetch(`${baseA}/v1/products/table-flow/proposals/count`)).json()
  assert.ok(proposals.total >= 1, '回滚丢失了提案数据')
  void tar2
})

await record('HOST=0.0.0.0 时可从本机第二地址访问（局域网绑定）', async () => {
  const lanIp = Object.values(os.networkInterfaces()).flat().find((item) => item && item.family === 'IPv4' && !item.internal)?.address
  assert.ok(lanIp, '本机没有可用的非回环 IPv4 地址')
  hubctl(['stop'])
  // hubctl start 本身会等到健康才返回，所以同步跑就能拿到它的告警
  const started = spawnSync('bash', [path.join(SITE_ROOT, 'deploy', 'hubctl'), 'start'], {
    cwd: SITE_ROOT,
    encoding: 'utf8',
    // 故意不配审核身份：绑非回环地址时必须把暴露面告警打出来
    env: { ...process.env, HUB_HOME: hubHome, HUB_DATA_DIR: path.join(hubHome, 'data'), HOST: '0.0.0.0', PORT: '0' },
    timeout: 120000
  })
  assert.equal(started.status, 0, `${started.stdout}${started.stderr}`)
  const startOutput = `${started.stdout}${started.stderr}`
  assert.match(startOutput, /非回环地址，同一网络内的其他设备可访问/)
  assert.match(startOutput, /未配置审核身份：任何人都能提交提案/)
  assert.match(startOutput, /只想给 tailnet 用就把 HOST 设成手机的 Tailscale 地址/)
  const { port: lanPort } = await readBoundPort(path.join(hubHome, 'data'))
  const health = await fetch(`http://${lanIp}:${lanPort}/health`, { signal: AbortSignal.timeout(5000) })
  assert.ok(health.ok, `无法从 ${lanIp}:${lanPort} 访问 /health`)
  const page = await fetch(`http://${lanIp}:${lanPort}/table-flow/`)
  assert.equal(page.status, 200)
  const warnings = spawnSync('bash', [path.join(SITE_ROOT, 'deploy', 'hubctl'), 'status'], {
    cwd: SITE_ROOT,
    encoding: 'utf8',
    env: { ...process.env, HUB_HOME: hubHome, HUB_DATA_DIR: path.join(hubHome, 'data'), HOST: '0.0.0.0', PORT: '0' }
  }).stdout
  assert.match(warnings, /回环=仅本机/, 'status 没说明监听范围的含义')
  spawnSync('bash', [path.join(SITE_ROOT, 'deploy', 'hubctl'), 'stop'], { cwd: SITE_ROOT, env: { ...process.env, HUB_HOME: hubHome, HUB_DATA_DIR: path.join(hubHome, 'data'), HOST: '0.0.0.0', PORT: '0' } })
})

await record('静态页资源全部同源，断外网不依赖发布仓', () => {
  const siteDir = path.join(hubHome, 'current', 'site')
  const html = fs.readFileSync(path.join(fs.realpathSync(siteDir), 'index.html'), 'utf8')
  // 运行时资源（脚本/样式/图片/预加载）必须同源；<a href> 指向发布仓直链是用户点击才出网，
  // 不构成打开页面对网络的依赖。
  const runtime = [...html.matchAll(/<(?:script|link|img)[^>]*?(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/g)].map((match) => match[1])
  const stylesheet = [...html.matchAll(/<link[^>]*rel="(?:stylesheet|preload|modulepreload)"[^>]*href="(https?:\/\/[^"]+)"/g)].map((match) => match[1])
  assert.deepEqual([...new Set([...runtime, ...stylesheet])], [], `首页在加载时依赖外部资源：${runtime.slice(0, 3).join(', ')}`)
  const downloadLinks = [...html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"/g)].map((match) => match[1])
  assert.ok(downloadLinks.every((link) => link.startsWith('https://')), '下载直链必须是 https')
  const assetRefs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1])
  assert.ok(assetRefs.length > 3, '首页没有足够的同源资源引用')
  for (const ref of assetRefs.filter((item) => !item.startsWith('http') && !item.includes('#'))) {
    const target = path.join(fs.realpathSync(siteDir), ref.replace(/^\//, '').replace(/\/$/, '/index'))
    const candidates = [target, `${target}.html`, path.join(path.dirname(target), 'index.html')]
    assert.ok(candidates.some((item) => fs.existsSync(item)), `资源缺失：${ref}`)
  }
})

await record('hubctl status / logs / doctor 可观测', () => {
  const status = hubctl(['status'])
  assert.equal(status.code, 0, status.output)
  assert.match(status.output, /版本\s*:/)
  assert.match(status.output, /数据目录/)
  const logs = hubctl(['logs', '-n', '5'])
  assert.equal(logs.code, 0, logs.output)
  const doctor = hubctl(['doctor'])
  assert.equal(doctor.code, 0, doctor.output)
  assert.match(doctor.output, /node=/)
  const envOut = hubctl(['env'])
  assert.equal(envOut.code, 0, envOut.output)
  assert.ok(!envOut.output.includes('deploy-test-reviewer-token'), 'hubctl env 泄漏了 token 值')
})

await record('服务停止后浏览器不应还能打开站点（不假装离线可用）', async () => {
  hubctl(['stop'])
  let refused = false
  try {
    await fetch(`${baseA}/health`, { signal: AbortSignal.timeout(2000) })
  } catch {
    refused = true
  }
  assert.ok(refused, '进程已停但端口仍可访问')
})

hubctl(['stop'])
fs.rmSync(work, { recursive: true, force: true })
const failed = results.filter((item) => !item.ok)
console.log(`\n部署与运维测试：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  for (const item of failed) console.error(`   · ${item.name}`)
  process.exit(1)
}
console.log('✅ 部署/备份/恢复/回滚（电脑侧演练）通过 —— Android 实机仍需在 Termux 上重跑同一组命令')

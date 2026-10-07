import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  SITE_ROOT,
  connectedProducts,
  generatedPaths,
  packageFromSource,
  readJson,
  readSource,
  validateRegistry,
  validateSource,
  verifyPackage
} from './content-lib.mjs'

const results = []

function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`  ✅ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.error(`  ❌ ${name}\n     ${String(error.message ?? error).split('\n').join('\n     ')}`)
  }
}

/** 每类断言都用临时副本，绝不改动仓库真实产物。 */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-content-test-'))
  for (const entry of ['scripts', 'schema', 'products', 'data', '.vitepress']) {
    const src = path.join(SITE_ROOT, entry)
    if (!fs.existsSync(src)) continue
    if (entry === '.vitepress') {
      fs.mkdirSync(path.join(dir, entry), { recursive: true })
      const release = path.join(src, 'release.json')
      if (fs.existsSync(release)) fs.copyFileSync(release, path.join(dir, entry, 'release.json'))
      continue
    }
    fs.cpSync(src, path.join(dir, entry), { recursive: true })
  }
  fs.copyFileSync(path.join(SITE_ROOT, 'package.json'), path.join(dir, 'package.json'))
  fs.symlinkSync(path.join(SITE_ROOT, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}

function run(dir, script, args = []) {
  const res = spawnSync(process.execPath, [path.join(dir, 'scripts', script), ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env }
  })
  return { code: res.status, stdout: `${res.stdout ?? ''}${res.stderr ?? ''}` }

}

function hashTree(dir) {
  if (!fs.existsSync(dir)) return 'missing'
  const walk = (current) => {
    const rows = []
    for (const name of fs.readdirSync(current).sort()) {
      const abs = path.join(current, name)
      if (fs.statSync(abs).isDirectory()) rows.push(...walk(abs))
      else rows.push(`${name}:${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16)}`)
    }
    return rows
  }
  return crypto.createHash('sha256').update(walk(dir).join('|')).digest('hex')
}

/**
 * Automation 已是对外列出的产品，"不许出现 Automation 这个词"早就不是它的本意。
 * 真正不能漏的是它机器上的东西：站点适配层、登记表、登录态、Profile、取证目录，以及任何凭证形态。
 */
const PRIVATE_LEAK = /private\/|browser-data|credential_vault|auth\.json|registry\.json|\/Users\/pikachu\/code\/Automation|token|secret|password|BEGIN [A-Z ]*PRIVATE KEY/i

const registry = readJson(path.join(SITE_ROOT, 'data', 'products.json'))

console.log('\n【1】schema 与内容源规则')

test('data/products.json 通过 products.v1 schema', () => {
  assert.equal(validateRegistry(registry).ok, true)
})

const tableFlow = registry.products.find((item) => item.id === 'table-flow')
const { source } = readSource('table-flow')

test('真实内容源通过校验', () => {
  assert.equal(validateSource(source, tableFlow).ok, true)
})

test('错误产品 ID 会失败', () => {
  const bad = structuredClone(source)
  bad.product = 'wps-enhancer'
  const result = validateSource(bad, tableFlow)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /product 不匹配/)
})

test('未知产品直接在读取处失败', () => {
  assert.throws(() => readSource('no-such-product'), /未知产品/)
})

test('facts 渠道变体会失败', () => {
  const bad = structuredClone(source)
  bad.facts['pricing.pro.monthly'].variants = { 'table-flow-panel': 6 }
  assert.equal(validateSource(bad, tableFlow).ok, false)
})

test('facts 缺 effectiveFromVersion 会失败', () => {
  const bad = structuredClone(source)
  delete bad.facts['pricing.pro.monthly'].effectiveFromVersion
  const result = validateSource(bad, tableFlow)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /effectiveFromVersion/)
})

test('copy 含 HTML 会失败', () => {
  const bad = structuredClone(source)
  bad.copy['overview.summary'].default = '<b>不允许 HTML</b>'
  assert.equal(validateSource(bad, tableFlow).ok, false)
})

test('copy 超渠道预算会失败', () => {
  const bad = structuredClone(source)
  bad.copy['update.summary'].default = '长'.repeat(tableFlow.budget.summary + 1)
  const result = validateSource(bad, tableFlow)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /超过 summary 预算/)
})

test('视觉字段名出现在 facts 会失败', () => {
  const bad = structuredClone(source)
  bad.facts['accent.color'] = { value: '#fff', effectiveFromVersion: '1.0.0' }
  assert.equal(validateSource(bad, tableFlow).ok, false)
})

console.log('\n【2】revision 语义与 SHA 自校验')

test('相同语义产生相同 revision 与 SHA（时间与 Git 不参与 hash）', () => {
  const a = packageFromSource(source, tableFlow)
  const b = packageFromSource(source, tableFlow)
  assert.equal(a.sha256, b.sha256)
  assert.equal(a.contentRevision, b.contentRevision)
})

test('内容包 SHA 不匹配会失败', () => {
  const pkg = packageFromSource(source, tableFlow)
  const tampered = structuredClone(pkg)
  tampered.facts['pricing.pro.monthly'].value = 99
  assert.equal(verifyPackage(tampered, 'table-flow').ok, false)
  const mismatchedSha = structuredClone(pkg)
  mismatchedSha.sha256 = '0'.repeat(64)
  assert.equal(verifyPackage(mismatchedSha, 'table-flow').ok, false)
})

test('仓库内已生成的 latest 包自校验通过', () => {
  for (const product of connectedProducts()) {
    const file = generatedPaths(product.id)
    assert.ok(fs.existsSync(file.latest), `${product.id} 缺少 latest`)
    const result = verifyPackage(readJson(file.latest), product.id)
    assert.ok(result.ok, `${product.id}: ${result.errors.join('; ')}`)
  }
})

console.log('\n【3】构建/漂移/回滚（临时副本沙箱）')

test('重复构建幂等：第二次构建不改字节', () => {
  const dir = sandbox()
  const first = run(dir, 'content-build.mjs')
  assert.equal(first.code, 0, first.stdout)
  const hashAfterFirst = hashTree(path.join(dir, 'data', 'generated'))
  const second = run(dir, 'content-build.mjs')
  assert.equal(second.code, 0, second.stdout)
  assert.equal(hashTree(path.join(dir, 'data', 'generated')), hashAfterFirst, '重复构建改变了生成目录')
})

test('CLI 同时支持 --product id 与 --product=id', () => {
  const dir = sandbox()
  const spaced = run(dir, 'content-build.mjs', ['--product', 'table-flow'])
  assert.equal(spaced.code, 0, spaced.stdout)
  const eq = run(dir, 'content-build.mjs', ['--product=table-flow'])
  assert.equal(eq.code, 0, eq.stdout)
  const validate = run(dir, 'content-validate.mjs', ['--product', 'table-flow'])
  assert.equal(validate.code, 0, validate.stdout)
  const rollback = run(dir, 'content-rollback.mjs', ['--product', 'table-flow'])
  assert.equal(rollback.code, 2, '缺参数时应退 2')
  const unknown = run(dir, 'content-build.mjs', ['--product', 'nope'])
  assert.equal(unknown.code, 2, '未知产品应失败而不是静默跳过')
})

test('单产品损坏不阻断其他产品，且不移动其 latest', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const generated = path.join(dir, 'data', 'generated')
  const tableFlowLatestBefore = fs.readFileSync(path.join(generated, 'table-flow', 'content-latest.v1.json'), 'utf8')
  const wpsPointerBefore = hashTree(path.join(generated, 'wps-enhancer'))

  const sourceFile = path.join(dir, 'products', 'wps-enhancer', 'content.v1.source.json')
  const broken = JSON.parse(fs.readFileSync(sourceFile, 'utf8'))
  broken.copy['overview.summary'].default = '<script>坏掉</script>'
  fs.writeFileSync(sourceFile, `${JSON.stringify(broken, null, 2)}\n`)

  const build = run(dir, 'content-build.mjs')
  assert.equal(build.code, 1, '存在失败产品时必须整体退 1')
  assert.match(build.stdout, /wps-enhancer/)
  assert.match(build.stdout, /table-flow/)
  assert.ok(!build.stdout.includes('❌ table-flow'), 'table-flow 不应被连坐')

  const tableFlowLatestAfter = fs.readFileSync(path.join(generated, 'table-flow', 'content-latest.v1.json'), 'utf8')
  assert.equal(tableFlowLatestAfter, tableFlowLatestBefore, '健康产品的 latest 不得被改动')

  // 修好后重新构建，坏掉的产品才恢复
  const fixed = JSON.parse(fs.readFileSync(sourceFile, 'utf8'))
  fixed.copy['overview.summary'].default = 'WPS 桌面端增强工具。'
  fs.writeFileSync(sourceFile, `${JSON.stringify(fixed, null, 2)}\n`)
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  assert.notEqual(hashTree(path.join(generated, 'wps-enhancer')), wpsPointerBefore)
})

test('校验失败时不移动 latest', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const file = path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json')
  const before = fs.readFileSync(file, 'utf8')
  const sourceFile = path.join(dir, 'products', 'table-flow', 'content.v1.source.json')
  const broken = JSON.parse(fs.readFileSync(sourceFile, 'utf8'))
  delete broken.facts['version.current'].effectiveFromVersion
  fs.writeFileSync(sourceFile, `${JSON.stringify(broken, null, 2)}\n`)
  assert.equal(run(dir, 'content-build.mjs').code, 1)
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'latest 被移动了')
})

test('漂移检查不因 Git revision 变化而跳过事实比较', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  assert.equal(run(dir, 'content-drift.mjs').code, 0)
  const latest = path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json')
  const pkg = JSON.parse(fs.readFileSync(latest, 'utf8'))
  // 只改事实值并同步 SHA/revision 字段形态无效：这里模拟"包被手改"
  pkg.facts['pricing.pro.monthly'].value = 4
  fs.writeFileSync(latest, `${JSON.stringify(pkg, null, 2)}\n`)
  const drift = run(dir, 'content-drift.mjs')
  assert.equal(drift.code, 1, '篡改价格事实必须报漂移')
  assert.match(drift.stdout, /pricing\.pro\.monthly|SHA 不匹配/)
})

test('历史 revision 被改写时构建拒绝', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const pkg = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  const history = path.join(dir, 'data', 'generated', 'table-flow', 'history', `${pkg.contentRevision}.json`)
  const tampered = JSON.parse(fs.readFileSync(history, 'utf8'))
  tampered.copy['overview.summary'].default = '偷改历史'
  fs.writeFileSync(history, `${JSON.stringify(tampered, null, 2)}\n`)
  const build = run(dir, 'content-build.mjs')
  assert.equal(build.code, 1)
  assert.match(build.stdout, /历史 revision 被改写/)
})

test('回滚到当前正确 revision 后漂移检查通过', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const correct = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  // 把 latest 指向同产品另一个历史 revision（模拟误发布）
  const others = fs.readdirSync(path.join(dir, 'data', 'generated', 'table-flow', 'history')).filter((f) => f.endsWith('.json'))
  const wrong = others.find((f) => !f.startsWith(correct.contentRevision))
  assert.ok(wrong, '需要至少两个历史 revision 才能验证回滚')
  fs.copyFileSync(path.join(dir, 'data', 'generated', 'table-flow', 'history', wrong), path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  assert.equal(run(dir, 'content-drift.mjs').code, 1, '误发布应被漂移检查抓住')
  const rollback = run(dir, 'content-rollback.mjs', ['--product', 'table-flow', '--revision', correct.contentRevision])
  assert.equal(rollback.code, 0, rollback.stdout)
  assert.match(rollback.stdout, /latest 已回滚/)
  assert.equal(run(dir, 'content-drift.mjs').code, 0, '回滚后漂移检查应通过')
  assert.equal(fs.readdirSync(path.join(dir, 'data', 'generated', 'table-flow', 'history')).length, others.length, '回滚不得删除历史')
})

test('回滚到过期 revision 时漂移检查会报警', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const first = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  // 造第二个合法 revision：改文案 → 构建 → 再改回来源，此时 latest 是第二份
  const sourceFile = path.join(dir, 'products', 'table-flow', 'content.v1.source.json')
  const src = JSON.parse(fs.readFileSync(sourceFile, 'utf8'))
  src.copy['overview.summary'].default = '过期版本的摘要文案。'
  fs.writeFileSync(sourceFile, `${JSON.stringify(src, null, 2)}\n`)
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const second = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  assert.notEqual(second.contentRevision, first.contentRevision, '两次构建应产生不同 revision')

  // 来源回到第一版语义
  src.copy['overview.summary'].default = structuredClone(source).copy['overview.summary'].default
  fs.writeFileSync(sourceFile, `${JSON.stringify(src, null, 2)}\n`)
  assert.equal(run(dir, 'content-drift.mjs').code, 1, 'latest 落后于 source 时漂移检查必须报警')
  const rollback = run(dir, 'content-rollback.mjs', ['--product=table-flow', `--revision=${first.contentRevision}`])
  assert.equal(rollback.code, 0, rollback.stdout)
  assert.equal(run(dir, 'content-drift.mjs').code, 0, '回滚到正确 revision 后漂移应通过')
})

test('SHA 自校验不通过的历史 revision 拒绝被回滚启用', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const historyDir = path.join(dir, 'data', 'generated', 'table-flow', 'history')
  const target = path.join(historyDir, 'content-ffffffffffff.json')
  const pkg = structuredClone(readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json')))
  pkg.contentRevision = 'content-ffffffffffff'
  pkg.sha256 = `${'f'.repeat(64)}`
  fs.writeFileSync(target, `${JSON.stringify(pkg, null, 2)}\n`)
  const rollback = run(dir, 'content-rollback.mjs', ['--product', 'table-flow', '--revision', 'content-ffffffffffff'])
  assert.equal(rollback.code, 1, rollback.stdout)
  assert.match(rollback.stdout, /SHA 不匹配/)
  const latest = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  assert.match(latest.sha256, /^[0-9a-f]{64}$/)
  assert.notEqual(latest.contentRevision, 'content-ffffffffffff', '非法 revision 不得成为 latest')
})

console.log('\n【4】发布适配器（默认 dry-run）')

test('dry-run 只生成本地 staging，不写远程、不移动 latest', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const generated = path.join(dir, 'data', 'generated')
  const before = hashTree(generated)
  const pkg = readJson(path.join(generated, 'table-flow', 'content-latest.v1.json'))
  const out = run(dir, 'content-publish.mjs', ['--product', 'table-flow', '--revision', pkg.contentRevision])
  assert.equal(out.code, 0, out.stdout)
  assert.match(out.stdout, /dry-run/)
  assert.equal(hashTree(generated), before, '发布适配器不得改动生成目录')
  const staging = path.join(dir, 'data', 'publish', 'table-flow', pkg.contentRevision)
  assert.ok(fs.existsSync(path.join(staging, 'publish-plan.json')), '缺少发布计划')
  const plan = readJson(path.join(staging, 'publish-plan.json'))
  assert.equal(plan.remoteWrite, false)
  assert.equal(plan.revision, pkg.contentRevision)
  assert.equal(plan.files.length, 2)
  for (const file of plan.files) assert.match(file.sha256, /^[0-9a-f]{64}$/)
  assert.ok(fs.existsSync(path.join(dir, 'data', 'publish', 'table-flow', pkg.contentRevision, 'content-latest.v1.json')))
})

test('没有发布配置时 --publish 必须拒绝远程写入', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const generated = path.join(dir, 'data', 'generated')
  const before = hashTree(generated)
  const pkg = readJson(path.join(generated, 'table-flow', 'content-latest.v1.json'))
  const out = run(dir, 'content-publish.mjs', ['--product', 'table-flow', '--revision', pkg.contentRevision, '--publish'])
  assert.equal(out.code, 3, out.stdout)
  assert.match(out.stdout, /拒绝远程写入/)
  assert.equal(hashTree(generated), before, '远程写入被拒后 latest 不能移动')
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'publish', 'table-flow', 'published.json')))
})

test('远程写入失败时不记录发布指针', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const generated = path.join(dir, 'data', 'generated')
  const before = hashTree(generated)
  const pkg = readJson(path.join(generated, 'table-flow', 'content-latest.v1.json'))
  const configDir = path.join(dir, 'data', 'publish')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'release-config.json'), `${JSON.stringify({ products: { 'table-flow': { command: ['/bin/sh', '-c', 'exit 7'] } } }, null, 2)}\n`)
  const failed = run(dir, 'content-publish.mjs', ['--product', 'table-flow', '--revision', pkg.contentRevision, '--publish'])
  assert.equal(failed.code, 1, failed.stdout)
  assert.match(failed.stdout, /latest 未移动/)
  assert.equal(hashTree(generated), before)
  assert.ok(!fs.existsSync(path.join(configDir, 'table-flow', 'published.json')))

  fs.writeFileSync(path.join(configDir, 'release-config.json'), `${JSON.stringify({ products: { 'table-flow': { command: ['/bin/sh', '-c', 'echo published $HUB_REVISION'] } } }, null, 2)}\n`)
  const ok = run(dir, 'content-publish.mjs', ['--product', 'table-flow', '--revision', pkg.contentRevision, '--publish'])
  assert.equal(ok.code, 0, ok.stdout)
  assert.ok(fs.existsSync(path.join(configDir, 'table-flow', 'published.json')))
  assert.equal(hashTree(generated), before, '即便发布成功也不得改站点仓生成目录')
})

test('发布配置里含凭证字段会被拒绝', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const pkg = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  fs.mkdirSync(path.join(dir, 'data', 'publish'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'data', 'publish', 'release-config.json'), `${JSON.stringify({ token: 'secret', products: { 'table-flow': { command: ['/bin/true'] } } }, null, 2)}\n`)
  const out = run(dir, 'content-publish.mjs', ['--product', 'table-flow', '--revision', pkg.contentRevision, '--publish'])
  assert.equal(out.code, 3, out.stdout)
  assert.match(out.stdout, /凭证/)
})

test('未接入发布分支的产品不允许发布', () => {
  const dir = sandbox()
  const out = run(dir, 'content-publish.mjs', ['--product', 'auto-clicker-mac', '--revision', 'content-000000000000'])
  assert.equal(out.code, 2, out.stdout)
  assert.match(out.stdout, /releaseBranch/)
})

test('发布产物不含 HTML/视觉字段/凭证占位', () => {
  const dir = sandbox()
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const pkg = readJson(path.join(dir, 'data', 'generated', 'table-flow', 'content-latest.v1.json'))
  run(dir, 'content-publish.mjs', ['--product', 'table-flow', '--revision', pkg.contentRevision])
  const staged = readJson(path.join(dir, 'data', 'publish', 'table-flow', pkg.contentRevision, 'content.v1.json'))
  const raw = JSON.stringify(staged)
  assert.ok(!/<[a-z/][^>]*>/i.test(raw), '发布包出现 HTML')
  assert.ok(!/"(icon|color|accent|layout)/i.test(raw), '发布包出现视觉字段')
  const leak = raw.match(PRIVATE_LEAK)
  assert.ok(!leak, `发布包出现本机数据/凭证形态：${leak?.[0]}`)
})

console.log('\n【5】生成包与站点消费一致性')

test('内容包不含 Automation 的本机数据与凭证', () => {
  for (const product of connectedProducts()) {
    const raw = fs.readFileSync(generatedPaths(product.id).latest, 'utf8')
    const hit = raw.match(PRIVATE_LEAK)
    assert.ok(!hit, `${product.id} 内容包出现本机数据/凭证形态：${hit?.[0]}`)
  }
})

test('所有已接入产品都有不可变 revision 落盘', () => {
  for (const product of connectedProducts()) {
    const pkg = readJson(generatedPaths(product.id).latest)
    assert.ok(fs.existsSync(generatedPaths(product.id, pkg.contentRevision).revision), `${product.id} 缺少 history/${pkg.contentRevision}.json`)
  }
})

console.log('\n【6】产品目录守卫（注册表是唯一索引，漏页面必须挡住）')

function lintIn(dir) {
  return run(dir, 'content-lint.mjs')
}

function registryIn(dir) {
  return path.join(dir, 'data', 'products.json')
}

test('当前仓库通过目录守卫', () => {
  const out = lintIn(sandbox())
  assert.equal(out.code, 0, out.stdout)
  assert.match(out.stdout, /注册表与页面一一对应/)
})

test('登记了产品却没写页面 → 挡住', () => {
  const dir = sandbox()
  const reg = readJson(registryIn(dir))
  reg.products.push({
    id: 'zephyr',
    name: 'Zephyr',
    kind: 'desktop-app',
    visibility: 'listed',
    status: 'released',
    factsSource: 'manual',
    releaseBranch: null,
    updateMechanism: 'none',
    contentSource: 'products/zephyr/content.v1.source.json',
    sections: ['overview'],
    brand: { logo: '/assets/zephyr/icon.png' },
    budget: { badge: 12, summary: 40, text: 200 }
  })
  fs.writeFileSync(registryIn(dir), `${JSON.stringify(reg, null, 2)}\n`)
  const out = lintIn(dir)
  assert.equal(out.code, 1, '新登记的产品没有页面时必须失败')
  assert.match(out.stdout, /zephyr\/index\.md 不存在/)
  assert.match(out.stdout, /登记了页面「overview」/)
})

test('写了页面却没登记进 sections → 挡住', () => {
  const dir = sandbox()
  fs.writeFileSync(path.join(dir, 'products', 'qoder-proxy', 'secrets.md'), '# 没人登记的页\n')
  const out = lintIn(dir)
  assert.equal(out.code, 1, '未登记的页面不会出现在侧栏，必须失败')
  assert.match(out.stdout, /secrets\.md 存在，却没登记进 sections/)
})

test('图标没按约定路径登记 → 挡住', () => {
  const dir = sandbox()
  const reg = readJson(registryIn(dir))
  reg.products.find((p) => p.id === 'wps-enhancer').brand.logo = '/assets/wps.png'
  fs.writeFileSync(registryIn(dir), `${JSON.stringify(reg, null, 2)}\n`)
  const out = lintIn(dir)
  assert.equal(out.code, 1)
  assert.match(out.stdout, /wps-enhancer: 图标未登记为约定路径/)
})

test('产品没声明形态与可用范围 → 挡住', () => {
  const dir = sandbox()
  const file = path.join(dir, 'products', 'wps-enhancer', 'content.v1.source.json')
  const src = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete src.facts['form.factor']
  delete src.facts['form.scope']
  fs.writeFileSync(file, `${JSON.stringify(src, null, 2)}\n`)
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const out = lintIn(dir)
  assert.equal(out.code, 1, '缺形态声明必须失败，否则用户看不到"这能在什么上跑"')
  assert.match(out.stdout, /wps-enhancer: 内容源缺事实 form\.factor/)
  assert.match(out.stdout, /wps-enhancer: 内容源缺事实 form\.scope/)
})

test('updateMechanism 为 none 却没登记获取地址 → 挡住', () => {
  // 用 qoder-proxy 测：它的页面没有 <Fact> 引用这个键，所以挡住它的必须是结构守卫本身，
  // 而不是"占位符指向未知事实"那条更早的检查（automation 的 faq 页有引用，走的是后者）。
  const dir = sandbox()
  const file = path.join(dir, 'products', 'qoder-proxy', 'content.v1.source.json')
  const src = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete src.facts['download.releasesUrl']
  delete src.facts['download.repoUrl']
  fs.writeFileSync(file, `${JSON.stringify(src, null, 2)}\n`)
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const out = lintIn(dir)
  assert.equal(out.code, 1, '键名写错或漏写时，页面只会静默显示一条告警')
  assert.match(out.stdout, /qoder-proxy: updateMechanism 为 none 却没登记/)
})

test('页面引用了不存在的事实 → 挡住', () => {
  const dir = sandbox()
  const file = path.join(dir, 'products', 'automation', 'content.v1.source.json')
  const src = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete src.facts['download.repoUrl']
  fs.writeFileSync(file, `${JSON.stringify(src, null, 2)}\n`)
  assert.equal(run(dir, 'content-build.mjs').code, 0)
  const out = lintIn(dir)
  assert.equal(out.code, 1)
  assert.match(out.stdout, /占位符指向未知事实 automation\/download\.repoUrl/)
})

test('逐字副本在站点侧被手改 → 挡住', () => {
  const dir = sandbox()
  const file = path.join(dir, 'products', 'table-flow', 'privacy.md')
  fs.appendFileSync(file, '\n站点侧偷偷加一句\n')
  const out = lintIn(dir)
  assert.equal(out.code, 1, '镜像文件必须在源仓改')
  assert.match(out.stdout, /逐字副本在站点侧被改动/)
})

test('登记表指向不存在的副本 → 挡住', () => {
  const dir = sandbox()
  fs.rmSync(path.join(dir, 'products', 'table-flow', 'usage-guide.md'))
  const out = lintIn(dir)
  assert.equal(out.code, 1)
  assert.match(out.stdout, /登记的逐字副本不存在/)
})

test('回环地址不被当成版本号（127.0.0.1 是 IP，不是 x.y.z 事实）', () => {
  const dir = sandbox()
  const file = path.join(dir, 'products', 'qoder-proxy', 'overview.md')
  const before = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, `${before}\n默认监听 127.0.0.1:3100，另有 0.0.0.0 的写法。\n`)
  assert.equal(lintIn(dir).code, 0, 'IP 地址被误判成裸版本号会让整条 lint 失去可信度')
  fs.writeFileSync(file, `${before}\n当前版本 v1.6.1 已发布。\n`)
  assert.match(lintIn(dir).stdout, /任意 x\.y\.z 版本号/, '真版本号仍须被抓住')
})

const failed = results.filter((item) => !item.ok)
console.log(`\n内容流水线测试：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  for (const item of failed) console.error(`   · ${item.name}`)
  process.exit(1)
}
console.log('✅ 内容一致性测试通过')

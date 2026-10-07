import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { SITE_ROOT } from './content-lib.mjs'

/**
 * 站点改了东西却忘了记日志——这件事靠人记得是不成立的，所以做成会红的守卫。
 *
 * 两条判据：
 *  1) HEAD 动了发布面（.vitepress/ data/ products/ public/ scripts/ index.md），
 *     同一笔提交必须也动 CHANGELOG.md；
 *  2) 跨日兜底：最新一笔动发布面的提交晚于最新一笔动 CHANGELOG.md 的提交即红。
 *
 * 已知盲区：日期粒度到日，所以"同一天先提交代码、几小时后再补日志"不会被判红；
 * 合并提交不展开文件清单（本仓走线性历史，不依赖它）。
 */
const LOG = 'CHANGELOG.md'
const WATCHED = ['.vitepress', 'data', 'products', 'public', 'scripts', 'index.md']
// 内容包由 products/<id>/*.source.json 生成，改动原因看源文件那一笔，不重复要求记日志。
const DERIVED = ['data/generated/', '.vitepress/dist/', '.vitepress/cache/']

const repoArg = process.argv.indexOf('--repo')
const REPO = repoArg > -1 ? path.resolve(process.argv[repoArg + 1]) : SITE_ROOT

function git(...args) {
  const res = spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8' })
  return res.status === 0 ? res.stdout : null
}

const isRepo = git('rev-parse', '--is-inside-work-tree')?.trim() === 'true'
if (!isRepo) {
  console.log(`ℹ️ ${REPO} 不是 git 工作树，CHANGELOG 守卫没有可比的历史，跳过`)
  process.exit(0)
}

const derived = (f) => DERIVED.some((p) => f.startsWith(p))
const watched = (f) => WATCHED.some((p) => f === p || f.startsWith(`${p}/`)) && !derived(f)

const headFilesRaw = git('show', '--pretty=format:', '--name-only', 'HEAD')
if (headFilesRaw === null) {
  console.log('ℹ️ HEAD 还不可读（空仓？），CHANGELOG 守卫跳过')
  process.exit(0)
}
const headFiles = headFilesRaw.split('\n').filter(Boolean)
const touched = headFiles.filter(watched)

const fails = []
if (touched.length && !headFiles.includes(LOG)) {
  fails.push(`HEAD 动了发布面却没记 ${LOG}：${touched.slice(0, 6).join('、')}${touched.length > 6 ? ` 等 ${touched.length} 处` : ''}`)
}

const newest = (paths) => {
  const out = git('log', '-1', '--format=%ct', '--', ...paths)
  return out && out.trim() ? Number(out.trim()) : 0
}
const lastCode = newest(WATCHED)
const lastLog = newest([LOG])
if (lastCode > lastLog) {
  fails.push(
    `最新一笔动发布面的提交（${new Date(lastCode * 1000).toISOString().slice(0, 10)}）` +
      `晚于最新一笔 ${LOG} 改动（${lastLog ? new Date(lastLog * 1000).toISOString().slice(0, 10) : '无'}）`
  )
}

if (fails.length) {
  console.error(`\n❌ CHANGELOG 守卫：${fails.length} 项不通过`)
  for (const f of fails) console.error(`   · ${f}`)
  console.error(`   修法：在 ${LOG} 顶部对应日期一节补一行（feat/fix/chore 前缀），与 commit message 同一句话`)
  process.exit(1)
}

console.log(`✅ CHANGELOG 守卫：发布面改动都有日志（HEAD 触及 ${touched.length} 个受管路径）`)

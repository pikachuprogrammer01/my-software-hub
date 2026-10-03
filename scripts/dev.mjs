import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const config = path.join(root, '.vitepress', 'config.mts')

const child = spawn('npx', ['vitepress', 'dev', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit'
})

// 侧栏与路由由构建期扫目录生成；dev 进程启动后不会重扫，所以新增/删除 md 时
// 触碰配置文件，借 VitePress 的 config 热重启拿到同样的"加一篇 md 就多一个页面"。
let timer
const bump = (_event, name) => {
  if (name && !name.endsWith('.md')) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    const now = new Date()
    fs.utimesSync(config, now, now)
    console.log(`[site] 检测到 md 增删（${name ?? 'unknown'}），dev server 重新扫描导航`)
  }, 400)
}

for (const dir of ['content', 'docs']) {
  const abs = path.join(root, dir)
  if (fs.existsSync(abs)) fs.watch(abs, bump)
}

const stop = () => child.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => process.exit(code ?? 0))

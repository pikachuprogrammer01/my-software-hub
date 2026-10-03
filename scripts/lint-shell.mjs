import fs from 'node:fs'
import path from 'node:path'
import { SITE_ROOT } from './content-lib.mjs'

/**
 * 在非 UTF-8 locale（如 ISO-8859-1）下，`$release（…` 里的全角括号首字节会被 bash
 * 当成变量名字符，`set -u` 直接报 "release<0xEF>: unbound variable"，
 * 而在 UTF-8 环境里跑什么都正常——只有换 locale 才炸。
 * 规则：shell 脚本里变量一律写 ${VAR}，紧邻非 ASCII 的裸 $VAR 一律失败。
 */
const IDENT = /[A-Za-z0-9_]/
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vitepress', '.server-dist', '.hub-data', 'out', '.pnpm'])

function shellFiles(dir) {
  const found = []
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
    const abs = path.join(dir, name)
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) found.push(...shellFiles(abs))
    else if (name.endsWith('.sh')) found.push(abs)
    else if (!path.extname(name)) {
      const head = fs.readFileSync(abs).subarray(0, 64).toString('utf8')
      if (/^#!.*(bash|\/sh)/.test(head)) found.push(abs)
    }
  }
  return found
}

const violations = []
for (const file of [...shellFiles(SITE_ROOT), path.join(SITE_ROOT, 'deploy', 'hubctl')]) {
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] !== '$') continue
      if (line[i - 1] === '{' || line[i - 1] === '$') continue
      let j = i + 1
      while (j < line.length && IDENT.test(line[j])) j += 1
      if (j === i + 1) continue
      if (j < line.length && line[j].codePointAt(0) > 127) {
        violations.push(`${path.relative(SITE_ROOT, file)}:${index + 1}  $${line.slice(i + 1, j)} 后紧跟非 ASCII「${line[j]}」→ 改成 \${${line.slice(i + 1, j)}}`)
      }
    }
  })
}

if (violations.length) {
  console.error(`❌ shell 脚本存在 locale 敏感写法（换成非 UTF-8 locale 就会炸）：`)
  for (const v of new Set(violations)) console.error(`   ${v}`)
  process.exit(1)
}
console.log('✅ shell 变量写法与 locale 无关')

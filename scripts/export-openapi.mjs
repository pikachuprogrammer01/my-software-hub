import fs from 'node:fs'
import path from 'node:path'
import { SITE_ROOT, readJson } from './content-lib.mjs'

const distDir = path.join(SITE_ROOT, '.server-dist')
if (!fs.existsSync(path.join(distDir, 'openapi.js'))) {
  console.error('❌ 找不到 .server-dist/openapi.js，请先执行：pnpm api:build')
  process.exit(1)
}

const { loadConfig } = await import(path.join(distDir, 'config.js'))
const { buildOpenApi } = await import(path.join(distDir, 'openapi.js'))

const checkOnly = process.argv.includes('--check')
const target = path.join(SITE_ROOT, 'api', 'openapi.v1.json')
const config = loadConfig({ ...process.env, HUB_STATIC_DIR: path.join(SITE_ROOT, '.vitepress', 'dist') })

/**
 * servers 里的端口只用于本地预览，info.version 随 package.json 浮动；
 * 两者在入库文档里归一化，比较才有意义。
 */
function normalize(doc) {
  doc.servers = [{ url: 'http://127.0.0.1:8787', description: '手机本地实例（局域网访问需显式设置 HOST=0.0.0.0）' }]
  doc.info = { ...doc.info, version: config.version }
  return doc
}

if (checkOnly) {
  if (!fs.existsSync(target)) {
    console.error('❌ api/openapi.v1.json 不存在，请执行 node scripts/export-openapi.mjs')
    process.exit(1)
  }
  const onDisk = JSON.stringify(normalize(readJson(target)), null, 2)
  const built = JSON.stringify(normalize(buildOpenApi(config)), null, 2)
  if (onDisk !== built) {
    console.error('❌ api/openapi.v1.json 与实现不一致，请重新执行 node scripts/export-openapi.mjs 并提交')
    process.exit(1)
  }
  console.log('✅ OpenAPI 文档与实现一致')
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(normalize(buildOpenApi(config)), null, 2)}\n`)
  console.log(`✅ 已写出 ${path.relative(SITE_ROOT, target)}`)
}

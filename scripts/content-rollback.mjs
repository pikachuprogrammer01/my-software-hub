import fs from 'node:fs'
import path from 'node:path'
import { generatedPaths, readRegistry, writeJson } from './content-lib.mjs'

const product = process.argv.find((arg) => arg.startsWith('--product='))?.split('=')[1]
const revision = process.argv.find((arg) => arg.startsWith('--revision='))?.split('=')[1]
if (!product || !revision) { console.error('用法：pnpm content:rollback --product=<id> --revision=<revision>'); process.exit(2) }
if (!readRegistry().products.some((item) => item.id === product)) { console.error(`未知产品：${product}`); process.exit(2) }
const paths = generatedPaths(product, revision)
if (!fs.existsSync(paths.revision)) { console.error(`找不到 revision：${paths.revision}`); process.exit(1) }
const value = JSON.parse(fs.readFileSync(paths.revision, 'utf8'))
writeJson(paths.latest, value)
console.log(`✅ ${product}: latest 已回滚到 ${revision}`)

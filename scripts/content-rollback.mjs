import path from 'node:path'
import fs from 'node:fs'
import { parseArgs, flagValue } from './lib/args.mjs'
import { generatedPaths, readJson, readRegistry, verifyPackage, writeJsonIfChanged } from './content-lib.mjs'

const { flags } = parseArgs()
const product = flagValue(flags, 'product')
const revision = flagValue(flags, 'revision')

if (!product || !revision) {
  console.error('用法：node scripts/content-rollback.mjs --product <id> --revision <revision>（也支持 --product=<id>）')
  process.exit(2)
}
if (!readRegistry().products.some((item) => item.id === product)) {
  console.error(`未知产品：${product}`)
  process.exit(2)
}

const paths = generatedPaths(product, revision)
if (!fs.existsSync(paths.revision)) {
  console.error(`找不到 revision：${path.relative(process.cwd(), paths.revision)}`)
  process.exit(1)
}

const value = readJson(paths.revision)
const check = verifyPackage(value, product)
if (!check.ok) {
  console.error(`❌ 拒绝回滚：历史 revision 自校验失败\n    ${check.errors.join('\n    ')}`)
  process.exit(1)
}
if (value.contentRevision !== revision) {
  console.error(`❌ 拒绝回滚：文件名 revision 与包内不一致（${revision} != ${value.contentRevision}）`)
  process.exit(1)
}

writeJsonIfChanged(paths.full, value)
writeJsonIfChanged(paths.latest, value)
console.log(`✅ ${product}: latest 已回滚到 ${revision}（历史 revision 未删除）`)

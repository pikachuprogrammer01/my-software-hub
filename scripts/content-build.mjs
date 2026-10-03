import path from 'node:path'
import { packageFromSource, readRegistry, readSource, validateSource, generatedPaths, writeJson } from './content-lib.mjs'

const args = process.argv.slice(2)
const only = args.find((arg) => arg.startsWith('--product='))?.split('=')[1]
const dryRun = args.includes('--dry-run')
const products = readRegistry().products.filter((item) => (!only || item.id === only) && item.contentSource)
let failures = 0
for (const registry of products) {
  const { source } = readSource(registry.id)
  const checked = validateSource(source, registry)
  if (!checked.ok) { failures++; console.error(`❌ ${registry.id}: 校验失败`); continue }
  const content = packageFromSource(source, registry)
  const paths = generatedPaths(registry.id, content.contentRevision)
  if (dryRun) { console.log(`✅ ${registry.id}: 将生成 ${content.contentRevision}`); continue }
  writeJson(paths.revision, content)
  writeJson(paths.full, content)
  writeJson(paths.latest, content)
  console.log(`✅ ${registry.id}: ${path.relative(process.cwd(), paths.latest)} ← ${content.contentRevision}`)
}
if (failures) process.exit(1)

import fs from 'node:fs'
import path from 'node:path'
import { GENERATED_DIR, SITE_ROOT, readRegistry, readSource, packageFromSource } from './content-lib.mjs'

let failures = 0
for (const product of readRegistry().products.filter((item) => item.contentSource)) {
  const latest = path.join(GENERATED_DIR, product.id, 'content-latest.v1.json')
  if (!fs.existsSync(latest)) { failures++; console.error(`❌ ${product.id}: 缺少 latest 内容包`); continue }
  const expected = packageFromSource(readSource(product.id).source, product)
  const actual = JSON.parse(fs.readFileSync(latest, 'utf8'))
  if (actual.product !== product.id) { failures++; console.error(`❌ ${product.id}: latest 产品归属错误`); continue }
  if (actual.sha256 !== expected.sha256 && actual.sourceRevision === expected.sourceRevision) {
    failures++; console.error(`❌ ${product.id}: source 与 latest 漂移`)
  } else {
    if (product.id === 'table-flow') {
      const releaseFile = path.join(SITE_ROOT, '.vitepress', 'release.json')
      if (fs.existsSync(releaseFile)) {
        const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'))
        const current = actual.facts?.['version.current']?.value
        if (current && release.version && current !== release.version) {
          failures++; console.error(`❌ table-flow: 内容事实 v${current} 与 update.json v${release.version} 不一致`); continue
        }
      }
    }
    console.log(`✅ ${product.id}: latest 可追溯`)
  }
}
if (failures) process.exit(1)

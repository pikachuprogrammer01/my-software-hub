import fs from 'node:fs'
import path from 'node:path'
import { SITE_ROOT } from './sync-release.mjs'

const file = path.join(SITE_ROOT, 'schema', 'content.v1.json')
console.log(fs.readFileSync(file, 'utf8'))

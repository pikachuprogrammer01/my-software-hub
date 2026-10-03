import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { SITE_ROOT, readRegistry } from './content-lib.mjs'

const file = path.join(SITE_ROOT, 'schema', 'proposal.v1.json')
const ajv = new Ajv({ allErrors: true, strict: false, formats: { 'date-time': true } })
const validate = ajv.compile(JSON.parse(fs.readFileSync(file, 'utf8')))
const input = process.argv[2]
if (!input) { console.error('用法：node scripts/proposal-validate.mjs <proposal.json>'); process.exit(2) }
const proposal = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'))
const known = new Set(readRegistry().products.map((item) => item.id))
const errors = []
if (!validate(proposal)) errors.push(...(validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`))
if (!known.has(proposal.product)) errors.push(`未知产品：${proposal.product}`)
if (proposal.fieldId.startsWith('facts.') && proposal.channel) errors.push('facts 提案不允许 channel 变体')
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log(`✅ 提案通过基础校验：${proposal.product}/${proposal.fieldId}`)

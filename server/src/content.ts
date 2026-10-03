import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// 与 scripts/*.mjs 用同一个 draft 2020-12 校验器，避免两套校验语义。
const Ajv2020 = require('ajv/dist/2020.js') as new (options?: Record<string, unknown>) => AjvLike

type AjvError = { instancePath?: string; message?: string }
type ValidateFn = ((data: unknown) => boolean) & { errors?: AjvError[] }
interface AjvLike {
  addSchema(schema: object): unknown
  compile(schema: object): ValidateFn
}

export type RegistryProduct = {
  id: string
  name: string
  kind: string
  visibility: string
  status: string
  factsSource: string
  releaseBranch: string | null
  updateMechanism: string
  contentSource: string | null
  contentEndpoint: string | null
  sections: string[]
  budget?: { badge?: number; summary?: number; text?: number }
}

export type ContentPackage = {
  schema: number
  product: string
  contentRevision: string
  sha256: string
  facts?: Record<string, unknown>
  copy?: Record<string, { default?: string; variants?: Record<string, string> }>
  update?: { badge?: string; summary?: string; text?: string; detail?: string }
}

/**
 * 站点内容包的只读视图：冲突检测要用它当基线，GET 端点也只分发它。
 * 数据库永远不参与拼装内容包，所以这里没有写路径。
 */
export class ContentStore {
  private readonly registryFile: string
  private readonly ajv: AjvLike
  private readonly validateEnvelope: (data: unknown) => boolean
  private envelopeErrors: AjvError[] = []

  constructor(private readonly contentDir: string, private readonly schemaDir: string) {
    this.registryFile = path.join(path.dirname(path.dirname(contentDir)), 'data', 'products.json')
    this.ajv = new Ajv2020({ allErrors: true, strict: false, formats: { 'date-time': true } })
    const proposalSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'proposal.v1.json'), 'utf8'))
    const envelopeSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'proposal-envelope.v1.json'), 'utf8'))
    this.ajv.addSchema(proposalSchema)
    const compiled = this.ajv.compile(envelopeSchema)
    this.validateEnvelope = (data: unknown) => {
      const ok = compiled(data)
      this.envelopeErrors = compiled.errors ?? []
      return ok
    }
  }

  registry(): RegistryProduct[] {
    const parsed = JSON.parse(fs.readFileSync(this.registryFile, 'utf8')) as { products: RegistryProduct[] }
    return parsed.products
  }

  product(id: string): RegistryProduct | undefined {
    return this.registry().find((item) => item.id === id)
  }

  /** 读已验证的发布副本；SHA 与语义不一致就当作不可用，不分发。 */
  latestPackage(productId: string): ContentPackage | null {
    const file = path.join(this.contentDir, productId, 'content-latest.v1.json')
    if (!fs.existsSync(file)) return null
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as ContentPackage
      return this.selfVerify(pkg) ? pkg : null
    } catch {
      return null
    }
  }

  selfVerify(pkg: ContentPackage): boolean {
    if (!pkg || pkg.product === undefined || pkg.sha256 === undefined) return false
    const semantic = {
      schema: pkg.schema,
      product: pkg.product,
      facts: pkg.facts,
      copy: pkg.copy,
      update: pkg.update ?? null
    }
    const hash = crypto.createHash('sha256').update(JSON.stringify(semantic)).digest('hex')
    return hash === pkg.sha256 && `content-${hash.slice(0, 12)}` === pkg.contentRevision
  }

  fieldOf(pkg: ContentPackage | null, fieldId: string): { exists: boolean; value: unknown } {
    if (!pkg) return { exists: false, value: undefined }
    const dot = fieldId.indexOf('.')
    const zone = fieldId.slice(0, dot)
    const key = fieldId.slice(dot + 1)
    if (zone === 'facts') {
      const fact = pkg.facts?.[key] as { value?: unknown } | undefined
      if (fact === undefined) return { exists: false, value: undefined }
      return { exists: true, value: fact.value ?? fact }
    }
    if (zone === 'copy') {
      const copy = pkg.copy?.[key]
      if (copy === undefined) return { exists: false, value: undefined }
      return { exists: true, value: copy.default }
    }
    return { exists: false, value: undefined }
  }

  copyBudget(productId: string, fieldId: string): number | null {
    const product = this.product(productId)
    if (!product?.budget) return null
    if (fieldId.startsWith('copy.update.badge')) return product.budget.badge ?? null
    if (fieldId.startsWith('copy.update.summary')) return product.budget.summary ?? null
    if (fieldId.startsWith('copy.update.text')) return product.budget.text ?? null
    return null
  }

  validateRequestEnvelope(data: unknown): string[] {
    if (this.validateEnvelope(data)) return []
    return this.envelopeErrors.map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim())
  }
}

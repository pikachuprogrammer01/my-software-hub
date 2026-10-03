import crypto from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { ApiError, ERROR_CODES } from '../http/errors.js'
import { safeEqual, type AppEnv } from '../http/middleware.js'
import type { ServerConfig } from '../config.js'
import type { Store } from '../db/index.js'
import type { ContentStore } from '../content.js'
import { auditEvents, idempotencyRecords, proposals, publishTasks } from '../db/schema.js'

const HTML_RE = /<[^>]+>/
const VISUAL_FIELD_RE = /^(copy\.|facts\.)?(icon|color|accent|layout)(\.|$)/i

type ProposalBody = {
  schema: 1
  product: string
  fieldId: string
  value: unknown
  channel?: string
  clientVersion?: string
  source: string
  createdAt: string
}

type Envelope = { proposal: ProposalBody; base?: { contentRevision?: string; currentValue?: unknown }; submitter?: { label?: string; device?: string } }

export type ProposalView = {
  id: string
  product: string
  fieldId: string
  zone: string
  channel: string | null
  value: unknown
  baseRevision: string | null
  observedCurrentValue: unknown
  submitter: string | null
  trust: string
  status: string
  createdAt: string
  updatedAt: string
  requestId: string | null
  decision: { decidedAt: string | null; decidedBy: string | null; note: string | null }
}

function nowIso(): string {
  return new Date().toISOString()
}

function zoneOf(fieldId: string): 'copy' | 'facts' | null {
  if (fieldId.startsWith('copy.')) return 'copy'
  if (fieldId.startsWith('facts.')) return 'facts'
  return null
}

function toView(row: typeof proposals.$inferSelect): ProposalView {
  return {
    id: row.id,
    product: row.product,
    fieldId: row.fieldId,
    zone: row.zone,
    channel: row.channel,
    value: JSON.parse(row.valueJson) as unknown,
    baseRevision: row.baseRevision,
    observedCurrentValue: row.observedValueJson === null ? undefined : (JSON.parse(row.observedValueJson) as unknown),
    submitter: row.submitter,
    trust: row.trust,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requestId: row.requestId,
    decision: { decidedAt: row.decidedAt, decidedBy: row.decidedBy, note: row.decisionNote }
  }
}

export function requireReviewer(c: Context<AppEnv>, config: ServerConfig): void {
  if (!config.reviewerToken) {
    throw new ApiError(ERROR_CODES.unavailable, '本部署未配置审核身份，提案只能在电脑侧经站点仓受控变更处理', {
      details: { reason: 'reviewer_identity_not_configured' }
    })
  }
  const presented = c.req.header('x-hub-reviewer-token')
  if (!presented || !safeEqual(presented, config.reviewerToken)) {
    throw new ApiError(ERROR_CODES.unauthenticated, '审核身份凭证缺失或不正确', { details: { reason: 'reviewer_token_required' } })
  }
}

function submitterTrust(config: ServerConfig, c: Context<AppEnv>): 'trusted' | 'untrusted' {
  const presented = c.req.header('x-hub-submitter-token')
  if (!presented || config.submitterTokens.length === 0) return 'untrusted'
  return config.submitterTokens.some((token) => safeEqual(presented, token)) ? 'trusted' : 'untrusted'
}

export function createProposalRoutes(deps: { config: ServerConfig; store: Store; content: ContentStore }): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const { config, store, content } = deps

  async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
    const declared = Number(c.req.header('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > config.maxBodyBytes) {
      throw new ApiError(ERROR_CODES.payload_too_large, `请求体超过 ${config.maxBodyBytes} 字节上限`, { details: { maxBytes: config.maxBodyBytes } })
    }
    const raw = await c.req.text()
    if (raw.length > config.maxBodyBytes) {
      throw new ApiError(ERROR_CODES.payload_too_large, `请求体超过 ${config.maxBodyBytes} 字节上限`, { details: { maxBytes: config.maxBodyBytes } })
    }
    if (!raw.trim().length) throw new ApiError(ERROR_CODES.bad_request, '请求体不能为空')
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new ApiError(ERROR_CODES.schema_invalid, '请求体不是合法 JSON')
    }
  }

  app.post('/v1/products/:productId/proposals', async (c) => {
    const productId = c.req.param('productId')
    const requestId = c.get('requestId')
    const product = content.product(productId)
    if (!product) throw new ApiError(ERROR_CODES.unknown_product, `未知产品：${productId}`, { details: { path: c.req.path } })

    const envelope = (await readJsonBody(c)) as Envelope
    const schemaErrors = content.validateRequestEnvelope(envelope)
    if (schemaErrors.length) {
      throw new ApiError(ERROR_CODES.schema_invalid, '提案信封不符合 proposal-envelope.v1', { details: { errors: schemaErrors } })
    }
    const body = envelope.proposal
    if (body.product !== productId) {
      throw new ApiError(ERROR_CODES.bad_request, '提案产品与路径不一致', { details: { path: productId, body: body.product } })
    }
    const zone = zoneOf(body.fieldId)
    if (!zone) throw new ApiError(ERROR_CODES.schema_invalid, `fieldId 必须以 copy. 或 facts. 开头：${body.fieldId}`)

    // facts 是共享事实，渠道变体只允许存在于 copy
    if (zone === 'facts' && body.channel) {
      throw new ApiError(ERROR_CODES.facts_channel_forbidden, 'facts 提案不允许 channel 变体', { details: { fieldId: body.fieldId, channel: body.channel } })
    }
    if (VISUAL_FIELD_RE.test(body.fieldId)) {
      throw new ApiError(ERROR_CODES.schema_invalid, '视觉字段不允许进入内容面', { details: { fieldId: body.fieldId } })
    }
    if (zone === 'copy') {
      if (typeof body.value !== 'string') throw new ApiError(ERROR_CODES.schema_invalid, 'copy 提案的值必须是字符串', { details: { fieldId: body.fieldId } })
      if (HTML_RE.test(body.value)) throw new ApiError(ERROR_CODES.schema_invalid, 'copy 提案不允许 HTML', { details: { fieldId: body.fieldId } })
      const budget = content.copyBudget(productId, body.fieldId)
      if (budget !== null && [...body.value].length > budget) {
        throw new ApiError(ERROR_CODES.copy_over_budget, `copy 提案超过 ${body.fieldId} 的渠道预算`, {
          details: { budget, length: [...body.value].length }
        })
      }
    }

    const baseline = content.latestPackage(productId)
    // 没有已验证发布副本就没有可比基线，接了也无从判冲突，必须显式失败。
    if (!baseline) {
      throw new ApiError(ERROR_CODES.unavailable, `${productId} 尚无已验证内容包，无法接收提案`, { details: { reason: 'verified_copy_missing' } })
    }
    if (baseline && !baseline[zone === 'facts' ? 'facts' : 'copy']) {
      throw new ApiError(ERROR_CODES.unknown_field, `该产品内容包没有 ${zone} 区，无法接收此提案`, { details: { fieldId: body.fieldId } })
    }
    const current = content.fieldOf(baseline, body.fieldId)
    if (baseline && !current.exists) {
      throw new ApiError(ERROR_CODES.unknown_field, `未知字段：${body.fieldId}`, { details: { product: productId, knownZones: ['copy', 'facts'] } })
    }

    // 幂等：断线重试不得产生第二条提案
    const idempotencyKey = c.req.header('idempotency-key') ?? null
    if (idempotencyKey !== null && !/^[A-Za-z0-9._:-]{8,64}$/.test(idempotencyKey)) {
      throw new ApiError(ERROR_CODES.bad_request, 'Idempotency-Key 形态不合法（8-64 位字母数字与 . _ : -）')
    }
    if (idempotencyKey) {
      const replay = store.db.select().from(idempotencyRecords).where(eq(idempotencyRecords.key, idempotencyKey)).get()
      if (replay) {
        const stored = JSON.parse(replay.responseJson) as { proposal: ProposalView }
        return c.json({ ...stored, idempotentReplay: true, requestId }, replay.responseCode as 200)
      }
    }

    // 字段级冲突检测：基础 revision 或字段旧值与当前发布副本不符即为冲突，绝不按写入时间取胜。
    const conflicts: { field: string; expected: unknown; actual: unknown }[] = []
    if (baseline && envelope.base?.contentRevision && envelope.base.contentRevision !== baseline.contentRevision) {
      conflicts.push({ field: 'contentRevision', expected: envelope.base.contentRevision, actual: baseline.contentRevision })
    }
    if (baseline && envelope.base && 'currentValue' in envelope.base && JSON.stringify(envelope.base.currentValue) !== JSON.stringify(current.value)) {
      conflicts.push({ field: body.fieldId, expected: envelope.base.currentValue, actual: current.value })
    }
    const status = conflicts.length ? 'conflict' : 'pending'
    const trust = submitterTrust(config, c)
    const id = `prop-${crypto.randomUUID()}`
    const timestamp = nowIso()

    const row = {
      id,
      product: productId,
      fieldId: body.fieldId,
      zone,
      channel: body.channel ?? null,
      valueJson: JSON.stringify(body.value),
      baseRevision: envelope.base?.contentRevision ?? baseline?.contentRevision ?? null,
      observedValueJson: envelope.base && 'currentValue' in envelope.base ? JSON.stringify(envelope.base.currentValue ?? null) : null,
      submitter: envelope.submitter?.label ?? null,
      trust,
      status,
      idempotencyKey,
      requestId,
      origin: 'http',
      clientVersion: body.clientVersion ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      decidedAt: null,
      decidedBy: null,
      decisionNote: null
    }

    const responsePayload = {
      proposal: toView(row),
      baselineRevision: baseline?.contentRevision ?? null,
      trust,
      ...(conflicts.length ? { conflict: { reason: 'stale_base', details: conflicts, hint: '客户端应重新拉取内容包后再提交' } } : {})
    }
    const responseCode = conflicts.length ? 409 : trust === 'trusted' ? 201 : 202

    // 提案与审计必须同事务落库，之后才对客户端宣告接收成功。
    store.transaction((tx) => {
      tx.insert(proposals).values(row).run()
      tx.insert(auditEvents)
        .values({
          id: `aud-${crypto.randomUUID()}`,
          proposalId: id,
          actor: trust === 'trusted' ? (envelope.submitter?.label ?? 'trusted-client') : 'anonymous-client',
          action: conflicts.length ? 'proposal.received.conflict' : 'proposal.received',
          detailJson: JSON.stringify({ fieldId: body.fieldId, zone, baseRevision: row.baseRevision, clientVersion: body.clientVersion ?? null, conflicts }),
          requestId,
          createdAt: timestamp
        })
        .run()
      if (idempotencyKey) {
        tx.insert(idempotencyRecords)
          .values({ key: idempotencyKey, proposalId: id, responseCode, responseJson: JSON.stringify(responsePayload), createdAt: timestamp })
          .run()
      }
    })

    return c.json(responsePayload, responseCode as 201, { 'x-hub-trust': trust })
  })

  app.get('/v1/products/:productId/content', (c) => {
    const productId = c.req.param('productId')
    if (!content.product(productId)) throw new ApiError(ERROR_CODES.unknown_product, `未知产品：${productId}`)
    // 只分发已验证的发布副本：临时从数据库拼装内容包会把 SQLite 变成第二主源。
    const pkg = content.latestPackage(productId)
    if (!pkg) {
      throw new ApiError(ERROR_CODES.unavailable, `${productId} 没有可分发的已验证内容包`, { details: { reason: 'verified_copy_missing' } })
    }
    const etag = `"${pkg.contentRevision}"`
    if (c.req.header('if-none-match') === etag) return c.body(null, 304)
    return c.json({ schema: pkg.schema, product: pkg.product, contentRevision: pkg.contentRevision, sha256: pkg.sha256, facts: pkg.facts, copy: pkg.copy, update: pkg.update ?? null }, 200, {
      etag,
      'cache-control': 'public, max-age=60, must-revalidate'
    })
  })

  app.get('/v1/proposals', (c) => {
    requireReviewer(c, config)
    const status = c.req.query('status')
    const product = c.req.query('product')
    if (status && !['pending', 'accepted', 'rejected', 'conflict'].includes(status)) {
      throw new ApiError(ERROR_CODES.bad_request, 'status 只能是 pending|accepted|rejected|conflict')
    }
    const conditions = []
    if (status) conditions.push(eq(proposals.status, status))
    if (product) conditions.push(eq(proposals.product, product))
    const rows = store.db
      .select()
      .from(proposals)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(proposals.createdAt))
      .all()
    return c.json({ count: rows.length, proposals: rows.map(toView) })
  })

  app.get('/v1/proposals/:id', (c) => {
    requireReviewer(c, config)
    const row = store.db.select().from(proposals).where(eq(proposals.id, c.req.param('id'))).get()
    if (!row) throw new ApiError(ERROR_CODES.not_found, '找不到提案')
    const events = store.db.select().from(auditEvents).where(eq(auditEvents.proposalId, row.id)).all()
    return c.json({
      proposal: toView(row),
      audit: events.map((event) => ({ id: event.id, actor: event.actor, action: event.action, detail: event.detailJson ? JSON.parse(event.detailJson) : null, requestId: event.requestId, createdAt: event.createdAt }))
    })
  })

  app.post('/v1/proposals/:id/decision', async (c) => {
    requireReviewer(c, config)
    const requestId = c.get('requestId')
    const body = (await readJsonBody(c)) as { decision?: string; note?: string }
    const decision = body.decision
    if (decision !== 'accept' && decision !== 'reject') {
      throw new ApiError(ERROR_CODES.bad_request, 'decision 只能是 accept 或 reject')
    }
    const row = store.db.select().from(proposals).where(eq(proposals.id, c.req.param('id'))).get()
    if (!row) throw new ApiError(ERROR_CODES.not_found, '找不到提案')
    if (row.status !== 'pending' && row.status !== 'conflict') {
      throw new ApiError(ERROR_CODES.bad_request, `提案已处理（${row.status}），不接受重复裁决`)
    }

    const timestamp = nowIso()
    const actor = c.req.header('x-hub-reviewer-id') ?? 'reviewer'
    const status = decision === 'accept' ? 'accepted' : 'rejected'
    // 批准只登记状态与待办任务；内容变更必须经电脑侧受控变更进站点仓，
    // 手机不写 Git、不移动 latest。
    const operationKey = `site-change:${row.id}`

    store.transaction((tx) => {
      tx.update(proposals)
        .set({ status, decidedAt: timestamp, decidedBy: actor, decisionNote: body.note ?? null, updatedAt: timestamp })
        .where(eq(proposals.id, row.id))
        .run()
      tx.insert(auditEvents)
        .values({
          id: `aud-${crypto.randomUUID()}`,
          proposalId: row.id,
          actor,
          action: decision === 'accept' ? 'proposal.accepted' : 'proposal.rejected',
          detailJson: JSON.stringify({ note: body.note ?? null, operationKey }),
          requestId,
          createdAt: timestamp
        })
        .run()
      if (decision === 'accept') {
        tx.insert(publishTasks)
          .values({
            id: `task-${crypto.randomUUID()}`,
            product: row.product,
            proposalId: row.id,
            operationKey,
            targetRevision: row.baseRevision,
            status: 'pending',
            attempts: 0,
            createdAt: timestamp,
            updatedAt: timestamp
          })
          .run()
      }
    })

    const updated = store.db.select().from(proposals).where(eq(proposals.id, row.id)).get()
    return c.json({ proposal: toView(updated as typeof proposals.$inferSelect), requestId, nextStep: '在电脑侧运行 node scripts/proposal-review.mjs apply --id <id>，经站点仓受控变更后再生成内容包' }, 200)
  })

  app.get('/v1/products/:productId/proposals/count', (c) => {
    const productId = c.req.param('productId')
    if (!content.product(productId)) throw new ApiError(ERROR_CODES.unknown_product, `未知产品：${productId}`)
    const rows = store.db.select({ status: proposals.status, trust: proposals.trust }).from(proposals).where(eq(proposals.product, productId)).all()
    const counts: Record<string, number> = {}
    for (const row of rows) counts[`${row.status}/${row.trust}`] = (counts[`${row.status}/${row.trust}`] ?? 0) + 1
    return c.json({ product: productId, total: rows.length, byStatusTrust: counts })
  })

  return app
}

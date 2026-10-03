import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { and, eq } from 'drizzle-orm'
import { loadConfig, type ServerConfig } from './config.js'
import { openStore, type Store } from './db/index.js'
import { ContentStore } from './content.js'
import { auditEvents, proposals, publishTasks } from './db/schema.js'

export type Resolved = { config: ServerConfig; store: Store; content: ContentStore }

export function resolve(env: NodeJS.ProcessEnv = process.env): Resolved {
  const config = loadConfig(env)
  return { config, store: openStore({ dbFile: config.dbFile, migrationsDir: config.migrationsDir }), content: new ContentStore(config.contentDir, config.schemaDir) }
}

function nowIso(): string {
  return new Date().toISOString()
}

export function listProposals(deps: Resolved, filter?: { status?: string; product?: string }): (typeof proposals.$inferSelect)[] {
  const where = filter?.status && filter.product ? and(eq(proposals.status, filter.status), eq(proposals.product, filter.product)) : filter?.status ? eq(proposals.status, filter.status) : filter?.product ? eq(proposals.product, filter.product) : undefined
  return deps.store.db.select().from(proposals).where(where).all()
}

export function listTasks(deps: Resolved, status?: string): (typeof publishTasks.$inferSelect)[] {
  return deps.store.db.select().from(publishTasks).where(status ? eq(publishTasks.status, status) : undefined).all()
}

/** 批准/驳回：只登记状态与待办任务，不碰站点仓、不移动 latest。 */
export function decide(deps: Resolved, id: string, decision: 'accept' | 'reject', actor: string, note?: string): { proposal: typeof proposals.$inferSelect; createdTask: boolean } {
  const row = deps.store.db.select().from(proposals).where(eq(proposals.id, id)).get()
  if (!row) throw new Error(`找不到提案：${id}`)
  if (row.status !== 'pending' && row.status !== 'conflict') throw new Error(`提案已处理（${row.status}）`)
  const timestamp = nowIso()
  const status = decision === 'accept' ? 'accepted' : 'rejected'
  const operationKey = `site-change:${row.id}`
  let createdTask = false

  deps.store.transaction((tx) => {
    tx.update(proposals).set({ status, decidedAt: timestamp, decidedBy: actor, decisionNote: note ?? null, updatedAt: timestamp }).where(eq(proposals.id, id)).run()
    tx.insert(auditEvents)
      .values({ id: `aud-${crypto.randomUUID()}`, proposalId: id, actor, action: decision === 'accept' ? 'proposal.accepted' : 'proposal.rejected', detailJson: JSON.stringify({ note: note ?? null, via: 'cli', operationKey }), requestId: row.requestId, createdAt: timestamp })
      .run()
    if (decision === 'accept') {
      const existing = tx.select().from(publishTasks).where(eq(publishTasks.operationKey, operationKey)).get()
      if (!existing) {
        tx.insert(publishTasks)
          .values({ id: `task-${crypto.randomUUID()}`, product: row.product, proposalId: row.id, operationKey, targetRevision: row.baseRevision, status: 'pending', attempts: 0, createdAt: timestamp, updatedAt: timestamp })
          .run()
        createdTask = true
      }
    }
  })
  return { proposal: deps.store.db.select().from(proposals).where(eq(proposals.id, id)).get() as typeof proposals.$inferSelect, createdTask }
}

/**
 * 把已批准的 copy 提案写进站点仓内容源（受控变更），随后立刻跑校验-构建-漂移。
 * 任一步失败都还原文件并把任务标为 failed，保留可恢复状态；facts 一律拒绝自动落地，
 * 事实的主源在发布仓/开发仓，不能由提案通道改写。
 */
export type ApplyResult = { ok: boolean; changed: boolean; detail: string; blocked?: boolean }

export function applyToSiteRepo(deps: Resolved, id: string, options: { dryRun: boolean; actor: string }): ApplyResult {
  const row = deps.store.db.select().from(proposals).where(eq(proposals.id, id)).get()
  if (!row) throw new Error(`找不到提案：${id}`)
  if (row.status !== 'accepted') return { ok: false, changed: false, blocked: true, detail: '提案未批准，拒绝进入站点仓' }
  if (row.zone === 'facts') return { ok: false, changed: false, blocked: true, detail: 'facts 提案不允许自动落地：事实主源在发布仓，需人工按受控变更处理' }

  const registryProduct = deps.content.product(row.product)
  if (!registryProduct?.contentSource) return { ok: false, changed: false, blocked: true, detail: `${row.product} 没有内容源文件` }

  const repoRoot = repoRootOf(deps.config)
  const target = path.join(repoRoot, registryProduct.contentSource)
  if (!fs.existsSync(target)) return { ok: false, changed: false, blocked: true, detail: `内容源不存在：${registryProduct.contentSource}（部署包只读时请回电脑执行）` }

  const key = row.fieldId.slice('copy.'.length)
  const value = JSON.parse(row.valueJson) as string
  const source = JSON.parse(fs.readFileSync(target, 'utf8')) as { copy?: Record<string, { default?: string; variants?: Record<string, string> }> }
  const field = source.copy?.[key]
  if (!field) return { ok: false, changed: false, blocked: true, detail: `内容源没有 copy.${key}` }
  const before = row.channel ? field.variants?.[row.channel] : field.default
  const after = value

  if (before === after) {
    markTaskDone(deps, row.id, '内容与提案已一致')
    return { ok: true, changed: false, detail: `copy.${key}${row.channel ? `[${row.channel}]` : ''} 已是目标文案` }
  }
  if (options.dryRun) {
    return { ok: true, changed: false, detail: `dry-run：将把 copy.${key}${row.channel ? `[${row.channel}]` : ''} 从 ${JSON.stringify(before)} 改为 ${JSON.stringify(after)}` }
  }

  const backup = fs.readFileSync(target, 'utf8')
  if (row.channel) (field.variants ??= {})[row.channel] = after
  else field.default = after
  fs.writeFileSync(target, `${JSON.stringify(source, null, 2)}\n`)

  const pipeline = ['content-validate.mjs', 'content-build.mjs', 'content-drift.mjs']
  for (const script of pipeline) {
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', script)], { cwd: repoRoot, encoding: 'utf8' })
    if (run.status !== 0) {
      fs.writeFileSync(target, backup)
      markTaskFailed(deps, row.id, `${script} 失败，已还原内容源`)
      return {
        ok: false,
        changed: false,
        detail: `${script} 失败，已还原内容源，任务保留为 failed 可继续处理：${(run.stderr || run.stdout).trim().split('\n').slice(0, 2).join(' / ')}`
      }
    }
  }
  markTaskDone(deps, row.id, `copy.${key} 已更新并重建内容包`)
  return { ok: true, changed: true, detail: `copy.${key} 已写入站点仓内容源，内容包已重建` }
}

function taskOf(deps: Resolved, proposalId: string): (typeof publishTasks.$inferSelect) | undefined {
  return deps.store.db.select().from(publishTasks).where(eq(publishTasks.operationKey, `site-change:${proposalId}`)).get()
}

function markTaskDone(deps: Resolved, proposalId: string, note: string): void {
  const task = taskOf(deps, proposalId)
  if (!task) return
  deps.store.db.update(publishTasks).set({ status: 'done', lastError: note, attempts: task.attempts + 1, updatedAt: nowIso() }).where(eq(publishTasks.id, task.id)).run()
}

function markTaskFailed(deps: Resolved, proposalId: string, reason: string): void {
  const task = taskOf(deps, proposalId)
  if (!task) return
  deps.store.db.update(publishTasks).set({ status: 'failed', lastError: reason, attempts: task.attempts + 1, updatedAt: nowIso() }).where(eq(publishTasks.id, task.id)).run()
}

/** 重启后继续处理 pending 任务；同一 operationKey 不会被重复执行。 */
export function drainTasks(deps: Resolved, options: { dryRun: boolean; actor: string }): { id: string; product: string; proposalId: string; ok: boolean; blocked: boolean; detail: string }[] {
  const tasks = listTasks(deps, 'pending')
  return tasks.map((task) => {
    const result = applyToSiteRepo(deps, task.proposalId, { dryRun: options.dryRun, actor: options.actor })
    // 被规则挡住的（facts、未批准）不算失败，是"本来就该由人工处理"的状态
    if (result.blocked && task.status === 'pending') {
      deps.store.db.update(publishTasks).set({ lastError: result.detail, updatedAt: new Date().toISOString() }).where(eq(publishTasks.id, task.id)).run()
    }
    return { id: task.id, product: task.product, proposalId: task.proposalId, ok: result.ok, blocked: result.blocked === true, detail: result.detail }
  })
}

/** 离线交接：JSON 文件队列是导出/导入格式，不是第二主源。 */
export function exportQueue(deps: Resolved, outRoot: string): string[] {
  const written: string[] = []
  for (const status of ['pending', 'accepted', 'rejected'] as const) {
    const rows = deps.store.db.select().from(proposals).where(eq(proposals.status, status)).all()
    const dir = path.join(outRoot, status)
    fs.mkdirSync(dir, { recursive: true })
    for (const row of rows) {
      const envelope = {
        proposal: {
          schema: 1,
          product: row.product,
          fieldId: row.fieldId,
          value: JSON.parse(row.valueJson) as unknown,
          ...(row.channel ? { channel: row.channel } : {}),
          ...(row.clientVersion ? { clientVersion: row.clientVersion } : {}),
          source: `hub:${row.origin}`,
          createdAt: row.createdAt
        },
        base: { contentRevision: row.baseRevision ?? undefined, ...(row.observedValueJson ? { currentValue: JSON.parse(row.observedValueJson) } : {}) },
        submitter: { label: row.submitter ?? undefined },
        _hub: { id: row.id, status: row.status, trust: row.trust, requestId: row.requestId, decidedBy: row.decidedBy, decidedAt: row.decidedAt }
      }
      const file = path.join(dir, `${row.id}.json`)
      fs.writeFileSync(file, `${JSON.stringify(envelope, null, 2)}\n`)
      written.push(file)
    }
  }
  return written
}

export function importQueue(deps: Resolved, fileOrDir: string): { imported: number; skipped: number; errors: string[] } {
  const target = path.resolve(fileOrDir)
  const files = fs.statSync(target).isDirectory() ? collectJson(target) : [target]
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const file of files) {
    try {
      const envelope = JSON.parse(fs.readFileSync(file, 'utf8')) as { proposal?: { product?: string; fieldId?: string; value?: unknown; channel?: string; createdAt?: string; clientVersion?: string }; base?: { contentRevision?: string }; _hub?: { id?: string } }
      if (!envelope.proposal?.product || !envelope.proposal.fieldId) {
        errors.push(`${path.basename(file)}：缺少 product 或 fieldId`)
        continue
      }
      const zone = envelope.proposal.fieldId.startsWith('facts.') ? 'facts' : 'copy'
      if (zone === 'facts' && envelope.proposal.channel) {
        errors.push(`${path.basename(file)}：facts 提案不允许 channel`)
        continue
      }
      const id = envelope._hub?.id && envelope._hub.id.startsWith('prop-') ? envelope._hub.id : `prop-${crypto.randomUUID()}`
      const existing = deps.store.db.select({ id: proposals.id }).from(proposals).where(eq(proposals.id, id)).get()
      if (existing) {
        skipped += 1
        continue
      }
      const timestamp = nowIso()
      deps.store.transaction((tx) => {
        tx.insert(proposals)
          .values({
            id,
            product: envelope.proposal!.product!,
            fieldId: envelope.proposal!.fieldId!,
            zone,
            channel: envelope.proposal!.channel ?? null,
            valueJson: JSON.stringify(envelope.proposal!.value ?? null),
            baseRevision: envelope.base?.contentRevision ?? null,
            observedValueJson: null,
            submitter: null,
            trust: 'untrusted',
            status: 'pending',
            idempotencyKey: null,
            requestId: null,
            origin: 'file-import',
            clientVersion: envelope.proposal!.clientVersion ?? null,
            createdAt: envelope.proposal!.createdAt ?? timestamp,
            updatedAt: timestamp,
            decidedAt: null,
            decidedBy: null,
            decisionNote: null
          })
          .run()
        tx.insert(auditEvents)
          .values({ id: `aud-${crypto.randomUUID()}`, proposalId: id, actor: 'file-import', action: 'proposal.imported', detailJson: JSON.stringify({ file: path.basename(file) }), requestId: null, createdAt: timestamp })
          .run()
      })
      imported += 1
    } catch (error) {
      errors.push(`${path.basename(file)}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { imported, skipped, errors }
}

function collectJson(dir: string): string[] {
  const out: string[] = []
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name)
    if (fs.statSync(abs).isDirectory()) out.push(...collectJson(abs))
    else if (name.endsWith('.json')) out.push(abs)
  }
  return out
}

function repoRootOf(config: ServerConfig): string {
  // schema 目录与仓库根同源：<root>/schema
  return path.dirname(config.schemaDir)
}

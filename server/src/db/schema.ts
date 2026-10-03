import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * SQLite 只保存运行期状态（提案、审计、发布任务）。
 * 产品文案/价格/版本的主源仍是站点仓内容源，发布仓仍是版本事实与内容包分发面。
 */
export const proposals = sqliteTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    product: text('product').notNull(),
    fieldId: text('field_id').notNull(),
    /** copy | facts —— facts 永不允许渠道变体 */
    zone: text('zone').notNull(),
    channel: text('channel'),
    valueJson: text('value_json').notNull(),
    baseRevision: text('base_revision'),
    observedValueJson: text('observed_value_json'),
    submitter: text('submitter'),
    /** trusted | untrusted —— 无可信凭证的提交只能进不可信待处理区 */
    trust: text('trust').notNull(),
    /** pending | accepted | rejected | conflict */
    status: text('status').notNull(),
    idempotencyKey: text('idempotency_key'),
    requestId: text('request_id'),
    origin: text('origin').notNull(),
    clientVersion: text('client_version'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
    decisionNote: text('decision_note')
  },
  (table) => [
    uniqueIndex('proposals_idempotency_key_idx').on(table.idempotencyKey),
    index('proposals_product_status_idx').on(table.product, table.status),
    index('proposals_field_idx').on(table.product, table.fieldId)
  ]
)

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id'),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    detailJson: text('detail_json'),
    requestId: text('request_id'),
    createdAt: text('created_at').notNull()
  },
  (table) => [index('audit_proposal_idx').on(table.proposalId)]
)

/** 断线重试靠它保证同一键只落一条提案，且能重放同一响应。 */
export const idempotencyRecords = sqliteTable('idempotency_records', {
  key: text('key').primaryKey(),
  proposalId: text('proposal_id').notNull(),
  responseCode: integer('response_code').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: text('created_at').notNull()
})

/**
 * 发布任务持久状态：进程重启后继续处理；operationKey 唯一，
 * 因此停机期间的任务不会被重复发布。
 */
export const publishTasks = sqliteTable(
  'publish_tasks',
  {
    id: text('id').primaryKey(),
    product: text('product').notNull(),
    proposalId: text('proposal_id').notNull(),
    operationKey: text('operation_key').notNull(),
    targetRevision: text('target_revision'),
    /** pending | done | failed */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => [uniqueIndex('publish_tasks_operation_key_idx').on(table.operationKey), index('publish_tasks_status_idx').on(table.status)]
)

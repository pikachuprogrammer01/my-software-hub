import type { ServerConfig } from './config.js'

const SCHEMA_BASE = 'https://gitee.com/pikachuprogrammer01/my-software-releases/schema'

function errorResponse(description: string): { description: string; content: { 'application/json': { schema: { $ref: string } } } } {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } }
  }
}

export function buildOpenApi(config: ServerConfig): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'my-software-hub 提案与内容分发 API',
      version: config.version,
      description: [
        '运行在 Android + Termux 上的单进程服务：静态站点、/health、提案 API。',
        '内容事实主源仍是站点仓内容源，发布仓仍是版本事实与内容包分发面；',
        'SQLite 只保存提案状态、审计与发布任务，不拼装内容包。',
        '提案不会移动 latest，也不会写 Git。批准后的变更由电脑侧受控流程进入站点仓。'
      ].join(' ')
    },
    servers: [{ url: `http://${config.host}:${config.port}`, description: '手机本地或局域网实例' }],
    security: [{ reviewerToken: [] }],
    paths: {
      '/health': {
        get: {
          summary: '运行健康检查',
          description: '只返回运行状态与内容副本指纹，不返回配置、凭证或提案正文。',
          security: [],
          responses: { '200': { description: '正常' }, '503': { description: '数据库不可用（degraded）' } }
        }
      },
      '/v1/products/{productId}/proposals': {
        post: {
          summary: '提交文案/事实提案',
          description: [
            '请求体是 proposal-envelope.v1：包住冻结的 proposal.v1 本体，另带 base（基础 contentRevision 与字段旧值）与 submitter 声明。',
            'facts 提案禁止 channel 变体；copy 提案受渠道预算与 HTML 禁令约束。',
            'Idempotency-Key 相同的重试返回同一提案，不会新增记录。',
            'base 与当前发布副本不一致时返回 409 并把该提案登记为 conflict，永不按写入时间取胜。',
            '无可信提交凭证时提案进入不可信待处理区（202），不会被自动批准。'
          ].join(' '),
          security: [{ submitterToken: [] }],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', pattern: '^[A-Za-z0-9._:-]{8,64}$' } },
            { name: 'X-Hub-Submitter-Token', in: 'header', required: false, schema: { type: 'string' } },
            { name: 'X-Request-Id', in: 'header', required: false, schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProposalEnvelope' } } }
          },
          responses: {
            '201': { description: '可信提交已接收（pending）' },
            '202': { description: '无提交凭证，已接收进不可信待处理区' },
            '400': errorResponse('产品与路径不一致、请求体为空或 Idempotency-Key 形态非法'),
            '404': errorResponse('未知产品'),
            '413': errorResponse('请求体超过上限'),
            '422': errorResponse('schema 校验失败、未知字段、facts 渠道变体或文案超预算'),
            '409': { description: '字段级冲突：提案登记为 conflict，客户端需重新拉基线后提交' },
            '429': errorResponse('触发限流')
          }
        }
      },
      '/v1/products/{productId}/content': {
        get: {
          summary: '读取已验证的发布副本内容包',
          description: '只分发构建并通过自校验的内容包；SHA 不符时返回 503 而不是分发脏数据。ETag 即 contentRevision。',
          security: [],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'If-None-Match', in: 'header', required: false, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: '内容包' },
            '304': { description: '未变更' },
            '404': errorResponse('未知产品'),
            '503': errorResponse('没有可分发的已验证副本')
          }
        }
      },
      '/v1/proposals': {
        get: {
          summary: '列出提案（需审核身份）',
          parameters: [
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'conflict'] } },
            { name: 'product', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: { '200': { description: '提案列表' }, '401': errorResponse('审核凭证不正确'), '503': errorResponse('本部署未配置审核身份') }
        }
      },
      '/v1/proposals/{id}': {
        get: {
          summary: '提案详情与审计（需审核身份）',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: '详情' }, '401': errorResponse('审核凭证不正确'), '404': errorResponse('找不到提案'), '503': errorResponse('未配置审核身份') }
        }
      },
      '/v1/proposals/{id}/decision': {
        post: {
          summary: '批准或驳回提案（需审核身份）',
          description: '只登记状态与发布任务；不写站点仓、不移动 latest、不做远程发布。',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { type: 'string', enum: ['accept', 'reject'] }, note: { type: 'string', maxLength: 500 } } }
              }
            }
          },
          responses: { '200': { description: '已登记裁决' }, '400': errorResponse('decision 非法或提案已处理'), '401': errorResponse('审核凭证不正确'), '503': errorResponse('未配置审核身份') }
        }
      },
      '/v1/products/{productId}/proposals/count': {
        get: { summary: '提案计数（按状态与信任级别）', security: [], parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '计数' }, '404': errorResponse('未知产品') } }
      },
      '/v1/openapi.json': { get: { summary: '本文件', security: [], responses: { '200': { description: 'OpenAPI 文档' } } } }
    },
    components: {
      securitySchemes: {
        reviewerToken: { type: 'apiKey', in: 'header', name: 'X-Hub-Reviewer-Token', description: '审核身份。由部署侧配置，客户端不得内置。' },
        submitterToken: { type: 'apiKey', in: 'header', name: 'X-Hub-Submitter-Token', description: '提交身份。缺失只降级为不可信待处理，不作为安全边界。' }
      },
      schemas: {
        ProposalEnvelope: {
          type: 'object',
          required: ['proposal'],
          additionalProperties: false,
          properties: {
            proposal: { $ref: `${SCHEMA_BASE}/proposal.v1.json` },
            base: {
              type: 'object',
              additionalProperties: false,
              properties: { contentRevision: { type: 'string' }, currentValue: {} }
            },
            submitter: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', maxLength: 64 }, device: { type: 'string', maxLength: 64 } } }
          }
        },
        ProposalView: {
          type: 'object',
          required: ['id', 'product', 'fieldId', 'zone', 'trust', 'status', 'createdAt'],
          properties: {
            id: { type: 'string' },
            product: { type: 'string' },
            fieldId: { type: 'string' },
            zone: { type: 'string', enum: ['copy', 'facts'] },
            channel: { type: ['string', 'null'] },
            value: {},
            baseRevision: { type: ['string', 'null'] },
            observedCurrentValue: {},
            submitter: { type: ['string', 'null'] },
            trust: { type: 'string', enum: ['trusted', 'untrusted'] },
            status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'conflict'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            requestId: { type: ['string', 'null'] },
            decision: { type: 'object', properties: { decidedAt: { type: ['string', 'null'] }, decidedBy: { type: ['string', 'null'] }, note: { type: ['string', 'null'] } } }
          }
        },
        ErrorBody: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'requestId'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'bad_request', 'schema_invalid', 'unknown_product', 'unknown_field', 'facts_channel_forbidden',
                    'copy_over_budget', 'revision_conflict', 'unauthenticated', 'forbidden_origin', 'unauthorized',
                    'payload_too_large', 'rate_limited', 'service_unavailable', 'not_found', 'internal'
                  ]
                },
                message: { type: 'string' },
                requestId: { type: ['string', 'null'] },
                details: {}
              }
            }
          }
        }
      }
    }
  }
}

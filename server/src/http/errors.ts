export const ERROR_CODES = {
  bad_request: 'bad_request',
  schema_invalid: 'schema_invalid',
  unknown_product: 'unknown_product',
  unknown_field: 'unknown_field',
  facts_channel_forbidden: 'facts_channel_forbidden',
  copy_over_budget: 'copy_over_budget',
  revision_conflict: 'revision_conflict',
  unauthenticated: 'unauthenticated',
  forbidden_origin: 'forbidden_origin',
  unauthorized: 'unauthorized',
  payload_too_large: 'payload_too_large',
  rate_limited: 'rate_limited',
  unavailable: 'service_unavailable',
  not_found: 'not_found',
  internal: 'internal'
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  schema_invalid: 400,
  unknown_product: 404,
  unknown_field: 422,
  facts_channel_forbidden: 422,
  copy_over_budget: 422,
  revision_conflict: 409,
  unauthenticated: 401,
  forbidden_origin: 403,
  unauthorized: 403,
  payload_too_large: 413,
  rate_limited: 429,
  service_unavailable: 503,
  not_found: 404,
  internal: 500
}

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: unknown
  readonly retryAfterSeconds?: number

  constructor(code: ErrorCode, message: string, options?: { details?: unknown; retryAfterSeconds?: number; status?: number }) {
    super(message)
    this.code = code
    this.status = options?.status ?? STATUS[code]
    this.details = options?.details
    this.retryAfterSeconds = options?.retryAfterSeconds
  }
}

export type ErrorBody = {
  error: { code: ErrorCode; message: string; requestId: string | null; details?: unknown }
}

export function errorBody(code: ErrorCode, message: string, requestId: string | null, details?: unknown): ErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } }
}

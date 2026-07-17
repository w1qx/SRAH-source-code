/**
 * The one error type routes throw. Everything else that escapes a handler is, by
 * definition, a bug — and gets a 500 with no detail leaked to the caller.
 */
export type ApiErrorCode =
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_too_many_attempts'
  | 'analysis_blocked'
  | 'feature_disabled'
  | 'llm_unavailable'
  | 'internal_error';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'validation_failed', message, details);
  }

  static unauthorized(message = 'Authentication required.'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static notFound(message = 'Not found.'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  /**
   * The feature exists in the codebase but is toggled off. 503 rather than 404: the route
   * is real, it is just not active yet. This is what /auth/nafath/* answers today.
   */
  static featureDisabled(feature: string, message: string): ApiError {
    return new ApiError(503, 'feature_disabled', message, { feature, comingSoon: true });
  }

  /** The analysis cannot responsibly run — e.g. expenses already exceed income (§10.6). */
  static analysisBlocked(message: string, details?: unknown): ApiError {
    return new ApiError(422, 'analysis_blocked', message, details);
  }
}

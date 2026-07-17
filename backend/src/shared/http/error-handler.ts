import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './api-error';
import { logger } from '../logger';

/** Wraps async handlers so a rejected promise reaches the error middleware, not the void. */
export function asyncHandler<T>(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<T>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
  });
}

/**
 * The single exit point for every failure.
 *
 * An ApiError is something we chose to say. Anything else is a bug, and a bug's message
 * may contain anything at all — a query, a token, a stack. Those get logged, and the
 * caller gets "Internal server error." and nothing more.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
  });

  res.status(500).json({
    error: { code: 'internal_error', message: 'Internal server error.' },
  });
}

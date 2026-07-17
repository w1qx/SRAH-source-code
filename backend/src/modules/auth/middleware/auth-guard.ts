import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '@/shared/http/api-error';
import type { TokenService } from '../infrastructure/token.service';

export interface AuthContext {
  userId: string;
  sessionId: string;
}

/** Express's Request, once the guard has run. */
export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

/**
 * Built as a factory over TokenService rather than exported as a bare middleware, so the
 * secret arrives by injection and a test can hand it a token service of its own.
 */
export function createAuthGuard(tokens: TokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const claims = tokens.verifyAccessToken(bearerToken(req));
      (req as AuthenticatedRequest).auth = { userId: claims.sub, sessionId: claims.sid };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function bearerToken(req: Request): string {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token.');
  }
  return header.slice('Bearer '.length).trim();
}

/** The authenticated user on a request the guard has already passed. */
export function authOf(req: Request): AuthContext {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    // Only reachable if a route forgot its guard — a bug, not a client error.
    throw new Error('authOf() called on a route with no auth guard');
  }
  return auth;
}

import jwt from 'jsonwebtoken';
import { ApiError } from '@/shared/http/api-error';

/**
 * Access tokens (JWT, short-lived) + refresh tokens (opaque, server-side in `sessions`).
 *
 * The access token is stateless and lives ~15 minutes; the refresh token is a row in the
 * database that can be revoked. That split is the whole point of having a sessions table:
 * a logout revokes the row immediately, and the access token it was paired with dies of old
 * age within the quarter hour. Verifying the session on every single request would be
 * strictly safer and cost a database round trip per call — the short TTL buys most of that
 * safety for none of the cost.
 */
export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id — ties an access token back to the refresh session that minted it. */
  sid: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly accessTtlMinutes: number,
    private readonly refreshTtlDays: number,
  ) {
    if (secret.length < 32) throw new Error('JWT secret must be at least 32 characters');
  }

  signAccessToken(claims: AccessTokenClaims, now: Date): { token: string; expiresAt: Date } {
    const expiresAt = new Date(now.getTime() + this.accessTtlMinutes * 60_000);
    const token = jwt.sign({ sub: claims.sub, sid: claims.sid }, this.secret, {
      algorithm: 'HS256',
      expiresIn: `${this.accessTtlMinutes}m`,
      issuer: 'suraa',
      audience: 'suraa-api',
    });
    return { token, expiresAt };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'], // Pinned: never let the token choose its own algorithm.
        issuer: 'suraa',
        audience: 'suraa-api',
      });

      if (typeof payload === 'string' || !payload.sub || typeof payload.sub !== 'string') {
        throw ApiError.unauthorized('Malformed access token.');
      }
      const sid = (payload as jwt.JwtPayload).sid;
      if (typeof sid !== 'string') throw ApiError.unauthorized('Malformed access token.');

      return { sub: payload.sub, sid };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.unauthorized('Invalid or expired access token.');
    }
  }

  refreshExpiryFrom(now: Date): Date {
    return new Date(now.getTime() + this.refreshTtlDays * 24 * 60 * 60_000);
  }
}

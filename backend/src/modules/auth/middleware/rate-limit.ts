import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

/**
 * Rate limits on the auth surface (NFR: "rate limiting on auth").
 *
 * These bound the BLAST RADIUS; they are not the real defence. A six-digit code is protected by
 * the per-code attempt counter in the database, which an attacker cannot escape by rotating IP
 * addresses. The limiter's job is to make the attempt expensive and noisy.
 *
 * FACTORIES, not module-level singletons. Each limiter owns an in-memory store, and a store that
 * outlives the app it belongs to is shared state hiding in an import — every app instance in the
 * process would silently draw down the same counter.
 *
 * NOTE for multi-instance deploys: the default MemoryStore is per-process, so N instances behind a
 * load balancer means N× the effective limit. That is acceptable while the DB-backed attempt cap is
 * the real control, but when this scales out, pass a shared (Redis) store here — one place to change.
 */
const FIFTEEN_MINUTES = 15 * 60_000;

export interface RateLimitOptions {
  windowMs?: number;
  otpRequestLimit?: number;
  otpVerifyLimit?: number;
  generalLimit?: number;
}

export interface AuthLimiters {
  otpRequest: RequestHandler;
  otpVerify: RequestHandler;
  general: RequestHandler;
}

export function createAuthLimiters(options: RateLimitOptions = {}): AuthLimiters {
  const windowMs = options.windowMs ?? FIFTEEN_MINUTES;

  return {
    /**
     * Requesting a code: this one sends an email, so abuse costs real money.
     *
     * Keyed on IP *and* email, so one attacker cannot lock an entire office NAT out of their
     * accounts, and cannot spray a thousand addresses from a single IP either.
     */
    otpRequest: rateLimit({
      windowMs,
      limit: options.otpRequestLimit ?? 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        // ipKeyGenerator normalises IPv6 to its /64 subnet — without it, anyone holding an IPv6
        // block gets a fresh limit for every address they own, which is to say no limit at all.
        return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
      },
      message: limitResponse('Too many code requests. Try again in a few minutes.'),
    }),

    /** Verifying a code: the brute-force surface. */
    otpVerify: rateLimit({
      windowMs,
      limit: options.otpVerifyLimit ?? 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: limitResponse('Too many attempts. Try again in a few minutes.'),
    }),

    /** Everything else under /auth — refresh, logout, and the Nafath routes. */
    general: rateLimit({
      windowMs,
      limit: options.generalLimit ?? 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: limitResponse('Too many requests. Try again in a few minutes.'),
    }),
  };
}

function limitResponse(message: string) {
  return { error: { code: 'rate_limited', message } };
}

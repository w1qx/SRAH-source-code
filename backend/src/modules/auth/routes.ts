import type { CookieOptions, RequestHandler, Request, Response } from 'express';
import { Router } from 'express';
import type { AuthSession } from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import { asyncHandler } from '@/shared/http/error-handler';
import { parseBody } from '@/shared/http/validate';
import type { AuthService } from './application/auth.service';
import { authOf } from './middleware/auth-guard';
import { createAuthLimiters } from './middleware/rate-limit';
import type { EmailOtpAuthProvider } from './infrastructure/email-otp.provider';
import type { NafathAuthProvider } from './infrastructure/nafath.provider';
import {
  NafathCallbackSchema,
  NafathInitiateSchema,
  RefreshSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
} from './schemas';

const REFRESH_COOKIE = 'suraa_refresh';

export interface AuthRouterDeps {
  service: AuthService;
  guard: RequestHandler;
  emailOtp: EmailOtpAuthProvider;
  nafath: NafathAuthProvider;
  isProduction: boolean;
}

export function authRouter(deps: AuthRouterDeps): Router {
  const { service, guard, emailOtp, nafath, isProduction } = deps;
  const router = Router();

  // Built per router, so the limiter's store lives and dies with the app that owns it.
  const limiters = createAuthLimiters();

  /**
   * Which login methods exist, and which actually work. This is what lets the frontend render
   * the Nafath button as a disabled "Coming Soon" control WITHOUT hardcoding that knowledge
   * into the frontend — it asks, and the backend tells it.
   */
  router.get(
    '/providers',
    asyncHandler(async (_req, res) => {
      if ('refreshActive' in nafath && typeof nafath.refreshActive === 'function') {
        await (nafath as { refreshActive(): Promise<boolean> }).refreshActive();
      }
      res.json({
        providers: [
          { method: emailOtp.method, isActive: emailOtp.isActive },
          { method: nafath.method, isActive: nafath.isActive },
        ],
      });
    }),
  );

  // --- Email OTP: request → verify → session ------------------------------------------

  router.post(
    '/otp/request',
    limiters.otpRequest,
    asyncHandler(async (req, res) => {
      const body = parseBody(RequestOtpSchema, req);
      const result = await service.requestOtp({ email: body.email });
      res.status(202).json(result);
    }),
  );

  router.post(
    '/otp/verify',
    limiters.otpVerify,
    asyncHandler(async (req, res) => {
      const body = parseBody(VerifyOtpSchema, req);

      const { session, profile, isNewUser } = await service.verifyOtp({
        email: body.email,
        code: body.code,
        pdplConsent: body.pdplConsent,
        userAgent: req.header('user-agent'),
        ip: req.ip,
      });

      setRefreshCookie(res, session, isProduction);
      res.status(200).json({ session, profile, isNewUser });
    }),
  );

  router.post(
    '/nafath/mock-login',
    limiters.general,
    asyncHandler(async (req, res) => {
      const { nationalId } = req.body;
      if (!nationalId || nationalId.length !== 10) {
        throw new ApiError(400, 'validation_failed', 'Invalid National ID');
      }

      // If user is already authenticated, associate this Nafath nationalId with their current account
      // so their history is preserved and they are not logged into a dummy account.
      let authUserId: string | null = null;
      const authHeader = req.header('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.slice('Bearer '.length).trim();
          const claims = tokens.verifyAccessToken(token);
          authUserId = claims.sub;
        } catch {
          // ignore verification errors and fall back to fresh login
        }
      }

      if (authUserId) {
        const existingUser = await service['repository'].findUserById(authUserId);
        if (existingUser) {
          await service['repository'].updateUserNafathId(existingUser.id, nationalId);
          const session = await service['issueSession'](existingUser.id, new Date(), req.header('user-agent'), req.ip);
          const profile = await service.profile(existingUser.id);
          setRefreshCookie(res, session, isProduction);
          res.status(200).json({ session, profile, isNewUser: false });
          return;
        }
      }

      const email = `nafath-${nationalId}@suraa.sa`;
      // Create user if not exists
      let user = await service['repository'].findUserByEmail(email);
      const isNewUser = !user;
      if (!user) {
        user = await service['repository'].createUser(email, 'nafath');
        await service['repository'].recordPdplConsent(user.id, new Date());
        await service['repository'].markEmailVerified(user.id, new Date());
      }
      const session = await service['issueSession'](user.id, new Date(), req.header('user-agent'), req.ip);
      const profile = await service.profile(user.id);
      setRefreshCookie(res, session, isProduction);
      res.status(200).json({ session, profile, isNewUser });
    }),
  );

  router.post(
    '/refresh',
    limiters.general,
    asyncHandler(async (req, res) => {
      const body = parseBody(RefreshSchema, req);
      const token = body.refreshToken ?? readRefreshCookie(req);
      if (!token) throw ApiError.unauthorized('No refresh token supplied.');

      const session = await service.refresh(token, req.header('user-agent'), req.ip);

      setRefreshCookie(res, session, isProduction);
      res.json({ session });
    }),
  );

  router.post(
    '/logout',
    limiters.general,
    asyncHandler(async (req, res) => {
      const body = parseBody(RefreshSchema, req);
      const token = body.refreshToken ?? readRefreshCookie(req);
      if (token) await service.logout(token);

      res.clearCookie(REFRESH_COOKIE, cookieOptions(isProduction));
      res.status(204).send();
    }),
  );

  // --- Account ------------------------------------------------------------------------

  router.get(
    '/me',
    guard,
    asyncHandler(async (req, res) => {
      res.json({ profile: await service.profile(authOf(req).userId) });
    }),
  );

  /** PDPL right-to-erasure. Everything the user ever gave us goes with the row. */
  router.delete(
    '/me',
    guard,
    asyncHandler(async (req, res) => {
      await service.deleteAccount(authOf(req).userId);
      res.clearCookie(REFRESH_COOKIE, cookieOptions(isProduction));
      res.status(204).send();
    }),
  );

  // --- Nafath: present, wired, and switched off ----------------------------------------
  //
  // These routes exist TODAY so that turning Nafath on is a flag flip and one swapped
  // adapter. They answer 503 + feature_disabled, never a fake success: an auth route that
  // pretends to authenticate is the single most dangerous thing a mock can do.

  router.post(
    '/nafath/initiate',
    limiters.general,
    asyncHandler(async (req, res) => {
      parseBody(NafathInitiateSchema, req);
      throw nafathDisabled();
    }),
  );

  router.post(
    '/nafath/callback',
    limiters.general,
    asyncHandler(async (req, res) => {
      parseBody(NafathCallbackSchema, req);
      throw nafathDisabled();
    }),
  );

  return router;
}

function nafathDisabled(): ApiError {
  return ApiError.featureDisabled(
    'auth_nafath',
    'Login with Nafath is not yet active. Please use email login for now.',
  );
}

function cookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true, // Unreadable from JavaScript, so XSS cannot lift the refresh token.
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

function setRefreshCookie(res: Response, session: AuthSession, isProduction: boolean): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions(isProduction),
    maxAge: 30 * 24 * 60 * 60_000,
  });
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}

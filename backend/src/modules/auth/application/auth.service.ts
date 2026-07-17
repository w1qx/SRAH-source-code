import type { AuthSession, OtpRequestResult, UserProfile } from '@shared/types';
import { ApiError } from '@/shared/http/api-error';
import { logger } from '@/shared/logger';
import type { OtpPolicy } from '../domain/otp-policy';
import { expiryFrom, formatCode, rejectionReason, secondsUntil } from '../domain/otp-policy';
import type { AuthRepository } from '../infrastructure/auth.repository';
import { toUserProfile } from '../infrastructure/auth.repository';
import type { Hasher } from '../infrastructure/hasher';
import type { Mailer } from '../infrastructure/mailer';
import type { TokenService } from '../infrastructure/token.service';

export interface RequestOtpParams {
  email: string;
}

export interface VerifyOtpParams {
  email: string;
  code: string;
  /** PDPL consent — REQUIRED on the first successful login, which is signup (Scope §4.1). */
  pdplConsent?: boolean;
  userAgent?: string;
  ip?: string;
}

/**
 * Email OTP: request → verify → session.
 *
 * The security properties worth stating out loud, because each one is a deliberate choice:
 *
 *  - The response to `requestOtp` is IDENTICAL whether or not the email exists. Anything
 *    else turns this endpoint into an account-enumeration oracle.
 *  - A new request invalidates every outstanding code, so a user racing the email cannot end
 *    up with several live codes at once.
 *  - Attempts are counted and capped in the database, not in memory. A rate limiter is
 *    per-IP and can be walked around; the attempt counter is per-code and cannot.
 *  - A wrong guess NEVER says whether it was the code or the email that was wrong.
 *  - Refresh tokens ROTATE on every use, and reusing an old one revokes the whole family.
 */
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly hasher: Hasher,
    private readonly mailer: Mailer,
    private readonly tokens: TokenService,
    private readonly policy: OtpPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async requestOtp(params: RequestOtpParams): Promise<OtpRequestResult> {
    const email = normalizeEmail(params.email);
    const now = this.now();

    // The user row is created on first request because otp_codes.user_id is a foreign key.
    // An unverified user with no consent and no session can do nothing at all, so this is
    // not an account in any meaningful sense until the code is verified.
    const user =
      (await this.repository.findUserByEmail(email)) ??
      (await this.repository.createUser(email, 'email_otp'));

    await this.repository.invalidateOtps(user.id, now);

    const code = formatCode(this.hasher.generateOtpDigits(this.policy.length), this.policy.length);
    const expiresAt = expiryFrom(now, this.policy);

    await this.repository.createOtp({
      userId: user.id,
      codeHash: await this.hasher.hashOtp(code),
      expiresAt,
    });

    await this.mailer.sendOtp({
      to: email,
      code,
      expiresInMinutes: this.policy.ttlMinutes,
    });

    // The user id, never the code. The code exists in exactly two places: the user's inbox,
    // and an argon2 hash in the database.
    logger.info('OTP issued', { userId: user.id });

    return { issued: true, expiresInSeconds: secondsUntil(expiresAt, now) };
  }

  async verifyOtp(
    params: VerifyOtpParams,
  ): Promise<{ session: AuthSession; profile: UserProfile; isNewUser: boolean }> {
    const email = normalizeEmail(params.email);
    const now = this.now();

    const user = await this.repository.findUserByEmail(email);
    const otp = user ? await this.repository.findLatestActiveOtp(user.id) : undefined;

    // No user, or no live code: the same answer a wrong code gets. An attacker learns nothing.
    if (!user || !otp) throw new ApiError(400, 'otp_invalid', 'Invalid or expired code.');

    const rejection = rejectionReason(otp, this.policy, now);
    if (rejection === 'expired' || rejection === 'already_used') {
      throw new ApiError(400, 'otp_expired', 'This code has expired. Request a new one.');
    }
    if (rejection === 'too_many_attempts') {
      throw new ApiError(
        429,
        'otp_too_many_attempts',
        'Too many incorrect attempts. Request a new code.',
      );
    }

    const matches = await this.hasher.verifyOtp(otp.codeHash, params.code);
    if (!matches) {
      const attempts = await this.repository.incrementOtpAttempts(otp.id);

      // Burn the code the moment the cap is hit, rather than leaving a spent code lying
      // around for the expiry to eventually clean up.
      if (attempts >= this.policy.maxAttempts) {
        await this.repository.consumeOtp(otp.id, now);
        logger.warn('OTP burned after too many attempts', { userId: user.id });
      }

      throw new ApiError(400, 'otp_invalid', 'Invalid or expired code.');
    }

    // §4.1 / FR-03: consent is captured AT SIGNUP. Without it there is no lawful basis to
    // persist this person's financial data, so there is no account.
    const isSignup = user.pdplConsentAt === null;
    if (isSignup && params.pdplConsent !== true) {
      throw new ApiError(
        400,
        'validation_failed',
        'PDPL consent is required to create an account.',
        { field: 'pdplConsent' },
      );
    }

    await this.repository.consumeOtp(otp.id, now);
    if (user.emailVerifiedAt === null) await this.repository.markEmailVerified(user.id, now);
    if (isSignup) await this.repository.recordPdplConsent(user.id, now);

    const session = await this.issueSession(user.id, now, params.userAgent, params.ip);
    const profile = await this.profile(user.id);

    logger.info(isSignup ? 'User signed up' : 'User logged in', { userId: user.id });

    // The frontend routes a first-ever verify (signup) down its own onboarding path.
    return { session, profile, isNewUser: isSignup };
  }

  /**
   * Rotate: every refresh mints a new token and revokes the one that was used.
   *
   * A refresh token that is presented twice has either been replayed or stolen, and we
   * cannot tell which — so we assume the worst and revoke every session the user has. It is
   * the standard response, and it fails in the safe direction: the legitimate user logs in
   * again, the thief gets nothing.
   */
  async refresh(refreshToken: string, userAgent?: string, ip?: string): Promise<AuthSession> {
    const now = this.now();
    const hash = this.hasher.hashToken(refreshToken);
    const session = await this.repository.findSessionByRefreshHash(hash);

    if (!session) throw ApiError.unauthorized('Invalid refresh token.');

    if (session.revokedAt !== null) {
      await this.repository.revokeAllSessions(session.userId, now);
      logger.warn('Reused refresh token — all sessions revoked', { userId: session.userId });
      throw ApiError.unauthorized('Invalid refresh token.');
    }

    if (session.expiresAt.getTime() <= now.getTime()) {
      throw ApiError.unauthorized('Session expired. Please log in again.');
    }

    await this.repository.revokeSession(session.id, now);
    return this.issueSession(session.userId, now, userAgent, ip);
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.repository.findSessionByRefreshHash(
      this.hasher.hashToken(refreshToken),
    );
    // Logging out an already-dead session is a success, not an error.
    if (session && session.revokedAt === null) {
      await this.repository.revokeSession(session.id, this.now());
    }
  }

  async profile(userId: string): Promise<UserProfile> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw ApiError.notFound('User not found.');
    return toUserProfile(user);
  }

  /** PDPL right-to-erasure (Scope §11.2): the cascade takes every trace with it. */
  async deleteAccount(userId: string): Promise<void> {
    await this.repository.deleteUser(userId);
    logger.info('User erased on request (PDPL)', { userId });
  }

  private async issueSession(
    userId: string,
    now: Date,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthSession> {
    const refreshToken = this.hasher.generateToken();

    const session = await this.repository.createSession({
      userId,
      refreshTokenHash: this.hasher.hashToken(refreshToken),
      expiresAt: this.tokens.refreshExpiryFrom(now),
      userAgent,
      ip,
    });

    const access = this.tokens.signAccessToken({ sub: userId, sid: session.id }, now);

    return {
      userId,
      accessToken: access.token,
      refreshToken,
      expiresAt: access.expiresAt.toISOString(),
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

import { AuthService } from '@/modules/auth/application/auth.service';
import { TokenService } from '@/modules/auth/infrastructure/token.service';
import { FakeAuthRepository, FakeHasher, FakeMailer } from '../fakes';

const POLICY = { length: 6, ttlMinutes: 10, maxAttempts: 5 };
const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const EMAIL = 'user@example.com';

function build(now: () => Date = () => new Date('2026-05-01T12:00:00Z')) {
  const repository = new FakeAuthRepository();
  const hasher = new FakeHasher();
  const mailer = new FakeMailer();
  const tokens = new TokenService(SECRET, 15, 30);
  const service = new AuthService(repository, hasher, mailer, tokens, POLICY, now);

  return { service, repository, hasher, mailer, tokens };
}

/** Sign up and land an authenticated session — the happy path, reused by later tests. */
async function signUp(ctx: ReturnType<typeof build>) {
  await ctx.service.requestOtp({ email: EMAIL });
  return ctx.service.verifyOtp({ email: EMAIL, code: ctx.mailer.lastCode!, pdplConsent: true });
}

describe('Email OTP — request', () => {
  it('issues a code, emails it, and stores only its HASH', async () => {
    const ctx = build();

    const result = await ctx.service.requestOtp({ email: EMAIL });

    expect(result).toEqual({ issued: true, expiresInSeconds: 600 });
    expect(ctx.mailer.sent).toHaveLength(1);

    const stored = [...ctx.repository.otps.values()][0]!;
    expect(stored.codeHash).not.toBe(ctx.mailer.lastCode);
    expect(stored.codeHash).toContain('hashed:');
  });

  it('normalizes the email, so Casing@X and casing@x are one account', async () => {
    const ctx = build();

    await ctx.service.requestOtp({ email: '  USER@Example.COM ' });

    expect(await ctx.repository.findUserByEmail(EMAIL)).toBeDefined();
    expect(ctx.repository.users.size).toBe(1);
  });

  it('invalidates the previous code when a new one is requested', async () => {
    const ctx = build();

    await ctx.service.requestOtp({ email: EMAIL });
    const firstCode = ctx.mailer.lastCode!;
    await ctx.service.requestOtp({ email: EMAIL });

    // The old code is dead, even though it had not expired.
    await expect(
      ctx.service.verifyOtp({ email: EMAIL, code: firstCode, pdplConsent: true }),
    ).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('answers identically for an unknown email — no account-enumeration oracle', async () => {
    const ctx = build();

    const known = await ctx.service.requestOtp({ email: EMAIL });
    const unknown = await ctx.service.requestOtp({ email: 'nobody@example.com' });

    expect(unknown).toEqual(known);
  });
});

describe('Email OTP — verify', () => {
  it('signs the user up, verifies the email, records PDPL consent, and issues a session', async () => {
    const ctx = build();

    const { session, profile } = await signUp(ctx);

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(profile.email).toBe(EMAIL);
    expect(profile.emailVerified).toBe(true);
    expect(profile.pdplConsentAt).not.toBeNull();

    const claims = ctx.tokens.verifyAccessToken(session.accessToken);
    expect(claims.sub).toBe(session.userId);
  });

  it('REFUSES to create an account without PDPL consent (FR-03)', async () => {
    const ctx = build();
    await ctx.service.requestOtp({ email: EMAIL });

    await expect(
      ctx.service.verifyOtp({ email: EMAIL, code: ctx.mailer.lastCode! }),
    ).rejects.toMatchObject({ status: 400, code: 'validation_failed' });

    // No consent, no session — and the user is still unverified.
    const user = await ctx.repository.findUserByEmail(EMAIL);
    expect(user!.pdplConsentAt).toBeNull();
    expect(ctx.repository.sessions.size).toBe(0);
  });

  it('does not ask an existing user to consent all over again', async () => {
    const ctx = build();
    await signUp(ctx);

    await ctx.service.requestOtp({ email: EMAIL });
    const login = await ctx.service.verifyOtp({ email: EMAIL, code: ctx.mailer.lastCode! });

    expect(login.session.accessToken).toBeTruthy();
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const ctx = build();
    await ctx.service.requestOtp({ email: EMAIL });

    await expect(
      ctx.service.verifyOtp({ email: EMAIL, code: '000000', pdplConsent: true }),
    ).rejects.toMatchObject({ code: 'otp_invalid' });

    expect([...ctx.repository.otps.values()][0]!.attempts).toBe(1);
  });

  it('burns the code after too many wrong attempts — the real brute-force defence', async () => {
    const ctx = build();
    await ctx.service.requestOtp({ email: EMAIL });
    const realCode = ctx.mailer.lastCode!;

    for (let attempt = 0; attempt < POLICY.maxAttempts; attempt += 1) {
      await expect(
        ctx.service.verifyOtp({ email: EMAIL, code: '000000', pdplConsent: true }),
      ).rejects.toThrow();
    }

    // Even the CORRECT code is now worthless — the attempt cap is per-code and lives in the
    // database, so rotating IP addresses past the rate limiter buys an attacker nothing.
    await expect(
      ctx.service.verifyOtp({ email: EMAIL, code: realCode, pdplConsent: true }),
    ).rejects.toThrow();
  });

  it('rejects an expired code', async () => {
    let now = new Date('2026-05-01T12:00:00Z');
    const ctx = build(() => now);

    await ctx.service.requestOtp({ email: EMAIL });
    now = new Date('2026-05-01T12:11:00Z'); // 11 minutes later; the code lives 10

    await expect(
      ctx.service.verifyOtp({ email: EMAIL, code: ctx.mailer.lastCode!, pdplConsent: true }),
    ).rejects.toMatchObject({ code: 'otp_expired' });
  });

  it('cannot use the same code twice', async () => {
    const ctx = build();
    await ctx.service.requestOtp({ email: EMAIL });
    const code = ctx.mailer.lastCode!;

    await ctx.service.verifyOtp({ email: EMAIL, code, pdplConsent: true });

    await expect(
      ctx.service.verifyOtp({ email: EMAIL, code, pdplConsent: true }),
    ).rejects.toThrow();
  });
});

describe('sessions', () => {
  it('rotates the refresh token, retiring the old one', async () => {
    const ctx = build();
    const { session } = await signUp(ctx);

    const refreshed = await ctx.service.refresh(session.refreshToken);

    expect(refreshed.refreshToken).not.toBe(session.refreshToken);
    expect(refreshed.accessToken).toBeTruthy();
  });

  it('revokes EVERY session when a used refresh token is replayed', async () => {
    const ctx = build();
    const { session } = await signUp(ctx);

    const rotated = await ctx.service.refresh(session.refreshToken);

    // The old token comes back — either a replay or a theft, and we cannot tell which. Assume the
    // worst and burn every session the user has.
    await expect(ctx.service.refresh(session.refreshToken)).rejects.toMatchObject({ status: 401 });

    // Even the legitimately rotated token is now dead. The real user logs in again; a thief gets
    // nothing. It fails in the safe direction.
    await expect(ctx.service.refresh(rotated.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a refresh token that never existed', async () => {
    const ctx = build();
    await expect(ctx.service.refresh('not-a-real-token')).rejects.toMatchObject({ status: 401 });
  });

  it('logs out by revoking the session server-side', async () => {
    const ctx = build();
    const { session } = await signUp(ctx);

    await ctx.service.logout(session.refreshToken);

    await expect(ctx.service.refresh(session.refreshToken)).rejects.toThrow();
  });

  it('erases the account and everything attached to it (PDPL right-to-erasure)', async () => {
    const ctx = build();
    const { session } = await signUp(ctx);

    await ctx.service.deleteAccount(session.userId);

    expect(ctx.repository.users.size).toBe(0);
    expect(ctx.repository.sessions.size).toBe(0);
    expect(ctx.repository.otps.size).toBe(0);
  });
});

describe('access tokens', () => {
  it('refuses a token signed with the wrong secret', () => {
    const attacker = new TokenService('a-completely-different-secret-32-chars!!', 15, 30);
    const forged = attacker.signAccessToken(
      { sub: 'user', sid: 'session' },
      new Date('2026-05-01T12:00:00Z'),
    );

    const real = new TokenService(SECRET, 15, 30);
    expect(() => real.verifyAccessToken(forged.token)).toThrow(/Invalid or expired/);
  });

  it('refuses a garbage token', () => {
    const tokens = new TokenService(SECRET, 15, 30);
    expect(() => tokens.verifyAccessToken('not.a.jwt')).toThrow();
  });
});

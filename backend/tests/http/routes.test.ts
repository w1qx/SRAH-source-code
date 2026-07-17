/**
 * The HTTP surface, driven end to end with supertest — real Express, real routers, real Zod, real
 * auth guard, real SAMA engine. Only the database and the LLM are doubles.
 */
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '@/app';
import type { Container } from '@/container';
import type { Db } from '@/db/prisma';
import type { Env } from '@/config/env';
import { AnalysisService } from '@/modules/analysis/application/analysis.service';
import { MockGastatProvider } from '@/modules/analysis/infrastructure/economic/mock-gastat.provider';
import { AuthService } from '@/modules/auth/application/auth.service';
import { TokenService } from '@/modules/auth/infrastructure/token.service';
import { EmailOtpAuthProvider } from '@/modules/auth/infrastructure/email-otp.provider';
import { MockNafathAuthProvider } from '@/modules/auth/infrastructure/nafath.provider';
import { createAuthGuard } from '@/modules/auth/middleware/auth-guard';
import { ChatService } from '@/modules/chat/application/chat.service';
import { DashboardService } from '@/modules/dashboard/application/dashboard.service';
import { MockLLMProvider } from '@/modules/chat/infrastructure/mock-llm.provider';
import { OffersService } from '@/modules/offers/application/offers.service';
import { MockOffersRepository } from '@/modules/offers/infrastructure/mock-offers.repository';
import { FeatureFlagsService } from '@/modules/feature-flags/application/feature-flags.service';
import { InMemoryFeatureFlagsRepository } from '@/modules/feature-flags/infrastructure/feature-flags.repository';
import { SAMA_2018_05 } from '@/modules/analysis/domain';
import { ProviderFactory } from '@/modules/external-sources/infrastructure/providers/provider.factory';
import {
  aUserFinancialData,
  FakeAnalysisRepository,
  FakeAuthRepository,
  FakeChatRepository,
  FakeHasher,
  FakeMailer,
} from '../fakes';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

function buildTestApp(): { app: Express; mailer: FakeMailer } {
  const env = {
    NODE_ENV: 'test',
    CORS_ORIGINS: 'http://localhost:3000',
    MESSAGE_LOCALE: 'en',
  } as Env;

  const analysisRepository = new FakeAnalysisRepository();
  const flags = new FeatureFlagsService(new InMemoryFeatureFlagsRepository());
  const tokens = new TokenService(SECRET, 15, 30);
  const mailer = new FakeMailer();

  const container: Container = {
    env,
    db: {} as Db, // Never touched: every repository is a fake.
    analysis: new AnalysisService(new MockGastatProvider(), analysisRepository, {
      locale: 'en',
    }),
    auth: new AuthService(
      new FakeAuthRepository(),
      new FakeHasher(),
      mailer,
      tokens,
      { length: 6, ttlMinutes: 10, maxAttempts: 5 },
    ),
    chat: new ChatService(new MockLLMProvider(), new FakeChatRepository(), analysisRepository),
    offers: new OffersService(
      new MockOffersRepository(SAMA_2018_05),
      analysisRepository,
      flags,
    ),
    // Wired exactly as container.ts wires it: a view over the SAME analysis repository the
    // analysis routes write to, so a dashboard read can never disagree with the analysis
    // that produced it.
    dashboard: new DashboardService(analysisRepository, SAMA_2018_05),
    flags,
    guard: createAuthGuard(tokens),
    emailOtp: new EmailOtpAuthProvider(),
    nafath: new MockNafathAuthProvider(flags),
    externalSources: new ProviderFactory(),
    pullConfig: {},
  };

  return { app: createApp(container), mailer };
}

/** Sign up over HTTP and return the bearer token, exactly as the frontend would. */
async function login(app: Express, mailer: FakeMailer, email = 'user@example.com'): Promise<string> {
  await request(app).post('/auth/otp/request').send({ email }).expect(202);

  const verify = await request(app)
    .post('/auth/otp/verify')
    .send({ email, code: mailer.lastCode, pdplConsent: true })
    .expect(200);

  return verify.body.session.accessToken as string;
}

describe('public routes', () => {
  it('reports health', async () => {
    const { app } = buildTestApp();
    await request(app).get('/health').expect(200, { status: 'ok', version: '0.1.0' });
  });

  it('publishes the SAMA rules in force, unauthenticated — they are regulation, not user data', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/analysis/rules').expect(200);

    expect(res.body.rules.version).toBe('SAMA-2018-05');
    expect(res.body.rules.deductionCapEmployee).toBe(0.3333);
    expect(res.body.thresholds).toEqual({ safeMax: 0.25, cautionMax: 0.3333 });
  });

  it('serves the feature flags, so the UI can render its "Coming Soon" badges', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/feature-flags').expect(200);

    const nafath = res.body.flags.find((f: { key: string }) => f.key === 'auth_nafath');
    expect(nafath.enabled).toBe(false);
    expect(res.body.flags.every((f: { enabled: boolean }) => f.enabled === false)).toBe(true);
  });

  it('advertises which login methods actually work', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/auth/providers').expect(200);

    expect(res.body.providers).toEqual([
      { method: 'email_otp', isActive: true },
      { method: 'nafath', isActive: false },
    ]);
  });

  it('404s an unknown route in the standard error envelope', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/nope').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('Nafath — present, wired, and switched off', () => {
  it('answers 503 "not yet active" rather than pretending to authenticate anyone', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/auth/nafath/initiate')
      .send({ nationalId: '1234567890' })
      .expect(503);

    expect(res.body.error.code).toBe('feature_disabled');
    expect(res.body.error.details).toEqual({ feature: 'auth_nafath', comingSoon: true });
  });

  it('still validates its input — the boundary is guarded before the feature is live', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post('/auth/nafath/initiate')
      .send({ nationalId: 'not-an-id' })
      .expect(400);

    expect(res.body.error.code).toBe('validation_failed');
  });

  it('has a callback route ready and inactive too', async () => {
    const { app } = buildTestApp();
    await request(app).post('/auth/nafath/callback').send({ transactionId: 'abc' }).expect(503);
  });
});

describe('the auth guard', () => {
  it('rejects an unauthenticated analysis request', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/analysis')
      .send({ input: aUserFinancialData() })
      .expect(401);

    expect(res.body.error.code).toBe('unauthorized');
  });

  it('rejects a forged bearer token', async () => {
    const { app } = buildTestApp();
    await request(app)
      .post('/analysis')
      .set('Authorization', 'Bearer totally.made.up')
      .send({ input: aUserFinancialData() })
      .expect(401);
  });
});

describe('POST /analysis', () => {
  it('runs the worked example end to end over HTTP and returns a "safe" verdict', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const res = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        // ~2,950/month at the engine's indicative 6% APR over 5 years, on a 12,000 salary.
        input: aUserFinancialData({ financingAmount: 152_588.9, termYears: 5 }),
        locale: 'en',
      })
      .expect(201);

    expect(res.body.analysisId).toBeDefined();
    expect(res.body.result.overallRisk).toBe('safe');
    expect(res.body.result.requestedDbr).toBeCloseTo(0.2458, 3);
    expect(res.body.result.scenarios).toHaveLength(3);
    expect(res.body.result.provenance.ruleVersion).toBe('SAMA-2018-05');
    expect(res.body.result.provenance.inflationValue).toBe(0.02);

    const yearOne = res.body.result.scenarios[0].years[0];
    expect(yearOne.installment).toBeCloseTo(2_950, 0);
    expect(yearOne.remainingMonthly).toBeCloseTo(4_050, 0);
    expect(yearOne.riskTier).toBe('safe');
    expect(yearOne.message).toContain('comfortable margin');
  });

  it('returns a Safer Option when the request is high risk', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const res = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ input: aUserFinancialData({ financingAmount: 400_000, termYears: 5 }), locale: 'en' })
      .expect(201);

    expect(res.body.result.overallRisk).toBe('high');
    expect(res.body.result.saferOption.suggestedAmount).toBeLessThan(400_000);
    expect(res.body.result.saferOption.rationale).toBeTruthy();
  });

  it('halts with 422 when expenses already exceed income (§10.6)', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const res = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({
        input: aUserFinancialData({ grossSalary: 5_000, monthlyExpenses: 6_000 }),
        locale: 'en',
      })
      .expect(422);

    expect(res.body.error.code).toBe('analysis_blocked');
    expect(res.body.error.details.issues[0].code).toBe('income_below_expenses');
  });

  it('rejects a malformed body at the boundary, before it reaches the engine', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const res = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ input: { ...aUserFinancialData(), grossSalary: -1 } })
      .expect(400);

    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.issues[0].path).toBe('input.grossSalary');
  });

  it('rejects an unknown field rather than silently ignoring it', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ input: aUserFinancialData(), somethingElse: true })
      .expect(400);
  });

  it('stores the analysis in the user\'s history, retrievable with its provenance intact', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const created = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .send({ input: aUserFinancialData(), locale: 'en' })
      .expect(201);

    const fetched = await request(app)
      .get(`/analysis/${created.body.analysisId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(fetched.body.result).toEqual(created.body.result);
    expect(fetched.body.input.grossSalary).toBe(12_000);

    const history = await request(app)
      .get('/analysis')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(history.body.analyses).toHaveLength(1);
  });

  it('does not leak one user\'s analysis to another', async () => {
    const { app, mailer } = buildTestApp();
    const tokenA = await login(app, mailer, 'a@example.com');

    const created = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ input: aUserFinancialData() })
      .expect(201);

    const tokenB = await login(app, mailer, 'b@example.com');

    await request(app)
      .get(`/analysis/${created.body.analysisId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });
});

describe('the chatbot flow', () => {
  it('collects the ten answers, then hands a financial input straight to /analysis', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);
    const auth = { Authorization: `Bearer ${token}` };

    const started = await request(app).post('/chat').set(auth).expect(201);
    const chatId = started.body.chatSessionId;
    expect(started.body.nextQuestion.field).toBe('goal');

    const answers = ['car', '150000', '5', '12000', '0', '0', '5000', 'married', '20000', 'private', '4'];
    let last;
    for (const message of answers) {
      last = await request(app).post(`/chat/${chatId}/messages`).set(auth).send({ message }).expect(200);
    }

    expect(last!.body.complete).toBe(true);
    expect(last!.body.progress).toEqual({ collected: 11, total: 11 });

    // The handoff: the chatbot's output is analysed by id, so the analysis's provenance points at
    // the exact inputs that produced it.
    const analysis = await request(app)
      .post('/analysis')
      .set(auth)
      .send({ financialInputId: last!.body.financialInputId, locale: 'en' })
      .expect(201);

    expect(analysis.body.result.overallRisk).toBeDefined();
    expect(analysis.body.result.provenance.ruleVersion).toBe('SAMA-2018-05');
  });

  it('serves the asked questions and an empty pull while the auto-pull flags are off', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    // Flags off (the test container's pullConfig is empty) → every field is asked, nothing pulled.
    const questions = await request(app).get('/chat/questions').expect(200);
    expect(questions.body.questions).toHaveLength(11);

    const pull = await request(app)
      .post('/chat/pull')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(pull.body).toEqual({ pulled: {}, provenance: {} });
  });

  it('rejects an empty message at the boundary', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const started = await request(app).post('/chat').set('Authorization', `Bearer ${token}`).expect(201);

    await request(app)
      .post(`/chat/${started.body.chatSessionId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '   ' })
      .expect(400);
  });
});

describe('POST /offers', () => {
  it('returns illustrative offers, clearly labelled as not real', async () => {
    const { app, mailer } = buildTestApp();
    const token = await login(app, mailer);

    const res = await request(app)
      .post('/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({ input: aUserFinancialData() })
      .expect(200);

    expect(res.body.illustrative).toBe(true);
    expect(res.body.disclaimer).toContain('not real offers');
    expect(res.body.offers.length).toBeGreaterThan(0);
    expect(res.body.offers[0]).toMatchObject({
      provider: expect.any(String),
      monthlyInstallment: expect.any(Number),
      totalAdditionalCost: expect.any(Number),
      apr: expect.any(Number),
      safety: expect.stringMatching(/safe|caution|high/),
    });
  });
});

describe('the account lifecycle over HTTP', () => {
  it('signs up, reads the profile, refreshes, logs out, and erases the account', async () => {
    const { app, mailer } = buildTestApp();
    const email = 'lifecycle@example.com';

    await request(app).post('/auth/otp/request').send({ email }).expect(202);

    const verified = await request(app)
      .post('/auth/otp/verify')
      .send({ email, code: mailer.lastCode, pdplConsent: true })
      .expect(200);

    const { accessToken, refreshToken } = verified.body.session;
    expect(verified.body.profile.pdplConsentAt).not.toBeNull();

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.profile.email).toBe(email);

    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken }).expect(200);
    expect(refreshed.body.session.refreshToken).not.toBe(refreshToken);

    await request(app)
      .post('/auth/logout')
      .send({ refreshToken: refreshed.body.session.refreshToken })
      .expect(204);

    // PDPL right-to-erasure.
    await request(app)
      .delete('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('refuses signup without PDPL consent', async () => {
    const { app, mailer } = buildTestApp();
    const email = 'noconsent@example.com';

    await request(app).post('/auth/otp/request').send({ email }).expect(202);

    const res = await request(app)
      .post('/auth/otp/verify')
      .send({ email, code: mailer.lastCode })
      .expect(400);

    expect(res.body.error.details).toEqual({ field: 'pdplConsent' });
  });

  it('rejects a malformed email before it reaches the service', async () => {
    const { app } = buildTestApp();
    await request(app).post('/auth/otp/request').send({ email: 'not-an-email' }).expect(400);
  });
});

describe('rate limiting on the auth surface', () => {
  it('cuts off a flood of code requests for the same address', async () => {
    const { app } = buildTestApp();
    const email = 'flood@example.com';

    // The limit is 5 per window, per IP+email.
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/auth/otp/request').send({ email }).expect(202);
    }

    const blocked = await request(app).post('/auth/otp/request').send({ email }).expect(429);
    expect(blocked.body.error.code).toBe('rate_limited');
  });

  /**
   * Guards the bug this test was written after finding: the limiters used to be module-level
   * singletons, so every app in the process drew down ONE shared counter. In production that is a
   * single instance and looks fine — right up until a second instance, or a test, quietly inherits
   * a half-spent limit from something else entirely.
   */
  it('gives each app instance its own limiter state, rather than one shared across the module', async () => {
    const first = buildTestApp();
    const email = 'isolated@example.com';

    for (let i = 0; i < 5; i += 1) {
      await request(first.app).post('/auth/otp/request').send({ email }).expect(202);
    }
    await request(first.app).post('/auth/otp/request').send({ email }).expect(429);

    // A different app is a different limiter. It must not start life already rate-limited.
    const second = buildTestApp();
    await request(second.app).post('/auth/otp/request').send({ email }).expect(202);
  });

  it('limits each address separately — one attacker cannot lock everyone else out', async () => {
    const { app } = buildTestApp();

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/auth/otp/request').send({ email: 'victim@example.com' }).expect(202);
    }
    await request(app).post('/auth/otp/request').send({ email: 'victim@example.com' }).expect(429);

    // A different user, from the same IP, is unaffected.
    await request(app).post('/auth/otp/request').send({ email: 'bystander@example.com' }).expect(202);
  });
});

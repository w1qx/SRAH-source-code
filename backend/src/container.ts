/**
 * The composition root — the ONE place that decides which implementation answers which port.
 *
 * This file is the payoff of the whole architecture. Going to production is not a rewrite; it is
 * a different branch in this file:
 *
 *   ECONOMIC_PROVIDER=mock   → gastat   (real CPI ingest)
 *   OFFERS_PROVIDER=mock     → bank_api (real lender offers)
 *   LLM_PROVIDER=mock        → anthropic
 *   MockNafathAuthProvider   → RealNafathAuthProvider
 *
 * Nothing downstream of here knows or cares. The services depend on the PORTS in shared/types.ts,
 * never on the adapters, which is exactly why the swap is a config change.
 */
import type {
  EconomicDataProvider,
  OffersRepository,
  LLMProvider,
  SimahProvider,
} from '@shared/types';
import type { Env } from './config/env';
import { prisma } from './db/prisma';
import type { Db } from './db/prisma';

import { AnalysisService } from './modules/analysis/application/analysis.service';
import { PrismaAnalysisRepository } from './modules/analysis/infrastructure/analysis.repository';
import { CachedEconomicDataProvider } from './modules/analysis/infrastructure/economic/cached-economic-data.provider';
import { RealGastatProvider } from './modules/analysis/infrastructure/economic/real-gastat.provider';
import { MockGastatProvider } from './modules/analysis/infrastructure/economic/mock-gastat.provider';
import { PrismaEconomicDataCacheRepository } from './modules/analysis/infrastructure/economic/economic-data.repository';
import { MockSimahProvider } from './modules/analysis/infrastructure/simah/mock-simah.provider';
import { RealSimahProvider } from './modules/analysis/infrastructure/simah/real-simah.provider';
import { ProviderFactory } from './modules/external-sources/infrastructure/providers/provider.factory';
import type { ChatPullConfig } from './modules/chat/application/financial-pull';
import { getRuleSet } from './modules/analysis/domain/sama-rules';

import { AuthService } from './modules/auth/application/auth.service';
import { PrismaAuthRepository } from './modules/auth/infrastructure/auth.repository';
import { CryptoHasher } from './modules/auth/infrastructure/hasher';
import { EmailOtpAuthProvider } from './modules/auth/infrastructure/email-otp.provider';
import { MockNafathAuthProvider } from './modules/auth/infrastructure/nafath.provider';
import { ConsoleMailer, SmtpMailer } from './modules/auth/infrastructure/mailer';
import type { Mailer } from './modules/auth/infrastructure/mailer';
import { TokenService } from './modules/auth/infrastructure/token.service';
import { createAuthGuard } from './modules/auth/middleware/auth-guard';

import { ChatService } from './modules/chat/application/chat.service';
import { PrismaChatRepository } from './modules/chat/infrastructure/chat.repository';
import { AnthropicLLMProvider } from './modules/chat/infrastructure/anthropic-llm.provider';
import { MockLLMProvider } from './modules/chat/infrastructure/mock-llm.provider';

import { OffersService } from './modules/offers/application/offers.service';
import {
  BankApiOffersRepository,
  MockOffersRepository,
} from './modules/offers/infrastructure/mock-offers.repository';

import { DashboardService } from './modules/dashboard/application/dashboard.service';
import { FeatureFlagsService } from './modules/feature-flags/application/feature-flags.service';
import { PrismaFeatureFlagsRepository } from './modules/feature-flags/infrastructure/feature-flags.repository';

export interface Container {
  env: Env;
  db: Db;
  analysis: AnalysisService;
  auth: AuthService;
  chat: ChatService;
  offers: OffersService;
  dashboard: DashboardService;
  flags: FeatureFlagsService;
  guard: ReturnType<typeof createAuthGuard>;
  emailOtp: EmailOtpAuthProvider;
  nafath: MockNafathAuthProvider;
  externalSources: ProviderFactory;
  pullConfig: ChatPullConfig;
}

export function buildContainer(env: Env, db: Db = prisma): Container {
  const rules = getRuleSet();

  // --- Feature flags (needed by the adapters below) ---
  const flags = new FeatureFlagsService(new PrismaFeatureFlagsRepository(db));

  // --- Economic data (GASTAT CPI): source adapter, wrapped in the cache ---
  const economicSource: EconomicDataProvider =
    env.ECONOMIC_PROVIDER === 'gastat' && env.GASTAT_CPI_URL
      ? new RealGastatProvider(env.GASTAT_CPI_URL)
      : new MockGastatProvider();

  const economic: EconomicDataProvider = new CachedEconomicDataProvider(
    economicSource,
    new PrismaEconomicDataCacheRepository(db),
  );

  // --- SIMAH credit bureau: mock is active now; the real adapter throws until it is licensed.
  // Which one is wired is an env choice; whether it is CONSULTED is the `simah_credit` flag,
  // checked per-run by the analysis service. Real credit data is never faked.
  const simah: SimahProvider =
    env.SIMAH_PROVIDER === 'real' ? new RealSimahProvider() : new MockSimahProvider();

  // --- External sources (GOSI / Nafath / SIMAH) behind the "flip a flag, swap an adapter"
  // factory. The mock-vs-live axis is env-driven (only SIMAH has an env switch today; GOSI/Nafath
  // are mock-only until their integrations exist). WHETHER a source is consulted is the DB feature
  // flag, checked at the call site — the two axes stay separate.
  const externalSources = new ProviderFactory({
    liveGosi: false,
    liveNafath: false,
    liveSimah: env.SIMAH_PROVIDER === 'real',
  });

  // --- Analysis ---
  const analysisRepository = new PrismaAnalysisRepository(db);
  const analysis = new AnalysisService(economic, analysisRepository, {
    locale: env.MESSAGE_LOCALE,
    simah,
    // Gate: SIMAH replaces the manual COMMITMENTS while `simah_credit` is on (off by default).
    isSimahEnabled: () => flags.isEnabled('simah_credit'),
    // GOSI owns salary: when `gosi_income` is on, the input's GOSI salary is kept and SIMAH's is
    // ignored (fallback only). Degrades to "GOSI unavailable" on a DB read failure.
    isGosiEnabled: () => flags.isEnabled('gosi_income').catch(() => false),
  });

  // --- Auth ---
  const tokens = new TokenService(
    env.JWT_SECRET,
    env.ACCESS_TOKEN_TTL_MINUTES,
    env.REFRESH_TOKEN_TTL_DAYS,
  );

  const mailer: Mailer =
    env.MAIL_TRANSPORT === 'smtp' && env.SMTP_HOST && env.SMTP_PORT
      ? new SmtpMailer(
          {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            user: env.SMTP_USER,
            password: env.SMTP_PASSWORD,
          },
          env.MAIL_FROM,
        )
      : new ConsoleMailer(env.NODE_ENV);

  const auth = new AuthService(
    new PrismaAuthRepository(db),
    new CryptoHasher(),
    mailer,
    tokens,
    {
      length: env.OTP_LENGTH,
      ttlMinutes: env.OTP_TTL_MINUTES,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
    },
  );

  // --- Chat ---
  const llm: LLMProvider =
    env.LLM_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY
      ? new AnthropicLLMProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL })
      : new MockLLMProvider();

  // Auto-pull wiring: GOSI (from the factory — mock today) fills salary/sector/tenure and the
  // existing SIMAH provider fills obligations, each gated by its DB flag. On a DB read failure the
  // thunk resolves false, so the chat degrades to asking all 11 fields rather than crashing.
  // Shared by the chat (completion) and the /chat/pull route (searching-screen pull).
  const pullConfig: ChatPullConfig = {
    gosi: externalSources.getIncomeVerificationProvider(),
    simah,
    isGosiEnabled: () => flags.isEnabled('gosi_income').catch(() => false),
    isSimahEnabled: () => flags.isEnabled('simah_credit').catch(() => false),
  };
  const chat = new ChatService(llm, new PrismaChatRepository(db), analysisRepository, pullConfig);

  // --- Offers ---
  const offersRepository: OffersRepository =
    env.OFFERS_PROVIDER === 'bank_api'
      ? new BankApiOffersRepository()
      : new MockOffersRepository(rules);

  const offers = new OffersService(offersRepository, analysisRepository, flags);

  // --- Dashboard: a read model over analyses the user already ran ---
  const dashboard = new DashboardService(analysisRepository, rules);

  return {
    env,
    db,
    analysis,
    auth,
    chat,
    offers,
    dashboard,
    flags,
    guard: createAuthGuard(tokens),
    emailOtp: new EmailOtpAuthProvider(),
    nafath: new MockNafathAuthProvider(flags),
    externalSources,
    pullConfig,
  };
}

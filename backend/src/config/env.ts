/**
 * Environment configuration — the ONLY place process.env is read.
 *
 * Secrets never appear in code, never get a default, and never get logged. The schema
 * below is also the documentation: if a variable is not here, the app does not use it.
 *
 * Validation is lazy (first access) rather than at import time, so that unit tests of the
 * pure domain can run without a .env file — the engine has no business needing one.
 */
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Signs access tokens. Must be long enough to be worth signing with. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  /** Wrong guesses allowed before the code is burned. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  /** Which adapter answers each port. Flip to the real one; never rewrite the caller. */
  ECONOMIC_PROVIDER: z.enum(['mock', 'gastat']).default('mock'),
  OFFERS_PROVIDER: z.enum(['mock', 'bank_api']).default('mock'),
  LLM_PROVIDER: z.enum(['anthropic', 'mock']).default('anthropic'),
  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  /**
   * SIMAH adapter: `mock` serves a realistic report; `real` throws until the integration is
   * licensed. This only picks WHICH adapter is wired — whether SIMAH is consulted at all is the
   * `simah_credit` feature flag, off by default.
   */
  SIMAH_PROVIDER: z.enum(['mock', 'real']).default('mock'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),

  GASTAT_CPI_URL: z.string().url().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Suraa <no-reply@suraa.sa>'),

  /** Language of the plain-language messages the engine emits. Arabic-first product. */
  MESSAGE_LOCALE: z.enum(['ar', 'en']).default('ar'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  // Cross-field rules: an adapter that cannot work without a secret must say so at boot,
  // not at 3am when the first user hits it.
  const env = parsed.data;
  if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
  }
  if (env.ECONOMIC_PROVIDER === 'gastat' && !env.GASTAT_CPI_URL) {
    throw new Error('ECONOMIC_PROVIDER=gastat requires GASTAT_CPI_URL');
  }
  if (env.MAIL_TRANSPORT === 'smtp' && !(env.SMTP_HOST && env.SMTP_PORT)) {
    throw new Error('MAIL_TRANSPORT=smtp requires SMTP_HOST and SMTP_PORT');
  }

  cached = env;
  return env;
}

/** Test seam: forget the cached env so a test can load a different one. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

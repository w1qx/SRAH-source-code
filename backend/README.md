# Suraa — Backend

A Saudi financial-awareness platform. It answers one question, before the user commits rather than
after: **is this financing decision safe for me?**

The answer comes from a deterministic engine built on **real SAMA responsible-lending rules** and
**real GASTAT inflation data** — never from an LLM.

---

## Setup

**Prerequisites:** Node **≥ 20** (`node -v`) and Docker Desktop **running** — `npm run db:up`
starts Postgres 16 in a container. If you would rather use your own Postgres, skip `db:up` and
point `DATABASE_URL` at it.

You need **no API keys** to run this. The default `.env.example` selects the mock adapters, so a
fresh clone boots offline; the SAMA engine itself is pure and never called an LLM to begin with.

```bash
# 1. Install
npm install

# 2. Start Postgres (or point DATABASE_URL at your own)
npm run db:up

# 3. Configure
cp .env.example .env

#    Then set the ONE value that has no default — the app refuses to boot without it:
#      JWT_SECRET=$(openssl rand -base64 48)
#    Leave the commented-out keys (ANTHROPIC_API_KEY, GASTAT_CPI_URL, SMTP_*) commented until
#    you switch the matching adapter on. An EMPTY value is not the same as an absent one:
#    `GASTAT_CPI_URL=` is a present-but-empty string and fails url validation at boot.

# 4. Migrate + seed
npm run prisma:generate
npm run prisma:migrate    # applies prisma/migrations (uses `migrate deploy`)
npm run db:seed           # feature flags (all off) + the current CPI figure

# 5. Run
npm run dev               # http://localhost:4000
```

Verify the whole stack in one line — this exercises env, DB and the engine's rule set:

```bash
curl localhost:4000/health          # {"status":"ok","version":"0.1.0"}
curl localhost:4000/analysis/rules  # the SAMA caps and risk thresholds
```

Routes mount at the **root** (`/auth`, `/analysis`, `/chat`, `/offers`, `/dashboard`,
`/feature-flags`) — there is no `/api` prefix. The frontend talks to `http://localhost:4000` by
default and overrides it with `NEXT_PUBLIC_API_URL`.

**Turning the real adapters on** is a change of `.env`, never of code: set `LLM_PROVIDER=anthropic`
with an `ANTHROPIC_API_KEY` for the real chatbot, `ECONOMIC_PROVIDER=gastat` with a
`GASTAT_CPI_URL` for live CPI. With `MAIL_TRANSPORT=console` (the default) the login OTP is
**printed to the terminal**, so you can sign in without an email server.

`npm test` runs the whole suite (124 tests, no database needed — the repositories are fakes).
`npm run typecheck` checks `src/`, `shared/` **and** `tests/` via `tsconfig.test.json`: the build
config excludes tests so they never reach `dist/`, which once let the fixtures drift out of sync
with the types for long enough that seven suites stopped compiling while the build stayed green.
Typecheck now covers them, so that failure mode is closed.

## Environment variables

Names only — never commit values. Everything is read through `src/config/env.ts`, which validates
the whole environment with Zod at boot and fails loudly rather than at 3am.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string. |
| `JWT_SECRET` | **yes** | Signs access tokens. Minimum 32 chars (`openssl rand -base64 48`). |
| `ANTHROPIC_API_KEY` | when `LLM_PROVIDER=anthropic` | The chatbot. |
| `NODE_ENV` | no | `development` \| `test` \| `production`. |
| `PORT` | no | Default `4000`. |
| `CORS_ORIGINS` | no | Comma-separated browser origins. |
| `ACCESS_TOKEN_TTL_MINUTES` | no | Default `15`. |
| `REFRESH_TOKEN_TTL_DAYS` | no | Default `30`. |
| `OTP_LENGTH` / `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` | no | Defaults `6` / `10` / `5`. |
| `ECONOMIC_PROVIDER` | no | `mock` (calibrated ~2.0% CPI) \| `gastat`. |
| `OFFERS_PROVIDER` | no | `mock` (sample offers) \| `bank_api`. |
| `LLM_PROVIDER` | no | `anthropic` \| `mock` (scripted, offline). |
| `MAIL_TRANSPORT` | no | `console` (dev — prints the OTP) \| `smtp`. |
| `ANTHROPIC_MODEL` | no | Default `claude-opus-4-8`. |
| `GASTAT_CPI_URL` | when `ECONOMIC_PROVIDER=gastat` | The CPI feed to ingest. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM` | when `MAIL_TRANSPORT=smtp` | Email provider. |
| `MESSAGE_LOCALE` | no | `ar` (default) \| `en`. Language of the engine's plain-language messages. |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error` \| `silent`. |

## Commands

| | |
|---|---|
| `npm run dev` | Start with hot reload. |
| `npm run build` / `npm start` | Compile to `dist/`, then run it. |
| `npm test` | Jest — 124 tests, no database or API key needed. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run prisma:migrate` | Apply migrations (`migrate deploy`). |
| `npm run prisma:migrate:dev` | Create a NEW migration after editing the schema. |
| `npm run db:seed` | Seed flags + CPI. Idempotent. |
| `npm run db:up` / `npm run db:down` | Local Postgres via Docker. |

The test suite runs entirely on in-memory fakes. If a test ever needs a database, a port has been
bypassed somewhere.

---

## Architecture

Clean/hexagonal. Per module: `domain/` (pure) · `application/` (orchestration) ·
`infrastructure/` (adapters) · `routes.ts` (Express + Zod).

```
src/
├── config/env.ts            Zod-validated env — the ONLY place process.env is read
├── container.ts             Composition root — the one file that picks mock vs real
├── app.ts / server.ts
├── shared/                  http helpers, logger, the Zod mirror of UserFinancialData
└── modules/
    ├── analysis/            THE SAMA ENGINE
    │   ├── domain/          pure: sama-rules, amortization, risk-classifier,
    │   │                    obligations, scenario-builder, safer-option, preflight
    │   ├── application/     analysis.service — orchestration only
    │   └── infrastructure/  Prisma repo + economic providers (mock | GASTAT | cache)
    ├── auth/                email OTP, sessions, Nafath adapter (off), guard, rate limits
    ├── chat/                LLM data collection (Anthropic | mock)
    ├── offers/              offer comparison (mock | bank API)
    └── feature-flags/       config + DB catalog
```

**`shared/types.ts` is the contract, and it is vendored.** It is the single source of truth for
every shape crossing the wire, and the frontend carries a copy of the same file. In the `amad/`
monorepo it lives at the root; this repo holds a byte-identical copy so it clones and builds on
its own. Keep them in sync — change the contract in one place and copy it across, never edit one
side alone.

**The engine is pure.** Nothing in `analysis/domain/` imports Express, Prisma, the Anthropic SDK,
or the clock — `computedAt` is passed in, because a function that reads the clock is not one you
can reproduce an audit against. If it needs `await`, it is in the wrong layer.

**Every external dependency sits behind a port** (`shared/types.ts`) with a mock and a real
implementation. Going to production is a branch in `container.ts`, not a rewrite:

| Port | Now | Later |
|---|---|---|
| `EconomicDataProvider` | calibrated ~2.0% mock | `ECONOMIC_PROVIDER=gastat` |
| `OffersRepository` | sample offers | `OFFERS_PROVIDER=bank_api` |
| `LLMProvider` | Anthropic (or offline mock) | — |
| `AuthProvider` | email OTP live; Nafath mocked | flip `auth_nafath` + swap the adapter |

## The rules (and where they live)

- **SAMA** gives the *rules*: deduction cap 33.33% (retirees 25%), obligation ceilings 45/55/65%.
  They live in exactly one place — `analysis/domain/sama-rules.ts` — as a **versioned, dated**
  object (`SAMA-2018-05`), never as scattered magic numbers. When SAMA updates, **add** a rule set;
  never edit a published one, or you silently rewrite history for every past analysis.
- **GASTAT** gives the *inflation number* (CPI ~2.0%). It arrives through `EconomicDataProvider`,
  is cached in `economic_data_cache`, and **GASTAT being down never blocks a user** — a stale CPI
  is a rounding error in a five-year projection; an error page mid-decision is a product failure.
- Risk tiers from DBR: **< 25% safe · 25–33.33% caution · > 33.33% high** — and high, too, if a
  SAMA obligation ceiling is breached or the month ends in the red (the DBR cannot see expenses).

Every analysis is persisted with **full provenance** — rule version, inflation value + source +
period, assumptions, and the self-describing `result_json` — so any result can be reproduced years
later, under the rules that applied at the time. A stored analysis is replayed verbatim, never
recomputed under today's rules.

## The LLM never calculates

The chatbot collects and structures data. That is all. It is never given the SAMA rules, the CPI,
or the engine — it *cannot* misuse numbers it does not have. Its output crosses three checks before
it is stored: a constrained JSON schema, Zod inside the adapter, and the strict
`PartialUserFinancialDataSchema` at the service boundary. A hallucinated field is rejected, not
silently dropped; the model's own "I'm done" flag is a hint, never the verdict.

## API

| | |
|---|---|
| `GET /health` | |
| `GET /feature-flags` | Public — drives the UI's "Coming Soon" badges. |
| `GET /analysis/rules` | Public — the SAMA red lines in force. |
| `POST /auth/otp/request` → `POST /auth/otp/verify` | Email OTP. Verify requires `pdplConsent` on signup. |
| `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `DELETE /auth/me` | `DELETE` is PDPL erasure. |
| `GET /auth/providers` | Which login methods are actually active. |
| `POST /auth/nafath/*` | Present and wired — returns **503 `feature_disabled`**, never a fake success. |
| `POST /chat` · `POST /chat/:id/messages` · `GET /chat/questions` | The 10 scoped questions. |
| `POST /analysis` · `GET /analysis` · `GET /analysis/:id` | 422 if expenses already exceed income. |
| `POST /offers` | Illustrative samples, labelled as such. |

Auth is `Authorization: Bearer <accessToken>`; the refresh token also rides in an httpOnly cookie.

## Security notes

- OTP codes are hashed with **argon2id** (six digits — a fast hash would be brute-forced from a
  leaked DB in seconds). Refresh tokens are 256-bit random and hashed with **SHA-256**, because
  they must be *looked up*, and argon2 salts every hash.
- Attempts are capped **per code, in the database** — the rate limiter is per-IP and can be walked
  around; the counter cannot.
- Refresh tokens **rotate**; a replayed one revokes every session the user has.
- `requestOtp` answers identically for known and unknown emails — no enumeration oracle.
- Secrets come from `process.env` only. Logs carry user ids, never payloads.

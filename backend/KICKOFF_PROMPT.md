# Suraa Backend — Kickoff Prompt (for Claude Opus 4.8)

> **How to use:** Paste the prompt below into Opus 4.8, and attach two files
> alongside it: `Suraa_Scope_v2.md` and `shared/types.ts`.
> You create the `.env` with real secret values yourself — the model only writes
> code that reads `process.env`, it never sees the keys.

---

You are building the complete backend for "Suraa" — a Saudi financial-awareness
platform that analyzes whether a financing decision is safe for a user, based on
real SAMA (Saudi Central Bank) responsible-lending rules and real GASTAT inflation
data.

I'm attaching two files:
  - Suraa_Scope_v2.md — the source of truth for architecture, the PostgreSQL
    schema, the SAMA formulas, and the worked example. Read it first.
  - shared/types.ts — the FIXED type contract. Build all layers against these
    exact types. Do not redefine or alter them.

Build the entire backend end to end in one pass. Only stop to ask me if you hit
something genuinely ambiguous that neither the scope nor this prompt covers.

## STACK (already decided — do not substitute)
- Node.js + Express + TypeScript
- PostgreSQL + Prisma (migrations from day one)
- Zod for validation, called manually at every route boundary
- jsonwebtoken + a sessions table for auth; argon2 (or bcrypt) to hash OTP codes
- express-rate-limit on auth routes
- Jest for tests
- @anthropic-ai/sdk for the chatbot LLM, called ONLY from chat/infrastructure/

## ARCHITECTURE RULES (non-negotiable)
- Clean/hexagonal layering. Folder structure per module:
  domain/ (pure logic, NO Express, NO Prisma, NO I/O)
  application/ (orchestration services)
  infrastructure/ (adapters: DB, LLM, GASTAT, offers, auth)
  routes.ts (Express router + Zod validation)
- The SAMA calculation engine MUST be pure functions in analysis/domain/ —
  no framework, no async, no I/O. If a function needs `await`, it's in the
  wrong layer.
- Every external dependency sits behind an interface with a mock + real impl:
  EconomicDataProvider (GASTAT ↔ mock), OffersRepository (bank API ↔ mock),
  AuthProvider (email OTP + Nafath-mock ↔ real), LLMProvider.
- Secrets come from process.env only. Never hardcode keys. Env vars I will
  provide: DATABASE_URL, ANTHROPIC_API_KEY, JWT_SECRET, and email-provider keys.

## GROUND-TRUTH FACTS (must be exact — do not improvise these numbers)
- SAMA caps: salary deduction ≤ 33.33% of gross salary; retirees ≤ 25%;
  total obligations ≤ 45% (income ≤ 15,000 SAR, excl. real estate);
  total finance obligations ≤ 55% (income ≤ 15,000); ≤ 65% (income 15,000–25,000).
- Store these caps as a VERSIONED, dated rule object (e.g. "SAMA-2018-05"),
  never as scattered magic numbers.
- Risk tiers from DBR: below 25% = Safe; 25%–33.33% = Acceptable with Caution;
  above 33.33% (or exceeding the obligation ceiling) = High Risk.
- Inflation comes from GASTAT (CPI, currently ~2.0%), NOT from SAMA. SAMA gives
  rules; GASTAT gives the inflation number. In the MVP, serve a calibrated mock
  (~2.0%) behind EconomicDataProvider, with a cache table ready for real ingest.
- DBR = (total monthly financing installments ÷ gross salary) × 100.
- Installment (amortization) = P × (r × (1+r)^n) ÷ ((1+r)^n − 1).
- Each analysis must be persisted with full provenance: rule_version,
  inflation_value + source + date, assumptions, and a self-describing result_json.

## WHAT TO BUILD (complete, in this order)
1. Scaffold the Express + TypeScript project and the module folder structure.
   Set up Prisma with the schema from the scope (Section 11) and generate the
   first migration. Place the provided shared/types.ts as the contract.
2. The SAMA engine in analysis/domain/ as pure functions (sama-rules versioned,
   amortization, risk-classifier, scenario-builder). Write Jest tests that prove
   the worked example: gross salary 12,000, expenses 5,000, no commitments,
   installment 2,950 → DBR = 24.6% → "Safe", monthly remaining 4,050. These
   tests MUST pass.
3. The EconomicDataProvider interface with the calibrated mock (~2.0%) + the
   cache table wiring; the analysis.service orchestrating engine + provider; the
   /analysis route with Zod validation; persist analyses with full provenance.
4. Auth: Email OTP (request → verify → session) fully working, plus the Nafath
   AuthProvider adapter as a mock behind the same interface, with /auth/nafath/*
   routes present but returning a "not yet active" response. Add rate limiting
   and the auth guard middleware.
5. The chat module: LLMProvider (Anthropic) in chat/infrastructure/, the
   extraction service (LLM asks the 10 scoped questions, returns partial
   UserFinancialData JSON), Zod-validated at the boundary before persistence.
   The LLM must NEVER calculate or give financial advice — it only collects and
   structures data.
6. Feature flags (config + feature_flags table) so future features (live Nafath,
   investment scenario, real offers) exist but are toggled off.

## WHEN DONE
- Ensure the project compiles, the migration runs, and all Jest tests pass.
- Provide a README with: setup steps, the required .env variables (names only,
  no values), how to run migrations, how to start the server, and how to run tests.
- Give me a short summary of what was built per module and anything you had to
  assume.

Build it all now.

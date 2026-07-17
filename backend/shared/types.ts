/**
 * Suraa — Shared Type Contract
 * ---------------------------------------------------------------------------
 * This file is the single source of truth for the data shapes exchanged across
 * the system (backend layers, and later the frontend). Pin these shapes before
 * building anything else. DB entities map TO these types via a mapping layer —
 * the database shape is not required to match these one-to-one.
 *
 * Rules:
 *  - The SAMA engine (analysis/domain) consumes UserFinancialData and produces
 *    AnalysisResult using ONLY pure functions.
 *  - The LLM only ever produces Partial<UserFinancialData>, validated with Zod
 *    at the backend boundary before use.
 *  - Every AnalysisResult is self-describing: it carries the provenance needed
 *    to reproduce it later (rule version, inflation value + source + date).
 */

// ===========================================================================
// USER FINANCIAL INPUT  (produced by the chatbot, validated, then analyzed)
// ===========================================================================

export type FinancingGoal =
  | "car"
  | "wedding"
  | "home"
  | "education"
  | "project"
  | "debt_consolidation"
  | "personal_need"
  // "personal" is the redesigned question set's option ("تمويل شخصي"); kept alongside the
  // legacy "personal_need" so historical rows stay valid — the superset never drops a value.
  | "personal"
  | "other";

export type EmploymentSector =
  | "government"
  | "private"
  | "semi_government"
  | "other";

export type FamilyStatus =
  | "single_no_dependents"
  | "married"
  | "with_dependents"
  // Redesigned question set's options; kept alongside the legacy values as a superset so no
  // stored row is ever orphaned.
  | "single"
  | "separated";

export interface UserFinancialData {
  goal: FinancingGoal;
  /** Requested financing amount in SAR. */
  financingAmount: number;
  /** Desired repayment term in years. */
  termYears: number;
  /** Gross monthly salary in SAR (basic − GOSI/pension + fixed allowances). */
  grossSalary: number;
  /** Fixed additional monthly income in SAR (0 if none). */
  additionalIncome: number;
  /** Total existing monthly commitments in SAR (0 if none). */
  existingCommitments: number;
  /** Average essential monthly expenses in SAR. */
  monthlyExpenses: number;
  familyStatus: FamilyStatus;
  /** Available emergency savings in SAR. */
  savings: number;
  employmentSector: EmploymentSector;
  /** Employment tenure in years. */
  tenureYears: number;
  /**
   * Optional annual bonus/allowance in SAR (0 or omitted if none). Supplementary field from the
   * redesigned question set; optional so existing rows and the engine (which does not consume it
   * yet) remain valid.
   */
  annualBonus?: number;
}

/** The partial shape the LLM emits during the chat, before completion. */
export type PartialUserFinancialData = Partial<UserFinancialData>;

// ===========================================================================
// SAMA RULES  (versioned, dated — never scattered magic numbers)
// ===========================================================================

/**
 * A dated SAMA rule set. Stored so that any past analysis remains reproducible
 * under the rule that applied at the time, even after SAMA updates its rules.
 */
export interface SamaRuleSet {
  /** e.g. "SAMA-2018-05" */
  version: string;
  /** ISO date the rule set became effective. */
  effectiveDate: string;
  /** Max deduction as a fraction of gross salary for a working employee (0.3333). */
  deductionCapEmployee: number;
  /** Max deduction as a fraction of pension for retirees (0.25). */
  deductionCapRetiree: number;
  /** Obligation tiers keyed by income band. Fractions of total income. */
  obligationTiers: {
    /** income ≤ 15,000 SAR, excluding real estate finance (0.45). */
    lowIncomeExclRealEstate: number;
    /** income ≤ 15,000 SAR, total finance obligations (0.55). */
    lowIncomeTotalFinance: number;
    /** income 15,000–25,000 SAR, total finance obligations (0.65). */
    midIncomeTotalFinance: number;
    /** Ministry of Housing / REDF beneficiaries ceiling (0.65). */
    housingBeneficiary: number;
  };
  /** Income band boundaries in SAR. */
  incomeBands: {
    low: number; // 15000
    mid: number; // 25000
  };
}

// ===========================================================================
// RISK CLASSIFICATION
// ===========================================================================

export type RiskTier = "safe" | "caution" | "high";

/**
 * Risk tier thresholds expressed as DBR fractions (of gross salary).
 *  - below safeMax          → "safe"        (< 25%)
 *  - safeMax .. cautionMax  → "caution"     (25% – 33.33%)
 *  - above cautionMax       → "high"        (> 33.33%)
 * cautionMax MUST equal the SAMA employee deduction cap.
 */
export interface RiskThresholds {
  safeMax: number; // 0.25
  cautionMax: number; // 0.3333  (== deductionCapEmployee)
}

// ===========================================================================
// SCENARIO ASSUMPTIONS & ECONOMIC DATA
// ===========================================================================

export type EconomicIndicator = "cpi";

/** A single economic data point, sourced and dated (e.g. GASTAT CPI). */
export interface EconomicDataPoint {
  indicator: EconomicIndicator;
  /** Annual rate as a fraction, e.g. 0.02 for 2.0%. */
  value: number;
  /** e.g. "GASTAT" */
  source: string;
  /** Reporting period, e.g. "2026-05". */
  period: string;
}

/** Assumptions applied when projecting scenarios over the term. */
export interface ScenarioAssumptions {
  /** Annual salary growth as a fraction (e.g. 0.02). Expected scenario. */
  salaryGrowth: number;
  /** Annual inflation as a fraction, from EconomicDataProvider (GASTAT CPI). */
  inflation: number;
}

// ===========================================================================
// ANALYSIS RESULT  (self-describing, audit-ready)
// ===========================================================================

export type ScenarioType = "baseline" | "expected" | "bad";

export interface YearBreakdown {
  /** 1-based year index within the term. */
  year: number;
  /** Monthly installment in SAR for this year. */
  installment: number;
  /** Monthly amount left after installment + expenses, in SAR. */
  remainingMonthly: number;
  /** Remaining debt balance at end of this year, in SAR. */
  remainingDebt: number;
  /** Debt Burden Ratio for this year as a fraction (e.g. 0.246). */
  dbr: number;
  riskTier: RiskTier;
  /** Plain-language explanation of what this year means for the user. */
  message: string;
}

export interface Scenario {
  type: ScenarioType;
  years: YearBreakdown[];
  /** One-sentence summary (e.g. "Goal achieved under high financial pressure"). */
  resultSummary: string;
}

/** Suggested safer alternative, present only when risk is elevated. */
export interface SaferOption {
  suggestedAmount: number;
  suggestedTermYears: number;
  /** Why this is safer, in plain language. */
  rationale: string;
}

/**
 * Where a given financial figure came from.
 *  - "manual" — the user typed it during the chatbot flow.
 *  - "simah"  — it was verified against the user's SIMAH credit report.
 *
 * Every analysis records this per figure so the UI can tell the user (with a badge, never
 * colour alone) which numbers are self-declared and which are bureau-verified, and so an
 * auditor can see exactly what the engine was fed.
 */
export type DataSource = "manual" | "simah" | "gosi";

/**
 * Which source supplied each value the engine consumed.
 *
 * Source ownership (locked):
 *   - GOSI is authoritative for salary, sector, and tenure.
 *   - SIMAH is authoritative for obligations, active loans, defaults, and credit score.
 *   - SIMAH's salary is a FALLBACK only, used solely when GOSI is unavailable.
 *
 * So `grossSalary` reads 'gosi' when GOSI supplied it, 'simah' only as the fallback, and 'manual'
 * when neither source was consulted. `existingCommitments` reads 'simah' when SIMAH supplied it,
 * else 'manual'.
 */
export interface FinancialDataProvenance {
  /** Source of the existing monthly commitments figure. */
  existingCommitments: DataSource;
  /** Source of the gross monthly salary figure. */
  grossSalary: DataSource;
  /** Present only when SIMAH supplied data — the report reference and score placeholder. */
  simah?: {
    /** SIMAH's reference for the report the figures were read from. */
    referenceId: string;
    /** Credit score placeholder (SIMAH range 300–900). */
    creditScore: number;
    /** ISO timestamp the bureau generated the report. */
    reportGeneratedAt: string;
    /** Source label, e.g. "SIMAH" or "SIMAH (mock)". */
    source: string;
  };
}

/**
 * Provenance stamped onto every analysis so it can be reproduced later.
 * This is what makes the result audit-ready for a regulated product.
 */
export interface AnalysisProvenance {
  /** SAMA rule set version used, e.g. "SAMA-2018-05". */
  ruleVersion: string;
  /** Inflation value applied (fraction). */
  inflationValue: number;
  /** Inflation source, e.g. "GASTAT". */
  inflationSource: string;
  /** Inflation reporting period, e.g. "2026-05". */
  inflationAsOf: string;
  /**
   * The annual profit rate the installment was amortized at, as a fraction (e.g. 0.06).
   *
   * Scope §10.1 computes the installment from a profit rate, but UserFinancialData carries
   * none — the user is asking "can I afford this?" BEFORE they hold an offer. So the engine
   * amortizes at an indicative rate. Without this field the UI could show an installment with
   * no way to say what rate produced it, which for a financial figure is not acceptable.
   */
  apr: number;
  /** True when `apr` is the engine's own assumption rather than a real rate the caller supplied. */
  aprIsIndicative: boolean;
  /** Assumptions applied. */
  assumptions: ScenarioAssumptions;
  /**
   * Which source supplied each user figure the engine consumed — "manual" (chatbot) or
   * "simah" (bureau-verified). Stamped so every result says, on its face, what it was fed.
   */
  dataSources: FinancialDataProvenance;
  /** ISO timestamp the analysis was computed. */
  computedAt: string;
}

export interface AnalysisResult {
  /** The three projected tracks: baseline, expected, bad. */
  scenarios: Scenario[];
  /** First-year DBR of the requested financing (fraction). */
  requestedDbr: number;
  /** Overall worst-case tier across the term (drives top-level messaging). */
  overallRisk: RiskTier;
  saferOption?: SaferOption;
  provenance: AnalysisProvenance;
}

// ===========================================================================
// FINANCING OFFERS  (mock now, real lenders later — same shape)
// ===========================================================================

export type OfferCategory = "best_match" | "lowest_cost" | "lowest_installment";

export interface FinancingOffer {
  id: string;
  /** Provider name (sample in MVP). */
  provider: string;
  monthlyInstallment: number;
  /** Total additional cost over the term, in SAR. */
  totalAdditionalCost: number;
  /** Annual percentage / profit rate as a fraction (e.g. 0.041). */
  apr: number;
  termYears: number;
  /** Safety classification of this offer for the user. */
  safety: RiskTier;
  /** Which comparison tabs this offer appears under. */
  categories: OfferCategory[];
}

// ===========================================================================
// PROVIDER INTERFACES  (ports — each has a mock + real adapter)
// ===========================================================================

export interface EconomicDataProvider {
  /** Returns the latest economic data point for an indicator (e.g. GASTAT CPI). */
  getLatest(indicator: EconomicIndicator): Promise<EconomicDataPoint>;
}

// --- SIMAH credit bureau -----------------------------------------------------
// Real credit data requires SAMA licensing + SIMAH membership. The mock returns data shaped
// exactly like a real report so the engine and UI are built against the final contract now;
// the real adapter is gated behind the `simah_credit` feature flag.

/** The kind of obligation a SIMAH commitment represents. */
export type CreditCommitmentType =
  | "personal_finance"
  | "credit_card"
  | "auto_lease"
  | "mortgage"
  | "other";

/** A single active obligation as it appears on a SIMAH report. */
export interface SimahCommitment {
  /** Creditor / lender name as reported to SIMAH. */
  creditor: string;
  type: CreditCommitmentType;
  /** Monthly installment in SAR. */
  monthlyInstallment: number;
  /** Outstanding balance in SAR. */
  outstandingBalance: number;
}

/** Overall payment standing derived from the report's default history. */
export type PaymentStanding = "current" | "late" | "default";

/**
 * A user's credit profile as SIMAH would return it: verified salary, active commitments and
 * their installments, payment/default history, and a credit-score placeholder. The mock and
 * the (stubbed) real adapter both produce THIS shape.
 */
export interface SimahCreditProfile {
  /** SIMAH's reference for this report. */
  referenceId: string;
  /** Verified gross monthly salary in SAR (salary-certificate / GOSI feed). */
  verifiedGrossSalary: number;
  /** Active commitments and their monthly installments. */
  commitments: SimahCommitment[];
  /** Sum of the commitments' monthly installments, in SAR (convenience total). */
  totalMonthlyInstallments: number;
  /** Overall payment standing. */
  standing: PaymentStanding;
  /** Count of obligations that defaulted in the last 24 months. */
  defaultsLast24Months: number;
  /** Credit-score placeholder (SIMAH range 300–900). */
  creditScore: number;
  /** ISO timestamp the bureau generated this report. */
  reportGeneratedAt: string;
  /** Source label stamped into provenance, e.g. "SIMAH" or "SIMAH (mock)". */
  source: string;
}

/** How SIMAH keys a report: by the subject's identity. */
export interface SimahSubjectRef {
  /** The Suraa user this report is for. */
  userId: string;
  /** National ID (Hawiyya/Iqama) — how a real SIMAH lookup is keyed. Optional for the mock. */
  nationalId?: string;
}

export interface SimahProvider {
  /** Whether the provider is authorized/active (mirrors the `simah_credit` feature flag). */
  isActive: boolean;
  /**
   * Pulls the credit profile for a subject. The mock returns realistic data; the real adapter
   * throws until SAMA licensing + SIMAH membership are in place.
   */
  getCreditProfile(subject: SimahSubjectRef): Promise<SimahCreditProfile>;
}

export interface OffersRepository {
  /** Returns candidate offers for a given financial input. */
  getOffers(input: UserFinancialData): Promise<FinancingOffer[]>;
}

export interface LLMProvider {
  /**
   * Sends the conversation so far and returns the assistant's next message plus
   * any structured data extracted so far. The LLM never calculates or advises.
   */
  next(messages: ChatMessage[]): Promise<LLMTurn>;
}

export type AuthMethod = "email_otp" | "nafath";

export interface AuthProvider {
  method: AuthMethod;
  /** Whether this provider is currently active (Nafath is mocked/off in MVP). */
  isActive: boolean;
}

// ===========================================================================
// CHAT
// ===========================================================================

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LLMTurn {
  /** The assistant's next message to show the user. */
  reply: string;
  /** Structured data extracted so far (accumulates across turns). */
  extracted: PartialUserFinancialData;
  /** True when all required fields are collected and validated. */
  complete: boolean;
}

// ===========================================================================
// AUTH  (Email OTP + Nafath-mock)
// ===========================================================================

export interface OtpRequestResult {
  /** Whether the code was issued (and emailed). */
  issued: boolean;
  /** Seconds until the code expires. */
  expiresInSeconds: number;
}

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** ISO expiry of the access token. */
  expiresAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  authProvider: AuthMethod;
  /** ISO timestamp of PDPL consent, or null if not yet given. */
  pdplConsentAt: string | null;
  createdAt: string;
}

// ===========================================================================
// BANK APPLICATIONS  (financing requests submitted to banks)
// ===========================================================================

export type BankApplicationStatus =
  | "pending" // submitted, awaiting bank decision
  | "approved" // a bank approved the request
  | "rejected" // a bank declined the request
  | "expired"; // request lapsed

export interface BankApplication {
  id: string;
  userId: string;
  /** The analysis this application was based on. */
  analysisId: string;
  /** Bank/lender name the request was submitted to. */
  bankName: string;
  /** Requested financing amount in SAR. */
  financingAmount: number;
  termYears: number;
  /** Monthly installment of the submitted offer, in SAR. */
  monthlyInstallment: number;
  status: BankApplicationStatus;
  /** ISO timestamp the request was submitted. */
  submittedAt: string;
  /** ISO timestamp the bank responded, or null if still pending. */
  respondedAt: string | null;
}

// ===========================================================================
// FINANCIAL INDICATOR  (the "natural" gauge that reacts to approvals)
// ===========================================================================

/**
 * A summary financial-health indicator shown on the dashboard.
 * `score` is a normalized value (0–100). It reflects the user's current
 * standing and shifts when a bank approves a financing request (a new
 * commitment changes the DBR and therefore the indicator).
 */
export interface FinancialIndicator {
  /** Normalized 0–100 health score. */
  score: number;
  /** Tier mirroring the risk tiers for consistent color coding. */
  tier: RiskTier;
  /** Current debt burden ratio as a fraction (e.g. 0.246). */
  currentDbr: number;
  /** Plain-language summary of what the indicator means right now. */
  message: string;
  /** ISO timestamp the indicator was last recomputed. */
  updatedAt: string;
}

// ===========================================================================
// DASHBOARD  (aggregate payload for the dashboard screen)
// ===========================================================================

/** Lightweight summary of a past analysis, for listing on the dashboard. */
export interface AnalysisSummary {
  id: string;
  goal: FinancingGoal;
  financingAmount: number;
  termYears: number;
  overallRisk: RiskTier;
  /** ISO timestamp the analysis was created. */
  createdAt: string;
}

export interface DashboardData {
  /**
   * Derived from the user's most recent analysis — so it is `null` until they
   * have run one. The UI must render an empty state rather than invent a score.
   */
  indicator: FinancialIndicator | null;
  /** Financing requests submitted to banks, awaiting or with a decision. */
  applications: BankApplication[];
  /** Past analyses the user can revisit. */
  pastAnalyses: AnalysisSummary[];
}

// ===========================================================================
// CONSENT  (Terms & Conditions + data retrieval/storage, PDPL)
// ===========================================================================

export interface ConsentState {
  /** User agreed to the Terms & Conditions and Privacy Policy. */
  termsAccepted: boolean;
  /**
   * User agreed to retrieving their financial data from authorized entities
   * (e.g. SIMAH) and storing it for analysis, under PDPL.
   */
  dataRetrievalAccepted: boolean;
  /** ISO timestamp when both consents were granted, or null if not yet complete. */
  consentedAt: string | null;
}

// ===========================================================================
// FEATURE FLAGS
// ===========================================================================

export type FeatureFlagKey =
  | "auth_nafath"
  | "scenario_investment"
  | "scenario_financial_health"
  | "offers_real_lenders"
  | "open_banking"
  | "simah_credit"
  // When on, gross salary + employment sector + tenure are auto-pulled from GOSI instead of asked
  // in the chat. Paired with `simah_credit` (obligations) this drives the auto-pull flow.
  | "gosi_income";

export interface FeatureFlag {
  key: FeatureFlagKey;
  enabled: boolean;
  description: string;
}

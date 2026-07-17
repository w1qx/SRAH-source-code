import type { AnalysisSummary, FinancingGoal, RiskTier } from "@shared/types";

/**
 * Client-side financial model for the dashboard's LIVE PREVIEWS (scenario drawer,
 * comparison matrix, inflation simulation).
 *
 * The backend owns the authoritative score and analysis. Everything here is a fast,
 * transparent approximation so sliders can respond on every frame — each preview is
 * labelled "تقديري/معاينة" in the UI and never overwrites server data.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/**
 * Saudi annual inflation rate, 2026: 1.8% — General Authority for Statistics
 * (GASTAT) / Ministry of Economy and Planning. A constant until a live feed exists.
 */
export const INFLATION_RATE = 0.018;
export const INFLATION_SOURCE = "وزارة الاقتصاد والتخطيط — الهيئة العامة للإحصاء";

/** SAMA employee deduction cap: the DBR red line every meter is measured against. */
export const DBR_CAP = 0.3333;

/**
 * Below this DBR the position is comfortably safe ("مريح"); between here and the
 * SAMA cap it degrades toward caution. Mirrors the tiers the backend uses.
 */
export const DBR_COMFORT = 0.15;
/** From this DBR on, the UI shifts the meter into its caution (warm copper) state. */
export const DBR_WARNING = 0.25;

/**
 * Estimated effective annual rates (APR) per goal, until real lender pricing is
 * wired in. Deliberately conservative mid-market figures; always shown as "تقديرية".
 */
export const ESTIMATED_APR: Record<FinancingGoal, number> = {
  home: 0.055,
  car: 0.065,
  personal: 0.07,
  personal_need: 0.07,
  wedding: 0.07,
  education: 0.06,
  project: 0.08,
  debt_consolidation: 0.075,
  other: 0.07,
};

/* ------------------------------------------------------------------ */
/* Loan math                                                           */
/* ------------------------------------------------------------------ */

/**
 * Standard amortized installment: M = P · r / (1 − (1+r)^−n)
 * where P = principal, r = monthly rate (APR/12), n = months.
 * With r = 0 it degrades to simple division.
 */
export function monthlyInstallment(principal: number, apr: number, years: number): number {
  const n = Math.max(1, Math.round(years * 12));
  if (principal <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Everything the drawer and matrix display about one loan configuration. */
export interface LoanBreakdown {
  principal: number;
  apr: number;
  installment: number;
  totalPaid: number;
  /** Total financing cost = what the borrower pays beyond the principal. */
  totalCost: number;
}

export function loanBreakdown(amount: number, downPayment: number, goal: FinancingGoal, years: number): LoanBreakdown {
  const principal = Math.max(0, amount - downPayment);
  const apr = ESTIMATED_APR[goal] ?? 0.07;
  const installment = monthlyInstallment(principal, apr, years);
  const totalPaid = installment * Math.round(years * 12);
  return { principal, apr, installment, totalPaid, totalCost: totalPaid - principal };
}

/* ------------------------------------------------------------------ */
/* DBR + preview score                                                 */
/* ------------------------------------------------------------------ */

/** DBR = all monthly debt commitments ÷ gross monthly income. */
export function computeDbr(monthlyCommitments: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return 0;
  return Math.max(0, monthlyCommitments / monthlyIncome);
}

/** The tier thresholds the meter color/status follow (never color alone — always with a label). */
export function tierForDbr(dbr: number): RiskTier {
  if (dbr < DBR_WARNING) return "safe";
  if (dbr <= DBR_CAP) return "caution";
  return "high";
}

/**
 * Preview health score (0–100), a piecewise-linear read of the DBR:
 *  - 0% DBR            → 100
 *  - comfort (15%)     → 85   (still clearly safe)
 *  - SAMA cap (33.33%) → 40   (at the legal edge)
 *  - 50%+              → 0
 * Chosen so dragging a slider produces smooth, monotonic feedback that agrees in
 * SPIRIT with the backend tiers; the authoritative score remains the server's.
 */
export function previewScore(dbr: number): number {
  const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
    y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  let s: number;
  if (dbr <= 0) s = 100;
  else if (dbr < DBR_COMFORT) s = lerp(dbr, 0, DBR_COMFORT, 100, 85);
  else if (dbr <= DBR_CAP) s = lerp(dbr, DBR_COMFORT, DBR_CAP, 85, 40);
  else if (dbr <= 0.5) s = lerp(dbr, DBR_CAP, 0.5, 40, 0);
  else s = 0;
  return Math.round(Math.max(0, Math.min(100, s)));
}

/** What the drawer pushes up to the gauge while sliders move. */
export interface SimulationPreview {
  dbr: number;
  score: number;
  tier: RiskTier;
}

/* ------------------------------------------------------------------ */
/* Inflation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Real (today's-money) value of a nominal amount after `years` of inflation:
 *   real = nominal ÷ (1 + i)^years
 * At i = 1.8%, 10,000 ر.س of monthly surplus keeps ≈ 8,365 ر.س of purchasing
 * power after 10 years — the erosion the toggle makes visible.
 */
export function realValue(nominal: number, years: number, rate: number = INFLATION_RATE): number {
  return nominal / Math.pow(1 + rate, years);
}

/* ------------------------------------------------------------------ */
/* Scenario helpers                                                    */
/* ------------------------------------------------------------------ */

/** The drawer's editable inputs, seeded from a saved scenario + the live indicator. */
export interface ScenarioInputs {
  amount: number;
  termYears: number;
  downPayment: number;
  monthlyIncome: number;
  otherCommitments: number;
}

export function seedInputs(scenario: AnalysisSummary, currentDbr: number): ScenarioInputs {
  // Income isn't part of the dashboard read model, so the simulator starts from a
  // typical figure and derives existing commitments from the KNOWN current DBR —
  // that way the preview's starting point agrees with the gauge the user sees.
  const monthlyIncome = 15000;
  return {
    amount: scenario.financingAmount,
    termYears: scenario.termYears,
    downPayment: 0,
    monthlyIncome,
    otherCommitments: Math.round(currentDbr * monthlyIncome),
  };
}

export function simulate(inputs: ScenarioInputs, goal: FinancingGoal): {
  loan: LoanBreakdown;
  dbr: number;
  score: number;
  tier: RiskTier;
  /** Monthly cash left after commitments + the new installment. */
  surplus: number;
} {
  const loan = loanBreakdown(inputs.amount, inputs.downPayment, goal, inputs.termYears);
  const dbr = computeDbr(inputs.otherCommitments + loan.installment, inputs.monthlyIncome);
  return {
    loan,
    dbr,
    score: previewScore(dbr),
    tier: tierForDbr(dbr),
    surplus: Math.max(0, inputs.monthlyIncome - inputs.otherCommitments - loan.installment),
  };
}

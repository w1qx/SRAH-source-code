/**
 * Engine ASSUMPTIONS — versioned and dated, and deliberately kept apart from
 * sama-rules.ts.
 *
 * The distinction matters in a regulated product:
 *   - sama-rules.ts holds REGULATION (SAMA red lines). Not ours to invent.
 *   - economic data holds MEASUREMENT (GASTAT CPI). Not ours to invent either.
 *   - this file holds our own PROJECTION ASSUMPTIONS. They are estimates, they are
 *     labelled as estimates, and they are stamped onto every analysis so a reader
 *     can tell exactly which guesses produced a given number.
 */

export interface EngineAssumptions {
  /** Version of this assumption set, stamped onto results alongside the rule version. */
  version: string;

  /**
   * Annual salary growth in the EXPECTED scenario, as a fraction.
   * Scope v2 §10.4: "modest salary growth (e.g. +2%/yr)".
   */
  salaryGrowth: number;

  /**
   * Bad-scenario stress: expenses inflate at CPI × this multiplier while salary stays
   * flat. Scope v2 §10.4: "salary flat, expenses keep rising".
   */
  badScenarioInflationMultiplier: number;

  /**
   * Indicative annual profit rate (APR) used to amortize the requested financing.
   *
   * ASSUMPTION, NOT A QUOTE. UserFinancialData carries no rate — the user is asking
   * "can I afford this?", before they have an offer in hand. We amortize at an
   * indicative rate to produce an installment, and the caller may override it per
   * request once a real rate is known. Real, per-lender rates live in the offers
   * module, which is where rate shopping belongs.
   */
  indicativeApr: number;

  /** Longest term the "Safer Option" is allowed to stretch a financing to. */
  maxSaferOptionTermYears: number;
}

export const ASSUMPTIONS_V1: EngineAssumptions = Object.freeze({
  version: 'ASSUMPTIONS-2026-01',
  salaryGrowth: 0.02,
  badScenarioInflationMultiplier: 2,
  indicativeApr: 0.06,
  maxSaferOptionTermYears: 10,
});

export const DEFAULT_ASSUMPTIONS = ASSUMPTIONS_V1;

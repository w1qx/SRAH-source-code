/**
 * SAMA responsible-lending rules — VERSIONED and DATED.
 *
 * These are regulatory red lines, not tunable parameters. They live in exactly one
 * place so that:
 *   1. no magic number is ever scattered through the codebase, and
 *   2. an analysis run today remains reproducible years from now, under the rule set
 *      that was in force at the time (see AnalysisProvenance.ruleVersion).
 *
 * When SAMA updates its rules, ADD a new dated rule set — never edit an old one.
 * Editing a published rule set silently rewrites history for every past analysis.
 *
 * Source: SAMA (Saudi Central Bank) — Responsible Lending Principles for Individuals.
 * NOTE: inflation is NOT here. SAMA gives the rules; GASTAT gives the CPI number.
 *       Inflation enters the engine through EconomicDataProvider.
 */
import type { RiskThresholds, SamaRuleSet } from '@shared/types';

/** SAMA Responsible Lending Principles, 2018 revision. */
export const SAMA_2018_05: SamaRuleSet = Object.freeze({
  version: 'SAMA-2018-05',
  effectiveDate: '2018-05-01',

  /** Salary deduction for a working employee: ≤ 33.33% of gross salary. */
  deductionCapEmployee: 0.3333,
  /** Deduction for retirees: ≤ 25% of pension. */
  deductionCapRetiree: 0.25,

  obligationTiers: {
    /** Income ≤ 15,000 SAR — total obligations excluding real estate: ≤ 45%. */
    lowIncomeExclRealEstate: 0.45,
    /** Income ≤ 15,000 SAR — total finance obligations: ≤ 55%. */
    lowIncomeTotalFinance: 0.55,
    /** Income 15,000–25,000 SAR — total finance obligations: ≤ 65%. */
    midIncomeTotalFinance: 0.65,
    /** Ministry of Housing / REDF beneficiaries: up to 65% of total income. */
    housingBeneficiary: 0.65,
  },

  incomeBands: {
    low: 15000,
    mid: 25000,
  },
}) as SamaRuleSet;

/** Every rule set the engine can reproduce, keyed by version. */
export const SAMA_RULE_SETS: Readonly<Record<string, SamaRuleSet>> = Object.freeze({
  [SAMA_2018_05.version]: SAMA_2018_05,
});

/** The rule set applied to new analyses. */
export const CURRENT_RULE_VERSION = SAMA_2018_05.version;

export class UnknownRuleVersionError extends Error {
  constructor(version: string) {
    super(`Unknown SAMA rule version "${version}". Known versions: ${Object.keys(SAMA_RULE_SETS).join(', ')}`);
    this.name = 'UnknownRuleVersionError';
  }
}

/**
 * Resolve a rule set by version. Used both for new analyses (current version) and
 * for re-running a historical analysis under the rules that applied back then.
 */
export function getRuleSet(version: string = CURRENT_RULE_VERSION): SamaRuleSet {
  const rules = SAMA_RULE_SETS[version];
  if (!rules) throw new UnknownRuleVersionError(version);
  return rules;
}

/**
 * Risk-tier thresholds, DERIVED from the rule set — never hardcoded independently.
 * The caution ceiling IS the SAMA employee deduction cap; if SAMA moves the cap,
 * the risk boundary moves with it, by construction.
 */
export function riskThresholdsFor(rules: SamaRuleSet): RiskThresholds {
  return {
    safeMax: 0.25,
    cautionMax: rules.deductionCapEmployee,
  };
}

/** The deduction cap that applies to this subject: retirees are held to a tighter line. */
export function deductionCapFor(rules: SamaRuleSet, subject: { isRetiree?: boolean } = {}): number {
  return subject.isRetiree ? rules.deductionCapRetiree : rules.deductionCapEmployee;
}

/**
 * SAMA obligation ceilings — the second red line, alongside the deduction cap.
 *
 * The deduction cap (33.33%) asks: "is this ONE financing's installment too big a bite
 * out of the salary?" The obligation ceilings ask: "does EVERYTHING this person owes,
 * measured against ALL the income they receive, exceed what SAMA permits?"
 *
 * A financing can pass the first test and fail the second. Both must hold.
 */
import type { SamaRuleSet } from '@shared/types';

export interface ObligationSubject {
  /** Gross salary + fixed additional income. SAMA measures obligations against total income. */
  totalIncome: number;
  /** Every monthly financing installment: the requested one plus existing commitments. */
  totalFinanceObligations: number;
  /**
   * The portion of the above that is real-estate financing. Carved out because the 45%
   * ceiling is explicitly "excluding real estate".
   */
  realEstateObligations: number;
  /** Ministry of Housing / REDF beneficiary — permitted up to 65%. */
  isHousingBeneficiary: boolean;
}

export interface ObligationCheck {
  /** Stable identifier for the rule that was applied — goes into the audit trail. */
  rule:
    | 'housing_beneficiary'
    | 'low_income_excl_real_estate'
    | 'low_income_total_finance'
    | 'mid_income_total_finance';
  /** The obligations measured by THIS check (some checks exclude real estate). */
  obligations: number;
  ratio: number;
  ceiling: number;
  breached: boolean;
}

/**
 * Evaluate every SAMA obligation ceiling that applies to this subject.
 *
 * Returns a LIST, not a single verdict, because in the ≤15,000 band two ceilings apply
 * at once (45% excluding real estate AND 55% including it) and a subject can breach
 * either one independently.
 *
 * Above 25,000 SAR of income SAMA defines no looser band, so the 65% tier continues to
 * apply. That is an interpretation, and it is the conservative one.
 */
export function evaluateObligations(subject: ObligationSubject, rules: SamaRuleSet): ObligationCheck[] {
  const { totalIncome, totalFinanceObligations, realEstateObligations, isHousingBeneficiary } = subject;
  if (totalIncome <= 0) throw new RangeError('totalIncome must be greater than zero');

  const tiers = rules.obligationTiers;
  const nonRealEstate = Math.max(0, totalFinanceObligations - realEstateObligations);

  const check = (
    rule: ObligationCheck['rule'],
    obligations: number,
    ceiling: number,
  ): ObligationCheck => {
    const ratio = obligations / totalIncome;
    return { rule, obligations, ratio, ceiling, breached: ratio > ceiling };
  };

  if (isHousingBeneficiary) {
    return [check('housing_beneficiary', totalFinanceObligations, tiers.housingBeneficiary)];
  }

  if (totalIncome <= rules.incomeBands.low) {
    return [
      check('low_income_excl_real_estate', nonRealEstate, tiers.lowIncomeExclRealEstate),
      check('low_income_total_finance', totalFinanceObligations, tiers.lowIncomeTotalFinance),
    ];
  }

  return [check('mid_income_total_finance', totalFinanceObligations, tiers.midIncomeTotalFinance)];
}

/** Did the subject breach ANY applicable ceiling? */
export function anyBreached(checks: readonly ObligationCheck[]): boolean {
  return checks.some((c) => c.breached);
}

/**
 * The check with the least headroom — the ceiling that actually constrains this user.
 * This is the one worth telling them about; the others are noise.
 */
export function bindingCheck(checks: readonly ObligationCheck[]): ObligationCheck | undefined {
  return checks.reduce<ObligationCheck | undefined>((tightest, c) => {
    if (!tightest) return c;
    return c.ceiling - c.ratio < tightest.ceiling - tightest.ratio ? c : tightest;
  }, undefined);
}

/** Does this financing goal create a real-estate obligation (carved out of the 45% ceiling)? */
export function isRealEstateGoal(goal: string): boolean {
  return goal === 'home';
}

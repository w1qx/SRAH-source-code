/**
 * "A Safer Option" — Scope v2 §4.5 / §10.6.
 *
 * When the requested financing is not safe, Suraa does not just say no. It works
 * backwards from the safe ceiling to the largest financing that WOULD be safe, and
 * hands the user something actionable.
 *
 * The arithmetic runs in reverse:
 *   1. What instalment keeps the user under the safe DBR (25%)?  → maxSafeInstallment
 *   2. What principal has exactly that instalment?               → principalFromInstallment
 *
 * Preference order: keep the amount the user asked for, and stretch the term only as far
 * as needed to make it safe. People ask for a financing amount because they need a
 * specific thing; the term is the softer variable. Only when no permitted term can carry
 * the full amount do we reduce the amount itself.
 */
import type { RiskThresholds, SaferOption, UserFinancialData } from '@shared/types';
import { monthlyInstallment, principalFromInstallment } from './amortization';
import { round2, roundDownTo } from './money';
import { debtBurdenRatio } from './ratios';
import type { MessageLocale } from './messages';
import { saferOptionRationale } from './messages';

/** Suggested amounts land on a round 500 SAR so the user sees a number, not a computation. */
const AMOUNT_STEP_SAR = 500;

/**
 * Aim one percentage point BELOW the safe ceiling, not exactly at it.
 *
 * A "safer option" that lands the user at 24.98% is safe by the letter of the rule and useless by
 * its spirit — one riyal of drift and they are in the caution band, which is precisely the
 * knife-edge this feature exists to get them off. The buffer is what makes the suggestion worth
 * taking.
 */
const SAFE_TARGET_BUFFER = 0.01;

export interface SaferOptionParams {
  input: UserFinancialData;
  thresholds: RiskThresholds;
  apr: number;
  maxTermYears: number;
  locale: MessageLocale;
}

export function buildSaferOption(params: SaferOptionParams): SaferOption {
  const { input, thresholds, apr, maxTermYears, locale } = params;

  // Step 1: the instalment budget that keeps total DBR comfortably inside the safe tier. Existing
  // commitments are already spending part of that budget, so they come off the top.
  const targetDbr = Math.max(0, thresholds.safeMax - SAFE_TARGET_BUFFER);
  const safeInstalmentBudget = targetDbr * input.grossSalary - input.existingCommitments;

  if (safeInstalmentBudget <= 0) {
    return {
      suggestedAmount: 0,
      suggestedTermYears: input.termYears,
      rationale: saferOptionRationale(locale, {
        originalAmount: input.financingAmount,
        originalTermYears: input.termYears,
        suggestedAmount: 0,
        suggestedTermYears: input.termYears,
        suggestedInstallment: 0,
        suggestedDbr: debtBurdenRatio(input.existingCommitments, input.grossSalary),
        noHeadroom: true,
      }),
    };
  }

  // Step 2: the shortest term at which the FULL requested amount fits inside that budget.
  const candidateTerms = termCandidates(input.termYears, maxTermYears);
  const fittingTerm = candidateTerms.find(
    (term) => principalFromInstallment(safeInstalmentBudget, apr, term) >= input.financingAmount,
  );

  const suggestedTermYears = fittingTerm ?? maxTermYears;
  const affordableAtTerm = principalFromInstallment(safeInstalmentBudget, apr, suggestedTermYears);

  // Never suggest MORE than the user asked for — they came for a specific need, and this
  // is a safety ceiling, not an upsell.
  const suggestedAmount = fittingTerm
    ? input.financingAmount
    : Math.max(0, roundDownTo(affordableAtTerm, AMOUNT_STEP_SAR));

  const suggestedInstallment =
    suggestedAmount > 0 ? monthlyInstallment(suggestedAmount, apr, suggestedTermYears) : 0;
  const suggestedDbr = debtBurdenRatio(
    suggestedInstallment + input.existingCommitments,
    input.grossSalary,
  );

  return {
    suggestedAmount: round2(suggestedAmount),
    suggestedTermYears,
    rationale: saferOptionRationale(locale, {
      originalAmount: input.financingAmount,
      originalTermYears: input.termYears,
      suggestedAmount: round2(suggestedAmount),
      suggestedTermYears,
      suggestedInstallment: round2(suggestedInstallment),
      suggestedDbr,
      noHeadroom: false,
    }),
  };
}

/** Whole-year terms from what was requested up to the ceiling, shortest first. */
function termCandidates(requestedTermYears: number, maxTermYears: number): number[] {
  const start = Math.max(1, Math.ceil(requestedTermYears));
  const terms: number[] = [];
  for (let term = start; term <= maxTermYears; term += 1) terms.push(term);
  return terms.length > 0 ? terms : [start];
}

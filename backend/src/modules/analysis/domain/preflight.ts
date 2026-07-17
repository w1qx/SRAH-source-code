/**
 * Pre-analysis sanity checks. Scope v2 §10.6 (edge cases).
 *
 * BLOCKERS stop the analysis before it starts. Running a cheerful five-year projection
 * for someone whose expenses already exceed their income would be worse than useless —
 * §10.6 says halt and warn, so we halt and warn.
 *
 * WARNINGS travel alongside a real result and flag reduced confidence.
 */
import type { UserFinancialData } from '@shared/types';
import { totalIncome } from './ratios';
import type { MessageLocale } from './messages';
import { preflightMessage } from './messages';

export type PreflightCode =
  | 'income_below_expenses'
  | 'invalid_amount'
  | 'invalid_term'
  | 'unstable_income';

export interface PreflightIssue {
  code: PreflightCode;
  severity: 'blocker' | 'warning';
  message: string;
}

/** Tenure below this many years means the income is not yet demonstrably stable. */
const STABLE_TENURE_YEARS = 1;
/** Beyond this, a consumer financing term is not credible. */
const MAX_CREDIBLE_TERM_YEARS = 30;

export function preflight(input: UserFinancialData, locale: MessageLocale = 'ar'): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const income = totalIncome(input.grossSalary, input.additionalIncome);

  // §10.6: "Income < expenses → halt, warn before any financing."
  if (income <= input.monthlyExpenses) {
    issues.push({
      code: 'income_below_expenses',
      severity: 'blocker',
      message: preflightMessage(locale, 'income_below_expenses', {
        income,
        expenses: input.monthlyExpenses,
      }),
    });
  }

  // §10.6: "Illogical amount/term → reject, re-ask in chatbot."
  if (!Number.isFinite(input.financingAmount) || input.financingAmount <= 0) {
    issues.push({
      code: 'invalid_amount',
      severity: 'blocker',
      message: preflightMessage(locale, 'invalid_amount', {}),
    });
  }

  if (
    !Number.isFinite(input.termYears) ||
    input.termYears <= 0 ||
    input.termYears > MAX_CREDIBLE_TERM_YEARS
  ) {
    issues.push({
      code: 'invalid_term',
      severity: 'blocker',
      message: preflightMessage(locale, 'invalid_term', { maxTerm: MAX_CREDIBLE_TERM_YEARS }),
    });
  }

  // §10.6: "No stable income → clarify repayment source; flag lower accuracy."
  if (input.tenureYears < STABLE_TENURE_YEARS) {
    issues.push({
      code: 'unstable_income',
      severity: 'warning',
      message: preflightMessage(locale, 'unstable_income', {}),
    });
  }

  return issues;
}

export function blockers(issues: readonly PreflightIssue[]): PreflightIssue[] {
  return issues.filter((i) => i.severity === 'blocker');
}

export function warnings(issues: readonly PreflightIssue[]): PreflightIssue[] {
  return issues.filter((i) => i.severity === 'warning');
}

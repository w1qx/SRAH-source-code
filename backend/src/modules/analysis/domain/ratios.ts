/**
 * The two ratios the whole product turns on. Scope v2 §10.1.
 */

/**
 * DBR (Debt Burden Ratio) = total monthly financing installments ÷ gross salary.
 *
 * Returned as a FRACTION (0.246), not a percentage (24.6). The type contract says
 * fraction everywhere; percent formatting is a presentation concern.
 *
 * Note the denominator is gross salary alone — not salary + additional income. That
 * is SAMA's definition and it is deliberately the conservative one. Additional income
 * does count toward the obligation ceilings (see obligations.ts) and toward monthly
 * cash flow, but it does not soften the deduction cap.
 */
export function debtBurdenRatio(totalMonthlyInstallments: number, grossSalary: number): number {
  if (grossSalary <= 0) throw new RangeError('grossSalary must be greater than zero');
  return totalMonthlyInstallments / grossSalary;
}

/**
 * Monthly remaining = income − (total installments + essential expenses).
 *
 * This is the number the user actually feels, so it uses the cash that actually
 * arrives: gross salary PLUS fixed additional income. (In the scope's worked example
 * additional income is 0, so the two readings coincide.)
 */
export function remainingMonthly(params: {
  grossSalary: number;
  additionalIncome: number;
  totalMonthlyInstallments: number;
  monthlyExpenses: number;
}): number {
  const { grossSalary, additionalIncome, totalMonthlyInstallments, monthlyExpenses } = params;
  return grossSalary + additionalIncome - (totalMonthlyInstallments + monthlyExpenses);
}

/** Total monthly income actually received. Denominator for SAMA's obligation ceilings. */
export function totalIncome(grossSalary: number, additionalIncome: number): number {
  return grossSalary + additionalIncome;
}

/** Compound an annual rate over `years - 1` elapsed years (year 1 = today, no growth yet). */
export function compoundToYear(base: number, annualRate: number, year: number): number {
  return base * Math.pow(1 + annualRate, year - 1);
}

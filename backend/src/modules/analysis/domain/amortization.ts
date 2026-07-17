/**
 * Amortization math. Pure, synchronous, framework-free.
 *
 *   Installment = P × (r × (1+r)^n) ÷ ((1+r)^n − 1)
 *
 * where P = principal, r = MONTHLY profit rate (annual ÷ 12), n = term in MONTHS.
 */

/** Convert an annual rate (fraction) to the monthly rate used by the formula. */
export function monthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Convert a term in years to the number of monthly payments. */
export function termMonths(termYears: number): number {
  return Math.round(termYears * 12);
}

/**
 * Fixed monthly installment for an amortizing financing.
 *
 * The r = 0 case is not a rounding accident — an interest-free / zero-profit
 * financing is a real product, and the closed form divides by zero there.
 */
export function monthlyInstallment(principal: number, annualRate: number, termYears: number): number {
  const n = termMonths(termYears);
  if (n <= 0) throw new RangeError('termYears must be greater than zero');
  if (principal < 0) throw new RangeError('principal must not be negative');
  if (principal === 0) return 0;

  const r = monthlyRate(annualRate);
  if (r === 0) return principal / n;

  const growth = Math.pow(1 + r, n);
  return (principal * (r * growth)) / (growth - 1);
}

/**
 * The inverse: the largest principal whose installment is exactly `installment`.
 * This is what turns "you can afford 3,000/month" into "so borrow at most X" —
 * the arithmetic behind the Safer Option.
 */
export function principalFromInstallment(installment: number, annualRate: number, termYears: number): number {
  const n = termMonths(termYears);
  if (n <= 0) throw new RangeError('termYears must be greater than zero');
  if (installment <= 0) return 0;

  const r = monthlyRate(annualRate);
  if (r === 0) return installment * n;

  const growth = Math.pow(1 + r, n);
  return (installment * (growth - 1)) / (r * growth);
}

/**
 * Outstanding debt after `monthsElapsed` payments.
 *
 *   B(m) = P × ((1+r)^n − (1+r)^m) ÷ ((1+r)^n − 1)
 */
export function remainingBalance(
  principal: number,
  annualRate: number,
  termYears: number,
  monthsElapsed: number,
): number {
  const n = termMonths(termYears);
  if (n <= 0) throw new RangeError('termYears must be greater than zero');
  if (monthsElapsed <= 0) return principal;
  if (monthsElapsed >= n) return 0;

  const r = monthlyRate(annualRate);
  if (r === 0) return principal * (1 - monthsElapsed / n);

  const growthN = Math.pow(1 + r, n);
  const growthM = Math.pow(1 + r, monthsElapsed);
  const balance = (principal * (growthN - growthM)) / (growthN - 1);
  return Math.max(0, balance);
}

/** Total cost of financing over the full term (everything paid, minus what was borrowed). */
export function totalAdditionalCost(principal: number, annualRate: number, termYears: number): number {
  const installment = monthlyInstallment(principal, annualRate, termYears);
  return installment * termMonths(termYears) - principal;
}

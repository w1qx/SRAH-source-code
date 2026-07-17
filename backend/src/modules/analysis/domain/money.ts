/**
 * Rounding, applied at the EDGE of the engine only.
 *
 * Every intermediate figure stays at full float precision; we round once, on the way
 * out. Rounding mid-computation and then compounding the rounded value over a 5-year
 * term is how a financial engine quietly drifts away from the truth.
 */

/** Money, to halalas. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Ratios (DBR, rates), to 4 decimals — 0.2458 is 24.58%. */
export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Round DOWN to a human-friendly step. A "safer" suggestion of 152,588 SAR is arithmetic;
 * 152,500 SAR is a number a person can act on. Always down, never up: rounding a safety
 * ceiling upward would hand back the margin we just calculated.
 */
export function roundDownTo(value: number, step: number): number {
  if (step <= 0) throw new RangeError('step must be greater than zero');
  return Math.floor(value / step) * step;
}

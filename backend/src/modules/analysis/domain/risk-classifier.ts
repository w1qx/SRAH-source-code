/**
 * Risk classification. Scope v2 §10.3.
 *
 *   DBR < 25%            → "safe"     — comfortable margin, can absorb a surprise
 *   25% ≤ DBR ≤ 33.33%   → "caution"  — within SAMA's limit, but tight
 *   DBR > 33.33%         → "high"     — past the SAMA red line
 *
 * Two conditions ESCALATE straight to "high" regardless of DBR:
 *   - a breached SAMA obligation ceiling (§10.3: "or exceeding the obligation ceiling")
 *   - negative monthly cash flow. A user whose money runs out every month is not "safe"
 *     just because the ratio flatters them; the DBR alone cannot see this, because it
 *     never looks at expenses.
 */
import type { RiskThresholds, RiskTier } from '@shared/types';

export interface RiskContext {
  dbr: number;
  /** Any applicable SAMA obligation ceiling breached. */
  obligationBreached: boolean;
  /**
   * The SAMA deduction cap for THIS subject is breached. Usually redundant with a
   * high DBR — except for retirees, whose cap is 25%, below the 33.33% tier boundary.
   * For them the "caution" band collapses, and only this flag can see it.
   */
  deductionCapBreached: boolean;
  /** Nothing left after installments and essential expenses. */
  cashFlowNegative: boolean;
}

/** Pure DBR → tier, with no escalation. */
export function classifyDbr(dbr: number, thresholds: RiskThresholds): RiskTier {
  if (dbr < thresholds.safeMax) return 'safe';
  if (dbr <= thresholds.cautionMax) return 'caution';
  return 'high';
}

/** The full picture: DBR tier, escalated by a breached red line or cash-flow failure. */
export function classifyRisk(ctx: RiskContext, thresholds: RiskThresholds): RiskTier {
  if (ctx.obligationBreached || ctx.deductionCapBreached || ctx.cashFlowNegative) return 'high';
  return classifyDbr(ctx.dbr, thresholds);
}

const SEVERITY: Record<RiskTier, number> = { safe: 0, caution: 1, high: 2 };

/** The worst tier in a set — this is what drives top-level messaging. */
export function worstTier(tiers: readonly RiskTier[]): RiskTier {
  return tiers.reduce<RiskTier>(
    (worst, tier) => (SEVERITY[tier] > SEVERITY[worst] ? tier : worst),
    'safe',
  );
}

/** True when the tier warrants offering a Safer Option. */
export function needsSaferOption(tier: RiskTier): boolean {
  return tier === 'high' || tier === 'caution';
}

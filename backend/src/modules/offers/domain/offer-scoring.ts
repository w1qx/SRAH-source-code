/**
 * Offer comparison. Pure — no lenders, no database, no I/O.
 *
 * Scope v2 §4.6: offers are compared across three tabs — Best Match, Lowest Cost, Lowest
 * Instalment. The three are genuinely different questions, and a user who does not see the
 * difference is exactly the user Suraa exists for:
 *
 *   Lowest instalment  — easiest month. Usually the longest term, and therefore the MOST
 *                        expensive financing overall. This is the trap.
 *   Lowest cost        — least money paid in total. Usually the shortest term, and the tightest
 *                        month.
 *   Best match         — the cheapest offer that still leaves the user in the SAFE risk tier.
 *                        Safety first, then cost. An offer that puts them past SAMA's line is
 *                        never a "best match", however cheap it looks.
 */
import type { FinancingOffer, OfferCategory, RiskThresholds, UserFinancialData } from '@shared/types';
import { debtBurdenRatio } from '@/modules/analysis/domain/ratios';
import { classifyDbr } from '@/modules/analysis/domain/risk-classifier';

/** An offer before it has been scored — what a lender (or the mock) actually quotes. */
export interface QuotedOffer {
  id: string;
  provider: string;
  apr: number;
  termYears: number;
  monthlyInstallment: number;
  totalAdditionalCost: number;
}

/** How safe is this specific offer for this specific person? */
export function classifyOfferSafety(
  offer: Pick<QuotedOffer, 'monthlyInstallment'>,
  input: UserFinancialData,
  thresholds: RiskThresholds,
): FinancingOffer['safety'] {
  const dbr = debtBurdenRatio(
    offer.monthlyInstallment + input.existingCommitments,
    input.grossSalary,
  );
  return classifyDbr(dbr, thresholds);
}

/**
 * Sort every offer into the tabs it belongs on. An offer can appear on more than one — and when
 * the same offer is BOTH the cheapest and the safest, that is worth the user seeing.
 */
export function assignCategories(
  quotes: readonly QuotedOffer[],
  input: UserFinancialData,
  thresholds: RiskThresholds,
): FinancingOffer[] {
  if (quotes.length === 0) return [];

  const cheapest = minBy(quotes, (o) => o.totalAdditionalCost);
  const lightest = minBy(quotes, (o) => o.monthlyInstallment);

  // Best match: among offers that keep the user SAFE, the one that costs least. If nothing is
  // safe, we do not promote a "best" — the honest answer is that none of these is a good match,
  // and the Safer Option from the analysis is what the user actually needs.
  const safeOffers = quotes.filter(
    (offer) => classifyOfferSafety(offer, input, thresholds) === 'safe',
  );
  const bestMatch = safeOffers.length > 0 ? minBy(safeOffers, (o) => o.totalAdditionalCost) : undefined;

  return quotes.map((quote) => {
    const categories: OfferCategory[] = [];
    if (bestMatch && quote.id === bestMatch.id) categories.push('best_match');
    if (cheapest && quote.id === cheapest.id) categories.push('lowest_cost');
    if (lightest && quote.id === lightest.id) categories.push('lowest_installment');

    return {
      id: quote.id,
      provider: quote.provider,
      monthlyInstallment: quote.monthlyInstallment,
      totalAdditionalCost: quote.totalAdditionalCost,
      apr: quote.apr,
      termYears: quote.termYears,
      safety: classifyOfferSafety(quote, input, thresholds),
      categories,
    };
  });
}

function minBy<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>(
    (best, item) => (best === undefined || score(item) < score(best) ? item : best),
    undefined,
  );
}

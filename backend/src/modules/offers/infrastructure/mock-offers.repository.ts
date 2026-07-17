import type { FinancingOffer, OffersRepository, SamaRuleSet, UserFinancialData } from '@shared/types';
import { monthlyInstallment, totalAdditionalCost } from '@/modules/analysis/domain/amortization';
import { round2, round4 } from '@/modules/analysis/domain/money';
import { riskThresholdsFor } from '@/modules/analysis/domain/sama-rules';
import { assignCategories } from '../domain/offer-scoring';
import type { QuotedOffer } from '../domain/offer-scoring';

/**
 * Illustrative sample offers. NOT real bank offers (Scope v2 §4.6, §15).
 *
 * The provider names are generic on purpose: putting a real Saudi bank's name next to an APR we
 * invented would be a false representation of that bank's pricing, and Suraa's entire claim is
 * that it is neutral and honest.
 *
 * The rate spread and the term ladder are what make the comparison worth showing: the longest
 * term always has the lightest instalment AND the highest total cost, which is precisely the
 * trade-off users get wrong.
 */
interface SampleLender {
  id: string;
  provider: string;
  apr: number;
  /** Terms this lender will write, in years. */
  terms: number[];
}

const SAMPLE_LENDERS: readonly SampleLender[] = Object.freeze([
  { id: 'sample-a', provider: 'Sample Bank A', apr: 0.049, terms: [3, 5] },
  { id: 'sample-b', provider: 'Sample Bank B', apr: 0.057, terms: [5, 7] },
  { id: 'sample-c', provider: 'Sample Finance Co.', apr: 0.065, terms: [5, 7, 10] },
]);

export class MockOffersRepository implements OffersRepository {
  constructor(private readonly rules: SamaRuleSet) {}

  async getOffers(input: UserFinancialData): Promise<FinancingOffer[]> {
    const thresholds = riskThresholdsFor(this.rules);

    const quotes: QuotedOffer[] = SAMPLE_LENDERS.flatMap((lender) =>
      lender.terms
        // Never quote a term shorter than the user asked for — that is not the product they came
        // for, and its instalment would be misleadingly high next to the others.
        .filter((term) => term >= input.termYears)
        .map((term) => ({
          id: `${lender.id}-${term}y`,
          provider: lender.provider,
          apr: round4(lender.apr),
          termYears: term,
          monthlyInstallment: round2(monthlyInstallment(input.financingAmount, lender.apr, term)),
          totalAdditionalCost: round2(totalAdditionalCost(input.financingAmount, lender.apr, term)),
        })),
    );

    return assignCategories(quotes, input, thresholds);
  }
}

/**
 * The real adapter, behind the `offers_real_lenders` flag.
 *
 * It exists so the swap is a one-line change in the container rather than a new integration
 * project. It throws rather than returning a plausible-looking fake — an offers screen that
 * silently serves invented rates while claiming to be live is a mis-selling incident.
 */
export class BankApiOffersRepository implements OffersRepository {
  async getOffers(_input: UserFinancialData): Promise<FinancingOffer[]> {
    throw new Error(
      'Real lender offers are not yet integrated. The `offers_real_lenders` feature flag must stay off until this adapter is implemented.',
    );
  }
}

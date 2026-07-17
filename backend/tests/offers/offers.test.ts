import { MockOffersRepository } from '@/modules/offers/infrastructure/mock-offers.repository';
import { OffersService } from '@/modules/offers/application/offers.service';
import { riskThresholdsFor, SAMA_2018_05 } from '@/modules/analysis/domain';
import { assignCategories } from '@/modules/offers/domain/offer-scoring';
import { FeatureFlagsService } from '@/modules/feature-flags/application/feature-flags.service';
import { InMemoryFeatureFlagsRepository } from '@/modules/feature-flags/infrastructure/feature-flags.repository';
import { aUserFinancialData, FakeAnalysisRepository } from '../fakes';

const thresholds = riskThresholdsFor(SAMA_2018_05);
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('offer comparison', () => {
  const repository = new MockOffersRepository(SAMA_2018_05);

  it('quotes every sample lender at or above the term the user asked for', async () => {
    const offers = await repository.getOffers(aUserFinancialData({ termYears: 5 }));

    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.termYears >= 5)).toBe(true);
  });

  /**
   * The trade-off the whole offers screen exists to expose: the offer that is easiest each month
   * is the one that costs the most in the end. A user who cannot see that is exactly the user
   * this product is for.
   */
  it('shows that the lightest instalment is NOT the cheapest financing', async () => {
    const offers = await repository.getOffers(aUserFinancialData({ termYears: 3 }));

    const lightest = offers.find((o) => o.categories.includes('lowest_installment'))!;
    const cheapest = offers.find((o) => o.categories.includes('lowest_cost'))!;

    expect(lightest.id).not.toBe(cheapest.id);
    expect(lightest.monthlyInstallment).toBeLessThan(cheapest.monthlyInstallment);
    expect(lightest.totalAdditionalCost).toBeGreaterThan(cheapest.totalAdditionalCost);
    expect(lightest.termYears).toBeGreaterThan(cheapest.termYears);
  });

  it('classifies each offer\'s safety against the SAMA thresholds, for THIS user', async () => {
    const offers = await repository.getOffers(
      aUserFinancialData({ financingAmount: 300_000, grossSalary: 12_000, termYears: 5 }),
    );

    // A 300k financing on a 12k salary is not safe at ANY term a lender will write.
    expect(offers.some((o) => o.safety === 'safe')).toBe(false);
    expect(offers.some((o) => o.safety === 'high')).toBe(true);

    // And here is the trade the user is really being offered: the longest term is the only one
    // that drags the ratio back under SAMA's cap — and it is the one that costs the most.
    const shortest = offers.reduce((a, b) => (a.termYears <= b.termYears ? a : b));
    const longest = offers.reduce((a, b) => (a.termYears >= b.termYears ? a : b));

    expect(shortest.safety).toBe('high');
    expect(longest.safety).toBe('caution');
    expect(longest.totalAdditionalCost).toBeGreaterThan(shortest.totalAdditionalCost);
  });

  it('only ever calls a SAFE offer the "best match" — and stays silent when none is safe', () => {
    const input = aUserFinancialData({ grossSalary: 12_000, existingCommitments: 0 });

    const unsafeOnly = assignCategories(
      [
        {
          id: 'a',
          provider: 'A',
          apr: 0.05,
          termYears: 5,
          monthlyInstallment: 5_000, // ~42% DBR
          totalAdditionalCost: 40_000,
        },
      ],
      input,
      thresholds,
    );

    // Cheapest and lightest by default (it is the only one), but never "best match".
    expect(unsafeOnly[0]!.safety).toBe('high');
    expect(unsafeOnly[0]!.categories).not.toContain('best_match');
    expect(unsafeOnly[0]!.categories).toEqual(
      expect.arrayContaining(['lowest_cost', 'lowest_installment']),
    );
  });

  it('picks the cheapest SAFE offer as the best match — safety first, then cost', () => {
    const input = aUserFinancialData({ grossSalary: 12_000 });

    const offers = assignCategories(
      [
        // Cheapest overall, but it breaks the SAMA line.
        { id: 'cheap-unsafe', provider: 'A', apr: 0.04, termYears: 3, monthlyInstallment: 4_500, totalAdditionalCost: 10_000 },
        // Safe, and the cheaper of the two safe options.
        { id: 'safe-cheaper', provider: 'B', apr: 0.05, termYears: 6, monthlyInstallment: 2_500, totalAdditionalCost: 25_000 },
        // Also safe, but dearer.
        { id: 'safe-dearer', provider: 'C', apr: 0.07, termYears: 8, monthlyInstallment: 2_400, totalAdditionalCost: 40_000 },
      ],
      input,
      thresholds,
    );

    const bestMatch = offers.find((o) => o.categories.includes('best_match'))!;
    expect(bestMatch.id).toBe('safe-cheaper');
    expect(bestMatch.safety).toBe('safe');

    // The cheapest offer overall still gets its own tab — we do not hide it, we label it.
    const cheapest = offers.find((o) => o.categories.includes('lowest_cost'))!;
    expect(cheapest.id).toBe('cheap-unsafe');
    expect(cheapest.safety).toBe('high');
  });
});

describe('OffersService', () => {
  it('labels the sample offers as illustrative while the real-lender flag is off', async () => {
    const service = new OffersService(
      new MockOffersRepository(SAMA_2018_05),
      new FakeAnalysisRepository(),
      new FeatureFlagsService(new InMemoryFeatureFlagsRepository()),
    );

    const result = await service.getOffers({ userId: USER_ID, input: aUserFinancialData() });

    expect(result.illustrative).toBe(true);
    expect(result.disclaimer).toContain('not real offers');
    expect(result.offers.length).toBeGreaterThan(0);
  });
});

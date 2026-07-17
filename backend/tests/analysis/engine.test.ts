/**
 * The rest of the engine: amortization, obligation ceilings, risk escalation, the Safer Option,
 * and the §10.6 edge cases.
 */
import type { EconomicDataPoint } from '@shared/types';
import {
  analyze,
  anyBreached,
  blockers,
  buildSaferOption,
  classifyRisk,
  evaluateObligations,
  monthlyInstallment,
  preflight,
  principalFromInstallment,
  remainingBalance,
  riskThresholdsFor,
  roundDownTo,
  SAMA_2018_05,
  totalAdditionalCost,
  warnings,
  worstTier,
} from '@/modules/analysis/domain';
import { aUserFinancialData } from '../fakes';

const thresholds = riskThresholdsFor(SAMA_2018_05);
const CPI: EconomicDataPoint = { indicator: 'cpi', value: 0.02, source: 'GASTAT', period: '2026-05' };

describe('amortization', () => {
  it('computes the instalment from P × (r(1+r)^n) ÷ ((1+r)^n − 1)', () => {
    // 100,000 at 6% over 5 years. Verified against the closed form independently.
    expect(monthlyInstallment(100_000, 0.06, 5)).toBeCloseTo(1933.28, 2);
  });

  it('handles a zero-profit financing without dividing by zero', () => {
    expect(monthlyInstallment(120_000, 0, 10)).toBeCloseTo(1_000, 6);
    expect(remainingBalance(120_000, 0, 10, 60)).toBeCloseTo(60_000, 6);
  });

  it('inverts cleanly: principal → instalment → principal', () => {
    const principal = principalFromInstallment(2_950, 0.06, 5);
    expect(monthlyInstallment(principal, 0.06, 5)).toBeCloseTo(2_950, 6);
  });

  it('amortizes the balance to zero at the end of the term, and not before', () => {
    expect(remainingBalance(100_000, 0.06, 5, 0)).toBe(100_000);
    expect(remainingBalance(100_000, 0.06, 5, 59)).toBeGreaterThan(0);
    expect(remainingBalance(100_000, 0.06, 5, 60)).toBe(0);
  });

  it('charges more in total the longer the term runs', () => {
    const short = totalAdditionalCost(100_000, 0.06, 3);
    const long = totalAdditionalCost(100_000, 0.06, 10);
    expect(long).toBeGreaterThan(short);
  });

  it('refuses a nonsensical term rather than returning a nonsensical number', () => {
    expect(() => monthlyInstallment(100_000, 0.06, 0)).toThrow(RangeError);
  });
});

describe('SAMA obligation ceilings', () => {
  it('applies BOTH low-income ceilings at once: 45% excluding real estate, 55% including it', () => {
    const checks = evaluateObligations(
      {
        totalIncome: 10_000,
        totalFinanceObligations: 5_000,
        realEstateObligations: 0,
        isHousingBeneficiary: false,
      },
      SAMA_2018_05,
    );

    expect(checks.map((c) => c.rule)).toEqual([
      'low_income_excl_real_estate',
      'low_income_total_finance',
    ]);
    // 50% of income: past the 45% non-real-estate line, still inside the 55% total line.
    expect(checks[0]!.breached).toBe(true);
    expect(checks[1]!.breached).toBe(false);
    expect(anyBreached(checks)).toBe(true);
  });

  it('excludes real-estate financing from the 45% ceiling, as SAMA specifies', () => {
    const checks = evaluateObligations(
      {
        totalIncome: 10_000,
        totalFinanceObligations: 5_000,
        realEstateObligations: 5_000, // all of it is a mortgage
        isHousingBeneficiary: false,
      },
      SAMA_2018_05,
    );

    // Nothing is left once the mortgage is carved out, so the 45% check is satisfied.
    expect(checks[0]!.breached).toBe(false);
    expect(checks[1]!.breached).toBe(false);
  });

  it('applies the 65% ceiling in the 15,000–25,000 income band', () => {
    const checks = evaluateObligations(
      {
        totalIncome: 20_000,
        totalFinanceObligations: 13_500, // 67.5%
        realEstateObligations: 0,
        isHousingBeneficiary: false,
      },
      SAMA_2018_05,
    );

    expect(checks).toHaveLength(1);
    expect(checks[0]!.rule).toBe('mid_income_total_finance');
    expect(checks[0]!.ceiling).toBe(0.65);
    expect(checks[0]!.breached).toBe(true);
  });

  it('permits REDF/housing beneficiaries up to 65%', () => {
    const checks = evaluateObligations(
      {
        totalIncome: 10_000,
        totalFinanceObligations: 6_400, // 64% — would breach both low-income ceilings
        realEstateObligations: 6_400,
        isHousingBeneficiary: true,
      },
      SAMA_2018_05,
    );

    expect(checks[0]!.rule).toBe('housing_beneficiary');
    expect(checks[0]!.breached).toBe(false);
  });
});

describe('risk classification', () => {
  it('draws the three tiers at 25% and 33.33%', () => {
    const base = { obligationBreached: false, deductionCapBreached: false, cashFlowNegative: false };

    expect(classifyRisk({ ...base, dbr: 0.2499 }, thresholds)).toBe('safe');
    expect(classifyRisk({ ...base, dbr: 0.25 }, thresholds)).toBe('caution');
    expect(classifyRisk({ ...base, dbr: 0.3333 }, thresholds)).toBe('caution');
    expect(classifyRisk({ ...base, dbr: 0.3334 }, thresholds)).toBe('high');
  });

  it('escalates to high risk when a SAMA obligation ceiling is breached, however low the DBR', () => {
    expect(
      classifyRisk(
        { dbr: 0.1, obligationBreached: true, deductionCapBreached: false, cashFlowNegative: false },
        thresholds,
      ),
    ).toBe('high');
  });

  it('escalates to high risk when the month ends in the red, however low the DBR', () => {
    // The DBR cannot see this: it never looks at expenses.
    expect(
      classifyRisk(
        { dbr: 0.1, obligationBreached: false, deductionCapBreached: false, cashFlowNegative: true },
        thresholds,
      ),
    ).toBe('high');
  });

  it('holds a retiree to the tighter 25% cap, where the caution band collapses', () => {
    // 26% of a pension is past SAMA's retiree line, even though it is inside the 33.33% employee
    // band that would otherwise read as mere "caution".
    expect(
      classifyRisk(
        { dbr: 0.26, obligationBreached: false, deductionCapBreached: true, cashFlowNegative: false },
        thresholds,
      ),
    ).toBe('high');
  });

  it('takes the worst tier across the term', () => {
    expect(worstTier(['safe', 'caution', 'safe'])).toBe('caution');
    expect(worstTier(['safe', 'high', 'caution'])).toBe('high');
    expect(worstTier([])).toBe('safe');
  });
});

describe('the Safer Option', () => {
  it('offers a safer alternative whenever the request is high risk (§10.6)', () => {
    // 300,000 over 5 years at 6% ≈ 5,800/month on a 12,000 salary → ~48% DBR.
    const result = analyze({
      input: aUserFinancialData({ financingAmount: 300_000, termYears: 5 }),
      economic: CPI,
      computedAt: '2026-05-01T00:00:00.000Z',
      locale: 'en',
    });

    expect(result.overallRisk).toBe('high');
    expect(result.requestedDbr).toBeGreaterThan(0.3333);
    expect(result.saferOption).toBeDefined();
  });

  it('works backwards from the safe ceiling to an instalment the user can actually carry', () => {
    const input = aUserFinancialData({ financingAmount: 300_000, termYears: 5 });

    const safer = buildSaferOption({
      input,
      thresholds,
      apr: 0.06,
      maxTermYears: 10,
      locale: 'en',
    });

    // Whatever it suggests must land inside the safe tier — that is the entire promise.
    const installment = monthlyInstallment(
      safer.suggestedAmount,
      0.06,
      safer.suggestedTermYears,
    );
    const dbr = (installment + input.existingCommitments) / input.grossSalary;

    expect(dbr).toBeLessThan(thresholds.safeMax);
    expect(safer.suggestedAmount).toBeGreaterThan(0);
    expect(safer.rationale).toContain('safe range');
  });

  it('leaves real headroom below the line, not a suggestion that sits on it', () => {
    // A suggestion landing at 24.98% is "safe" only until the first riyal of drift. The Safer
    // Option must actually create margin, so it aims a full point under the ceiling.
    const input = aUserFinancialData({ financingAmount: 400_000, termYears: 5 });
    const safer = buildSaferOption({ input, thresholds, apr: 0.06, maxTermYears: 10, locale: 'en' });

    const installment = monthlyInstallment(safer.suggestedAmount, 0.06, safer.suggestedTermYears);
    const dbr = installment / input.grossSalary;

    expect(dbr).toBeLessThanOrEqual(thresholds.safeMax - 0.01);
    // And the sentence the user reads must not contradict itself by rounding up onto the line.
    expect(safer.rationale).not.toContain('25.0%');
  });

  it('prefers stretching the term over shrinking the amount, when a permitted term can carry it', () => {
    // Comfortably affordable over a longer term, so the user keeps the full amount they asked for.
    const input = aUserFinancialData({ financingAmount: 200_000, termYears: 4, grossSalary: 12_000 });

    const safer = buildSaferOption({ input, thresholds, apr: 0.06, maxTermYears: 10, locale: 'en' });

    expect(safer.suggestedAmount).toBe(200_000);
    expect(safer.suggestedTermYears).toBeGreaterThan(4);
    expect(safer.rationale).toContain('longer term increases the total cost');
  });

  it('never suggests more than the user asked for — this is a ceiling, not an upsell', () => {
    const input = aUserFinancialData({ financingAmount: 50_000, termYears: 5 });
    const safer = buildSaferOption({ input, thresholds, apr: 0.06, maxTermYears: 10, locale: 'en' });

    expect(safer.suggestedAmount).toBeLessThanOrEqual(50_000);
  });

  it('says so plainly when existing commitments leave no room at all', () => {
    // Commitments already eat the entire 25% safe budget.
    const input = aUserFinancialData({ grossSalary: 10_000, existingCommitments: 3_000 });
    const safer = buildSaferOption({ input, thresholds, apr: 0.06, maxTermYears: 10, locale: 'en' });

    expect(safer.suggestedAmount).toBe(0);
    expect(safer.rationale).toContain('existing commitments');
  });

  it('rounds a suggested amount DOWN, never up — rounding up would give back the margin', () => {
    expect(roundDownTo(152_588, 500)).toBe(152_500);
  });
});

describe('preflight — the §10.6 edge cases', () => {
  it('halts before analysing anyone whose expenses already exceed their income', () => {
    const issues = preflight(
      aUserFinancialData({ grossSalary: 5_000, additionalIncome: 0, monthlyExpenses: 6_000 }),
      'en',
    );

    const blocking = blockers(issues);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]!.code).toBe('income_below_expenses');
  });

  it('counts additional income before declaring a shortfall', () => {
    const issues = preflight(
      aUserFinancialData({ grossSalary: 5_000, additionalIncome: 3_000, monthlyExpenses: 6_000 }),
      'en',
    );

    expect(blockers(issues)).toHaveLength(0);
  });

  it('warns, but does not block, when the income is not yet demonstrably stable', () => {
    const issues = preflight(aUserFinancialData({ tenureYears: 0 }), 'en');

    expect(blockers(issues)).toHaveLength(0);
    expect(warnings(issues).map((w) => w.code)).toContain('unstable_income');
  });

  it('rejects an illogical amount or term', () => {
    expect(
      blockers(preflight(aUserFinancialData({ financingAmount: 0 }), 'en')).map((b) => b.code),
    ).toContain('invalid_amount');

    expect(
      blockers(preflight(aUserFinancialData({ termYears: 99 }), 'en')).map((b) => b.code),
    ).toContain('invalid_term');
  });

  it('lets a healthy application through with nothing to say', () => {
    expect(preflight(aUserFinancialData(), 'en')).toHaveLength(0);
  });
});

describe('cash-flow failure in the bad scenario', () => {
  it('marks a year as high risk once the money runs out, even on a modest DBR', () => {
    // A modest instalment, but expenses that already consume nearly everything. As bad-scenario
    // inflation compounds, the month goes negative — and a negative month is not "safe".
    const result = analyze({
      input: aUserFinancialData({
        financingAmount: 60_000,
        termYears: 5,
        grossSalary: 12_000,
        monthlyExpenses: 10_500,
      }),
      economic: CPI,
      computedAt: '2026-05-01T00:00:00.000Z',
      locale: 'en',
    });

    const bad = result.scenarios.find((s) => s.type === 'bad')!;
    const finalYear = bad.years[bad.years.length - 1]!;

    expect(finalYear.dbr).toBeLessThan(0.25); // The ratio still looks fine...
    expect(finalYear.remainingMonthly).toBeLessThan(0); // ...but the month does not.
    expect(finalYear.riskTier).toBe('high');
    expect(result.overallRisk).toBe('high');
  });
});

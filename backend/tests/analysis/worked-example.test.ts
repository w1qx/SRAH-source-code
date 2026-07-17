/**
 * The worked example from Scope v2 §10.5. This is the acceptance test for the whole
 * engine — if this drifts, the product is wrong, whatever else passes.
 *
 *   Gross salary 12,000 · expenses 5,000 · no commitments · instalment 2,950
 *     → DBR = 24.6% → "Safe"
 *     → monthly remaining = 4,050 SAR
 *
 *   Bad scenario, end of term: expenses rise to 6,200 with salary flat
 *     → remaining shrinks to 2,850
 */
import type { EconomicDataPoint, UserFinancialData } from '@shared/types';
import {
  analyze,
  classifyDbr,
  debtBurdenRatio,
  monthlyInstallment,
  principalFromInstallment,
  remainingMonthly,
  riskThresholdsFor,
  getRuleSet,
  SAMA_2018_05,
} from '@/modules/analysis/domain';

const GASTAT_CPI: EconomicDataPoint = {
  indicator: 'cpi',
  value: 0.02,
  source: 'GASTAT',
  period: '2026-05',
};

const thresholds = riskThresholdsFor(SAMA_2018_05);

describe('Scope §10.5 — the worked example', () => {
  const GROSS_SALARY = 12_000;
  const MONTHLY_EXPENSES = 5_000;
  const EXISTING_COMMITMENTS = 0;
  const INSTALLMENT = 2_950;

  describe('the ratios, straight from the scope figures', () => {
    it('puts DBR at 24.6% of gross salary', () => {
      const dbr = debtBurdenRatio(INSTALLMENT + EXISTING_COMMITMENTS, GROSS_SALARY);

      expect(dbr).toBeCloseTo(0.2458, 4);
      expect(Number((dbr * 100).toFixed(1))).toBe(24.6);
    });

    it('classifies 24.6% as "safe" — it sits below the 25% line', () => {
      const dbr = debtBurdenRatio(INSTALLMENT, GROSS_SALARY);

      expect(dbr).toBeLessThan(thresholds.safeMax);
      expect(classifyDbr(dbr, thresholds)).toBe('safe');
    });

    it('leaves 4,050 SAR a month', () => {
      const remaining = remainingMonthly({
        grossSalary: GROSS_SALARY,
        additionalIncome: 0,
        totalMonthlyInstallments: INSTALLMENT,
        monthlyExpenses: MONTHLY_EXPENSES,
      });

      expect(remaining).toBe(4_050);
    });

    it('shrinks to 2,850 a month when expenses reach 6,200 with salary flat', () => {
      const remaining = remainingMonthly({
        grossSalary: GROSS_SALARY,
        additionalIncome: 0,
        totalMonthlyInstallments: INSTALLMENT,
        monthlyExpenses: 6_200,
      });

      expect(remaining).toBe(2_850);
    });
  });

  describe('end to end through analyze()', () => {
    // The scope hands us the instalment (2,950) rather than the principal, so we invert
    // the amortization to find the financing that produces exactly that instalment at
    // the engine's indicative rate. This proves the whole pipeline on the scope's numbers,
    // not just the ratio helpers.
    const APR = 0.06;
    const TERM_YEARS = 5;
    const financingAmount = principalFromInstallment(INSTALLMENT, APR, TERM_YEARS);

    const input: UserFinancialData = {
      goal: 'car',
      financingAmount,
      termYears: TERM_YEARS,
      grossSalary: GROSS_SALARY,
      additionalIncome: 0,
      existingCommitments: EXISTING_COMMITMENTS,
      monthlyExpenses: MONTHLY_EXPENSES,
      familyStatus: 'married',
      savings: 20_000,
      employmentSector: 'private',
      tenureYears: 4,
    };

    const result = analyze({
      input,
      economic: GASTAT_CPI,
      computedAt: '2026-05-01T00:00:00.000Z',
      locale: 'en',
    });

    const baseline = result.scenarios.find((s) => s.type === 'baseline')!;
    const yearOne = baseline.years[0]!;

    it('derives the 2,950 instalment from the amortization formula', () => {
      expect(monthlyInstallment(financingAmount, APR, TERM_YEARS)).toBeCloseTo(2_950, 6);
      expect(yearOne.installment).toBe(2_950);
    });

    it('reports the requested DBR as 24.6%', () => {
      expect(result.requestedDbr).toBeCloseTo(0.2458, 4);
      expect(yearOne.dbr).toBeCloseTo(0.2458, 4);
    });

    it('classifies year one as "safe"', () => {
      expect(yearOne.riskTier).toBe('safe');
    });

    it('leaves 4,050 SAR a month in year one', () => {
      expect(yearOne.remainingMonthly).toBe(4_050);
    });

    it('holds the overall risk at "safe" across all three scenarios', () => {
      expect(result.overallRisk).toBe('safe');
      expect(result.saferOption).toBeUndefined();
    });

    it('projects all three scenarios over the full five-year term', () => {
      expect(result.scenarios.map((s) => s.type)).toEqual(['baseline', 'expected', 'bad']);
      for (const scenario of result.scenarios) {
        expect(scenario.years).toHaveLength(TERM_YEARS);
        expect(scenario.resultSummary).not.toHaveLength(0);
      }
    });

    it('pays the financing off exactly at the end of the term', () => {
      expect(baseline.years[TERM_YEARS - 1]!.remainingDebt).toBe(0);
      expect(baseline.years[0]!.remainingDebt).toBeGreaterThan(0);
    });

    it('squeezes the bad scenario harder than the baseline, on a frozen instalment', () => {
      const bad = result.scenarios.find((s) => s.type === 'bad')!;
      const badFinal = bad.years[TERM_YEARS - 1]!;

      // Salary is flat in the bad scenario, so the instalment and DBR do not move —
      // the damage shows up entirely in what is left at the end of the month.
      expect(badFinal.installment).toBe(2_950);
      expect(badFinal.dbr).toBeCloseTo(yearOne.dbr, 4);
      expect(badFinal.remainingMonthly).toBeLessThan(yearOne.remainingMonthly);
    });

    it('leaves the user better off in the expected scenario than the bad one', () => {
      const expected = result.scenarios.find((s) => s.type === 'expected')!;
      const bad = result.scenarios.find((s) => s.type === 'bad')!;

      expect(expected.years[TERM_YEARS - 1]!.remainingMonthly).toBeGreaterThan(
        bad.years[TERM_YEARS - 1]!.remainingMonthly,
      );
    });

    it('stamps full provenance onto the result, so it can be reproduced later', () => {
      expect(result.provenance).toEqual({
        ruleVersion: 'SAMA-2018-05',
        inflationValue: 0.02,
        inflationSource: 'GASTAT',
        inflationAsOf: '2026-05',
        // No apr was passed to analyze(), so the engine amortized at its own indicative rate
        // and says so. The exhaustive toEqual is the point: provenance is the audit trail, and
        // a field silently added to it must break this test rather than slip through.
        apr: 0.06,
        aprIsIndicative: true,
        assumptions: { salaryGrowth: 0.02, inflation: 0.02 },
        // No dataSources passed to analyze(), so both figures default to the manual declaration.
        dataSources: { existingCommitments: 'manual', grossSalary: 'manual' },
        computedAt: '2026-05-01T00:00:00.000Z',
      });
    });

    it('is deterministic — the same inputs produce byte-identical output', () => {
      const again = analyze({
        input,
        economic: GASTAT_CPI,
        computedAt: '2026-05-01T00:00:00.000Z',
        locale: 'en',
      });

      expect(JSON.stringify(again)).toEqual(JSON.stringify(result));
    });
  });
});

describe('the SAMA rule set is exactly what SAMA published', () => {
  it('carries the caps as dated, versioned values', () => {
    const rules = getRuleSet('SAMA-2018-05');

    expect(rules.version).toBe('SAMA-2018-05');
    expect(rules.effectiveDate).toBe('2018-05-01');
    expect(rules.deductionCapEmployee).toBe(0.3333);
    expect(rules.deductionCapRetiree).toBe(0.25);
    expect(rules.obligationTiers.lowIncomeExclRealEstate).toBe(0.45);
    expect(rules.obligationTiers.lowIncomeTotalFinance).toBe(0.55);
    expect(rules.obligationTiers.midIncomeTotalFinance).toBe(0.65);
    expect(rules.obligationTiers.housingBeneficiary).toBe(0.65);
    expect(rules.incomeBands).toEqual({ low: 15_000, mid: 25_000 });
  });

  it('derives the caution ceiling FROM the deduction cap, never independently', () => {
    expect(riskThresholdsFor(SAMA_2018_05)).toEqual({ safeMax: 0.25, cautionMax: 0.3333 });
  });

  it('refuses to invent a rule set it does not know', () => {
    expect(() => getRuleSet('SAMA-1999-01')).toThrow(/Unknown SAMA rule version/);
  });
});

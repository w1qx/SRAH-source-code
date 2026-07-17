/**
 * The SAMA scenario engine — the core of Suraa.
 *
 * PURE. Synchronous. No Express, no Prisma, no clock, no network. Everything it needs is
 * passed in, including `computedAt`, because a function that reads the clock is not a
 * function you can reproduce an audit against.
 *
 * It produces three tracks over the term (Scope v2 §10.4):
 *   baseline — today's numbers held flat. The reference point.
 *   expected — modest salary growth vs. expenses rising at the real GASTAT CPI.
 *   bad      — the stress test: salary FLAT, expenses keep climbing.
 *
 * What moves and what does not, across all three:
 *   - the instalment NEVER moves. Fixed-rate financing; that is the whole point, and it
 *     is exactly why inflation matters — the payment is frozen while everything else
 *     around it is not.
 *   - existing commitments are carried for the full term. We do not know when they end,
 *     and assuming they conveniently expire would flatter the result.
 *   - additional income is held flat everywhere. It is "fixed additional income" by
 *     definition; growing it would be an assumption we have no basis for.
 */
import type {
  AnalysisResult,
  EconomicDataPoint,
  FinancialDataProvenance,
  RiskTier,
  SamaRuleSet,
  Scenario,
  ScenarioType,
  UserFinancialData,
  YearBreakdown,
} from '@shared/types';
import { monthlyInstallment, remainingBalance } from './amortization';
import type { EngineAssumptions } from './assumptions';
import { DEFAULT_ASSUMPTIONS } from './assumptions';
import type { MessageLocale } from './messages';
import { DEFAULT_LOCALE, scenarioSummary, yearMessage } from './messages';
import { round2, round4 } from './money';
import { anyBreached, evaluateObligations, isRealEstateGoal } from './obligations';
import { compoundToYear, debtBurdenRatio, remainingMonthly, totalIncome } from './ratios';
import { classifyRisk, needsSaferOption, worstTier } from './risk-classifier';
import { buildSaferOption } from './safer-option';
import { deductionCapFor, getRuleSet, riskThresholdsFor } from './sama-rules';

/** Traits SAMA cares about that UserFinancialData does not carry. Defaults are the common case. */
export interface SubjectTraits {
  /** Retirees are held to a 25% deduction cap rather than 33.33%. */
  isRetiree?: boolean;
  /** Ministry of Housing / REDF beneficiaries are permitted up to 65% of total income. */
  isHousingBeneficiary?: boolean;
}

export interface AnalyzeParams {
  input: UserFinancialData;
  /** The GASTAT CPI point in force. Fetched by the application layer, never by the engine. */
  economic: EconomicDataPoint;
  /** Defaults to the current SAMA rule set; pass a version to reproduce a past analysis. */
  rules?: SamaRuleSet;
  assumptions?: EngineAssumptions;
  /** Overrides the indicative APR — pass a real rate once the user has an actual offer. */
  apr?: number;
  /** Injected, never read from the clock: a pure function cannot call Date.now(). */
  computedAt: string;
  /**
   * Which source supplied each user figure — plain data the service resolves and passes in, the
   * same way `computedAt` is injected. The engine does NOT know what SIMAH is or how to reach it;
   * it only records what it was told. Defaults to manual for both figures when omitted.
   */
  dataSources?: FinancialDataProvenance;
  locale?: MessageLocale;
  subject?: SubjectTraits;
}

/** The default when the service supplies nothing: everything came from the chatbot. */
const MANUAL_SOURCES: FinancialDataProvenance = {
  existingCommitments: 'manual',
  grossSalary: 'manual',
};

/** How salary and expenses behave in each track. */
interface ScenarioDynamics {
  salaryGrowth: number;
  expenseInflation: number;
}

export function analyze(params: AnalyzeParams): AnalysisResult {
  const {
    input,
    economic,
    rules = getRuleSet(),
    assumptions = DEFAULT_ASSUMPTIONS,
    computedAt,
    locale = DEFAULT_LOCALE,
    subject = {},
  } = params;

  const apr = params.apr ?? assumptions.indicativeApr;
  const thresholds = riskThresholdsFor(rules);
  const inflation = economic.value;

  const installment = monthlyInstallment(input.financingAmount, apr, input.termYears);
  const totalInstallments = installment + input.existingCommitments;
  const requestedDbr = debtBurdenRatio(totalInstallments, input.grossSalary);

  const dynamics: Record<ScenarioType, ScenarioDynamics> = {
    // Today, frozen. The reference point the other two are read against.
    baseline: { salaryGrowth: 0, expenseInflation: 0 },
    // A reasonable future: pay rises a little, prices rise at the real measured rate.
    expected: { salaryGrowth: assumptions.salaryGrowth, expenseInflation: inflation },
    // The stress test: the pay rise never comes, but the prices still do.
    bad: {
      salaryGrowth: 0,
      expenseInflation: inflation * assumptions.badScenarioInflationMultiplier,
    },
  };

  const scenarios: Scenario[] = (['baseline', 'expected', 'bad'] as const).map((type) =>
    buildScenario({
      type,
      dynamics: dynamics[type],
      input,
      rules,
      thresholds,
      apr,
      installment,
      locale,
      subject,
    }),
  );

  const overallRisk = worstTier(
    scenarios.flatMap((scenario) => scenario.years.map((year) => year.riskTier)),
  );

  const result: AnalysisResult = {
    scenarios,
    requestedDbr: round4(requestedDbr),
    overallRisk,
    provenance: {
      ruleVersion: rules.version,
      inflationValue: economic.value,
      inflationSource: economic.source,
      inflationAsOf: economic.period,
      // The rate the instalment was amortized at. Stamped onto the result so a reader can
      // always tell WHICH rate produced the number they are looking at, and whether it was
      // our indicative assumption or a real one the caller supplied.
      apr,
      aprIsIndicative: params.apr === undefined,
      assumptions: {
        salaryGrowth: assumptions.salaryGrowth,
        inflation,
      },
      // Echoed straight through — the engine records provenance, it does not resolve it.
      dataSources: params.dataSources ?? MANUAL_SOURCES,
      computedAt,
    },
  };

  // §10.6: a requested instalment past the deduction cap gets an immediate Safer Option.
  // We also offer one at "caution" — the tier means "you would survive this, barely", and
  // a user who can see the safer number is better served than one who cannot.
  if (needsSaferOption(overallRisk)) {
    result.saferOption = buildSaferOption({
      input,
      thresholds,
      apr,
      maxTermYears: assumptions.maxSaferOptionTermYears,
      locale,
    });
  }

  return result;
}

interface BuildScenarioParams {
  type: ScenarioType;
  dynamics: ScenarioDynamics;
  input: UserFinancialData;
  rules: SamaRuleSet;
  thresholds: ReturnType<typeof riskThresholdsFor>;
  apr: number;
  installment: number;
  locale: MessageLocale;
  subject: SubjectTraits;
}

function buildScenario(params: BuildScenarioParams): Scenario {
  const { type, dynamics, input, rules, thresholds, apr, installment, locale, subject } = params;

  const totalInstallments = installment + input.existingCommitments;
  const realEstateObligations = isRealEstateGoal(input.goal) ? installment : 0;
  const years: YearBreakdown[] = [];

  for (let year = 1; year <= Math.ceil(input.termYears); year += 1) {
    // Year 1 is today — growth and inflation only start compounding from year 2.
    const salary = compoundToYear(input.grossSalary, dynamics.salaryGrowth, year);
    const expenses = compoundToYear(input.monthlyExpenses, dynamics.expenseInflation, year);

    const dbr = debtBurdenRatio(totalInstallments, salary);
    const remaining = remainingMonthly({
      grossSalary: salary,
      additionalIncome: input.additionalIncome,
      totalMonthlyInstallments: totalInstallments,
      monthlyExpenses: expenses,
    });
    const debt = remainingBalance(input.financingAmount, apr, input.termYears, year * 12);

    const obligationChecks = evaluateObligations(
      {
        totalIncome: totalIncome(salary, input.additionalIncome),
        totalFinanceObligations: totalInstallments,
        realEstateObligations,
        isHousingBeneficiary: subject.isHousingBeneficiary ?? false,
      },
      rules,
    );

    const obligationBreached = anyBreached(obligationChecks);
    const cashFlowNegative = remaining < 0;
    const deductionCapBreached = dbr > deductionCapFor(rules, subject);

    const riskTier: RiskTier = classifyRisk(
      { dbr, obligationBreached, deductionCapBreached, cashFlowNegative },
      thresholds,
    );

    years.push({
      year,
      installment: round2(installment),
      remainingMonthly: round2(remaining),
      remainingDebt: round2(debt),
      dbr: round4(dbr),
      riskTier,
      message: yearMessage(locale, {
        year,
        tier: riskTier,
        remainingMonthly: round2(remaining),
        dbr,
        cashFlowNegative,
        obligationBreached,
      }),
    });
  }

  const first = years[0];
  const last = years[years.length - 1];

  return {
    type,
    years,
    resultSummary: scenarioSummary(locale, {
      type,
      worstTier: worstTier(years.map((y) => y.riskTier)),
      firstRemainingMonthly: first?.remainingMonthly ?? 0,
      finalRemainingMonthly: last?.remainingMonthly ?? 0,
    }),
  };
}

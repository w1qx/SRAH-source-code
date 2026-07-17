import type {
  AnalysisSummary,
  BankApplication,
  DashboardData,
  FinancialIndicator,
  RiskTier,
  SamaRuleSet,
} from '@shared/types';
import type {
  AnalysisRepository,
  PersistedAnalysis,
} from '@/modules/analysis/infrastructure/analysis.repository';

/**
 * The dashboard is a VIEW over analyses the user has already run. It stores nothing of its
 * own and computes nothing new: the DBR, the tier and the plain-language message are all
 * replayed from the analysis that produced them, so the dashboard can never disagree with
 * the analysis page it links to.
 */
export class DashboardService {
  constructor(
    private readonly analyses: AnalysisRepository,
    private readonly rules: SamaRuleSet,
  ) {}

  async get(userId: string): Promise<DashboardData> {
    const history = await this.analyses.listAnalyses(userId);
    const latest = history[0];

    return {
      indicator: latest ? this.indicatorFrom(latest) : null,
      // Submitting a request to a lender is not a feature this product has: there is no
      // submission endpoint and no table behind it. An empty list is the honest answer —
      // fabricating rows here would be the mock data we just removed, moved server-side.
      applications: [] as BankApplication[],
      pastAnalyses: history.map(toSummary),
    };
  }

  /** The gauge, read off the newest analysis. */
  private indicatorFrom(latest: PersistedAnalysis): FinancialIndicator {
    const { requestedDbr, overallRisk, scenarios } = latest.result;

    // The expected scenario is the one the user is shown as their likely path, so its
    // opening year is what the gauge is speaking about.
    const expected = scenarios.find((s) => s.type === 'expected') ?? scenarios[0];
    const message = expected?.years[0]?.message ?? expected?.resultSummary ?? '';

    return {
      score: healthScore(requestedDbr, this.rules.deductionCapEmployee),
      tier: overallRisk,
      currentDbr: requestedDbr,
      message,
      updatedAt: latest.createdAt,
    };
  }
}

/**
 * A 0–100 reading of one number: how much of the regulator's deduction cap you have spent.
 *
 * It is anchored on the SAMA cap rather than an arbitrary curve, so the bands line up exactly
 * with the risk tiers the engine already assigns:
 *   DBR 0 → 100 · at the safe ceiling (25%) → 75 · at the cap (33.33%) → 50 · beyond → 50→0.
 */
export function healthScore(dbr: number, cap: number): number {
  const safeCeiling = 0.25;
  if (dbr <= 0) return 100;

  if (dbr <= safeCeiling) {
    return Math.round(100 - (dbr / safeCeiling) * 25);
  }

  if (dbr <= cap) {
    return Math.round(75 - ((dbr - safeCeiling) / (cap - safeCeiling)) * 25);
  }

  // Past the cap the score decays to zero once the burden reaches twice the cap.
  const overshoot = Math.min((dbr - cap) / cap, 1);
  return Math.max(0, Math.round(50 - overshoot * 50));
}

function toSummary(analysis: PersistedAnalysis): AnalysisSummary {
  return {
    id: analysis.id,
    goal: analysis.input.goal,
    financingAmount: analysis.input.financingAmount,
    termYears: analysis.input.termYears,
    overallRisk: analysis.result.overallRisk as RiskTier,
    createdAt: analysis.createdAt,
  };
}

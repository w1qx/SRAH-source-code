import {
  SimahCreditReport,
  SimahContract,
  CreditBureauProvider,
} from '@shared/external-sources.types';
import { simulateLatency, nowIso, todayDateIso } from './mock.helpers';

/**
 * ============================================================================
 * MockSimahProvider — سمة (SIMAH)
 * ============================================================================
 * Returns existing obligations + credit score in the live report's shape.
 * In the demo this replaces "how much are your current installments?":
 * totalMonthlyObligations flows straight into the DBR numerator, and the
 * per-contract breakdown is shown so the pull feels tangible.
 *
 * "هل يفضل التفصيل؟" — YES. We return activeContracts so the UI can show a
 * collapsible breakdown, but the engine only needs totalMonthlyObligations.
 * ============================================================================
 */
export class MockSimahProvider implements CreditBureauProvider {
  private readonly fixtures: Record<string, Omit<SimahCreditReport, 'provenance'>> = {
    default: {
      creditScore: 720,
      totalMonthlyObligations: 3200,
      activeContracts: [
        { type: 'auto', creditorName: 'شركة تمويل المركبات', monthlyInstallment: 1800, remainingMonths: 30 },
        { type: 'creditCard', creditorName: 'بنك محلي', monthlyInstallment: 1400, remainingMonths: null },
      ],
    },
    // Clean persona — no existing obligations (good for a "Safe" demo run)
    clean: {
      creditScore: 810,
      totalMonthlyObligations: 0,
      activeContracts: [],
    },
  };

  async getCreditReport(nationalId: string): Promise<SimahCreditReport> {
    await simulateLatency();
    const key = nationalId.endsWith('0') ? 'clean' : 'default';
    // Non-null assertion: both fixture keys are guaranteed present; this satisfies the
    // project's noUncheckedIndexedAccess without changing runtime behavior.
    const base = this.fixtures[key]!;
    // Recompute the total from contracts so the numbers can never drift.
    const totalMonthlyObligations = base.activeContracts.reduce(
      (sum: number, c: SimahContract) => sum + c.monthlyInstallment,
      0,
    );
    return {
      ...base,
      totalMonthlyObligations,
      provenance: { source: 'SIMAH', mode: 'mock', asOfDate: todayDateIso(), fetchedAt: nowIso() },
    };
  }
}

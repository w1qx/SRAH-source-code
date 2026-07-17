import type { EconomicDataPoint, EconomicDataProvider, EconomicIndicator } from '@shared/types';

/**
 * The calibrated CPI mock served in the MVP.
 *
 * Calibrated, not invented: 2.0% is the Saudi headline CPI figure GASTAT was reporting at
 * the time of writing, so scenarios built on it behave the way they will behave in
 * production. When the real ingest lands, the number moves — the engine does not.
 *
 * The source string says "mock" out loud, and that string is stamped into every analysis's
 * provenance. In a regulated product, a result must never be able to claim it was computed
 * from official data when it was not.
 */
export const CALIBRATED_CPI = 0.02;

export const MOCK_CPI_SOURCE = 'GASTAT (calibrated mock)';

/**
 * The GASTAT CPI mock — active now (Scope v2 §6). Swapped for {@link RealGastatProvider} by
 * flipping ECONOMIC_PROVIDER=gastat; nothing downstream of the container changes.
 */
export class MockGastatProvider implements EconomicDataProvider {
  constructor(
    private readonly value: number = CALIBRATED_CPI,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getLatest(indicator: EconomicIndicator): Promise<EconomicDataPoint> {
    return {
      indicator,
      value: this.value,
      source: MOCK_CPI_SOURCE,
      period: lastCompletePeriod(this.now()),
    };
  }
}

/**
 * CPI for a month is published after the month ends, so "latest available" is always the
 * PREVIOUS month. Reporting this month's period would be claiming data that does not exist.
 */
export function lastCompletePeriod(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based, so this is already last month's 1-based index.
  if (month === 0) return `${year - 1}-12`;
  return `${year}-${String(month).padStart(2, '0')}`;
}

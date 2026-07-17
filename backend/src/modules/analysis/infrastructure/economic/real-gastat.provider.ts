import type { EconomicDataPoint, EconomicDataProvider, EconomicIndicator } from '@shared/types';
import { z } from 'zod';
import { logger } from '@/shared/logger';

/**
 * The real GASTAT adapter — the one the mock is standing in for.
 *
 * Scope v2 §15 flags the risk plainly: GASTAT does not publish a clean, stable JSON CPI
 * endpoint, so the production path is a monthly ingest (portal/CSV/API, whatever GASTAT
 * offers when we get there) into `economic_data_cache`. This adapter is the seam where
 * that lands. It is switched on with ECONOMIC_PROVIDER=gastat + GASTAT_CPI_URL, and the
 * caller — CachedEconomicDataProvider — is completely unaware of which one it is talking to.
 *
 * The response shape below is a placeholder: adjust `GastatResponseSchema` to whatever the
 * chosen GASTAT feed actually returns. Everything else stays put.
 */
const GastatResponseSchema = z.object({
  /** Annual CPI change. GASTAT publishes percent (2.0), the engine wants a fraction (0.02). */
  value: z.number(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'period must look like "2026-05"'),
});

export class RealGastatProvider implements EconomicDataProvider {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async getLatest(indicator: EconomicIndicator): Promise<EconomicDataPoint> {
    if (indicator !== 'cpi') {
      throw new Error(`GASTAT adapter has no feed for indicator "${indicator}"`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`GASTAT responded ${response.status} ${response.statusText}`);
      }

      // GASTAT is an external system: its payload is untrusted input like any other.
      const parsed = GastatResponseSchema.parse(await response.json());

      return {
        indicator: 'cpi',
        value: toFraction(parsed.value),
        source: 'GASTAT',
        period: parsed.period,
      };
    } catch (error) {
      logger.warn('GASTAT CPI fetch failed; the cache will absorb this', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * GASTAT publishes CPI as a percentage. A value of 2.0 means 2%, i.e. 0.02.
 * Guard rather than guess: a rate above 1 can only be a percentage, and silently treating
 * 2.0 as "200% inflation" would poison every scenario downstream.
 */
function toFraction(value: number): number {
  return Math.abs(value) > 1 ? value / 100 : value;
}

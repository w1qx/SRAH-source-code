import type { EconomicDataPoint, EconomicDataProvider, EconomicIndicator } from '@shared/types';
import type { EconomicDataCacheRepository } from './economic-data.repository';
import { logger } from '@/shared/logger';

/**
 * The cache in front of whichever economic source is configured. Scope v2 §11.2 and §9
 * ("cached CPI so GASTAT latency never blocks users").
 *
 * It is a DECORATOR, not a special case: it implements EconomicDataProvider and wraps an
 * EconomicDataProvider. The analysis service asks for CPI and has no idea whether the
 * answer came from the table, from GASTAT, or from the mock.
 *
 * Read path:
 *   1. Cache is fresh          → serve it. No network call.
 *   2. Cache is stale or empty → ask the source, write through, serve it.
 *   3. Source fails, but we hold a stale value → SERVE THE STALE VALUE. A CPI figure a few
 *      weeks old is a rounding error in a five-year projection. A user staring at an error
 *      page in the middle of a financing decision is a product failure. Inflation is not
 *      volatile enough to justify the second.
 *   4. Source fails and the cache is empty → we genuinely have nothing. Fail.
 */
export class CachedEconomicDataProvider implements EconomicDataProvider {
  constructor(
    private readonly source: EconomicDataProvider,
    private readonly cache: EconomicDataCacheRepository,
    /** CPI is monthly data — checking once a day is already generous. */
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getLatest(indicator: EconomicIndicator): Promise<EconomicDataPoint> {
    const cached = await this.cache.findLatest(indicator);

    if (cached && this.now() - cached.fetchedAt.getTime() < this.ttlMs) {
      return cached.point;
    }

    try {
      const fresh = await this.source.getLatest(indicator);
      const saved = await this.cache.save(fresh);
      return saved.point;
    } catch (error) {
      if (cached) {
        logger.warn('Economic data source unavailable; serving the cached value', {
          indicator,
          period: cached.point.period,
          fetchedAt: cached.fetchedAt.toISOString(),
        });
        return cached.point;
      }

      logger.error('Economic data source unavailable and the cache is empty', {
        indicator,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

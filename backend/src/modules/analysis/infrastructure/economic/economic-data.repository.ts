import type { EconomicDataPoint, EconomicIndicator } from '@shared/types';
import type { Db } from '@/db/prisma';

/**
 * The `economic_data_cache` table. Scope v2 §11.2: analyses read the cache, so GASTAT
 * being down never blocks a user mid-decision.
 */
export interface EconomicDataCacheRepository {
  /** Most recent point for an indicator, by reporting period. */
  findLatest(indicator: EconomicIndicator): Promise<CachedPoint | undefined>;
  save(point: EconomicDataPoint): Promise<CachedPoint>;
}

export interface CachedPoint {
  point: EconomicDataPoint;
  /** When we last pulled this from the source — drives staleness, not the period. */
  fetchedAt: Date;
}

export class PrismaEconomicDataCacheRepository implements EconomicDataCacheRepository {
  constructor(private readonly db: Db) {}

  async findLatest(indicator: EconomicIndicator): Promise<CachedPoint | undefined> {
    const row = await this.db.economicDataCache.findFirst({
      where: { indicator },
      orderBy: { period: 'desc' },
    });
    if (!row) return undefined;

    return {
      point: {
        indicator: row.indicator,
        value: Number(row.value),
        source: row.source,
        period: row.period,
      },
      fetchedAt: row.fetchedAt,
    };
  }

  async save(point: EconomicDataPoint): Promise<CachedPoint> {
    const row = await this.db.economicDataCache.upsert({
      where: { indicator_period: { indicator: point.indicator, period: point.period } },
      update: { value: point.value, source: point.source, fetchedAt: new Date() },
      create: {
        indicator: point.indicator,
        value: point.value,
        source: point.source,
        period: point.period,
      },
    });

    return {
      point: {
        indicator: row.indicator,
        value: Number(row.value),
        source: row.source,
        period: row.period,
      },
      fetchedAt: row.fetchedAt,
    };
  }
}

/** In-memory cache for tests and for running without a database. */
export class InMemoryEconomicDataCacheRepository implements EconomicDataCacheRepository {
  private readonly points = new Map<string, CachedPoint>();

  constructor(seed: CachedPoint[] = []) {
    for (const cached of seed) this.points.set(this.key(cached.point), cached);
  }

  private key(point: Pick<EconomicDataPoint, 'indicator' | 'period'>): string {
    return `${point.indicator}:${point.period}`;
  }

  async findLatest(indicator: EconomicIndicator): Promise<CachedPoint | undefined> {
    return [...this.points.values()]
      .filter((c) => c.point.indicator === indicator)
      .sort((a, b) => b.point.period.localeCompare(a.point.period))[0];
  }

  async save(point: EconomicDataPoint): Promise<CachedPoint> {
    const cached: CachedPoint = { point, fetchedAt: new Date() };
    this.points.set(this.key(point), cached);
    return cached;
  }
}

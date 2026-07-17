import type { FeatureFlag, FeatureFlagKey } from '@shared/types';
import type { Db } from '@/db/prisma';
import { FEATURE_FLAG_DEFAULTS, mergeFlags } from '../domain/flag-catalog';

export interface FeatureFlagsRepository {
  findAll(): Promise<FeatureFlag[]>;
  setEnabled(key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag>;
  /** Write the catalog's defaults for any flag the table has never seen. */
  syncDefaults(): Promise<void>;
}

export class PrismaFeatureFlagsRepository implements FeatureFlagsRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<FeatureFlag[]> {
    const rows = await this.db.featureFlag.findMany();
    return mergeFlags(rows);
  }

  async setEnabled(key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag> {
    const defaults = FEATURE_FLAG_DEFAULTS.find((f) => f.key === key);
    const row = await this.db.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled, description: defaults?.description ?? '' },
    });
    return { key: row.key as FeatureFlagKey, enabled: row.enabled, description: row.description };
  }

  async syncDefaults(): Promise<void> {
    for (const flag of FEATURE_FLAG_DEFAULTS) {
      await this.db.featureFlag.upsert({
        where: { key: flag.key },
        // Never overwrite `enabled` on an existing row — an operator may have flipped it
        // deliberately, and a redeploy must not quietly flip it back.
        update: { description: flag.description },
        create: { key: flag.key, enabled: flag.enabled, description: flag.description },
      });
    }
  }
}

/** In-memory repository for tests and for booting without a database. */
export class InMemoryFeatureFlagsRepository implements FeatureFlagsRepository {
  private overrides = new Map<FeatureFlagKey, boolean>();

  constructor(initial: Partial<Record<FeatureFlagKey, boolean>> = {}) {
    for (const [key, enabled] of Object.entries(initial)) {
      if (typeof enabled === 'boolean') this.overrides.set(key as FeatureFlagKey, enabled);
    }
  }

  async findAll(): Promise<FeatureFlag[]> {
    return mergeFlags([...this.overrides].map(([key, enabled]) => ({ key, enabled })));
  }

  async setEnabled(key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag> {
    this.overrides.set(key, enabled);
    const all = await this.findAll();
    return all.find((f) => f.key === key)!;
  }

  async syncDefaults(): Promise<void> {
    // Defaults are the starting state already.
  }
}

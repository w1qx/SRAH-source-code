import type { FeatureFlag, FeatureFlagKey } from '@shared/types';
import type { FeatureFlagsRepository } from '../infrastructure/feature-flags.repository';
import { defaultFlag } from '../domain/flag-catalog';

/**
 * Reads flags for the rest of the app.
 *
 * Cached for a few seconds: every request that touches a gated feature asks this service,
 * and none of them should cost a database round trip. A flag flip taking a few seconds to
 * propagate is a fine trade.
 */
export class FeatureFlagsService {
  private cache: { flags: FeatureFlag[]; expiresAt: number } | undefined;

  constructor(
    private readonly repository: FeatureFlagsRepository,
    private readonly ttlMs = 15_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async list(): Promise<FeatureFlag[]> {
    if (this.cache && this.cache.expiresAt > this.now()) return this.cache.flags;

    const flags = await this.repository.findAll();
    this.cache = { flags, expiresAt: this.now() + this.ttlMs };
    return flags;
  }

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    const flags = await this.list();
    return flags.find((f) => f.key === key)?.enabled ?? defaultFlag(key).enabled;
  }

  async setEnabled(key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag> {
    const flag = await this.repository.setEnabled(key, enabled);
    this.cache = undefined;
    return flag;
  }

  async syncDefaults(): Promise<void> {
    await this.repository.syncDefaults();
    this.cache = undefined;
  }
}

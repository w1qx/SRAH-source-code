/**
 * The feature-flag catalog — the single source of truth for what exists but is not on yet.
 *
 * Scope v2 §4.7: future features live in the codebase, wired and reachable, and are
 * toggled OFF. One flag drives both the backend's "not yet active" response and the
 * frontend's disabled control with its "Coming Soon" badge. That is why the flag list is
 * SERVED to the client rather than hidden in the server.
 *
 * Defaults live here in config; the feature_flags table overrides them at runtime, so a
 * flag can be flipped without a deploy.
 */
import type { FeatureFlag, FeatureFlagKey } from '@shared/types';

export const FEATURE_FLAG_DEFAULTS: readonly FeatureFlag[] = Object.freeze([
  {
    key: 'auth_nafath',
    enabled: false,
    description:
      'Login with Nafath (National SSO). Routes and AuthProvider adapter exist; the live handshake is pending official access.',
  },
  {
    key: 'scenario_investment',
    enabled: false,
    description: 'Investment-decision scenario in the analysis engine.',
  },
  {
    key: 'scenario_financial_health',
    enabled: false,
    description: 'General financial-health scenario in the analysis engine.',
  },
  {
    key: 'offers_real_lenders',
    enabled: false,
    description:
      'Real lender offers via the OffersRepository. The mock repository serves illustrative sample offers until this is on.',
  },
  {
    key: 'open_banking',
    enabled: false,
    description: 'Open Banking account aggregation (requires user consent).',
  },
  {
    key: 'simah_credit',
    enabled: false,
    description: 'SIMAH credit-bureau data to verify declared commitments.',
  },
  {
    key: 'gosi_income',
    enabled: false,
    description:
      'GOSI-verified income: auto-pulls gross salary, employment sector, and tenure instead of asking for them in the chat.',
  },
]);

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = FEATURE_FLAG_DEFAULTS.map((f) => f.key);

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(value);
}

export function defaultFlag(key: FeatureFlagKey): FeatureFlag {
  const flag = FEATURE_FLAG_DEFAULTS.find((f) => f.key === key);
  if (!flag) throw new Error(`No default defined for feature flag "${key}"`);
  return flag;
}

/**
 * Merge DB overrides over the config defaults. The catalog (which flags exist, what they
 * mean) is owned by code; only the on/off bit is owned by the database.
 */
export function mergeFlags(overrides: ReadonlyArray<{ key: string; enabled: boolean }>): FeatureFlag[] {
  return FEATURE_FLAG_DEFAULTS.map((flag) => {
    const override = overrides.find((o) => o.key === flag.key);
    return override ? { ...flag, enabled: override.enabled } : { ...flag };
  });
}

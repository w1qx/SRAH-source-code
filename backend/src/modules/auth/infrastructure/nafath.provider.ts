import type { AuthProvider } from '@shared/types';
import type { FeatureFlagsService } from '@/modules/feature-flags/application/feature-flags.service';

/**
 * Nafath (National SSO) — structurally present, deliberately inactive.
 *
 * Scope v2 §4.1 / §12.1: the button, the routes, and the adapter all exist NOW, wired to a
 * mock, so that switching Nafath on later is a flag flip and a swapped implementation of
 * this one interface — not a re-architecture of authentication.
 *
 * The mock does NOT authenticate anyone. It cannot: there is no handshake to perform. It
 * exists so the route can answer, the frontend can render its disabled button, and the
 * shape of the eventual integration is already pinned down.
 */
export interface NafathHandshake {
  /** Where the user would be sent to approve the login. */
  redirectUrl: string;
  /** The number the real Nafath app shows the user to confirm. */
  transactionId: string;
}

export interface NafathAuthProvider extends AuthProvider {
  method: 'nafath';
  /** Begin a login. Throws while the feature is off. */
  initiate(nationalId: string): Promise<NafathHandshake>;
  /** Complete a login once Nafath calls back. Throws while the feature is off. */
  complete(transactionId: string): Promise<{ nafathId: string }>;
}

export class NafathNotActiveError extends Error {
  constructor() {
    super('Nafath login is not yet active.');
    this.name = 'NafathNotActiveError';
  }
}

/** The MVP implementation: honest about being inactive. */
export class MockNafathAuthProvider implements NafathAuthProvider {
  readonly method = 'nafath' as const;

  /**
   * Read off the `auth_nafath` feature flag rather than hardcoded, so the day Nafath goes
   * live the switch is a database row — and the same flag already drives the "Coming Soon"
   * badge in the UI.
   */
  isActive = false;

  constructor(private readonly flags?: FeatureFlagsService) {}

  async refreshActive(): Promise<boolean> {
    this.isActive = this.flags ? await this.flags.isEnabled('auth_nafath') : false;
    return this.isActive;
  }

  async initiate(_nationalId: string): Promise<NafathHandshake> {
    await this.refreshActive();
    if (!this.isActive) throw new NafathNotActiveError();

    // Reached only once the flag is on AND this class has been replaced by the real adapter.
    // Failing loudly beats returning a plausible-looking fake handshake to a live user.
    throw new NafathNotActiveError();
  }

  async complete(_transactionId: string): Promise<{ nafathId: string }> {
    await this.refreshActive();
    throw new NafathNotActiveError();
  }
}

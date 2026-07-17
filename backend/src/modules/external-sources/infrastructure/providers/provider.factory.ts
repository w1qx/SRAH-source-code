import {
  IncomeVerificationProvider,
  IdentityProvider,
  CreditBureauProvider,
} from '@shared/external-sources.types';
import { MockGosiProvider } from './mock/mock-gosi.provider';
import { MockNafathProvider } from './mock/mock-nafath.provider';
import { MockSimahProvider } from './mock/mock-simah.provider';

/**
 * ============================================================================
 * Provider Factory — the "flip a flag, swap an adapter" mechanism
 * ============================================================================
 * Business logic asks the factory for an interface and never knows whether it
 * got a Mock or a Live implementation. Going to production = set the flag true
 * and register the live class. No engine code changes. This is the exact story
 * to tell the judge.
 * ============================================================================
 */

export interface ExternalSourceFlags {
  liveGosi: boolean;
  liveNafath: boolean;
  liveSimah: boolean;
}

/** Demo defaults: everything mocked. Production flips these on per contract. */
export const DEFAULT_FLAGS: ExternalSourceFlags = {
  liveGosi: false,
  liveNafath: false,
  liveSimah: false,
};

export class ProviderFactory {
  constructor(private readonly flags: ExternalSourceFlags = DEFAULT_FLAGS) {}

  getIncomeVerificationProvider(): IncomeVerificationProvider {
    if (this.flags.liveGosi) {
      // return new LiveGosiProvider(...)  // production: Nafeth-brokered API
      throw new Error('Live GOSI provider not wired yet — requires Nafeth agreement.');
    }
    return new MockGosiProvider();
  }

  getIdentityProvider(): IdentityProvider {
    if (this.flags.liveNafath) {
      // return new LiveNafathProvider(...)
      throw new Error('Live Nafath provider not wired yet — requires official access.');
    }
    return new MockNafathProvider();
  }

  getCreditBureauProvider(): CreditBureauProvider {
    if (this.flags.liveSimah) {
      // return new LiveSimahProvider(...)
      throw new Error('Live SIMAH provider not wired yet — requires membership agreement.');
    }
    return new MockSimahProvider();
  }
}

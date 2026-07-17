import {
  NafathVerification,
  IdentityProvider,
} from '@shared/external-sources.types';
import { simulateLatency, maskIdentity, nowIso, todayDateIso } from './mock.helpers';

/**
 * ============================================================================
 * MockNafathProvider — نفاذ (National SSO / identity assurance)
 * ============================================================================
 * Two-step handshake exactly like the real flow:
 *   1) initiate() → returns a verificationNumber to show on screen
 *   2) user "approves" in the Nafath app → poll() returns COMPLETED
 *
 * DEMO SCRIPT: show the 2-digit number, wait ~2s, then reveal COMPLETED.
 * ============================================================================
 */
export class MockNafathProvider implements IdentityProvider {
  private pending = new Map<string, { nationalId: string; number: number }>();

  async initiate(nationalId: string): Promise<NafathVerification> {
    await simulateLatency(500, 900);
    const transactionId = 'txn_' + Math.random().toString(36).slice(2, 10);
    const verificationNumber = Math.floor(Math.random() * 90) + 10; // 10–99
    this.pending.set(transactionId, { nationalId, number: verificationNumber });
    return {
      transactionId,
      status: 'WAITING',
      nationalId: maskIdentity(nationalId),
      verificationNumber,
      verifiedAt: null,
      provenance: { source: 'NAFATH', mode: 'mock', asOfDate: todayDateIso(), fetchedAt: nowIso() },
    };
  }

  async poll(transactionId: string): Promise<NafathVerification> {
    await simulateLatency(1500, 2500); // simulate the user tapping "approve"
    const entry = this.pending.get(transactionId);
    const nationalId = entry ? maskIdentity(entry.nationalId) : '**********';
    const verificationNumber = entry?.number ?? 0;
    this.pending.delete(transactionId);
    return {
      transactionId,
      status: 'COMPLETED',
      nationalId,
      verificationNumber,
      verifiedAt: nowIso(),
      provenance: { source: 'NAFATH', mode: 'mock', asOfDate: todayDateIso(), fetchedAt: nowIso() },
    };
  }
}

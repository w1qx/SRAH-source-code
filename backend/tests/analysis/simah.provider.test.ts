import { MockSimahProvider } from '@/modules/analysis/infrastructure/simah/mock-simah.provider';
import {
  RealSimahProvider,
  SimahNotAuthorizedError,
} from '@/modules/analysis/infrastructure/simah/real-simah.provider';

const SUBJECT = { userId: '11111111-1111-4111-8111-111111111111' };

describe('SimahProvider — the mock', () => {
  it('returns a full credit profile shaped like a real SIMAH report', async () => {
    const profile = await new MockSimahProvider().getCreditProfile(SUBJECT);

    expect(profile.verifiedGrossSalary).toBeGreaterThan(0);
    expect(profile.commitments.length).toBeGreaterThan(0);
    expect(profile.creditScore).toBeGreaterThanOrEqual(300);
    expect(profile.creditScore).toBeLessThanOrEqual(900);
    expect(profile.standing).toBe('current');
  });

  it('reports totalMonthlyInstallments as the exact sum of its commitments', async () => {
    const profile = await new MockSimahProvider().getCreditProfile(SUBJECT);
    const sum = profile.commitments.reduce((s, c) => s + c.monthlyInstallment, 0);
    expect(profile.totalMonthlyInstallments).toBe(sum);
  });

  it('says out loud that it is a mock — a result must never claim bureau data it does not have', async () => {
    const profile = await new MockSimahProvider().getCreditProfile(SUBJECT);
    expect(profile.source).toContain('mock');
  });

  it('is deterministic per subject — the same user always gets the same reference', async () => {
    const a = await new MockSimahProvider().getCreditProfile(SUBJECT);
    const b = await new MockSimahProvider().getCreditProfile(SUBJECT);
    expect(a.referenceId).toBe(b.referenceId);
  });

  it('is "active" as a data source — the flag, not the provider, decides if it is consulted', () => {
    expect(new MockSimahProvider().isActive).toBe(true);
  });
});

describe('SimahProvider — the real adapter', () => {
  it('is inert and refuses to answer until it is authorized', async () => {
    const provider = new RealSimahProvider();
    expect(provider.isActive).toBe(false);
    await expect(provider.getCreditProfile(SUBJECT)).rejects.toBeInstanceOf(SimahNotAuthorizedError);
  });

  it('names the authorization it is waiting on, rather than failing opaquely', async () => {
    await expect(new RealSimahProvider().getCreditProfile(SUBJECT)).rejects.toThrow(/SAMA|SIMAH/);
  });
});

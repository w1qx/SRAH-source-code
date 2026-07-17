import type {
  SimahCommitment,
  SimahCreditProfile,
  SimahProvider,
  SimahSubjectRef,
} from '@shared/types';

/**
 * The SIMAH credit-bureau mock — the one the real adapter is standing in for.
 *
 * Scope v2 §5/§16: SIMAH credit data lives in the codebase now, behind the same port the real
 * bureau will use, so switching it on later is a flag flip and a swapped adapter — not a new
 * integration. This mock returns data shaped EXACTLY like a real SIMAH report (verified salary,
 * active commitments and their installments, payment/default history, a credit-score
 * placeholder), so the engine and the UI are built against the final contract today.
 *
 * Two honesty rules it keeps, the same ones the CPI mock keeps:
 *   1. `source` says "SIMAH (mock)" out loud, and that string is stamped into every analysis's
 *      provenance. A result must never be able to claim it was verified by the bureau when it
 *      was not.
 *   2. The creditor names are generic samples, not real lenders — asserting a real relationship
 *      ("you owe مصرف X") in fabricated data would be as misleading as inventing a real bank's
 *      offer. The `MockOffersRepository` avoids real names for the same reason.
 */
export const MOCK_SIMAH_SOURCE = 'SIMAH (mock)';

/** A realistic, healthy-but-not-empty sample profile. Sum of installments = 1,850 SAR/mo. */
const SAMPLE_COMMITMENTS: readonly SimahCommitment[] = Object.freeze([
  {
    creditor: 'تمويل شخصي (عيّنة)',
    type: 'personal_finance',
    monthlyInstallment: 1_350,
    outstandingBalance: 46_200,
  },
  {
    creditor: 'بطاقة ائتمانية (عيّنة)',
    type: 'credit_card',
    monthlyInstallment: 500,
    outstandingBalance: 12_000,
  },
]);

export interface MockSimahProfileOverrides {
  verifiedGrossSalary?: number;
  commitments?: readonly SimahCommitment[];
  standing?: SimahCreditProfile['standing'];
  defaultsLast24Months?: number;
  creditScore?: number;
}

export class MockSimahProvider implements SimahProvider {
  /**
   * The mock is always able to answer — it is "active" as a data source. Whether the analysis
   * service is ALLOWED to consult it is a separate decision: the `simah_credit` feature flag,
   * checked in the service. The provider does not gate itself; the composition root does.
   */
  readonly isActive = true;

  constructor(
    private readonly overrides: MockSimahProfileOverrides = {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCreditProfile(subject: SimahSubjectRef): Promise<SimahCreditProfile> {
    const commitments = [...(this.overrides.commitments ?? SAMPLE_COMMITMENTS)];
    const totalMonthlyInstallments = commitments.reduce(
      (sum, c) => sum + c.monthlyInstallment,
      0,
    );

    return {
      referenceId: referenceFor(subject),
      verifiedGrossSalary: this.overrides.verifiedGrossSalary ?? 14_500,
      commitments,
      totalMonthlyInstallments,
      standing: this.overrides.standing ?? 'current',
      defaultsLast24Months: this.overrides.defaultsLast24Months ?? 0,
      creditScore: this.overrides.creditScore ?? 720,
      reportGeneratedAt: this.now().toISOString(),
      source: MOCK_SIMAH_SOURCE,
    };
  }
}

/**
 * A stable, report-looking reference derived from the subject. A real report carries SIMAH's own
 * id; the mock derives one deterministically so the same user always sees the same reference.
 */
function referenceFor(subject: SimahSubjectRef): string {
  const seed = (subject.nationalId ?? subject.userId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `SMH-${seed.slice(0, 10).padEnd(10, '0')}`;
}

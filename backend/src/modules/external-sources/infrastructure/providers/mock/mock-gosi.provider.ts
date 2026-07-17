import {
  GosiEmploymentRecord,
  IncomeVerificationProvider,
} from '@shared/external-sources.types';
import {
  simulateLatency,
  maskIdentity,
  nowIso,
  todayDateIso,
} from './mock.helpers';

/**
 * ============================================================================
 * MockGosiProvider — التأمينات الاجتماعية (GOSI)
 * ============================================================================
 * Returns a verified employment/wage record with the SAME shape the live
 * Nafeth-brokered GOSI integration would return. In the demo this replaces the
 * "what is your salary?" question: the number arrives verified, not typed.
 *
 * DEMO SCRIPT: contributionWage below becomes the gross salary in the SAMA
 * DBR formula. Point the judge at this field to show the pull → engine link.
 * ============================================================================
 */
export class MockGosiProvider implements IncomeVerificationProvider {
  /** A small fixture set so different demo IDs tell different stories. */
  private readonly fixtures: Record<string, Omit<GosiEmploymentRecord, 'provenance'>> = {
    // Comfortable private-sector employee (the happy-path demo persona)
    default: {
      identityNumber: '1089468234',
      fullName: 'محمد أحمد الشهري',
      employerName: 'شركة الأفق للتقنية',
      employmentStatus: 'active',
      contributionWage: 12000,
      basicWage: 9500,
      housingAllowance: 1500,
      otherAllowances: 1000,
      serviceMonths: 84,
      sector: 'private',
    },
    // Government employee, higher tenure (alternate persona)
    '1023456789': {
      identityNumber: '1023456789',
      fullName: 'سارة عبدالله القحطاني',
      employerName: 'جهة حكومية',
      employmentStatus: 'active',
      contributionWage: 18500,
      basicWage: 14000,
      housingAllowance: 3000,
      otherAllowances: 1500,
      serviceMonths: 132,
      sector: 'government',
    },
  };

  async getEmploymentRecord(nationalId: string): Promise<GosiEmploymentRecord> {
    await simulateLatency();
    // Non-null assertion: the `default` fixture is guaranteed present; this satisfies the
    // project's noUncheckedIndexedAccess without changing runtime behavior.
    const base = this.fixtures[nationalId] ?? this.fixtures.default!;
    return {
      ...base,
      identityNumber: maskIdentity(base.identityNumber),
      provenance: {
        source: 'GOSI',
        mode: 'mock',
        asOfDate: todayDateIso(),
        fetchedAt: nowIso(),
      },
    };
  }
}

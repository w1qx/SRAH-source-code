import type { DataSource, SimahProvider, UserFinancialData } from '@shared/types';
import type { IncomeVerificationProvider } from '@shared/external-sources.types';
import { AUTO_PULL_FIELDS } from '../domain/questions';

/**
 * How the auto-pulled fields are filled. GOSI is authoritative for salary, sector, and tenure;
 * the existing SIMAH provider is authoritative for obligations. Each is gated by its feature flag
 * — with both off, nothing is pulled and every field is asked in the chat (legacy).
 *
 * This is the ONE place the pull lives: the chat consumes it to complete collection, and the
 * `/chat/pull` route consumes it so the frontend can show the pull happening on the searching
 * screen. Same values, same provenance, no duplication.
 */
export interface ChatPullConfig {
  gosi?: IncomeVerificationProvider;
  simah?: SimahProvider;
  isGosiEnabled?: () => Promise<boolean>;
  isSimahEnabled?: () => Promise<boolean>;
}

/** Result of a pull: the values to merge, and which source supplied each. */
export interface PulledFinancialData {
  pulled: Partial<UserFinancialData>;
  provenance: Partial<Record<keyof UserFinancialData, DataSource>>;
}

/** The fields being auto-pulled right now, per the feature flags. Empty when both are off. */
export async function resolveAutoPulled(
  config: ChatPullConfig,
): Promise<Set<keyof UserFinancialData>> {
  const set = new Set<keyof UserFinancialData>();
  if (config.gosi && config.isGosiEnabled && (await config.isGosiEnabled())) {
    AUTO_PULL_FIELDS.gosi_income.forEach((f) => set.add(f));
  }
  if (config.simah && config.isSimahEnabled && (await config.isSimahEnabled())) {
    AUTO_PULL_FIELDS.simah_credit.forEach((f) => set.add(f));
  }
  return set;
}

/**
 * Fetch the auto-pulled fields from their sources. GOSI's contribution wage becomes gross salary
 * (the SAMA DBR input), its sector and service-months become employment sector and tenure; SIMAH's
 * total installments become existing commitments. Only the values and their provenance leave here.
 */
export async function pullFinancialData(
  userId: string,
  config: ChatPullConfig,
): Promise<PulledFinancialData> {
  const autoPulled = await resolveAutoPulled(config);
  const pulled: Partial<UserFinancialData> = {};
  const provenance: Partial<Record<keyof UserFinancialData, DataSource>> = {};

  if (config.gosi && autoPulled.has('grossSalary')) {
    const record = await config.gosi.getEmploymentRecord(userId);
    pulled.grossSalary = record.contributionWage;
    pulled.employmentSector = record.sector;
    pulled.tenureYears = Math.round(record.serviceMonths / 12);
    provenance.grossSalary = 'gosi';
    provenance.employmentSector = 'gosi';
    provenance.tenureYears = 'gosi';
  }

  if (config.simah && autoPulled.has('existingCommitments')) {
    const profile = await config.simah.getCreditProfile({ userId });
    pulled.existingCommitments = profile.totalMonthlyInstallments;
    provenance.existingCommitments = 'simah';
  }

  return { pulled, provenance };
}

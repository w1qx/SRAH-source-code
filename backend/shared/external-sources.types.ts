/**
 * ============================================================================
 * Suraa — External Source Response Contracts
 * ============================================================================
 * These types mirror the REAL response shapes of the Saudi government / regulated
 * data sources. The Mock providers return objects that satisfy these exact types,
 * so switching to the live integration later is a provider swap — never a rewrite.
 *
 * Sources modeled:
 *   - GOSI    (التأمينات الاجتماعية)  → income & employment verification
 *   - Nafath  (نفاذ)                  → national identity verification
 *   - SIMAH   (سمة)                   → existing credit obligations
 * ============================================================================
 */

/** Every external response carries provenance so results stay reproducible. */
export interface SourceProvenance {
  source: 'GOSI' | 'NAFATH' | 'SIMAH';
  mode: 'mock' | 'live';
  asOfDate: string; // ISO date — when the source data was valid
  fetchedAt: string; // ISO datetime — when we called it
}

/* --------------------------------------------------------------------------
 * 1) GOSI — التأمينات الاجتماعية
 * Pulls verified wage + employment. contributionWage becomes the gross salary
 * used in the SAMA DBR calculation, replacing a self-typed number.
 * -------------------------------------------------------------------------- */
export interface GosiEmploymentRecord {
  identityNumber: string; // masked in UI: 10******34
  fullName: string;
  employerName: string;
  employmentStatus: 'active' | 'inactive' | 'suspended';
  /** Wage subject to GOSI contribution — the SAMA "gross salary" input. */
  contributionWage: number;
  basicWage: number;
  housingAllowance: number;
  otherAllowances: number;
  /** Total months of registered service — proxy for job tenure/stability. */
  serviceMonths: number;
  sector: 'private' | 'government';
  provenance: SourceProvenance;
}

/* --------------------------------------------------------------------------
 * 2) Nafath — نفاذ  (National Single Sign-On / identity assurance)
 * -------------------------------------------------------------------------- */
export interface NafathVerification {
  transactionId: string;
  status: 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'WAITING';
  nationalId: string; // masked in UI
  /** The 2-digit number the user confirms inside the Nafath app. */
  verificationNumber: number;
  verifiedAt: string | null;
  provenance: SourceProvenance;
}

/* --------------------------------------------------------------------------
 * 3) SIMAH — سمة  (existing credit obligations + score)
 * activeContracts feed the numerator of DBR automatically.
 * -------------------------------------------------------------------------- */
export interface SimahContract {
  type: 'auto' | 'personal' | 'mortgage' | 'creditCard';
  creditorName: string;
  monthlyInstallment: number;
  /** null for revolving products like credit cards. */
  remainingMonths: number | null;
}

export interface SimahCreditReport {
  creditScore: number; // 300–900 scale
  /** Sum of monthlyInstallment across activeContracts — the DBR numerator. */
  totalMonthlyObligations: number;
  activeContracts: SimahContract[];
  provenance: SourceProvenance;
}

/* --------------------------------------------------------------------------
 * Provider interfaces — business logic depends on THESE, not on Mock/Live.
 * Production = implement the same interface against Nafeth-brokered APIs.
 * -------------------------------------------------------------------------- */
export interface IncomeVerificationProvider {
  getEmploymentRecord(nationalId: string): Promise<GosiEmploymentRecord>;
}

export interface IdentityProvider {
  initiate(nationalId: string): Promise<NafathVerification>;
  poll(transactionId: string): Promise<NafathVerification>;
}

export interface CreditBureauProvider {
  getCreditReport(nationalId: string): Promise<SimahCreditReport>;
}

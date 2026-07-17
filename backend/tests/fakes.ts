/**
 * In-memory doubles for every repository port.
 *
 * These exist so the entire application layer — auth, chat, analysis, offers, and the HTTP routes
 * — is testable with no Postgres, no Anthropic key, and no network. That is not a testing
 * convenience; it is the architecture proving itself. If a service could not be tested against a
 * fake repository, it would mean the service had reached past its port and touched Prisma
 * directly.
 */
import { randomUUID } from 'node:crypto';
import type {
  AnalysisResult,
  AuthMethod,
  ChatMessage,
  PartialUserFinancialData,
  SimahCreditProfile,
  SimahProvider,
  SimahSubjectRef,
  UserFinancialData,
} from '@shared/types';
import type {
  GosiEmploymentRecord,
  IncomeVerificationProvider,
} from '@shared/external-sources.types';
import type {
  AnalysisRepository,
  PersistedAnalysis,
  SaveAnalysisParams,
} from '@/modules/analysis/infrastructure/analysis.repository';
import type {
  AuthRepository,
  OtpRecordRow,
  SessionRow,
  UserRecord,
} from '@/modules/auth/infrastructure/auth.repository';
import type { Hasher } from '@/modules/auth/infrastructure/hasher';
import type { Mailer } from '@/modules/auth/infrastructure/mailer';
import type { ChatRepository, ChatSessionRecord } from '@/modules/chat/infrastructure/chat.repository';

// ---------------------------------------------------------------------------- analysis

export class FakeAnalysisRepository implements AnalysisRepository {
  readonly inputs = new Map<string, { userId: string; input: UserFinancialData; source: string }>();
  readonly analyses = new Map<string, PersistedAnalysis & { userId: string }>();
  readonly saved: SaveAnalysisParams[] = [];

  async createFinancialInput(
    userId: string,
    input: UserFinancialData,
    source: 'chatbot' | 'form',
  ): Promise<{ id: string }> {
    const id = randomUUID();
    this.inputs.set(id, { userId, input, source });
    return { id };
  }

  async findFinancialInput(userId: string, id: string): Promise<UserFinancialData | undefined> {
    const row = this.inputs.get(id);
    return row && row.userId === userId ? row.input : undefined;
  }

  async saveAnalysis(params: SaveAnalysisParams): Promise<{ id: string; createdAt: string }> {
    this.saved.push(params);
    const id = randomUUID();
    const createdAt = new Date('2026-05-01T00:00:00.000Z').toISOString();

    this.analyses.set(id, {
      id,
      createdAt,
      userId: params.userId,
      input: this.inputs.get(params.financialInputId)!.input,
      result: params.result,
    });

    return { id, createdAt };
  }

  async findAnalysis(userId: string, id: string): Promise<PersistedAnalysis | undefined> {
    const row = this.analyses.get(id);
    return row && row.userId === userId ? row : undefined;
  }

  async listAnalyses(userId: string): Promise<PersistedAnalysis[]> {
    return [...this.analyses.values()].filter((a) => a.userId === userId);
  }
}

export function anAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    scenarios: [],
    requestedDbr: 0.24,
    overallRisk: 'safe',
    provenance: {
      ruleVersion: 'SAMA-2018-05',
      inflationValue: 0.02,
      inflationSource: 'GASTAT',
      inflationAsOf: '2026-05',
      // The rate the instalment was amortized at, and whether it was ours or the caller's.
      // A result that cannot say which rate produced its instalment is not reproducible.
      apr: 0.06,
      aprIsIndicative: true,
      assumptions: { salaryGrowth: 0.02, inflation: 0.02 },
      dataSources: { existingCommitments: 'manual', grossSalary: 'manual' },
      computedAt: '2026-05-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------- simah

/**
 * A SIMAH double whose verified figures differ from the manual declaration on purpose — that
 * gap is exactly what the provenance and the UI badge exist to surface.
 */
export class FakeSimahProvider implements SimahProvider {
  readonly isActive = true;
  readonly calls: SimahSubjectRef[] = [];

  constructor(private readonly profile: Partial<SimahCreditProfile> = {}) {}

  async getCreditProfile(subject: SimahSubjectRef): Promise<SimahCreditProfile> {
    this.calls.push(subject);
    return {
      referenceId: 'SMH-TEST00000',
      verifiedGrossSalary: 14_500,
      commitments: [
        { creditor: 'عيّنة', type: 'personal_finance', monthlyInstallment: 1_850, outstandingBalance: 46_200 },
      ],
      totalMonthlyInstallments: 1_850,
      standing: 'current',
      defaultsLast24Months: 0,
      creditScore: 720,
      reportGeneratedAt: '2026-05-01T00:00:00.000Z',
      source: 'SIMAH (mock)',
      ...this.profile,
    };
  }
}

// ---------------------------------------------------------------------------- gosi

/**
 * A GOSI income-verification double: deterministic, no artificial latency. Its contribution wage
 * becomes the auto-pulled gross salary; sector and service-months become employment sector and
 * tenure.
 */
export class FakeGosiProvider implements IncomeVerificationProvider {
  readonly calls: string[] = [];

  constructor(private readonly record: Partial<GosiEmploymentRecord> = {}) {}

  async getEmploymentRecord(nationalId: string): Promise<GosiEmploymentRecord> {
    this.calls.push(nationalId);
    return {
      identityNumber: '10******34',
      fullName: 'اختبار',
      employerName: 'جهة اختبار',
      employmentStatus: 'active',
      contributionWage: 15_000,
      basicWage: 12_000,
      housingAllowance: 2_000,
      otherAllowances: 1_000,
      serviceMonths: 48,
      sector: 'private',
      provenance: {
        source: 'GOSI',
        mode: 'mock',
        asOfDate: '2026-01-01',
        fetchedAt: '2026-01-01T00:00:00.000Z',
      },
      ...this.record,
    };
  }
}

// ---------------------------------------------------------------------------- auth

export class FakeAuthRepository implements AuthRepository {
  readonly users = new Map<string, UserRecord>();
  readonly otps = new Map<string, OtpRecordRow>();
  readonly sessions = new Map<string, SessionRow & { refreshTokenHash: string }>();

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    return [...this.users.values()].find((u) => u.email === email);
  }

  async findUserById(id: string): Promise<UserRecord | undefined> {
    return this.users.get(id);
  }

  async createUser(email: string, authProvider: AuthMethod): Promise<UserRecord> {
    const user: UserRecord = {
      id: randomUUID(),
      email,
      emailVerifiedAt: null,
      authProvider,
      pdplConsentAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    this.users.set(user.id, user);
    return user;
  }

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.emailVerifiedAt = at;
  }

  async recordPdplConsent(userId: string, at: Date): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.pdplConsentAt = at;
  }

  async deleteUser(userId: string): Promise<void> {
    this.users.delete(userId);
    for (const [id, otp] of this.otps) if (otp.userId === userId) this.otps.delete(id);
    for (const [id, s] of this.sessions) if (s.userId === userId) this.sessions.delete(id);
  }

  async createOtp(params: {
    userId: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<OtpRecordRow> {
    const otp: OtpRecordRow = {
      id: randomUUID(),
      userId: params.userId,
      codeHash: params.codeHash,
      expiresAt: params.expiresAt,
      consumedAt: null,
      attempts: 0,
    };
    this.otps.set(otp.id, otp);
    return otp;
  }

  async findLatestActiveOtp(userId: string): Promise<OtpRecordRow | undefined> {
    return [...this.otps.values()]
      .reverse()
      .find((o) => o.userId === userId && o.consumedAt === null);
  }

  async incrementOtpAttempts(otpId: string): Promise<number> {
    const otp = this.otps.get(otpId)!;
    otp.attempts += 1;
    return otp.attempts;
  }

  async consumeOtp(otpId: string, at: Date): Promise<void> {
    const otp = this.otps.get(otpId);
    if (otp) otp.consumedAt = at;
  }

  async invalidateOtps(userId: string, at: Date): Promise<void> {
    for (const otp of this.otps.values()) {
      if (otp.userId === userId && otp.consumedAt === null) otp.consumedAt = at;
    }
  }

  async createSession(params: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<SessionRow> {
    const session = {
      id: randomUUID(),
      userId: params.userId,
      refreshTokenHash: params.refreshTokenHash,
      expiresAt: params.expiresAt,
      revokedAt: null as Date | null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionByRefreshHash(hash: string): Promise<SessionRow | undefined> {
    return [...this.sessions.values()].find((s) => s.refreshTokenHash === hash);
  }

  async revokeSession(sessionId: string, at: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.revokedAt = at;
  }

  async revokeAllSessions(userId: string, at: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.revokedAt === null) session.revokedAt = at;
    }
  }
}

/**
 * A fast, fake hasher. Argon2 is deliberately slow — that is its entire job — and paying that
 * cost on every assertion would make the auth suite crawl. The REAL hasher is what production
 * uses; this one only has to be honest about equality.
 */
export class FakeHasher implements Hasher {
  private tokenCounter = 0;
  private codeCounter = 0;

  async hashOtp(code: string): Promise<string> {
    return `hashed:${code}`;
  }

  async verifyOtp(hash: string, code: string): Promise<boolean> {
    return hash === `hashed:${code}`;
  }

  hashToken(token: string): string {
    return `sha:${token}`;
  }

  generateToken(): string {
    this.tokenCounter += 1;
    return `token-${this.tokenCounter}`;
  }

  /**
   * Deterministic but DIFFERENT on every call — real codes are, and a fake that returns the same
   * six digits forever would quietly make "a new code invalidates the old one" untestable, because
   * the old code and the new one would be the same string.
   */
  generateOtpDigits(count: number): number[] {
    this.codeCounter += 1;
    const seed = this.codeCounter;
    return Array.from({ length: count }, (_, i) => (seed * 7 + i * 3) % 10);
  }
}

export class FakeMailer implements Mailer {
  readonly sent: Array<{ to: string; code: string }> = [];

  async sendOtp(params: { to: string; code: string; expiresInMinutes: number }): Promise<void> {
    this.sent.push({ to: params.to, code: params.code });
  }

  get lastCode(): string | undefined {
    return this.sent[this.sent.length - 1]?.code;
  }
}

// ---------------------------------------------------------------------------- chat

export class FakeChatRepository implements ChatRepository {
  readonly sessions = new Map<string, ChatSessionRecord>();

  async create(userId: string): Promise<ChatSessionRecord> {
    const session: ChatSessionRecord = {
      id: randomUUID(),
      userId,
      transcript: [],
      extracted: {},
      complete: false,
      extractedInputId: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z').toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(userId: string, id: string): Promise<ChatSessionRecord | undefined> {
    const session = this.sessions.get(id);
    return session && session.userId === userId ? session : undefined;
  }

  async update(
    id: string,
    data: {
      transcript: ChatMessage[];
      extracted: PartialUserFinancialData;
      complete: boolean;
      extractedInputId?: string;
    },
  ): Promise<ChatSessionRecord> {
    const session = this.sessions.get(id)!;
    const updated: ChatSessionRecord = {
      ...session,
      transcript: data.transcript,
      extracted: data.extracted,
      complete: data.complete,
      extractedInputId: data.extractedInputId ?? session.extractedInputId,
    };
    this.sessions.set(id, updated);
    return updated;
  }
}

// ---------------------------------------------------------------------------- fixtures

export function aUserFinancialData(
  overrides: Partial<UserFinancialData> = {},
): UserFinancialData {
  return {
    goal: 'car',
    financingAmount: 150_000,
    termYears: 5,
    grossSalary: 12_000,
    additionalIncome: 0,
    existingCommitments: 0,
    monthlyExpenses: 5_000,
    familyStatus: 'married',
    savings: 20_000,
    employmentSector: 'private',
    tenureYears: 4,
    ...overrides,
  };
}

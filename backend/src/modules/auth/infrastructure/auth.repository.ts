import type { AuthMethod, UserProfile } from '@shared/types';
import type { Db } from '@/db/prisma';

export interface UserRecord {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  authProvider: AuthMethod;
  pdplConsentAt: Date | null;
  createdAt: Date;
}

export interface OtpRecordRow {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
}

export interface SessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  findUserById(id: string): Promise<UserRecord | undefined>;
  createUser(email: string, authProvider: AuthMethod): Promise<UserRecord>;
  markEmailVerified(userId: string, at: Date): Promise<void>;
  recordPdplConsent(userId: string, at: Date): Promise<void>;
  deleteUser(userId: string): Promise<void>;

  createOtp(params: { userId: string; codeHash: string; expiresAt: Date }): Promise<OtpRecordRow>;
  findLatestActiveOtp(userId: string): Promise<OtpRecordRow | undefined>;
  incrementOtpAttempts(otpId: string): Promise<number>;
  consumeOtp(otpId: string, at: Date): Promise<void>;
  /** Burn every outstanding code for this user. A new request invalidates the old codes. */
  invalidateOtps(userId: string, at: Date): Promise<void>;

  createSession(params: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<SessionRow>;
  findSessionByRefreshHash(hash: string): Promise<SessionRow | undefined>;
  revokeSession(sessionId: string, at: Date): Promise<void>;
  revokeAllSessions(userId: string, at: Date): Promise<void>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: Db) {}

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row ? toUserRecord(row) : undefined;
  }

  async findUserById(id: string): Promise<UserRecord | undefined> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toUserRecord(row) : undefined;
  }

  async createUser(email: string, authProvider: AuthMethod): Promise<UserRecord> {
    const row = await this.db.user.create({ data: { email, authProvider } });
    return toUserRecord(row);
  }

  async markEmailVerified(userId: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { emailVerifiedAt: at } });
  }

  async recordPdplConsent(userId: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { pdplConsentAt: at } });
  }

  /** PDPL right-to-erasure. Everything user-linked cascades from this row (Scope §11.2). */
  async deleteUser(userId: string): Promise<void> {
    await this.db.user.delete({ where: { id: userId } });
  }

  async createOtp(params: {
    userId: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<OtpRecordRow> {
    return this.db.otpCode.create({
      data: {
        userId: params.userId,
        codeHash: params.codeHash,
        expiresAt: params.expiresAt,
        purpose: 'login',
      },
      select: OTP_FIELDS,
    });
  }

  async findLatestActiveOtp(userId: string): Promise<OtpRecordRow | undefined> {
    const row = await this.db.otpCode.findFirst({
      where: { userId, purpose: 'login', consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: OTP_FIELDS,
    });
    return row ?? undefined;
  }

  async incrementOtpAttempts(otpId: string): Promise<number> {
    const row = await this.db.otpCode.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return row.attempts;
  }

  async consumeOtp(otpId: string, at: Date): Promise<void> {
    await this.db.otpCode.update({ where: { id: otpId }, data: { consumedAt: at } });
  }

  async invalidateOtps(userId: string, at: Date): Promise<void> {
    await this.db.otpCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: at },
    });
  }

  async createSession(params: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<SessionRow> {
    return this.db.session.create({
      data: {
        userId: params.userId,
        refreshTokenHash: params.refreshTokenHash,
        expiresAt: params.expiresAt,
        userAgent: params.userAgent ?? null,
        ip: params.ip ?? null,
      },
      select: SESSION_FIELDS,
    });
  }

  async findSessionByRefreshHash(hash: string): Promise<SessionRow | undefined> {
    const row = await this.db.session.findUnique({
      where: { refreshTokenHash: hash },
      select: SESSION_FIELDS,
    });
    return row ?? undefined;
  }

  async revokeSession(sessionId: string, at: Date): Promise<void> {
    await this.db.session.update({ where: { id: sessionId }, data: { revokedAt: at } });
  }

  async revokeAllSessions(userId: string, at: Date): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}

const OTP_FIELDS = {
  id: true,
  userId: true,
  codeHash: true,
  expiresAt: true,
  consumedAt: true,
  attempts: true,
} as const;

const SESSION_FIELDS = {
  id: true,
  userId: true,
  expiresAt: true,
  revokedAt: true,
} as const;

function toUserRecord(row: {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  authProvider: string;
  pdplConsentAt: Date | null;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    authProvider: row.authProvider as AuthMethod,
    pdplConsentAt: row.pdplConsentAt,
    createdAt: row.createdAt,
  };
}

/** DB row → the API's UserProfile contract. */
export function toUserProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    authProvider: user.authProvider,
    pdplConsentAt: user.pdplConsentAt ? user.pdplConsentAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

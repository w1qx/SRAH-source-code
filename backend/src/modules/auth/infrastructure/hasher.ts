import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Two hashes, for two different threats. The difference is not a detail — getting it
 * backwards breaks either security or the product.
 *
 * OTP CODES: six digits. A million possibilities. If those were stored under a fast hash,
 * a leaked database would be brute-forced in seconds. They get argon2id, which is
 * deliberately slow and memory-hard. We can afford it: we verify a code at most a handful
 * of times per login.
 *
 * REFRESH TOKENS: 256 bits from a CSPRNG. There is nothing to brute-force — guessing one is
 * strictly harder than guessing the argon2 hash of one. They get SHA-256, which is fast and,
 * crucially, DETERMINISTIC: argon2 salts every hash, so the same token hashes differently
 * every time and you could never look a session up by it.
 */
export interface Hasher {
  hashOtp(code: string): Promise<string>;
  verifyOtp(hash: string, code: string): Promise<boolean>;
  /** Deterministic — this one is used as a lookup key. */
  hashToken(token: string): string;
  generateToken(): string;
  generateOtpDigits(count: number): number[];
}

export class CryptoHasher implements Hasher {
  async hashOtp(code: string): Promise<string> {
    return argon2.hash(code, { type: argon2.argon2id });
  }

  async verifyOtp(hash: string, code: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, code);
    } catch {
      // A malformed hash in the database is not a valid code — it is a bug, and it must
      // never accidentally authenticate anyone.
      return false;
    }
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  generateOtpDigits(count: number): number[] {
    return Array.from({ length: count }, () => randomInt(0, 10));
  }
}

/** Constant-time string comparison, for anything compared against a secret. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

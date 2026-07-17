/**
 * OTP policy — pure decisions about whether a code may still be used.
 *
 * No crypto, no clock, no database: the times are passed in. Keeping the rules pure means
 * "is this code still valid?" is a question we can test exhaustively, including the awkward
 * boundaries, without standing up Postgres or waiting ten minutes for a code to expire.
 */

export interface OtpRecord {
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
}

export type OtpRejection = 'expired' | 'already_used' | 'too_many_attempts';

export interface OtpPolicy {
  maxAttempts: number;
  ttlMinutes: number;
  length: number;
}

/** Why this code may NOT be used — or undefined if it is still live. */
export function rejectionReason(
  record: OtpRecord,
  policy: OtpPolicy,
  now: Date,
): OtpRejection | undefined {
  if (record.consumedAt !== null) return 'already_used';
  if (record.attempts >= policy.maxAttempts) return 'too_many_attempts';
  if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
  return undefined;
}

export function expiryFrom(now: Date, policy: OtpPolicy): Date {
  return new Date(now.getTime() + policy.ttlMinutes * 60_000);
}

export function secondsUntil(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 1000));
}

/**
 * The digit string a user would recognise as a code. Randomness is INJECTED — a pure
 * function cannot call a random number generator, and the caller in infrastructure supplies
 * cryptographically secure bytes.
 */
export function formatCode(randomDigits: readonly number[], length: number): string {
  if (randomDigits.length < length) {
    throw new RangeError(`Need at least ${length} random digits, got ${randomDigits.length}`);
  }
  return randomDigits
    .slice(0, length)
    .map((d) => String(Math.abs(Math.trunc(d)) % 10))
    .join('');
}

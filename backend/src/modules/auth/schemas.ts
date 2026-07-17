import { z } from 'zod';

export const RequestOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();

export const VerifyOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    /** Digits only — the code is generated as digits, so anything else is not a code. */
    code: z.string().trim().regex(/^\d{4,10}$/, 'The code must be 4–10 digits.'),
    /** Required on first login (signup). FR-03. */
    pdplConsent: z.boolean().optional(),
  })
  .strict();

export const RefreshSchema = z
  .object({
    /** Optional in the body: browsers send it as an httpOnly cookie instead. */
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

/**
 * The Nafath national id. Validated even though the route is inactive — the day the adapter
 * goes live, the boundary is already guarded, and until then a caller gets a straight answer
 * about a malformed id rather than a confusing "not active" for the wrong reason.
 */
export const NafathInitiateSchema = z
  .object({
    nationalId: z.string().trim().regex(/^[12]\d{9}$/, 'A Saudi national id is 10 digits starting with 1 or 2.'),
  })
  .strict();

export const NafathCallbackSchema = z
  .object({
    transactionId: z.string().trim().min(1),
  })
  .strict();

import type { AuthProvider } from '@shared/types';

/**
 * Email OTP — the auth method that IS active in the MVP.
 *
 * Sits behind the same AuthProvider port as Nafath, so the rest of the app asks "which
 * providers are available?" and never branches on the answer.
 */
export class EmailOtpAuthProvider implements AuthProvider {
  readonly method = 'email_otp' as const;
  readonly isActive = true;
}

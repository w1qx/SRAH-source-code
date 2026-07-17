"use client";

import type { AuthSession, OtpRequestResult, UserProfile } from "@shared/types";
import { request, setAccessToken } from "./client";

/**
 * Email OTP is the only live auth method. There is no password and no separate register
 * endpoint: signing up IS the first successful verify, which is why `pdplConsent` must be
 * sent the first time — the backend rejects a first verify without it.
 */

export function requestOtp(email: string, signal?: AbortSignal): Promise<OtpRequestResult> {
  return request<OtpRequestResult>("/auth/otp/request", {
    method: "POST",
    body: { email },
    signal,
  });
}

export async function verifyOtp(
  email: string,
  code: string,
  pdplConsent: boolean,
  signal?: AbortSignal,
): Promise<{ session: AuthSession; profile: UserProfile; isNewUser: boolean }> {
  const data = await request<{ session: AuthSession; profile: UserProfile; isNewUser?: boolean }>("/auth/otp/verify", {
    method: "POST",
    body: { email, code, pdplConsent },
    signal,
  });

  setAccessToken(data.session.accessToken);
  return { ...data, isNewUser: data.isNewUser ?? false };
}

export function getProfile(signal?: AbortSignal): Promise<UserProfile> {
  return request<{ profile: UserProfile }>("/auth/me", { auth: true, signal }).then(
    (r) => r.profile,
  );
}

export async function logout(): Promise<void> {
  try {
    await request<void>("/auth/logout", { method: "POST", body: {}, auth: true });
  } finally {
    setAccessToken(null);
  }
}

export async function mockNafathLogin(
  nationalId: string,
  signal?: AbortSignal,
): Promise<{ session: AuthSession; profile: UserProfile; isNewUser: boolean }> {
  const data = await request<{ session: AuthSession; profile: UserProfile; isNewUser?: boolean }>("/auth/nafath/mock-login", {
    method: "POST",
    body: { nationalId },
    signal,
  });

  setAccessToken(data.session.accessToken);
  return { ...data, isNewUser: data.isNewUser ?? false };
}

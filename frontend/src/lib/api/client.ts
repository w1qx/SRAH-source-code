"use client";

/**
 * The one place the frontend talks to the API.
 *
 * Everything the UI renders comes through here — there is no mock layer behind it any more.
 * The backend replies with a single error envelope, `{ error: { code, message, details } }`,
 * so callers get a typed ApiError with a machine-readable `code` instead of a string.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ApiErrorCode =
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "otp_invalid"
  | "otp_expired"
  | "otp_too_many_attempts"
  | "analysis_blocked"
  | "feature_disabled"
  | "llm_unavailable"
  | "internal_error"
  | "network_error";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /**
   * A validation_failed body carries `details.issues: [{ path, message }]`. Without this the UI
   * shows only "Invalid request body.", which tells the user nothing about WHICH field is wrong.
   */
  get issues(): { path: string; message: string }[] {
    const d = this.details as { issues?: { path?: string; message?: string }[] } | undefined;
    if (!d?.issues) return [];
    return d.issues.map((i) => ({ path: String(i.path ?? ""), message: String(i.message ?? "") }));
  }

  /**
   * e.g. "مبلغ التمويل: Number must be greater than 0".
   *
   * Only validation issues carry a `path`. A blocked analysis (422) reports issues keyed by a
   * `code` with no path, and its `message` is already a complete Arabic sentence — so fall back
   * to the message rather than prefixing it with an empty label.
   */
  describe(fieldLabels: Record<string, string> = {}): string {
    const located = this.issues.filter((i) => i.path.length > 0);
    if (located.length === 0) return this.message;

    return located
      .map((i) => {
        const field = i.path.split(".").pop() ?? i.path;
        return `${fieldLabels[field] ?? field}: ${i.message}`;
      })
      .join(" — ");
  }
}

/* ------------------------------------------------------------------ */
/* Access token                                                        */
/* ------------------------------------------------------------------ */

/**
 * The access token lives in memory, mirrored to sessionStorage so a page reload keeps you
 * signed in. The REFRESH token is never touched here: the backend sets it as an httpOnly
 * cookie (`suraa_refresh`), which JS cannot read — which is the point. Every call therefore
 * sends `credentials: "include"` so that cookie rides along to /auth/refresh.
 */
const TOKEN_KEY = "suraa_access_token";

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window === "undefined") return null;
  accessToken = sessionStorage.getItem(TOKEN_KEY);
  return accessToken;
}

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Send the bearer token. */
  auth?: boolean;
  /**
   * Send this Blob/File as the raw request body (Content-Type taken from the blob),
   * bypassing JSON encoding — used for the PDF statement upload.
   */
  rawBody?: Blob;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let code: ApiErrorCode = "internal_error";
  let message = `Request failed (${res.status})`;
  let details: unknown;

  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    // A non-JSON body (proxy error page, empty 502) — keep the generic message.
  }

  return new ApiError(code, message, res.status, details);
}

/**
 * A 15-minute access token WILL expire mid-session. On a 401 we spend the refresh cookie once,
 * then replay the original request. If the refresh also fails the session is genuinely over and
 * the error propagates, so the UI can send the user back to /login.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { session?: { accessToken?: string } };
      if (!data.session?.accessToken) return false;
      setAccessToken(data.session.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = false, rawBody, _retried = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": rawBody ? rawBody.type || "application/octet-stream" : "application/json",
  };
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      signal,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(
      "network_error",
      "تعذّر الاتصال بالخادم. تأكد من تشغيل الخدمة ثم أعد المحاولة.",
      0,
    );
  }

  if (res.status === 401 && auth && !_retried) {
    if (await refreshSession()) {
      return request<T>(path, { ...options, _retried: true });
    }
    setAccessToken(null);
  }

  if (!res.ok) throw await parseError(res);

  // 204 No Content (logout, account deletion).
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

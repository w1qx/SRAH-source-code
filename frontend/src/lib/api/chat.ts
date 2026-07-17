"use client";

import type { DataSource, UserFinancialData } from "@shared/types";
import { request } from "./client";

/**
 * The questions the advisor asks are OWNED BY THE BACKEND — field name, Arabic wording and
 * quick replies all come from `/chat/questions`. The frontend no longer keeps its own list.
 */
export interface QuickReply {
  value: string;
  ar: string;
  en: string;
}

export interface ScopedQuestion {
  field: keyof UserFinancialData;
  ar: string;
  en: string;
  quickReplies?: QuickReply[];
}

export function getQuestions(signal?: AbortSignal): Promise<ScopedQuestion[]> {
  return request<{ questions: ScopedQuestion[] }>("/chat/questions", { signal }).then(
    (r) => r.questions,
  );
}

/**
 * The values the backend auto-pulls (GOSI income, SIMAH obligations) for the signed-in user,
 * with the source that supplied each. Called on the searching screen and merged into the
 * collected answers before analysis. Empty objects when both pull flags are off.
 */
export interface PulledFinancialData {
  pulled: Partial<UserFinancialData>;
  provenance: Partial<Record<keyof UserFinancialData, DataSource>>;
}

export function pullFinancialData(signal?: AbortSignal): Promise<PulledFinancialData> {
  return request<PulledFinancialData>("/chat/pull", { method: "POST", body: {}, auth: true, signal });
}

/**
 * The "رفع تقرير سمة" gateway: uploads the user's SIMAH credit-report PDF (raw body, not
 * multipart) and gets back the extracted salary/obligations in the same `{ pulled, provenance }`
 * shape as /chat/pull, so callers merge it identically. Extraction is server-side — see the
 * backend's statement-extraction.ts for what is real vs mocked.
 */
export function uploadStatement(file: File, signal?: AbortSignal): Promise<PulledFinancialData> {
  return request<PulledFinancialData>("/chat/statement", {
    method: "POST",
    rawBody: file,
    auth: true,
    signal,
  });
}

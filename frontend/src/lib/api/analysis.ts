"use client";

import type {
  AnalysisResult,
  RiskThresholds,
  SamaRuleSet,
  UserFinancialData,
} from "@shared/types";
import { request } from "./client";

/** One past analysis, replayed exactly as it was given (its own rule version and CPI). */
export interface PersistedAnalysis {
  id: string;
  createdAt: string;
  input: UserFinancialData;
  result: AnalysisResult;
}

export interface AnalysisRun {
  analysisId: string;
  result: AnalysisResult;
  /**
   * The effective figures the engine ran on — verified when SIMAH was applied, manual otherwise.
   * The composition views read this so they always agree with the DBR the engine computed.
   */
  input: UserFinancialData;
  /** Non-blocking flags, e.g. `unstable_income` when tenure < 1 year. */
  warnings: string[];
}

/**
 * Run the analysis. Everything the analysis page renders — the installment, the DBR, the
 * scenarios, the safer option — comes from this one response. The frontend computes none of it.
 *
 * `apr` is the annual profit rate the installment is amortized at, as a fraction (0.049 = 4.9%).
 * Omit it and the engine uses its indicative rate and says so (`provenance.aprIsIndicative`);
 * pass one once the user holds a real offer, and the whole analysis is recomputed on it.
 */
export function runAnalysis(
  input: UserFinancialData,
  apr?: number,
  signal?: AbortSignal,
): Promise<AnalysisRun> {
  return request<AnalysisRun>("/analysis", {
    method: "POST",
    body: apr === undefined ? { input } : { input, apr },
    auth: true,
    signal,
  });
}

/** Account history, newest first. */
export function listAnalyses(signal?: AbortSignal): Promise<PersistedAnalysis[]> {
  return request<{ analyses: PersistedAnalysis[] }>("/analysis", { auth: true, signal }).then(
    (r) => r.analyses,
  );
}

/** NB: this route returns the analysis unwrapped, unlike the list route. */
export function getAnalysis(id: string, signal?: AbortSignal): Promise<PersistedAnalysis> {
  return request<PersistedAnalysis>(`/analysis/${id}`, { auth: true, signal });
}

/**
 * The SAMA rules in force — public, unauthenticated. The 33.33% deduction cap the UI draws its
 * red line at is regulation, so it is read from here rather than hardcoded in a component.
 */
export function getRules(
  signal?: AbortSignal,
): Promise<{ rules: SamaRuleSet; thresholds: RiskThresholds }> {
  return request<{ rules: SamaRuleSet; thresholds: RiskThresholds }>("/analysis/rules", { signal });
}

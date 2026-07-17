"use client";

import { create } from "zustand";
import type { UserFinancialData } from "@shared/types";
import type { AnalysisRun } from "@/lib/api/analysis";

/**
 * The advisor flow's state.
 *
 * `answers` is now the CONTRACT type, keyed by the same field names the backend's questions
 * come back with (`goal`, `financingAmount`, …) and holding typed values — not the old
 * `Record<string, string>` of Arabic labels that had to be re-parsed before it could be sent.
 *
 * `analysis` is the server's answer, held verbatim. Every number the analysis and offers pages
 * render is read out of here; neither page computes anything of its own.
 */
interface AppState {
  currentStep: 1 | 2 | 3;
  currentQuestion: number;
  answers: Partial<UserFinancialData>;
  analysis: AnalysisRun | null;
  selectedOffer: string | null;
  isAnalyzing: boolean;
  chatStarted: boolean;
  reviewMode: boolean;
  sortBy: string;
  /**
   * Bumped by `resetAll`. The advisor keys the conversation on it, so "بدء تحليل جديد" remounts
   * the chat and drops its local message list — the store alone can't clear that.
   */
  runId: number;

  setStep: (step: 1 | 2 | 3) => void;
  setCurrentQuestion: (q: number) => void;
  setAnswer: <K extends keyof UserFinancialData>(field: K, value: UserFinancialData[K]) => void;
  setAnalysis: (analysis: AnalysisRun | null) => void;
  setSelectedOffer: (id: string | null) => void;
  setIsAnalyzing: (v: boolean) => void;
  setChatStarted: (v: boolean) => void;
  setReviewMode: (v: boolean) => void;
  setSortBy: (v: string) => void;
  resetAll: () => void;
}

const INITIAL = {
  currentStep: 1 as const,
  currentQuestion: 0,
  answers: {} as Partial<UserFinancialData>,
  analysis: null,
  selectedOffer: null,
  isAnalyzing: false,
  chatStarted: false,
  reviewMode: false,
  sortBy: "compatibility",
  runId: 0,
};

export const useAppStore = create<AppState>((set) => ({
  ...INITIAL,

  setStep: (step) => set({ currentStep: step }),
  setCurrentQuestion: (q) => set({ currentQuestion: q }),
  setAnswer: (field, value) => set((state) => ({ answers: { ...state.answers, [field]: value } })),
  setAnalysis: (analysis) => set({ analysis }),
  setSelectedOffer: (id) => set({ selectedOffer: id }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setChatStarted: (v) => set({ chatStarted: v }),
  setReviewMode: (v) => set({ reviewMode: v }),
  setSortBy: (v) => set({ sortBy: v }),
  resetAll: () => set((state) => ({ ...INITIAL, runId: state.runId + 1 })),
}));

/** The 11 fields the backend requires before an analysis can run. */
export const REQUIRED_FIELDS: (keyof UserFinancialData)[] = [
  "goal",
  "financingAmount",
  "termYears",
  "grossSalary",
  "additionalIncome",
  "existingCommitments",
  "monthlyExpenses",
  "familyStatus",
  "savings",
  "employmentSector",
  "tenureYears",
];

/** Narrows the partial answers to the full contract type, or null if anything is missing. */
export function completeInput(answers: Partial<UserFinancialData>): UserFinancialData | null {
  const missing = REQUIRED_FIELDS.some((f) => answers[f] === undefined || answers[f] === null);
  return missing ? null : (answers as UserFinancialData);
}

"use client";

import { useState, useEffect } from "react";
import { useAppStore, completeInput } from "@/store/useAppStore";
import { runAnalysis } from "@/lib/api/analysis";
import { ApiError } from "@/lib/api/client";
import { Logo } from "@/components/ui/logo";

const steps = [
  "نحسب قدرتك المالية الحالية",
  "نختبر أثر تغير المصروفات",
  "نبني السيناريو المتوقع",
  "نقارن مستوى المخاطر",
];

const STEP_MS = 800;
/** The steps are a progress read-out, not a stopwatch: never leave before they finish. */
const MIN_VISIBLE_MS = steps.length * STEP_MS + 400;

/** Field names as the backend reports them → what the user actually saw us ask. */
const FIELD_LABELS: Record<string, string> = {
  goal: "الهدف",
  financingAmount: "مبلغ التمويل",
  termYears: "مدة السداد",
  grossSalary: "الراتب الشهري",
  additionalIncome: "الدخل الإضافي",
  existingCommitments: "الالتزامات الحالية",
  monthlyExpenses: "المصروفات الشهرية",
  familyStatus: "الحالة الأسرية",
  savings: "المدخرات",
  employmentSector: "قطاع العمل",
  tenureYears: "مدة الخدمة",
};

export default function AnalyzingOverlay() {
  const { answers, setAnalysis, setIsAnalyzing, setStep, setReviewMode } = useAppStore();
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** The engine refused to analyse (e.g. expenses already exceed income) — not an error. */
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    const timers = steps.map((_, i) => setTimeout(() => setActiveStep(i), i * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, []);

  /**
   * The overlay owns the request AND the handoff. It has to: showing this overlay unmounts
   * ConversationPage, so a promise started over there would be waiting inside a dead component.
   */
  useEffect(() => {
    const input = completeInput(answers);
    if (!input) {
      setIsAnalyzing(false);
      setReviewMode(true);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const startedAt = Date.now();

    // No apr here: the user has no offer yet, so the engine amortizes at its indicative rate
    // and flags it as such. The analysis page lets them re-run on a real rate.
    runAnalysis(input, undefined, controller.signal)
      .then(async (run) => {
        if (cancelled) return;
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_VISIBLE_MS) {
          await new Promise((r) => setTimeout(r, MIN_VISIBLE_MS - elapsed));
        }
        if (cancelled) return;

        setActiveStep(steps.length);
        setAnalysis(run);
        setIsAnalyzing(false);
        setStep(2);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;

        if (!(e instanceof ApiError)) {
          setError("تعذّر إجراء التحليل. حاول مرة أخرى.");
          return;
        }

        if (e.code === "unauthorized") {
          setError("انتهت جلستك. سجّل الدخول مرة أخرى لإتمام التحليل.");
          return;
        }

        // A blocked analysis is not a failure — the engine refused to model new financing on
        // top of a deficit, and its message already explains why, in Arabic.
        if (e.code === "analysis_blocked") {
          setBlocked(e.message);
          return;
        }

        // Name the field the server rejected, instead of the bare "Invalid request body."
        setError(e.describe(FIELD_LABELS));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [answers, setAnalysis, setIsAnalyzing, setStep, setReviewMode]);

  if (blocked) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div role="alert" className="max-w-md w-full text-center rounded-[20px] border border-caution/30 bg-caution-bg p-6">
          <p className="text-sm font-semibold text-caution mb-2">لا يمكن إجراء التحليل</p>
          <p className="text-xs text-navy leading-relaxed mb-4">{blocked}</p>
          <button
            onClick={() => {
              setIsAnalyzing(false);
              setReviewMode(true);
            }}
            className="min-h-[44px] px-6 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
          >
            تعديل بياناتي
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div role="alert" className="max-w-md w-full text-center rounded-[20px] border border-danger/30 bg-danger-bg p-6">
          <p className="text-sm font-semibold text-danger mb-1">تعذّر إجراء التحليل</p>
          <p className="text-xs text-text-secondary leading-relaxed mb-4">{error}</p>
          <button
            onClick={() => {
              setIsAnalyzing(false);
              setReviewMode(true);
            }}
            className="min-h-[44px] px-6 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
          >
            العودة للمراجعة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center" role="status" aria-live="polite" aria-label="جارٍ تحليل قرارك">
        <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center mx-auto mb-8 shadow-sm">
          <Logo className="w-11 h-11 text-white" />
        </div>

        <h2 className="text-xl font-bold text-navy mb-6">جارٍ تحليل قرارك...</h2>

        <div className="space-y-2 text-right">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-[20px] transition-all duration-500 ${
                i <= activeStep ? "bg-white border border-border" : "opacity-30"
              }`}
            >
              {i < activeStep ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : i === activeStep ? (
                <div className="w-4 h-4 rounded-full border-2 border-purple animate-pulse-gentle" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-border" />
              )}
              <span className={`text-sm ${i <= activeStep ? "text-navy font-medium" : "text-text-secondary"}`}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

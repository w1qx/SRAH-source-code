"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import type { AnalysisSummary, DashboardData } from "@shared/types";
import { getDashboard } from "@/lib/api/dashboard";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/lib/toast";
import type { SimulationPreview } from "./finance";
import HealthGauge from "./HealthGauge";
import PastAnalysesSection from "./PastAnalysesSection";
import ScenarioDrawer from "./ScenarioDrawer";

/* ------------------------------------------------------------------ */
/* Loading skeleton — reserves the real layout so nothing jumps in     */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse-gentle" aria-hidden="true">
      <div className="h-[264px] rounded-[15px] border border-border bg-white" />
      <div>
        <div className="h-4 w-32 rounded bg-border/70 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-[196px] rounded-[15px] border border-border bg-white" />
          <div className="h-[196px] rounded-[15px] border border-border bg-white" />
        </div>
      </div>
      <div>
        <div className="h-4 w-32 rounded bg-border/70 mb-4" />
        <div className="h-[216px] rounded-[15px] border border-border bg-white" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function DashboardScreen() {
  const router = useRouter();
  // Requests the user submitted from the offers page live in the store (the backend has no
  // submission table yet and returns an empty list) — surface them alongside any server ones.
  const submittedApplications = useAppStore((s) => s.applications);
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /** Start a fresh analysis of a bank offer: clean slate, then flip on offer mode. */
  const startOfferAnalysis = () => {
    const s = useAppStore.getState();
    s.resetAll();
    s.setOfferMode(true);
    s.setHasBankOffer(true);
    router.push("/advisor");
  };

  /** A plain new analysis must never inherit a previous run's offer mode. */
  const clearOfferMode = () => {
    const s = useAppStore.getState();
    s.setOfferMode(false);
    s.setHasBankOffer(null);
    s.setOffer(null);
    s.setOfferAnalysis(null);
  };

  /**
   * Scenarios are lifted into LOCAL state (seeded from the fetch) so the drawer's
   * "حفظ التعديلات" / "حفظ كمسار جديد" update every consumer — the list, the matrix
   * and the drawer itself — in one place. TODO(backend): persist via PUT /analyses.
   */
  const [scenarios, setScenarios] = useState<AnalysisSummary[]>([]);
  /** The scenario currently open in the quick-edit drawer, if any. */
  const [editing, setEditing] = useState<AnalysisSummary | null>(null);
  /** Live values the drawer pushes while sliders move; null = show real data. */
  const [preview, setPreview] = useState<SimulationPreview | null>(null);
  /** The inflation-adjusted projection switch (widget in the health card). */
  const [inflationOn, setInflationOn] = useState(false);

  useEffect(() => {
    // No ref-guard: a StrictMode remount must be able to start a fresh load.
    let cancelled = false;
    const controller = new AbortController();

    // TODO(backend): swap getDashboard() for the real GET /dashboard, or move
    // this to TanStack Query once the API is live (caching + retries for free).
    getDashboard(controller.signal)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setScenarios(result.pastAnalyses);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setData(null);
    setAttempt((n) => n + 1);
  }, []);

  const openScenario = useCallback((a: AnalysisSummary) => setEditing(a), []);
  const closeDrawer = useCallback(() => setEditing(null), []);

  /** Override the edited scenario in place. */
  const saveScenario = useCallback((updated: AnalysisSummary) => {
    setScenarios((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
    toast.success("حُفظت تعديلات السيناريو.");
  }, []);

  /** Keep the original and add the edited copy as a new path. */
  const saveScenarioAsNew = useCallback((created: AnalysisSummary) => {
    setScenarios((prev) => [created, ...prev]);
    setEditing(null);
    toast.success("حُفظ كمسار جديد ضمن تحليلاتك.");
  }, []);

  // The inflation example projects over the horizon the user is actually looking
  // at: the scenario being edited, else the most recent one, else a decade.
  const inflationHorizon = editing?.termYears ?? scenarios[0]?.termYears ?? 10;

  return (
    <div className="flex-1 w-full max-w-[1000px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-in-up">
        <div>
          <h1 className="text-2xl sm:text-[32px] leading-snug font-bold text-navy mb-2">لوحتك المالية</h1>
          <p className="text-text-secondary leading-relaxed max-w-xl">
            وضعك المالي الحالي، وتحليلاتك السابقة لسيناريوهات التمويل — في مكان واحد.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
          <button
            type="button"
            onClick={startOfferAnalysis}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 bg-white border border-navy/20 text-navy font-semibold rounded-[15px] shadow-sm transition-all duration-200 hover:border-navy/40 hover:shadow-md active:scale-[0.99] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            تحليل عرض من أحد البنوك
          </button>
          <Link
            href="/advisor"
            onClick={clearOfferMode}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 bg-orange hover:bg-orange-hover text-white font-semibold rounded-[15px] shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            تحليل جديد
          </Link>
        </div>
      </header>

      {failed ? (
        <div role="alert" className="rounded-[15px] border border-danger/30 bg-danger-bg/60 p-6 text-center">
          <p className="text-sm font-semibold text-danger mb-1">تعذّر تحميل لوحتك</p>
          <p className="text-xs text-text-secondary leading-relaxed mb-4">
            قد يكون الاتصال متعذّراً حالياً. يمكنك المحاولة مرة أخرى.
          </p>
          <button
            onClick={retry}
            className="min-h-[44px] px-6 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-[15px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : !data ? (
        <>
          <p className="sr-only" aria-live="polite">
            جارٍ تحميل لوحتك المالية…
          </p>
          <DashboardSkeleton />
        </>
      ) : (
        <div className="space-y-8">
          <div className="animate-fade-in-up">
            {/* The indicator is derived from the user's latest analysis, so a brand-new
                account genuinely has none — show that instead of inventing a score. */}
            {data.indicator ? (
              <HealthGauge
                indicator={data.indicator}
                preview={preview}
                inflationOn={inflationOn}
                onInflationToggle={setInflationOn}
                inflationHorizonYears={inflationHorizon}
              />
            ) : (
              <section className="bg-white rounded-[15px] border border-dashed border-border p-8 text-center">
                <p className="text-sm font-semibold text-navy mb-1">لا يوجد مؤشر بعد</p>
                <p className="text-xs text-text-secondary leading-relaxed mb-4">
                  مؤشر صحتك المالية يُحسب من آخر تحليل أجريته. ابدأ تحليلك الأول ليظهر هنا.
                </p>
                <Link
                  href="/advisor"
                  onClick={clearOfferMode}
                  className="inline-flex items-center gap-2 min-h-[44px] px-5 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-full transition-colors"
                >
                  ابدأ تحليلاً جديداً
                </Link>
              </section>
            )}
          </div>
          <div className="animate-fade-in-up anim-delay-1">
            <PastAnalysesSection analyses={scenarios} onOpen={openScenario} />
          </div>
        </div>
      )}

      {/* Quick-edit drawer — its sliders drive the gauge above through `preview`. */}
      <AnimatePresence>
        {editing && data && (
          <ScenarioDrawer
            key={editing.id}
            scenario={editing}
            currentDbr={data.indicator?.currentDbr ?? 0}
            inflationOn={inflationOn}
            onPreview={setPreview}
            onSave={saveScenario}
            onSaveAsNew={saveScenarioAsNew}
            onClose={closeDrawer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAppStore, completeInput } from "@/store/useAppStore";
import { getOffers } from "@/lib/api/offers";
import AssistantPanel from "@/components/AssistantPanel";
import { runAnalysis } from "@/lib/api/analysis";
import { ApiError } from "@/lib/api/client";
import StatusBadge from "./StatusBadge";
import { PageBackdrop } from "@/components/ui/page-backdrop";
import { Logo } from "@/components/ui/logo";
import type { BankApplication, FinancingOffer, OfferCategory, RiskTier } from "@shared/types";

/** A browser-safe unique id for a locally-recorded application. */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `app_${Date.now()}`;
}

const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
/** The backend sends APR as a fraction (0.049), never a percentage. */
const apr = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

const RISK_STATUS: Record<RiskTier, "safe" | "caution" | "danger"> = {
  safe: "safe",
  caution: "caution",
  high: "danger",
};

const RISK_LABEL: Record<RiskTier, string> = {
  safe: "ضمن النطاق الآمن",
  caution: "مناسب مع الحذر",
  high: "عالي المخاطر",
};

/** The badges are the backend's own categories — not a score invented in the UI. */
const CATEGORY_LABEL: Record<OfferCategory, string> = {
  best_match: "الأنسب لوضعك",
  lowest_cost: "الأقل تكلفة",
  lowest_installment: "الأقل قسطاً",
};

const SORT_OPTIONS = [
  { id: "lowest-installment", label: "الأقل قسطاً" },
  { id: "lowest-cost", label: "الأقل تكلفة" },
  { id: "shortest-term", label: "الأقصر مدة" },
] as const;

export default function OffersPage() {
  const router = useRouter();
  const { answers, selectedOffer, setSelectedOffer, sortBy, setSortBy, setStep, setAnalysis, offer, analysis, addApplication } =
    useAppStore();

  const [offers, setOffers] = useState<FinancingOffer[] | null>(null);
  const [meta, setMeta] = useState<{ illustrative: boolean; disclaimer: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  /** The offer whose application is being submitted — drives the success animation + redirect. */
  const [submitted, setSubmitted] = useState<FinancingOffer | null>(null);

  const input = useMemo(() => completeInput(answers), [answers]);

  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();

    getOffers(input, controller.signal)
      .then((res) => {
        setOffers(res.offers);
        setMeta({ illustrative: res.illustrative, disclaimer: res.disclaimer });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof ApiError ? e.message : "تعذّر تحميل العروض.");
      });

    return () => controller.abort();
  }, [input]);

  const sorted = useMemo(() => {
    if (!offers) return null;
    const copy = [...offers];
    switch (sortBy) {
      case "lowest-cost":
        return copy.sort((a, b) => a.totalAdditionalCost - b.totalAdditionalCost);
      case "shortest-term":
        return copy.sort((a, b) => a.termYears - b.termYears);
      default:
        return copy.sort((a, b) => a.monthlyInstallment - b.monthlyInstallment);
    }
  }, [offers, sortBy]);

  const salary = answers.grossSalary ?? 0;
  const commitments = answers.existingCommitments ?? 0;
  const expenses = answers.monthlyExpenses ?? 0;

  /**
   * Re-run the analysis on THIS offer's real profit rate.
   *
   * The first analysis is amortized at the engine's indicative rate, because the user had no
   * offer yet. An offer is exactly the missing basis: feeding its APR back through /analysis
   * recomputes the installment, the DBR, every scenario and the risk tier on a real number.
   */
  const analyzeOnOffer = async (offer: FinancingOffer) => {
    if (!input) return;
    setSelectedOffer(offer.id);
    setRerunningId(offer.id);
    try {
      const run = await runAnalysis({ ...input, termYears: offer.termYears }, offer.apr);
      setAnalysis(run);
      setStep(2);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "تعذّر إعادة التحليل على هذا العرض.");
    } finally {
      setRerunningId(null);
    }
  };

  /**
   * Submit a financing request for the chosen offer: record it, play the success animation, then
   * hand the user to their dashboard where the new request is waiting. The application is stored
   * client-side (see the store) until a real submission endpoint exists.
   */
  const submitApplication = (chosen: FinancingOffer) => {
    if (submitted) return; // a submission is already in flight
    setSelectedOffer(chosen.id);
    const application: BankApplication = {
      id: newId(),
      userId: "",
      analysisId: analysis?.analysisId ?? "",
      bankName: chosen.provider,
      financingAmount: input?.financingAmount ?? answers.financingAmount ?? 0,
      termYears: chosen.termYears,
      monthlyInstallment: chosen.monthlyInstallment,
      status: "pending",
      submittedAt: new Date().toISOString(),
      respondedAt: null,
    };
    addApplication(application);
    setSubmitted(chosen);
    // Let the animation land, then move to the dashboard so the request is there on arrival.
    window.setTimeout(() => router.push("/dashboard"), 2000);
  };

  return (
    <div className="flex-1 w-full relative bg-[#faf8f5]">
      <PageBackdrop animated={false} />

      {/* Context-aware voice assistant — compares the offers on screen objectively. It reads the
          client's data and the displayed offers fresh at ask-time; it never pushes a provider. */}
      <AssistantPanel
        page="offers"
        getContext={() => ({
          financials: input ?? answers,
          offers: offers ?? null,
          analysisInput: input ?? null,
          heldOffer: offer ?? null,
        })}
      />


      <div className="relative z-10 max-w-[1000px] mx-auto w-full px-4 py-6 space-y-6">
        <header className="animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <span className="inline-flex items-center gap-1.5 bg-purple-light text-purple text-xs font-bold px-3 py-1.5 rounded-full">
              الخطوة 3 من 3 — العروض
            </span>
          </div>
          <h1 className="text-2xl sm:text-[32px] leading-snug font-bold text-navy mb-2">
            العروض المتاحة لك
          </h1>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            كل عرض محسوب على مبلغك ومدتك، ومعه أثره على استقطاعك الشهري.
          </p>
        </header>

        {/* What the offers were priced on */}
        <section className="bg-white rounded-[15px] border border-border p-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setStep(2)}
            className="text-sm font-semibold text-orange hover:text-orange-hover transition-colors cursor-pointer"
          >
            العودة للتحليل
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Chip label="مبلغ التمويل" value={`${fmt(answers.financingAmount ?? 0)} ريال`} />
            <Chip label="المدة المستهدفة" value={`${answers.termYears ?? 0} سنوات`} />
            <Chip label="الراتب" value={`${fmt(salary)} ريال`} />
          </div>
        </section>

        {!input ? (
          <EmptyState onStart={() => setStep(1)} />
        ) : !offer ? (
          <div className="bg-white rounded-[15px] border border-dashed border-border p-8 text-center py-16 space-y-4 animate-fade-in-up">
            <div className="mx-auto w-16 h-16 rounded-full bg-warm-bg flex items-center justify-center text-text-secondary">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
                <line x1="12" y1="12" x2="12" y2="18" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-navy">لم يتم إرفاق أي ملف تمويلي</h3>
              <p className="text-xs text-text-secondary leading-relaxed max-w-md mx-auto">
                لم نجد أي عرض تمويلي مرفق في المحادثة. يرجى تصوير أو إرفاق ملف عرض التمويل الذي حصلت عليه في الشات أولاً، وسنقوم بمطابقته وتحليله لك هنا.
              </p>
            </div>
            <button
              onClick={() => router.push("/advisor")}
              className="inline-flex items-center justify-center bg-orange hover:bg-orange-hover text-white font-semibold px-6 py-3 rounded-full text-sm transition-colors cursor-pointer"
            >
              الذهاب للمحادثة لإرفاق العرض
            </button>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-[15px] border border-danger/30 bg-danger-bg p-6 text-center">
            <p className="text-sm font-semibold text-danger mb-1">تعذّر تحميل العروض</p>
            <p className="text-xs text-text-secondary leading-relaxed">{error}</p>
          </div>
        ) : !sorted ? (
          <div className="space-y-4 animate-pulse-gentle" aria-hidden="true">
            <div className="h-[150px] rounded-[15px] border border-border bg-white" />
            <div className="h-[150px] rounded-[15px] border border-border bg-white" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-[15px] border border-dashed border-border p-8 text-center">
            <p className="text-sm font-semibold text-navy mb-1">لا توجد عروض مطابقة</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              لا توجد جهة تمويلية تغطي هذا المبلغ بهذه المدة حالياً. جرّب تعديل المبلغ أو المدة.
            </p>
          </div>
        ) : (
          <>
            {/* Sort */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-secondary font-medium">ترتيب حسب:</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  aria-pressed={sortBy === opt.id}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    sortBy === opt.id
                      ? "bg-navy text-white"
                      : "bg-white border border-border text-navy hover:bg-warm-bg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <ul className="space-y-4">
              {sorted.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  selected={selectedOffer === offer.id}
                  onAnalyze={() => analyzeOnOffer(offer)}
                  onSubmit={() => submitApplication(offer)}
                  analyzing={rerunningId === offer.id}
                  submitting={submitted?.id === offer.id}
                  disabled={submitted !== null}
                  salary={salary}
                  commitments={commitments}
                  expenses={expenses}
                />
              ))}
            </ul>

            {/* The backend's own disclaimer — shown verbatim, not paraphrased. */}
            {meta && (
              <section className="rounded-[15px] border border-dashed border-border p-4 text-center">
                {meta.illustrative && (
                  <p className="text-[11px] font-bold text-caution mb-1">
                    هذه عروض توضيحية من جهات افتراضية — وليست عروضاً حقيقية.
                  </p>
                )}
                <p className="text-[11px] text-text-secondary leading-relaxed">{meta.disclaimer}</p>
              </section>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {submitted && <SubmittedOverlay offer={submitted} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * The "تم التقديم" moment: a full-cover scrim with a drawing checkmark, a short confirmation,
 * and a hint that we're moving the user to their dashboard (where the request now lives).
 */
function SubmittedOverlay({ offer }: { offer: FinancingOffer }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      dir="rtl"
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy/45 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-sm bg-white rounded-[24px] shadow-[0_30px_70px_rgba(8,47,62,0.28)] p-8 text-center"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 26 }}
      >
        <div className="relative mx-auto mb-5 h-20 w-20">
          {!reduce && (
            <motion.span
              className="absolute inset-0 rounded-full bg-safe/15"
              initial={{ scale: 0.6, opacity: 0.8 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
              aria-hidden="true"
            />
          )}
          <div className="relative h-20 w-20 rounded-full bg-safe-bg flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-safe)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <motion.path
                d="M5 13l4 4L19 7"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.18, ease: "easeInOut" }}
              />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-navy mb-1.5">تم تقديم طلبك بنجاح</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          أرسلنا طلب تمويلك إلى <span className="font-bold text-navy">{offer.provider}</span> بقسط
          شهري {fmt(offer.monthlyInstallment)} ريال. حالته الآن «قيد المراجعة».
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-text-secondary">
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-navy">
            <Logo className="h-3.5 w-3.5 text-white" />
          </span>
          نحوّلك إلى لوحتك المالية…
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-warm-bg">
          <motion.div
            className="h-full bg-orange"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 2, ease: "linear" }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-white rounded-[15px] border border-dashed border-border p-8 text-center">
      <p className="text-sm font-semibold text-navy mb-1">لا توجد بيانات لعرض عروض عليها</p>
      <p className="text-xs text-text-secondary leading-relaxed mb-4">
        أكمل التحليل أولاً حتى نحسب العروض على مبلغك ومدتك.
      </p>
      <button
        onClick={onStart}
        className="min-h-[44px] px-6 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
      >
        ابدأ التحليل
      </button>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-warm-bg border border-border rounded-full px-3 py-1.5 text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className="font-bold text-navy" style={NUM}>
        {value}
      </span>
    </span>
  );
}

function OfferCard({
  offer,
  selected,
  onAnalyze,
  onSubmit,
  analyzing,
  submitting,
  disabled,
  salary,
  commitments,
  expenses,
}: {
  offer: FinancingOffer;
  selected: boolean;
  onAnalyze: () => void;
  onSubmit: () => void;
  analyzing: boolean;
  submitting: boolean;
  disabled: boolean;
  salary: number;
  commitments: number;
  expenses: number;
}) {
  // Derived from THIS offer's installment and the user's own figures — same definition the
  // engine uses (DBR is measured against gross salary, not salary + additional income).
  const dbr = salary > 0 ? (offer.monthlyInstallment + commitments) / salary : 0;
  const remaining = salary - offer.monthlyInstallment - commitments - expenses;

  return (
    <li>
      <article
        className={`bg-white rounded-[15px] border p-5 transition-shadow ${
          selected ? "border-orange shadow-[0_8px_24px_-12px_rgba(176,91,55,0.5)]" : "border-border"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="font-bold text-navy text-base">{offer.provider}</h2>
              {offer.categories.map((c) => (
                <span
                  key={c}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-light text-purple"
                >
                  {CATEGORY_LABEL[c]}
                </span>
              ))}
            </div>
            <p className="text-xs text-text-secondary" style={NUM}>
              هامش مرابحة {apr(offer.apr)} · مدة {offer.termYears} سنوات
            </p>
          </div>
          <StatusBadge status={RISK_STATUS[offer.safety]} label={RISK_LABEL[offer.safety]} size="sm" />
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Cell label="القسط الشهري" value={fmt(offer.monthlyInstallment)} unit="ر.س" />
          <Cell label="إجمالي التكلفة الإضافية" value={fmt(offer.totalAdditionalCost)} unit="ر.س" />
          <Cell label="نسبة الاستقطاع" value={`${(dbr * 100).toFixed(1)}%`} />
          <Cell label="المتبقي شهرياً" value={fmt(remaining)} unit="ر.س" />
        </dl>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onAnalyze}
            disabled={analyzing || disabled}
            className="flex-1 min-h-[44px] px-4 rounded-full text-sm font-semibold border border-navy/25 text-navy bg-white hover:bg-warm-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {analyzing ? "جارٍ إعادة الحساب…" : `حلّل وضعي على هامش ${apr(offer.apr)}`}
          </button>
          <button
            onClick={onSubmit}
            disabled={disabled}
            aria-label={`قدّم طلب تمويل عبر ${offer.provider}`}
            className="min-h-[44px] px-6 rounded-full text-sm font-bold bg-orange hover:bg-orange-hover text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" style={{ animationDuration: "0.9s" }} aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                جارٍ التقديم…
              </>
            ) : (
              "قدّم الطلب"
            )}
          </button>
        </div>
      </article>
    </li>
  );
}

function Cell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-warm-bg rounded-[15px] border border-border/60 p-3">
      <dt className="text-[11px] text-text-secondary mb-0.5">{label}</dt>
      <dd className="text-sm font-bold text-navy" style={NUM}>
        {value}
        {unit && <span className="text-[10px] font-normal text-text-secondary mr-1">{unit}</span>}
      </dd>
    </div>
  );
}

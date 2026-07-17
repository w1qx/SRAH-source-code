"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore, completeInput } from "@/store/useAppStore";
import { getOffers } from "@/lib/api/offers";
import { runAnalysis } from "@/lib/api/analysis";
import { ApiError } from "@/lib/api/client";
import StatusBadge from "./StatusBadge";
import { PageBackdrop } from "@/components/ui/page-backdrop";
import type { FinancingOffer, OfferCategory, RiskTier } from "@shared/types";

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
  const { answers, selectedOffer, setSelectedOffer, sortBy, setSortBy, setStep, setAnalysis } =
    useAppStore();

  const [offers, setOffers] = useState<FinancingOffer[] | null>(null);
  const [meta, setMeta] = useState<{ illustrative: boolean; disclaimer: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);

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

  return (
    <div className="flex-1 w-full relative bg-[#faf8f5]">
      <PageBackdrop animated={false} />

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
                  onSelect={() => setSelectedOffer(offer.id)}
                  onAnalyze={() => analyzeOnOffer(offer)}
                  analyzing={rerunningId === offer.id}
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
    </div>
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
  onSelect,
  onAnalyze,
  analyzing,
  salary,
  commitments,
  expenses,
}: {
  offer: FinancingOffer;
  selected: boolean;
  onSelect: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
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
            disabled={analyzing}
            className="flex-1 min-h-[44px] px-4 rounded-full text-sm font-semibold bg-orange hover:bg-orange-hover disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
          >
            {analyzing ? "جارٍ إعادة الحساب…" : `حلّل وضعي على هامش ${apr(offer.apr)}`}
          </button>
          <button
            onClick={onSelect}
            aria-pressed={selected}
            className={`min-h-[44px] px-5 rounded-full text-sm font-semibold transition-colors cursor-pointer ${
              selected ? "bg-navy text-white" : "border border-border text-navy hover:bg-warm-bg"
            }`}
          >
            {selected ? "العرض المختار" : "اختر"}
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

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { AnalysisSummary } from "@shared/types";
import StatusBadge from "@/components/StatusBadge";
import { loanBreakdown } from "./finance";
import { GOAL_LABEL, NUM, RISK_LABEL, RISK_RAIL, RISK_STATUS, fmt, formatDate } from "./labels";

type View = "list" | "matrix";

/** How many scenarios the comparison matrix holds side-by-side. */
const MATRIX_MAX = 3;

/* ------------------------------------------------------------------ */
/* View switcher — segmented control with a sliding thumb              */
/* ------------------------------------------------------------------ */

function ViewSwitcher({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const options: { key: View; label: string }[] = [
    { key: "list", label: "قائمة" },
    { key: "matrix", label: "مصفوفة المقارنة" },
  ];
  return (
    <div role="tablist" aria-label="طريقة العرض" className="inline-flex items-center rounded-full border border-border bg-white p-1">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={view === o.key}
          onClick={() => onChange(o.key)}
          className={`relative min-h-[34px] px-4 rounded-full text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
            view === o.key ? "text-white" : "text-text-secondary hover:text-navy"
          }`}
        >
          {view === o.key && (
            <motion.span
              layoutId="analyses-view-thumb"
              className="absolute inset-0 rounded-full bg-navy"
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              aria-hidden="true"
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison matrix                                                   */
/* ------------------------------------------------------------------ */

function ComparisonMatrix({
  analyses,
  onOpen,
}: {
  analyses: AnalysisSummary[];
  onOpen: (a: AnalysisSummary) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    analyses.slice(0, Math.min(2, analyses.length)).map((a) => a.id),
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MATRIX_MAX ? prev : [...prev, id],
    );

  const selected = analyses.filter((a) => selectedIds.includes(a.id));

  // Estimated metrics per selected scenario, then the "pros" — which column wins
  // on monthly installment and which on total financing cost (ties: first wins).
  const columns = useMemo(() => {
    const cols = selected.map((a) => ({
      analysis: a,
      loan: loanBreakdown(a.financingAmount, 0, a.goal, a.termYears),
    }));
    const minInstallment = Math.min(...cols.map((c) => c.loan.installment));
    const minCost = Math.min(...cols.map((c) => c.loan.totalCost));
    return cols.map((c) => ({
      ...c,
      bestInstallment: cols.length > 1 && c.loan.installment === minInstallment,
      bestCost: cols.length > 1 && c.loan.totalCost === minCost,
    }));
  }, [selected]);

  return (
    <div className="space-y-3">
      {/* Picker chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={`اختر حتى ${MATRIX_MAX} سيناريوهات للمقارنة`}>
        {analyses.map((a) => {
          const active = selectedIds.includes(a.id);
          const full = !active && selectedIds.length >= MATRIX_MAX;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={active}
              disabled={full}
              onClick={() => toggle(a.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
                active
                  ? "border-navy bg-navy text-white"
                  : "border-border bg-white text-navy hover:bg-warm-bg"
              }`}
            >
              {GOAL_LABEL[a.goal]} · <span style={NUM}>{a.termYears}</span> سنوات
            </button>
          );
        })}
      </div>

      {selected.length < 2 ? (
        <div className="bg-white rounded-[15px] border border-dashed border-border p-6 text-center text-xs text-text-secondary">
          اختر سيناريوهين على الأقل لعرض المقارنة جنباً إلى جنب.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map(({ analysis, loan, bestInstallment, bestCost }) => (
            <motion.article
              key={analysis.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="bg-white rounded-[15px] border border-border p-4 flex flex-col gap-3"
            >
              <header>
                <p className="text-sm font-bold text-navy">{GOAL_LABEL[analysis.goal]}</p>
                <p className="text-[10.5px] text-text-secondary mt-0.5">{formatDate(analysis.createdAt)}</p>
              </header>

              {/* Pros badges — the visual "vs" highlights. */}
              {(bestInstallment || bestCost) && (
                <div className="flex flex-wrap gap-1.5">
                  {bestInstallment && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-safe-bg text-safe border border-safe/20 px-2 py-0.5 text-[10.5px] font-semibold">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      أقل قسط شهري
                    </span>
                  )}
                  {bestCost && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-safe-bg text-safe border border-safe/20 px-2 py-0.5 text-[10.5px] font-semibold">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      أقل كلفة تمويل إجمالية
                    </span>
                  )}
                </div>
              )}

              <dl className="space-y-2 text-xs flex-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-text-secondary">المبلغ</dt>
                  <dd className="font-bold text-navy" style={NUM}>{fmt(analysis.financingAmount)} ر.س</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-secondary">المدة</dt>
                  <dd className="font-bold text-navy" style={NUM}>{analysis.termYears} سنوات</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-secondary">القسط الشهري (تقديري)</dt>
                  <dd className="font-bold text-purple" style={NUM}>{fmt(Math.round(loan.installment))} ر.س</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-secondary">كلفة التمويل الإجمالية (تقديرية)</dt>
                  <dd className="font-bold text-navy" style={NUM}>{fmt(Math.round(loan.totalCost))} ر.س</dd>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <dt className="text-text-secondary">التقييم</dt>
                  <dd>
                    <StatusBadge status={RISK_STATUS[analysis.overallRisk]} label={RISK_LABEL[analysis.overallRisk]} size="sm" />
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => onOpen(analysis)}
                className="w-full min-h-[38px] rounded-full border border-navy/20 text-navy text-xs font-semibold hover:bg-warm-bg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
              >
                تعديل السيناريو
              </button>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export default function PastAnalysesSection({
  analyses,
  onOpen,
}: {
  analyses: AnalysisSummary[];
  /** Opens the quick-edit drawer for one scenario. */
  onOpen: (a: AnalysisSummary) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [view, setView] = useState<View>("list");

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-bold text-navy mb-1">تحليلاتك السابقة</h2>
          <p className="text-xs text-text-secondary">
            كل تحليل محفوظ بافتراضاته — افتح أي سيناريو لتعديله مباشرة، أو قارن بينها جنباً إلى جنب.
          </p>
        </div>
        {analyses.length > 0 && <ViewSwitcher view={view} onChange={setView} />}
      </div>
      <div className="mb-4" />

      {analyses.length === 0 ? (
        <div className="bg-white rounded-[15px] border border-dashed border-border p-8 text-center">
          <p className="text-sm font-semibold text-navy mb-1">لم تجرِ أي تحليل بعد</p>
          <p className="text-xs text-text-secondary leading-relaxed mb-4">
            ابدأ تحليلك الأول لتعرف أثر التمويل على وضعك قبل أن تلتزم به.
          </p>
          <Link
            href="/advisor"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            ابدأ تحليلاً جديداً
          </Link>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {view === "list" ? (
            <motion.ul
              key="list"
              className="bg-white rounded-[15px] border border-border overflow-hidden divide-y divide-border/60"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {analyses.map((analysis) => (
                <li key={analysis.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(analysis)}
                    className={`group w-full text-start flex items-center gap-4 p-4 sm:px-5 border-s-[3px] ${RISK_RAIL[analysis.overallRisk]} transition-colors hover:bg-warm-bg/60 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-navy`}
                  >
                    <span className="w-10 h-10 shrink-0 rounded-[15px] bg-purple-light text-purple flex items-center justify-center" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-navy truncate">{GOAL_LABEL[analysis.goal]}</p>
                      <p className="text-xs text-text-secondary mt-0.5" style={NUM}>
                        {fmt(analysis.financingAmount)} ر.س · {analysis.termYears} سنوات ·{" "}
                        {formatDate(analysis.createdAt)}
                      </p>
                    </div>

                    <StatusBadge
                      status={RISK_STATUS[analysis.overallRisk]}
                      label={RISK_LABEL[analysis.overallRisk]}
                      size="sm"
                    />

                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-text-secondary group-hover:text-navy transition-colors">
                      عرض القرض
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-x-0.5" aria-hidden="true">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : (
            <motion.div
              key="matrix"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <ComparisonMatrix analyses={analyses} onOpen={onOpen} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  );
}

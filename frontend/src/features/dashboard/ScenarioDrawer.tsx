"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { AnalysisSummary } from "@shared/types";
import StatusBadge from "@/components/StatusBadge";
import AnimatedNumber from "./AnimatedNumber";
import {
  INFLATION_RATE,
  type ScenarioInputs,
  type SimulationPreview,
  realValue,
  seedInputs,
  simulate,
} from "./finance";
import { GOAL_LABEL, NUM, RISK_LABEL, RISK_STATUS, fmt, formatDate } from "./labels";

/**
 * The scenario quick-edit drawer.
 *
 * Slides in from the screen's left edge (the same side the app hangs its voice strip
 * on) over a blurred glass panel. Every slider recomputes the loan locally — see
 * finance.ts for the math — and pushes a SimulationPreview up to the page so the main
 * health gauge and DBR meter re-animate live in the background while the user drags.
 */

/** One labelled range+value row of the quick adjuster. */
function AdjusterRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = fmt,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (n: number) => string;
  unit?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-navy">{label}</span>
        <span className="text-xs font-bold text-navy" style={NUM}>
          {format(value)}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        dir="rtl"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 cursor-pointer appearance-auto"
        style={{ accentColor: "var(--color-purple)" }}
        aria-label={label}
      />
    </label>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border/50 last:border-b-0">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm font-bold text-navy">{children}</dd>
    </div>
  );
}

export default function ScenarioDrawer({
  scenario,
  currentDbr,
  inflationOn,
  onPreview,
  onSave,
  onSaveAsNew,
  onClose,
}: {
  scenario: AnalysisSummary;
  /** The real DBR from the indicator — the simulation's honest starting point. */
  currentDbr: number;
  inflationOn: boolean;
  onPreview: (p: SimulationPreview | null) => void;
  onSave: (updated: AnalysisSummary) => void;
  onSaveAsNew: (created: AnalysisSummary) => void;
  onClose: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [inputs, setInputs] = useState<ScenarioInputs>(() => seedInputs(scenario, currentDbr));
  const set = <K extends keyof ScenarioInputs>(key: K, v: number) =>
    setInputs((prev) => ({ ...prev, [key]: v }));

  const sim = useMemo(() => simulate(inputs, scenario.goal), [inputs, scenario.goal]);

  // Push the live reading up to the gauge on every recompute; clear it on unmount
  // so closing the drawer returns the gauge to the server's real values.
  const onPreviewRef = useRef(onPreview);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);
  useEffect(() => {
    onPreviewRef.current({ dbr: sim.dbr, score: sim.score, tier: sim.tier });
  }, [sim]);
  useEffect(() => () => onPreviewRef.current(null), []);

  // Esc closes; the page behind must not scroll while the drawer is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  /** Real (today's-money) value of the monthly surplus at END of term: surplus ÷ 1.018^years. */
  const erodedSurplus = Math.round(realValue(sim.surplus, inputs.termYears));

  const save = () =>
    onSave({
      ...scenario,
      financingAmount: inputs.amount,
      termYears: inputs.termYears,
      overallRisk: sim.tier,
    });

  const saveAsNew = () =>
    onSaveAsNew({
      ...scenario,
      id: `local-${Date.now()}`,
      financingAmount: inputs.amount,
      termYears: inputs.termYears,
      overallRisk: sim.tier,
      createdAt: new Date().toISOString(),
    });

  return (
    <div className="fixed inset-0 z-[1200]" role="dialog" aria-modal="true" aria-label="تعديل السيناريو">
      {/* Scrim */}
      <motion.button
        type="button"
        aria-label="إغلاق"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 w-full bg-navy/25 backdrop-blur-[3px] cursor-pointer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />

      {/* Glass panel — docked to the physical left edge, like the voice strip. */}
      <motion.div
        className="absolute top-0 bottom-0 left-0 w-full max-w-md flex flex-col bg-white/85 backdrop-blur-xl border-e border-white/60 shadow-[8px_0_40px_-12px_rgba(8,47,62,0.35)]"
        initial={shouldReduceMotion ? { opacity: 0 } : { x: "-100%" }}
        animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
        exit={shouldReduceMotion ? { opacity: 0 } : { x: "-100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border/60">
          <div>
            <h2 className="text-base font-bold text-navy">{GOAL_LABEL[scenario.goal]}</h2>
            <p className="text-[11px] text-text-secondary mt-0.5">
              سيناريو محفوظ بتاريخ {formatDate(scenario.createdAt)} — عدّل القيم وشاهد المؤشر يتحدث فوراً.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق المحرر"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-border text-navy hover:bg-warm-bg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Scenario summary */}
          <section>
            <h3 className="text-xs font-bold text-text-secondary mb-2">ملخص السيناريو</h3>
            <dl className="bg-white rounded-[15px] border border-border/70 px-4 py-1">
              <StatRow label="مبلغ التمويل (بعد الدفعة المقدمة)">
                <AnimatedNumber value={sim.loan.principal} /> <span className="text-xs font-medium">ر.س</span>
              </StatRow>
              <StatRow label="مدة التمويل">
                <span style={NUM}>{inputs.termYears}</span>{" "}
                <span className="text-xs font-medium">{inputs.termYears === 2 ? "سنتان" : "سنوات"}</span>
              </StatRow>
              <StatRow label="النسبة السنوية الفعالة (تقديرية)">
                <span style={NUM}>{(sim.loan.apr * 100).toFixed(2)}%</span>
              </StatRow>
              <StatRow label="القسط الشهري">
                <AnimatedNumber value={sim.loan.installment} className="text-purple" />{" "}
                <span className="text-xs font-medium">ر.س</span>
              </StatRow>
              <StatRow label="الأثر على نسبة الالتزام (DBR)">
                <span className="inline-flex items-center gap-2">
                  <AnimatedNumber value={sim.dbr * 100} decimals={1} suffix="%" />
                  <StatusBadge status={RISK_STATUS[sim.tier]} label={RISK_LABEL[sim.tier]} size="sm" />
                </span>
              </StatRow>
              <StatRow label="الفائض الشهري المتبقي">
                <AnimatedNumber value={sim.surplus} /> <span className="text-xs font-medium">ر.س</span>
              </StatRow>
              {inflationOn && (
                <StatRow label={`قوته الشرائية بعد ${inputs.termYears} سنة (تضخم ${(INFLATION_RATE * 100).toFixed(1)}%)`}>
                  <AnimatedNumber value={erodedSurplus} className="text-caution" />{" "}
                  <span className="text-xs font-medium">ر.س بقيمة اليوم</span>
                </StatRow>
              )}
            </dl>
          </section>

          {/* Quick adjuster */}
          <section>
            <h3 className="text-xs font-bold text-text-secondary mb-3">تعديل البيانات</h3>
            <div className="space-y-4 bg-white rounded-[15px] border border-border/70 p-4">
              <AdjusterRow
                label="مبلغ التمويل"
                value={inputs.amount}
                min={10_000}
                max={3_000_000}
                step={10_000}
                onChange={(v) => set("amount", v)}
                unit="ر.س"
              />
              <AdjusterRow
                label="الدفعة المقدمة"
                value={inputs.downPayment}
                min={0}
                max={Math.max(0, Math.round((inputs.amount * 0.5) / 5000) * 5000)}
                step={5_000}
                onChange={(v) => set("downPayment", v)}
                unit="ر.س"
              />
              <AdjusterRow
                label="مدة التمويل"
                value={inputs.termYears}
                min={1}
                max={30}
                step={1}
                onChange={(v) => set("termYears", v)}
                unit="سنة"
              />
              <AdjusterRow
                label="دخلك الشهري"
                value={inputs.monthlyIncome}
                min={3_000}
                max={100_000}
                step={500}
                onChange={(v) => set("monthlyIncome", v)}
                unit="ر.س"
              />
              <AdjusterRow
                label="التزامات شهرية أخرى"
                value={inputs.otherCommitments}
                min={0}
                max={50_000}
                step={250}
                onChange={(v) => set("otherCommitments", v)}
                unit="ر.س"
              />
            </div>
            <p className="text-[10.5px] text-text-secondary leading-relaxed mt-2">
              الحسابات هنا تقديرية للمعاينة الفورية — التحليل المعتمد يبقى ما يحسبه الخادم وفق قواعد ساما.
            </p>
          </section>
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-border/60 space-y-2.5 bg-white/70">
          <button
            type="button"
            onClick={save}
            className="w-full min-h-[46px] rounded-[15px] bg-navy text-white text-sm font-semibold hover:opacity-92 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            حفظ التعديلات
          </button>
          <button
            type="button"
            onClick={saveAsNew}
            className="w-full min-h-[46px] rounded-[15px] border border-navy/20 bg-white text-navy text-sm font-semibold hover:bg-warm-bg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            حفظ كمسار جديد
          </button>
          <Link
            href="/advisor"
            className="flex items-center justify-center w-full min-h-[46px] rounded-[15px] bg-orange hover:bg-orange-hover text-white text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
          >
            تقديم طلب التمويل الآن
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

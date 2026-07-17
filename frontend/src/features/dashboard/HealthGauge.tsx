"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import type { FinancialIndicator } from "@shared/types";
import StatusBadge from "@/components/StatusBadge";
import type { SimulationPreview } from "./finance";
import { DBR_CAP, tierForDbr } from "./finance";
import InflationWidget from "./InflationWidget";
import { NUM, RISK_LABEL, RISK_STATUS, formatDate } from "./labels";

/** Status hues, reused from the app tokens so risk color is identical everywhere. */
const TIER_COLOR: Record<FinancialIndicator["tier"], string> = {
  safe: "var(--color-safe)",
  caution: "var(--color-caution)",
  high: "var(--color-danger)",
};

/**
 * DBR-meter status labels. Status is never color alone (the copper/plum pair is
 * too close under tritanopia) — every state carries its icon chip + wording.
 */
const DBR_LABEL: Record<FinancialIndicator["tier"], string> = {
  safe: "مريح",
  caution: "قريب من الحد",
  high: "تجاوز الحد",
};

/** The meter's track spans 0 → 40% DBR so the SAMA cap tick sits INSIDE the bar. */
const TRACK_MAX = 0.4;

/* Semicircular gauge: 180° arc, RTL-neutral (it fills from the left end). */
const R = 78;
const CX = 100;
const CY = 96;
const ARC_LENGTH = Math.PI * R;

function arcPath(): string {
  return `M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`;
}

export default function HealthGauge({
  indicator,
  preview,
  inflationOn,
  onInflationToggle,
  inflationHorizonYears,
}: {
  indicator: FinancialIndicator;
  /** Live values pushed from the scenario drawer while its sliders move. */
  preview: SimulationPreview | null;
  inflationOn: boolean;
  onInflationToggle: (on: boolean) => void;
  inflationHorizonYears: number;
}) {
  // The drawer's simulation, when active, takes over the whole reading.
  const score = Math.max(0, Math.min(100, preview ? preview.score : indicator.score));
  const tier = preview ? preview.tier : indicator.tier;
  const dbr = preview ? preview.dbr : indicator.currentDbr;

  const color = TIER_COLOR[tier];
  const dbrPct = Math.round(dbr * 1000) / 10;
  const capPct = Math.round(DBR_CAP * 1000) / 10;
  const dbrTier = tierForDbr(dbr);
  const shouldReduceMotion = useReducedMotion();

  // One animated value drives the arc, the number, and the DBR meter together, so
  // the whole reading moves as a single gesture. It animates FROM the currently
  // shown value — slider drags from the drawer chain smoothly instead of restarting.
  const [progress, setProgress] = useState(0);
  // Mirrors the shown value (written only inside the animation callback) so each
  // new animation starts from the value currently on screen, not from zero.
  const progressRef = useRef(0);
  useEffect(() => {
    const controls = animate(progressRef.current, score, {
      duration: shouldReduceMotion ? 0 : 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        progressRef.current = v;
        setProgress(v);
      },
    });
    return () => controls.stop();
  }, [score, shouldReduceMotion]);

  return (
    <section className="bg-white rounded-[15px] border border-border shadow-[0_1px_3px_rgba(8,47,62,0.06),0_8px_24px_-12px_rgba(8,47,62,0.12)]">
      <div className="p-6 sm:p-8 flex flex-col md:flex-row md:items-center gap-8">
        {/* Gauge */}
        <div className="shrink-0 mx-auto md:mx-0">
          <svg
            viewBox="0 0 200 116"
            className="w-[220px] h-auto"
            role="img"
            aria-label={`مؤشر صحتك المالية ${score} من 100 — ${RISK_LABEL[tier]}${preview ? " (معاينة)" : ""}`}
          >
            {/* Track */}
            <path d={arcPath()} fill="none" stroke="var(--color-border)" strokeWidth="12" strokeLinecap="round" />
            {/* Score arc — swept by the shared animated value */}
            <path
              d={arcPath()}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * ARC_LENGTH} ${ARC_LENGTH}`}
              style={{ transition: "stroke 0.35s ease" }}
            />
            {/* Score counts up alongside the arc */}
            <text
              x={CX}
              y={CY - 14}
              textAnchor="middle"
              fontSize="38"
              fontWeight="700"
              fill="var(--color-navy)"
              style={{ fontVariantNumeric: "tabular-nums", direction: "ltr" }}
            >
              {Math.round(progress)}
            </text>
            <text x={CX} y={CY + 8} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">
              من 100
            </text>
            {/* Scale ends */}
            <text x={CX - R} y={CY + 18} textAnchor="middle" fontSize="9.5" fill="var(--color-text-secondary)" style={{ direction: "ltr" }}>
              0
            </text>
            <text x={CX + R} y={CY + 18} textAnchor="middle" fontSize="9.5" fill="var(--color-text-secondary)" style={{ direction: "ltr" }}>
              100
            </text>
          </svg>
        </div>

        {/* Reading */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-navy">مؤشر صحتك المالية</h2>
            <StatusBadge status={RISK_STATUS[tier]} label={RISK_LABEL[tier]} size="sm" />
            {preview && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple/30 bg-purple-light px-2.5 py-1 text-[11px] font-semibold text-navy">
                <span className="h-1.5 w-1.5 rounded-full bg-purple animate-pulse" aria-hidden="true" />
                معاينة مباشرة
              </span>
            )}
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            {preview
              ? "هذه القيم تعكس تعديلاتك الجارية في السيناريو — لم تُحفظ بعد، وستعود للقيم الفعلية عند إغلاق المحرر."
              : indicator.message}
          </p>

          {/* DBR against the SAMA cap */}
          <div className="bg-warm-bg rounded-[15px] border border-border/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <span className="flex items-center gap-2 text-xs text-text-secondary">
                نسبة الالتزامات من دخلك (DBR)
                <StatusBadge status={RISK_STATUS[dbrTier]} label={DBR_LABEL[dbrTier]} size="sm" />
              </span>
              <span className="text-base font-bold text-navy" style={NUM}>
                {dbrPct}%
              </span>
            </div>

            {/* Track spans 0→40% DBR so the SAMA 33.3% tick sits inside the bar. */}
            <div
              className="relative h-2.5 rounded-full bg-navy/10"
              role="meter"
              aria-valuenow={dbrPct}
              aria-valuemin={0}
              aria-valuemax={capPct}
              aria-label={`نسبة الالتزامات ${dbrPct}% — ${DBR_LABEL[dbrTier]} (الحد النظامي ${capPct}%)`}
            >
              <div
                className="absolute top-0 right-0 h-2.5 rounded-full"
                style={{
                  width: `${Math.min(100, (dbr / TRACK_MAX) * 100) * (score === 0 ? 1 : progress / score)}%`,
                  backgroundColor: TIER_COLOR[dbrTier],
                  transition: "background-color 0.35s ease",
                }}
              />
              {/* SAMA cap micro-marker */}
              <span
                className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-navy/60"
                style={{ insetInlineStart: `${(DBR_CAP / TRACK_MAX) * 100}%` }}
                aria-hidden="true"
              />
            </div>

            <div className="flex justify-between items-center mt-2">
              <p className="text-[11px] text-text-secondary">
                الحد النظامي (ساما):{" "}
                <span className="font-semibold text-navy" style={NUM}>
                  {capPct}%
                </span>{" "}
                من الدخل
              </p>
            </div>
          </div>

          {/* Saudi inflation micro-panel + simulation switch */}
          <InflationWidget
            enabled={inflationOn}
            onToggle={onInflationToggle}
            horizonYears={inflationHorizonYears}
          />

          <p className="flex items-center gap-1.5 text-[11px] text-text-secondary mt-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            آخر تحديث {formatDate(indicator.updatedAt)} — يتغيّر المؤشر عند موافقة أي جهة على طلب تمويل.
          </p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { INFLATION_RATE, INFLATION_SOURCE, realValue } from "./finance";
import { NUM, fmt } from "./labels";

/**
 * The Saudi inflation micro-panel inside the health card.
 *
 * Shows the official 1.8% annual rate (GASTAT / Ministry of Economy & Planning),
 * explains on hover/tap what it does to purchasing power, and carries the switch
 * that turns the inflation-adjusted projection on across the dashboard: the drawer's
 * surplus readout and the example line below both start showing today's-money values.
 */
export default function InflationWidget({
  enabled,
  onToggle,
  /** Term (years) the example projection uses — the selected/latest scenario's. */
  horizonYears,
}: {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  horizonYears: number;
}) {
  const [open, setOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const tipId = useId();
  const ratePct = (INFLATION_RATE * 100).toFixed(1);

  // The educational example: what 10,000 ر.س of monthly surplus is really worth,
  // in today's purchasing power, at the end of the horizon (real = nominal ÷ 1.018^t).
  const EXAMPLE_SURPLUS = 10000;
  const eroded = Math.round(realValue(EXAMPLE_SURPLUS, horizonYears));

  return (
    <div className="mt-3 rounded-[15px] border border-purple/25 bg-purple-light/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* The pill — hover or tap opens the explanation. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          aria-expanded={open}
          aria-describedby={open ? tipId : undefined}
          className="inline-flex items-center gap-2 rounded-full border border-purple/30 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:border-purple/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          معدل التضخم السنوي
          <span className="text-purple" style={NUM}>
            {ratePct}%
          </span>
        </button>
        <span className="text-[10.5px] text-text-secondary">{INFLATION_SOURCE}</span>

        {/* The simulation switch. */}
        <label className="ms-auto inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs font-semibold text-navy">محاكاة أثر التضخم</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="محاكاة أثر التضخم على فائضك المالي"
            onClick={() => onToggle(!enabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple ${
              enabled ? "bg-purple" : "bg-navy/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                enabled ? "start-[22px]" : "start-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      {/* Educational overlay — the "why should I care" copy. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            id={tipId}
            role="note"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden text-[11.5px] leading-relaxed text-text-secondary"
          >
            <span className="block pt-2">
              التضخم عند {ratePct}% يعني أن قوتك الشرائية للمبلغ المتبقي (الادخار) قد تتأثر مستقبلاً.
              فعّل المحاكاة لترى أثر التضخم على فائضك المالي على المدى الطويل.
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      {/* The live example while the simulation is on. */}
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.p
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden text-[11.5px] leading-relaxed text-navy"
          >
            <span className="block pt-2 font-medium">
              بقوة شراء اليوم: كل <span style={NUM}>{fmt(EXAMPLE_SURPLUS)}</span> ر.س فائض شهري تعادل بعد{" "}
              <span style={NUM}>{horizonYears}</span> {horizonYears === 2 ? "سنتين" : "سنوات"} ≈{" "}
              <span className="font-bold" style={NUM}>
                {fmt(eroded)}
              </span>{" "}
              ر.س
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

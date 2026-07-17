"use client";

import { useState } from "react";
import type { RiskTier, Scenario, UserFinancialData } from "@shared/types";

/* ------------------------------------------------------------------ */
/* Charts for the analysis page.                                       */
/*                                                                     */
/* Palette rule enforced here: the two SCENARIO lines are the only     */
/* saturated categorical hues (blue vs rose — CVD-validated, ΔE 27.9). */
/* BASELINE is deliberately NOT a third hue — it is a reference, not a */
/* peer, so it is drawn as a neutral dashed rule. Adding a third       */
/* saturated line here would collide with the pale risk bands.         */
/* Risk status appears ONLY as pale zone tints, as the per-year ribbon */
/* (which every reader can also get as a label in the tooltip), and as */
/* chips with an icon + label — never as color alone.                  */
/* ------------------------------------------------------------------ */

export const SCEN_COLOR = {
  expected: "#0E7FB2", // blue
  bad: "#C05B76", // rose
  baseline: "#64757C", // neutral — a reference rule, not a categorical series
} as const;

export type ScenarioKey = keyof typeof SCEN_COLOR;

/** The two tracks that are real projections. Baseline is the ruler they are read against. */
export const PROJECTED: readonly ScenarioKey[] = ["expected", "bad"] as const;
export const ALL_SCENARIOS: readonly ScenarioKey[] = ["expected", "bad", "baseline"] as const;

export const TIER_COLOR: Record<RiskTier, string> = {
  safe: "var(--color-safe)",
  caution: "var(--color-caution)",
  high: "var(--color-danger)",
};

export const TIER_LABEL: Record<RiskTier, string> = {
  safe: "آمن",
  caution: "مع الحذر",
  high: "عالي المخاطر",
};

export const SCEN_TITLE: Record<ScenarioKey, string> = {
  expected: "المتوقع",
  bad: "السيئ",
  baseline: "بأرقام اليوم",
};

/** Stacked-fill order, validated: copper → purple → rose → blue. Purple never adjacent to blue. */
const FLOW_COLOR = {
  installment: "#B05B37", // copper — the new commitment
  commitments: "#8B82D8", // purple — what you already owe
  expenses: "#C05B76", // rose — living costs
  remaining: "#0E7FB2", // blue — what is left
} as const;

const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const LTR: React.CSSProperties = { ...NUM, direction: "ltr" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pctLabel = (f: number) => `${(f * 100).toFixed(1)}%`;

/* ------------------------------------------------------------------ */
/* Smoothing                                                           */
/* ------------------------------------------------------------------ */

/**
 * Monotone cubic interpolation — the smooth curve the design calls for, WITHOUT the lie a
 * naive spline tells: a Catmull-Rom through these points would overshoot past the real values
 * and invent, say, a dip below zero that never happens. Monotone smoothing cannot overshoot,
 * so the curve is pretty and still true to the numbers.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";

  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    dy[i] = pts[i + 1].y - pts[i].y;
    slope[i] = dy[i] / (dx[i] || 1);
  }

  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    // A local extremum flattens the tangent — this is what stops the overshoot.
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  m[n - 1] = slope[n - 2];

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/** Round ticks a human would choose (1/2/5 × 10ⁿ), so the axis never reads 3,847. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;

  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 0.001; t += step) {
    ticks.push(Math.abs(t) < step * 0.001 ? 0 : t);
  }
  return ticks;
}

/* ------------------------------------------------------------------ */
/* The gauge: one number — your deduction against SAMA's ceiling.      */
/* ------------------------------------------------------------------ */

export function DbrGauge({
  dbr,
  tier,
  cap,
  safeMax,
}: {
  dbr: number;
  tier: RiskTier;
  cap: number;
  safeMax: number;
}) {
  // Scaled to 1.5× the cap, so exceeding the ceiling reads as visible overshoot rather than
  // pinning silently at the end of the track.
  const max = cap * 1.5;
  const R = 76;
  const CX = 100;
  const CY = 90;
  const ARC = Math.PI * R;
  const frac = Math.max(0, Math.min(dbr / max, 1));
  const path = `M ${CX - R},${CY} A ${R},${R} 0 0 1 ${CX + R},${CY}`;

  const tickAt = (v: number) => {
    const a = Math.PI * Math.min(v / max, 1);
    return {
      x1: CX - R * Math.cos(a),
      y1: CY - R * Math.sin(a),
      x2: CX - (R - 12) * Math.cos(a),
      y2: CY - (R - 12) * Math.sin(a),
    };
  };

  // The headroom the reader actually wants: how much DBR is left before the regulator's line.
  const headroom = cap - dbr;

  return (
    <svg
      viewBox="0 0 200 148"
      className="w-full max-w-[220px] h-auto"
      role="img"
      aria-label={`نسبة الاستقطاع ${pctLabel(dbr)} من حد ساما ${pctLabel(cap)} — التصنيف ${TIER_LABEL[tier]}`}
    >
      <path d={path} fill="none" stroke="var(--color-safe-bg)" strokeWidth="12" strokeLinecap="round" />
      <path
        d={path}
        fill="none"
        stroke="var(--color-caution-bg)"
        strokeWidth="12"
        strokeDasharray={`${((cap - safeMax) / max) * ARC} ${ARC}`}
        strokeDashoffset={`${-(safeMax / max) * ARC}`}
      />
      <path
        d={path}
        fill="none"
        stroke="var(--color-danger-bg)"
        strokeWidth="12"
        strokeDasharray={`${((max - cap) / max) * ARC} ${ARC}`}
        strokeDashoffset={`${-(cap / max) * ARC}`}
      />

      <path
        d={path}
        fill="none"
        stroke={TIER_COLOR[tier]}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${frac * ARC} ${ARC}`}
      />

      {/* SAMA's red line. */}
      <line {...tickAt(cap)} stroke="var(--color-navy)" strokeWidth="2" />
      {/* Where "safe" ends — the reader could not see this boundary before. */}
      <line {...tickAt(safeMax)} stroke="var(--color-navy)" strokeWidth="1" opacity="0.35" />

      <text x={CX} y={CY - 14} textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--color-navy)" style={LTR}>
        {pctLabel(dbr)}
      </text>
      <text x={CX} y={CY + 2} textAnchor="middle" fontSize="9" fill="var(--color-text-secondary)">
        نسبة الاستقطاع
      </text>

      {/* The two ends of the track, named. */}
      <text x={CX - R} y={CY + 16} textAnchor="middle" fontSize="8" fill="var(--color-text-secondary)" style={LTR}>
        0%
      </text>
      <text x={CX + R} y={CY + 16} textAnchor="middle" fontSize="8" fill="var(--color-text-secondary)" style={LTR}>
        {pctLabel(max)}
      </text>

      <text x={CX} y={CY + 32} textAnchor="middle" fontSize="8.5" fill="var(--color-text-secondary)">
        حد ساما {pctLabel(cap)} · الآمن حتى {pctLabel(safeMax)}
      </text>
      <text
        x={CX}
        y={CY + 44}
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill={headroom >= 0 ? "var(--color-safe)" : "var(--color-danger)"}
      >
        {headroom >= 0
          ? `يتبقى ${pctLabel(headroom)} قبل الحد`
          : `تجاوزت الحد بـ ${pctLabel(-headroom)}`}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The main chart: every track at once, each independently isolable.   */
/* ------------------------------------------------------------------ */

export type Metric = "remainingMonthly" | "dbr" | "remainingDebt";

export const METRIC_META: Record<
  Metric,
  {
    label: string;
    /** The unit, stated ONCE at the top of the axis — never repeated on every mark. */
    axis: string;
    /** Full value, for the tooltip, where there is room for a unit. */
    format: (v: number) => string;
    /** Axis ticks and end-of-line labels: bare numerals. Mixing an Arabic unit into a
     *  direction:ltr label makes the bidi algorithm reorder it ("4,050 ر.س" → "ر.س 4,050"). */
    tick: (v: number) => string;
  }
> = {
  remainingMonthly: {
    label: "المتبقي شهرياً",
    axis: "ريال / شهرياً",
    format: (v) => `${fmt(v)} ر.س`,
    tick: fmt,
  },
  dbr: {
    label: "نسبة الاستقطاع",
    axis: "% من الراتب",
    format: pctLabel,
    tick: (v) => `${(v * 100).toFixed(0)}%`,
  },
  remainingDebt: {
    label: "الدين المتبقي",
    axis: "ريال",
    format: (v) => `${fmt(v)} ر.س`,
    tick: fmt,
  },
};

export function ScenarioChart({
  scenarios,
  visible,
  metric,
  cap,
  safeMax,
  yearLabel,
}: {
  scenarios: Record<ScenarioKey, Scenario>;
  /** Which tracks are drawn. Toggling one off isolates the others. */
  visible: Record<ScenarioKey, boolean>;
  metric: Metric;
  cap: number;
  safeMax: number;
  yearLabel: (year: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 760;
  const PAD_R = 64; // the y-axis lives on the RIGHT: in RTL, that is the origin side
  const PAD_L = 62; // room for the end-of-line value labels, which land on the left
  const PAD_TOP = 34;
  const X_LABELS = 20;

  const years = scenarios.expected.years;
  const shown = ALL_SCENARIOS.filter((k) => visible[k]);
  const ribbons = PROJECTED.filter((k) => visible[k]); // baseline carries no risk story
  const RIBBON_H = 8;
  const RIBBON_GAP = 5;
  const ribbonBlock = ribbons.length * (RIBBON_H + RIBBON_GAP) + (ribbons.length ? 14 : 0);

  const PLOT_H = 236;
  const baseY = PAD_TOP + PLOT_H;
  const H = baseY + X_LABELS + ribbonBlock + 8;

  const valuesOf = (s: Scenario) => s.years.map((y) => y[metric] as number);

  // The scale spans EVERY track, shown or not, so toggling one off never rescales the axis
  // under the others — the lines must stay comparable across a toggle.
  const all = ALL_SCENARIOS.flatMap((k) => valuesOf(scenarios[k]));
  const isDbr = metric === "dbr";
  const yMax = isDbr ? Math.max(...all, cap * 1.15) : Math.max(...all) * 1.12;
  const yMin = Math.min(...all, 0);
  const span = yMax - yMin || 1;

  // RTL: year 1 on the RIGHT.
  const xAt = (i: number) => W - (PAD_R + (i * (W - PAD_R - PAD_L)) / Math.max(years.length - 1, 1));
  const yAt = (v: number) => PAD_TOP + (1 - (v - yMin) / span) * PLOT_H;

  const pointsOf = (key: ScenarioKey) =>
    scenarios[key].years.map((y, i) => ({ x: xAt(i), y: yAt(y[metric] as number) }));

  const ticks = niceTicks(yMin, yMax, 5);

  /* Area fills only when a single projection is isolated. With both on, the two translucent
     fills overlap into a muddy grey block that belongs to neither series — and the reader is
     comparing LINES anyway, so the fill is buying nothing at the price of a dirty chart. */
  const filled = ribbons.length === 1;

  /* End-of-line labels: the final year of each visible track, nudged apart when two lines
     land on top of each other. A value the eye can read without hovering. */
  const lastIdx = years.length - 1;
  const endLabels = shown
    .map((key) => ({
      key,
      value: scenarios[key].years[lastIdx][metric] as number,
      y: yAt(scenarios[key].years[lastIdx][metric] as number),
    }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    const gap = endLabels[i].y - endLabels[i - 1].y;
    if (gap < 14) endLabels[i].y = endLabels[i - 1].y + 14;
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${METRIC_META[metric].label} عبر سنوات السداد، للسيناريو المتوقع والسيئ مقارنةً بأرقام اليوم`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {PROJECTED.map((key) => (
            <linearGradient key={key} id={`area-${key}-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SCEN_COLOR[key]} stopOpacity={ribbons.length > 1 ? 0.16 : 0.26} />
              <stop offset="100%" stopColor={SCEN_COLOR[key]} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* Regulatory bands — only meaningful on the DBR axis. Pale tints, never saturated.
            On this metric the bands ARE the grid, so no gridlines are drawn over them. */}
        {isDbr && (
          <>
            <rect x={PAD_L} y={yAt(safeMax)} width={W - PAD_L - PAD_R} height={baseY - yAt(safeMax)} fill="var(--color-safe-bg)" opacity="0.7" />
            <rect x={PAD_L} y={yAt(cap)} width={W - PAD_L - PAD_R} height={yAt(safeMax) - yAt(cap)} fill="var(--color-caution-bg)" opacity="0.7" />
            <rect x={PAD_L} y={PAD_TOP} width={W - PAD_L - PAD_R} height={yAt(cap) - PAD_TOP} fill="var(--color-danger-bg)" opacity="0.7" />

            {/* Dashing is reserved for thresholds — these two lines are the only ones that earn it. */}
            <line x1={PAD_L} y1={yAt(cap)} x2={W - PAD_R} y2={yAt(cap)} stroke="var(--color-danger)" strokeWidth="1.25" strokeDasharray="5 4" />
            <text x={PAD_L + 4} y={yAt(cap) - 5} fontSize="9.5" fontWeight="700" fill="var(--color-danger)">
              حد ساما {pctLabel(cap)}
            </text>
            <line x1={PAD_L} y1={yAt(safeMax)} x2={W - PAD_R} y2={yAt(safeMax)} stroke="var(--color-safe)" strokeWidth="1" strokeDasharray="4 4" opacity="0.55" />
            <text x={PAD_L + 4} y={yAt(safeMax) - 5} fontSize="9" fontWeight="700" fill="var(--color-safe)" opacity="0.9">
              نهاية النطاق الآمن {pctLabel(safeMax)}
            </text>
          </>
        )}

        {/* Gridlines: solid hairlines, one shade off the surface. Never dashed — dashing means
            "threshold" on this chart, and a grid is not a threshold. */}
        {!isDbr &&
          ticks.map((t) => (
            <line key={t} x1={PAD_L} y1={yAt(t)} x2={W - PAD_R} y2={yAt(t)} stroke="var(--color-border)" strokeWidth="1" opacity="0.85" />
          ))}

        {/* The y-axis the chart never had: without it these lines had shape but no magnitude. */}
        {ticks.map((t) => (
          <text
            key={`t-${t}`}
            x={W - PAD_R + 8}
            y={yAt(t) + 3.5}
            textAnchor="start"
            fontSize="9.5"
            fill="var(--color-text-secondary)"
            style={LTR}
          >
            {METRIC_META[metric].tick(t)}
          </text>
        ))}
        <text x={W - PAD_R + 8} y={PAD_TOP - 14} textAnchor="start" fontSize="9" fontWeight="700" fill="var(--color-text-secondary)">
          {METRIC_META[metric].axis}
        </text>

        {/* Zero is a fact worth drawing when the projection can cross it. */}
        {yMin < 0 && (
          <line x1={PAD_L} y1={yAt(0)} x2={W - PAD_R} y2={yAt(0)} stroke="var(--color-danger)" strokeWidth="1.25" strokeDasharray="4 4" />
        )}

        {/* BASELINE first, underneath: it is the ruler, not a competitor. Neutral and dashed so
            it reads as "the same financing in a world with no inflation and no pay rise" — the
            gap between it and the coloured lines IS the cost of inflation, made visible. */}
        {visible.baseline && (
          <path
            d={smoothPath(pointsOf("baseline"))}
            fill="none"
            stroke={SCEN_COLOR.baseline}
            strokeWidth="1.75"
            strokeDasharray="6 5"
            strokeLinecap="round"
            opacity="0.9"
          />
        )}

        {/* Every projected scenario is drawn the SAME way — solid line + fill, in its own colour.
            Neither is demoted to a dashed "other". Colour follows the scenario, never its rank,
            so a toggle never repaints the survivor. */}
        {PROJECTED.filter((k) => visible[k]).map((key) => {
          const pts = pointsOf(key);
          const line = smoothPath(pts);
          const area = `${line} L ${pts[pts.length - 1].x},${baseY} L ${pts[0].x},${baseY} Z`;
          return (
            <g key={key}>
              {filled && <path d={area} fill={`url(#area-${key}-${metric})`} />}
              <path d={line} fill="none" stroke={SCEN_COLOR[key]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {/* Direct labels on the last year only — the axis and the tooltip carry the rest.
            A number on every point would be chaos. */}
        {endLabels.map(({ key, value, y }) => (
          <text
            key={`end-${key}`}
            x={xAt(lastIdx) - 10}
            y={y + 3.5}
            textAnchor="end"
            fontSize="10.5"
            fontWeight="700"
            fill={key === "baseline" ? "var(--color-text-secondary)" : SCEN_COLOR[key]}
            style={LTR}
          >
            {METRIC_META[metric].tick(value)}
          </text>
        ))}

        {/* Hover: crosshair, a ringed point per visible track, and one card reading them all. */}
        {hover !== null && shown.length > 0 && (
          <g pointerEvents="none">
            <line x1={xAt(hover)} y1={PAD_TOP} x2={xAt(hover)} y2={baseY} stroke="var(--color-navy)" strokeWidth="1" strokeDasharray="4 3" opacity="0.35" />
            {shown.map((key) => (
              <circle
                key={key}
                cx={xAt(hover)}
                cy={yAt(scenarios[key].years[hover][metric] as number)}
                r="6"
                fill="#FFFFFF"
                stroke={SCEN_COLOR[key]}
                strokeWidth="3"
              />
            ))}
            <TooltipCard
              x={xAt(hover)}
              chartWidth={W}
              title={yearLabel(years[hover].year)}
              rows={shown.map((key) => {
                const yr = scenarios[key].years[hover];
                const v = yr[metric] as number;
                const base = scenarios.baseline.years[hover][metric] as number;
                return {
                  key,
                  color: SCEN_COLOR[key],
                  label: SCEN_TITLE[key],
                  value: METRIC_META[metric].format(v),
                  // Against today's numbers — the whole reason the baseline is on the chart.
                  delta:
                    key === "baseline" || Math.abs(v - base) < 0.5 / (metric === "dbr" ? 1000 : 1)
                      ? undefined
                      : `${v > base ? "+" : "−"}${METRIC_META[metric].format(Math.abs(v - base))}`,
                  tier: key === "baseline" ? undefined : TIER_LABEL[yr.riskTier],
                };
              })}
            />
          </g>
        )}

        {/* Hit targets, wider than the marks. */}
        {years.map((_, i) => (
          <rect key={i} x={xAt(i) - 26} y={PAD_TOP} width={52} height={baseY - PAD_TOP} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}

        <line x1={PAD_L} y1={baseY} x2={W - PAD_R} y2={baseY} stroke="var(--color-border)" strokeWidth="1" />
        {years.map((y, i) => (
          <text
            key={y.year}
            x={xAt(i)}
            y={baseY + 15}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight={hover === i ? 700 : 400}
            fill={hover === i ? "var(--color-navy)" : "var(--color-text-secondary)"}
            style={LTR}
          >
            {y.year}
          </text>
        ))}

        {/* The risk ribbon: what tier each YEAR lands in, for each projected track. The line alone
            never said this — a line can sit in the caution band all term and look calm. The tier
            is never colour-alone: the tooltip and the year cards both name it in words. */}
        {ribbons.map((key, row) => {
          const top = baseY + X_LABELS + 8 + row * (RIBBON_H + RIBBON_GAP);
          const segW = (W - PAD_L - PAD_R) / years.length;
          return (
            <g key={`ribbon-${key}`}>
              {/* direction:ltr anchors the label block to the RIGHT gutter and lets it grow
                  rightward. Left to inherit the page's RTL, text-anchor flips and the label
                  runs back into the plot, where it gets clipped by the viewBox edge. */}
              <text
                x={W - PAD_R + 6}
                y={top + RIBBON_H}
                textAnchor="start"
                fontSize="8.5"
                fill="var(--color-text-secondary)"
                style={{ direction: "ltr" }}
              >
                {SCEN_TITLE[key]}
              </text>
              {scenarios[key].years.map((y, i) => (
                <rect
                  key={y.year}
                  // Segments run right-to-left, mirroring the timeline above them.
                  x={W - PAD_R - (i + 1) * segW + 1}
                  y={top}
                  width={segW - 2}
                  height={RIBBON_H}
                  rx="2"
                  fill={TIER_COLOR[y.riskTier]}
                  opacity={hover === null || hover === i ? 1 : 0.35}
                >
                  <title>{`${yearLabel(y.year)} — ${SCEN_TITLE[key]}: ${TIER_LABEL[y.riskTier]}`}</title>
                </rect>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * The floating card. It is SIZED FROM ITS CONTENT — the previous fixed 150px box clipped the
 * Arabic year title ("السنة الثانية (منتصف 2027)") straight through the middle.
 */
function TooltipCard({
  x,
  chartWidth,
  title,
  rows,
}: {
  x: number;
  chartWidth: number;
  title: string;
  rows: {
    key: string;
    color: string;
    label: string;
    value: string;
    delta?: string;
    tier?: string;
  }[];
}) {
  const CHAR = 5.6; // ~width of a glyph at 10px in this face
  const ROW_H = 30;
  const longest = Math.max(
    ...rows.map((r) => (r.label.length + r.value.length + (r.tier?.length ?? 0)) * CHAR + 54),
  );
  const W = Math.max(Math.min(Math.max(title.length * CHAR + 24, longest), 300), 176);
  const H = 26 + rows.length * ROW_H;

  // Keep the whole card inside the plot, whichever edge it is near.
  const left = Math.min(Math.max(x - W / 2, 4), chartWidth - W - 4);

  return (
    <g transform={`translate(${left}, 2)`}>
      <rect width={W} height={H} rx="12" fill="var(--color-navy)" />

      <text x={W - 10} y={17} textAnchor="end" fontSize="10" fill="#FFFFFF" opacity="0.75">
        {title}
      </text>

      {rows.map((r, i) => (
        <g key={r.key} transform={`translate(0, ${24 + i * ROW_H})`}>
          <circle cx={W - 15} cy={7} r="3.5" fill={r.color} />
          <text x={W - 24} y={10.5} textAnchor="end" fontSize="10" fill="#FFFFFF" opacity="0.75">
            {r.label}
          </text>
          <text x={10} y={10.5} textAnchor="start" fontSize="11.5" fontWeight="700" fill="#FFFFFF" style={LTR}>
            {r.value}
          </text>

          {/* Second line: the tier in WORDS, and the gap against today's numbers. */}
          {r.tier && (
            <text x={W - 24} y={22} textAnchor="end" fontSize="8.5" fill="#FFFFFF" opacity="0.55">
              {r.tier}
            </text>
          )}
          {r.delta && (
            <text x={10} y={22} textAnchor="start" fontSize="8.5" fill="#FFFFFF" opacity="0.55" style={LTR}>
              {r.delta} مقابل اليوم
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Where the monthly income actually goes.                             */
/* ------------------------------------------------------------------ */

export interface CashFlow {
  income: number;
  installment: number;
  commitments: number;
  expenses: number;
  remaining: number;
}

/** Fixed order — the stacked-fill order the palette was validated in. Never re-sort by size. */
const FLOW_ORDER = [
  { key: "installment", label: "قسط التمويل الجديد" },
  { key: "commitments", label: "التزامات قائمة" },
  { key: "expenses", label: "مصاريف المعيشة" },
  { key: "remaining", label: "المتبقي لك" },
] as const;

/** Year-1 composition, straight from the answers the user gave and the installment the engine set. */
export function cashFlowOf(input: UserFinancialData, installment: number): CashFlow {
  const income = input.grossSalary + input.additionalIncome;
  return {
    income,
    installment,
    commitments: input.existingCommitments,
    expenses: input.monthlyExpenses,
    remaining: income - installment - input.existingCommitments - input.monthlyExpenses,
  };
}

/**
 * A part-to-whole bar, not a pie: the four claims on one month's income, in one row, so the
 * reader can see at a glance how much of the bar the NEW installment eats. A deficit month
 * (spending past income) is drawn as an overflow past the end of the bar — it must not be
 * silently clipped, which is exactly what a naive 100%-stack would do.
 */
export function CashFlowBar({ flow }: { flow: CashFlow }) {
  const deficit = flow.remaining < 0;
  // In deficit the claims exceed income, so the bar scales to the CLAIMS, not the income.
  const total = deficit
    ? flow.installment + flow.commitments + flow.expenses
    : Math.max(flow.income, 1);

  // A negative "remaining" filters itself out of the bar — a deficit is not a segment you can
  // draw, it is an overflow, and the legend below says so in words.
  const segments = FLOW_ORDER.map((s) => ({ ...s, value: flow[s.key] })).filter((s) => s.value > 0);

  return (
    <div>
      {/* RTL: the bar fills from the right, like the timeline. 2px surface gaps, not borders. */}
      <div className="flex gap-[2px] h-9 w-full rounded-full overflow-hidden bg-warm-bg" role="img"
        aria-label={`توزيع دخل ${fmt(flow.income)} ريال: قسط ${fmt(flow.installment)}، التزامات ${fmt(flow.commitments)}، مصاريف ${fmt(flow.expenses)}، متبقٍ ${fmt(flow.remaining)}`}
      >
        {segments.map((s) => {
          const pctOf = (s.value / total) * 100;
          return (
            <div
              key={s.key}
              className="h-full flex items-center justify-center min-w-[2px]"
              style={{ width: `${pctOf}%`, backgroundColor: FLOW_COLOR[s.key] }}
              title={`${s.label}: ${fmt(s.value)} ريال (${pctOf.toFixed(0)}%)`}
            >
              {/* Only label a segment wide enough to hold the label — never clip it. */}
              {pctOf >= 14 && (
                <span className="text-[10px] font-bold text-white" style={LTR}>
                  {pctOf.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The legend is always present — identity is never carried by colour alone. */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {FLOW_ORDER.map((s) => {
          const value = flow[s.key];
          const isDeficit = s.key === "remaining" && deficit;
          return (
            <div key={s.key} className="flex items-start gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: isDeficit ? "var(--color-danger)" : FLOW_COLOR[s.key] }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="text-[10.5px] text-text-secondary leading-tight">
                  {isDeficit ? "العجز الشهري" : s.label}
                </dt>
                <dd className={`text-xs font-bold ${isDeficit ? "text-danger" : "text-navy"}`} style={NUM}>
                  {fmt(Math.abs(value))}
                  <span className="text-[9.5px] font-normal text-text-secondary mr-1">
                    ريال · {((Math.abs(value) / Math.max(flow.income, 1)) * 100).toFixed(0)}٪ من الدخل
                  </span>
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What the financing actually costs.                                  */
/* ------------------------------------------------------------------ */

/**
 * Principal vs. profit over the full term — the number the installment hides. A user reading
 * "2,950 a month" has no sense that they will hand over 177,000 for a 150,000 loan; this says it.
 * Two segments, so it is a meter, not a pie.
 */
export function CostMeter({
  amount,
  installment,
  termYears,
  apr,
  aprIsIndicative,
}: {
  amount: number;
  installment: number;
  termYears: number;
  apr: number;
  aprIsIndicative: boolean;
}) {
  const totalPaid = installment * 12 * termYears;
  const profit = Math.max(totalPaid - amount, 0);
  const profitShare = totalPaid > 0 ? profit / totalPaid : 0;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-navy" style={NUM}>
          {fmt(totalPaid)}
        </span>
        <span className="text-xs text-text-secondary">ريال إجمالي ما ستدفعه</span>
      </div>

      <div
        className="flex gap-[2px] h-9 w-full rounded-full overflow-hidden bg-warm-bg"
        role="img"
        aria-label={`من إجمالي ${fmt(totalPaid)} ريال: ${fmt(amount)} أصل المبلغ و${fmt(profit)} تكلفة التمويل`}
      >
        <div
          className="h-full flex items-center justify-center"
          style={{ width: `${(1 - profitShare) * 100}%`, backgroundColor: "#0E7FB2" }}
          title={`أصل المبلغ: ${fmt(amount)} ريال`}
        >
          <span className="text-[10px] font-bold text-white" style={LTR}>
            {((1 - profitShare) * 100).toFixed(0)}%
          </span>
        </div>
        <div
          className="h-full flex items-center justify-center"
          style={{ width: `${profitShare * 100}%`, backgroundColor: "#B05B37" }}
          title={`تكلفة التمويل: ${fmt(profit)} ريال`}
        >
          {profitShare >= 0.12 && (
            <span className="text-[10px] font-bold text-white" style={LTR}>
              {(profitShare * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 mt-3">
        <div className="flex items-start gap-2">
          <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: "#0E7FB2" }} aria-hidden="true" />
          <div>
            <dt className="text-[10.5px] text-text-secondary leading-tight">أصل المبلغ</dt>
            <dd className="text-xs font-bold text-navy" style={NUM}>
              {fmt(amount)} <span className="text-[9.5px] font-normal text-text-secondary">ريال</span>
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: "#B05B37" }} aria-hidden="true" />
          <div>
            <dt className="text-[10.5px] text-text-secondary leading-tight">
              تكلفة التمويل{aprIsIndicative ? " (تقديرية)" : ""}
            </dt>
            <dd className="text-xs font-bold text-navy" style={NUM}>
              {fmt(profit)} <span className="text-[9.5px] font-normal text-text-secondary">ريال · بهامش {pctLabel(apr)}</span>
            </dd>
          </div>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* How long the savings last if the income stops.                      */
/* ------------------------------------------------------------------ */

/**
 * Emergency runway: months of full outgoings (installment + commitments + expenses) the savings
 * would cover. The savings figure was collected from the user and then never shown to them again.
 * Three months is the conventional floor, six the comfortable one — both are drawn as ticks so
 * the number has something to mean.
 */
export function RunwayMeter({ savings, monthlyOutgoings }: { savings: number; monthlyOutgoings: number }) {
  const months = monthlyOutgoings > 0 ? savings / monthlyOutgoings : 0;
  const SCALE = 9; // months of track — 6 is the comfortable target, so show headroom past it
  const frac = Math.min(months / SCALE, 1);

  const tier: RiskTier = months >= 6 ? "safe" : months >= 3 ? "caution" : "high";
  const verdict =
    months >= 6
      ? "احتياطي مريح"
      : months >= 3
        ? "احتياطي مقبول — الحد الأدنى المعتاد ٣ أشهر"
        : "احتياطي منخفض — أقل من ٣ أشهر";

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-navy" style={NUM}>
          {months.toFixed(1)}
        </span>
        <span className="text-xs text-text-secondary">شهراً يغطيها احتياطك لو توقف الدخل</span>
      </div>

      <div className="relative h-9 w-full rounded-full bg-warm-bg overflow-hidden" role="img"
        aria-label={`مدخرات ${fmt(savings)} ريال تغطي ${months.toFixed(1)} شهراً من التزامات ${fmt(monthlyOutgoings)} ريال — ${verdict}`}
      >
        {/* RTL: the meter fills from the right. */}
        <div
          className="absolute inset-y-0 right-0 rounded-full"
          style={{ width: `${frac * 100}%`, backgroundColor: TIER_COLOR[tier] }}
        />
        {/* The two conventions, as ticks — the number needs a yardstick to mean anything. */}
        {[3, 6].map((m) => (
          <div
            key={m}
            className="absolute inset-y-0 w-px bg-navy/25"
            style={{ right: `${(m / SCALE) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="flex justify-between mt-1.5 text-[9.5px] text-text-secondary" style={LTR}>
        <span>{SCALE}+ شهر</span>
        <span>٦ أشهر</span>
        <span>٣ أشهر</span>
        <span>0</span>
      </div>

      <p
        className="text-[11px] font-semibold mt-2"
        style={{ color: TIER_COLOR[tier] }}
      >
        {verdict}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore, completeInput } from "@/store/useAppStore";
import { getRules, runAnalysis } from "@/lib/api/analysis";
import { ApiError } from "@/lib/api/client";
import StatusBadge from "./StatusBadge";
import DataSourceBadge from "./DataSourceBadge";
import { PageBackdrop } from "@/components/ui/page-backdrop";
import {
  CashFlowBar,
  CostMeter,
  DbrGauge,
  RunwayMeter,
  ScenarioChart,
  cashFlowOf,
  ALL_SCENARIOS,
  METRIC_META,
  PROJECTED,
  SCEN_COLOR,
  TIER_COLOR,
  type Metric,
  type ScenarioKey,
} from "@/features/analysis/charts";
import type { RiskThresholds, RiskTier, SamaRuleSet, Scenario } from "@shared/types";

/* ------------------------------------------------------------------ */
/* This page COMPUTES NOTHING. Every financial number is read out of    */
/* the AnalysisResult the backend returned; the layout is all it owns.  */
/* ------------------------------------------------------------------ */

const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

const RISK_STATUS: Record<RiskTier, "safe" | "caution" | "danger"> = {
  safe: "safe",
  caution: "caution",
  high: "danger",
};

const RISK_LABEL: Record<RiskTier, string> = {
  safe: "آمن",
  caution: "مع الحذر",
  high: "عالي المخاطر",
};

const VERDICT: Record<RiskTier, string> = {
  safe: "هذا التمويل يناسب وضعك المالي",
  caution: "يمكنك تحمّل هذا التمويل، لكن بهامش أمان ضيّق",
  high: "هذا التمويل يتجاوز قدرتك الآمنة",
};

const SCEN_META: Record<ScenarioKey, string> = {
  expected: "السيناريو المتوقع",
  bad: "السيناريو السيئ",
  baseline: "بأرقام اليوم (بلا تضخم)",
};

/** What each track assumes — the reader deserves to know what they are being shown. */
const SCEN_HINT: Record<ScenarioKey, string> = {
  expected: "راتبك ينمو قليلاً، والأسعار ترتفع بمعدل التضخم الفعلي.",
  bad: "لا زيادة على راتبك، والأسعار ترتفع بوتيرة أسرع.",
  baseline: "الراتب والمصاريف مجمّدة على أرقام اليوم — المرجع الذي يُقاس عليه أثر التضخم.",
};

const METRICS: Metric[] = ["remainingMonthly", "dbr", "remainingDebt"];

/** "السنة الرابعة (منتصف 2029)" — the calendar year is a label, never an input to a number. */
const ORDINAL = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
  "السابعة",
  "الثامنة",
  "التاسعة",
  "العاشرة",
];

export default function AnalysisPage() {
  const { analysis, answers, setStep, setAnalysis, setAnswer } = useAppStore();
  /**
   * All three tracks are drawn together; toggling one off isolates the others. The BASELINE is
   * on by default — without it the two projections are two lines with nothing to be read against,
   * and the whole point of the chart (what inflation costs you) is invisible.
   */
  const [visible, setVisible] = useState<Record<ScenarioKey, boolean>>({
    expected: true,
    bad: true,
    baseline: true,
  });
  const [metric, setMetric] = useState<Metric>("remainingMonthly");
  const [rules, setRules] = useState<SamaRuleSet | null>(null);
  const [thresholds, setThresholds] = useState<RiskThresholds | null>(null);

  const [rateInput, setRateInput] = useState("");
  const [busy, setBusy] = useState<"rate" | "safer" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The red lines are published regulation — read them, don't hardcode them.
  useEffect(() => {
    const controller = new AbortController();
    getRules(controller.signal)
      .then((r) => {
        setRules(r.rules);
        setThresholds(r.thresholds);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const result = analysis?.result;

  const scenarios = useMemo(() => {
    const find = (t: string) => result?.scenarios.find((s) => s.type === t);
    return {
      expected: find("expected"),
      bad: find("bad"),
      baseline: find("baseline"),
    } as Record<ScenarioKey, Scenario | undefined>;
  }, [result]);

  if (!result || !scenarios.expected || !scenarios.bad || !scenarios.baseline) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white border border-border rounded-[15px] p-8">
          <p className="text-sm font-semibold text-navy mb-2">لا يوجد تحليل لعرضه</p>
          <p className="text-xs text-text-secondary leading-relaxed mb-5">
            ابدأ تحليلاً جديداً حتى نحسب أثر التمويل على وضعك المالي.
          </p>
          <button
            onClick={() => setStep(1)}
            className="min-h-[44px] px-6 bg-orange hover:bg-orange-hover text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
          >
            ابدأ التحليل
          </button>
        </div>
      </div>
    );
  }

  /** The chart wants all three tracks in one bag, keyed the way it draws them. */
  const tracks = scenarios as Record<ScenarioKey, Scenario>;

  /**
   * The year cards and the headline stats need ONE scenario to read from. The chart shows all
   * three, so "focus" follows the toggles: isolate the bad scenario and the cards follow it.
   * Baseline is never the focus — it is a counterfactual, not a forecast to plan against.
   */
  const focus: ScenarioKey = visible.expected ? "expected" : visible.bad ? "bad" : "expected";
  const scenario = tracks[focus];
  const years = scenario.years;
  const year1 = years[0];
  const lastYear = years[years.length - 1];
  const safeYears = years.filter((y) => y.riskTier === "safe").length;
  const warnings = analysis?.warnings ?? [];
  const { apr, aprIsIndicative } = result.provenance;
  // Real provenance from the backend. Older analyses predate the field — default to manual so
  // the badge never claims verification that did not happen.
  const dataSources = result.provenance.dataSources ?? {
    existingCommitments: "manual" as const,
    grossSalary: "manual" as const,
  };

  const cap = rules?.deductionCapEmployee ?? 0.3333;
  const safeMax = thresholds?.safeMax ?? 0.25;

  /**
   * What inflation actually costs, in riyals: the gap between the focused track and the same
   * financing with today's prices frozen, at the END of the term. This is the number the chart
   * draws and nothing on the page ever stated.
   */
  const baselineLast = tracks.baseline.years[years.length - 1];
  const inflationBite = baselineLast.remainingMonthly - lastYear.remainingMonthly;

  /**
   * The composition charts show today's month, not a forecast — so they read the EFFECTIVE
   * figures the engine ran on (verified when SIMAH was applied), which keeps the cash-flow and
   * runway consistent with the DBR above. Fall back to the declared answers only if an older run
   * in the store predates this field. Null only if the store was rehydrated without either.
   */
  const input = analysis?.input ?? completeInput(answers);
  const flow = input ? cashFlowOf(input, year1.installment) : null;
  const outgoings = flow ? flow.installment + flow.commitments + flow.expenses : 0;

  /** Term-year 1 falls in the year the analysis was computed. A label, nothing more. */
  const startYear = new Date(result.provenance.computedAt).getFullYear();
  const yearLabel = (n: number) => {
    const ordinal = ORDINAL[n - 1] ?? String(n);
    return `السنة ${ordinal} (منتصف ${startYear + n - 1})`;
  };

  /** Any change of basis — rate, amount, term — goes back through the engine. */
  const rerun = async (
    kind: "rate" | "safer",
    override: { apr?: number; amount?: number; term?: number },
  ) => {
    const base = completeInput(answers);
    if (!base) return;

    setActionError(null);
    setBusy(kind);
    try {
      const input = {
        ...base,
        ...(override.amount !== undefined ? { financingAmount: override.amount } : {}),
        ...(override.term !== undefined ? { termYears: override.term } : {}),
      };

      const run = await runAnalysis(input, override.apr ?? (aprIsIndicative ? undefined : apr));
      setAnalysis(run);

      // Applying the suggestion genuinely changes the request, so the stored answers must
      // follow it — otherwise the offers step would price the OLD amount.
      if (override.amount !== undefined) setAnswer("financingAmount", override.amount);
      if (override.term !== undefined) setAnswer("termYears", override.term);

      setRateInput("");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "تعذّر إعادة الحساب.");
    } finally {
      setBusy(null);
    }
  };

  const applyRate = () => {
    const parsed = Number(rateInput.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      setActionError("أدخل نسبة بين 0 و100.");
      return;
    }
    // The API takes a fraction (0.049); the user types a percentage (4.9).
    rerun("rate", { apr: parsed / 100 });
  };

  return (
    <div className="flex-1 w-full relative bg-[#faf8f5]">
      <PageBackdrop animated={false} />

      <div className="relative z-10 max-w-[1000px] mx-auto w-full px-4 py-6 space-y-5">
        <header className="animate-fade-in-up">
          <h1 className="text-2xl sm:text-[32px] leading-snug font-bold text-navy mb-2">
            هل يناسبك هذا التمويل؟
          </h1>
          <p className="text-text-secondary leading-relaxed max-w-2xl">
            حسبنا القسط وفق قواعد مؤسسة النقد، وتتبّعنا أثره على دخلك سنة بسنة.
          </p>
        </header>

        {warnings.length > 0 && (
          <div role="status" className="rounded-[15px] border border-caution/30 bg-caution-bg p-4">
            {warnings.map((w) => (
              <p key={w} className="text-xs text-caution font-semibold leading-relaxed">
                {w === "unstable_income"
                  ? "مدة خدمتك أقل من سنة، لذلك قد تُقيّم الجهات الممولة استقرار دخلك بشكل مختلف."
                  : w}
              </p>
            ))}
          </div>
        )}

        {/* ---------- The verdict ---------- */}
        <section className="bg-white rounded-[15px] border border-border shadow-[0_1px_3px_rgba(8,47,62,0.06),0_10px_30px_-16px_rgba(8,47,62,0.18)] overflow-hidden animate-fade-in-up anim-delay-1">
          <div className="h-1" style={{ backgroundColor: TIER_COLOR[result.overallRisk] }} aria-hidden="true" />

          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-center">
            <div className="mx-auto md:mx-0">
              <DbrGauge dbr={result.requestedDbr} tier={result.overallRisk} cap={cap} safeMax={safeMax} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <StatusBadge status={RISK_STATUS[result.overallRisk]} label={RISK_LABEL[result.overallRisk]} />
                <span className="text-[11px] text-text-secondary" style={NUM}>
                  {safeYears} من {years.length} سنوات ضمن النطاق الآمن
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-navy leading-snug mb-2">
                {VERDICT[result.overallRisk]}
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed mb-5">{year1.message}</p>

              <dl className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Stat
                  label="القسط الشهري"
                  value={fmt(year1.installment)}
                  unit="ر.س"
                  sub={`بهامش ${pct(apr)} سنوياً${aprIsIndicative ? " (تقديري)" : ""}`}
                />
                <Stat
                  label="المتبقي شهرياً"
                  value={fmt(year1.remainingMonthly)}
                  unit="ر.س"
                  sub={`${lastYear.remainingMonthly >= year1.remainingMonthly ? "يرتفع" : "ينخفض"} إلى ${fmt(lastYear.remainingMonthly)} بنهاية المدة`}
                />
                <Stat
                  label="سنوات ضمن الأمان"
                  value={String(safeYears)}
                  sub={`من ${years.length}`}
                  dots={years.map((y) => TIER_COLOR[y.riskTier])}
                />
              </dl>
            </div>
          </div>
        </section>

        {/* ---------- The chart ---------- */}
        <section className="bg-white rounded-[15px] border border-border p-5 sm:p-6 animate-fade-in-up anim-delay-2">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-navy mb-1">مسارك خلال مدة السداد</h2>
              <p className="text-xs text-text-secondary leading-relaxed max-w-lg">
                الخط المتقطّع هو أرقام اليوم مجمّدة؛ المسافة بينه وبين السيناريوهات الملوّنة هي ما
                يقتطعه التضخم منك. مرّر على أي سنة لقراءتها، أو أخفِ مساراً للتركيز على غيره.
              </p>
            </div>

            {/* What the line measures. */}
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  aria-pressed={metric === m}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    metric === m
                      ? "bg-navy text-white"
                      : "bg-warm-bg border border-border text-navy hover:bg-white"
                  }`}
                >
                  {METRIC_META[m].label}
                </button>
              ))}
            </div>
          </div>

          <ScenarioChart
            scenarios={tracks}
            visible={visible}
            metric={metric}
            cap={cap}
            safeMax={safeMax}
            yearLabel={yearLabel}
          />

          {/* The ribbon under the plot is a SECOND colour encoding (status, not identity), and the
              safe tier sits close in hue to the expected-scenario blue. So it gets its own legend,
              named in words — otherwise a blue cell in the "السيئ" row reads as a stray series. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            <span className="text-[11px] text-text-secondary">الشريط أسفل الرسم — تصنيف كل سنة:</span>
            {(["safe", "caution", "high"] as RiskTier[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[11px] text-navy font-semibold">
                <span
                  className="w-3 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: TIER_COLOR[t] }}
                  aria-hidden="true"
                />
                {RISK_LABEL[t]}
              </span>
            ))}
          </div>

          {/* The legend IS the filter: each chip shows/hides its own track. */}
          <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-border/60">
            {ALL_SCENARIOS.map((key) => {
              const on = visible[key];
              // Never let the user empty the chart: the last visible PROJECTION can't be switched
              // off. Baseline is a reference — hiding it is always allowed.
              const isLast =
                on && PROJECTED.includes(key) && PROJECTED.filter((k) => visible[k]).length === 1;

              return (
                <button
                  key={key}
                  onClick={() => !isLast && setVisible((v) => ({ ...v, [key]: !v[key] }))}
                  aria-pressed={on}
                  disabled={isLast}
                  title={isLast ? "لا يمكن إخفاء آخر سيناريو معروض" : SCEN_HINT[key]}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors border ${
                    on
                      ? "bg-warm-bg border-navy/20 text-navy"
                      : "bg-white border-border text-text-secondary hover:bg-warm-bg"
                  } ${isLast ? "cursor-default" : "cursor-pointer"}`}
                >
                  {/* The swatch mirrors the mark: dashed for the reference, solid for a projection. */}
                  <span
                    className="w-4 h-[3px] rounded-full"
                    style={
                      key === "baseline"
                        ? {
                            backgroundImage: `repeating-linear-gradient(to right, ${SCEN_COLOR[key]} 0 4px, transparent 4px 7px)`,
                            opacity: on ? 1 : 0.3,
                          }
                        : { backgroundColor: SCEN_COLOR[key], opacity: on ? 1 : 0.3 }
                    }
                    aria-hidden="true"
                  />
                  {SCEN_META[key]}
                  {!on && <span className="text-[10px] opacity-70">(مخفي)</span>}
                </button>
              );
            })}
            <p className="text-[11px] text-text-secondary mr-auto">اضغط على أي مسار لإخفائه أو إظهاره.</p>
          </div>

          {/* What each visible track ASSUMES, and how the engine summed it up. The backend has
              been writing this sentence all along and the page was dropping it on the floor. */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {PROJECTED.filter((k) => visible[k]).map((key) => (
              <div key={key} className="bg-warm-bg rounded-[15px] border border-border/60 p-3.5">
                <dt className="flex items-center gap-2 text-[11px] font-bold text-navy mb-1">
                  <span
                    className="w-3 h-[3px] rounded-full shrink-0"
                    style={{ backgroundColor: SCEN_COLOR[key] }}
                    aria-hidden="true"
                  />
                  {SCEN_META[key]}
                </dt>
                <dd className="text-[11px] text-text-secondary leading-relaxed">
                  <span className="block mb-1">{SCEN_HINT[key]}</span>
                  <span className="text-navy font-semibold">{tracks[key].resultSummary}</span>
                </dd>
              </div>
            ))}
          </dl>

          {/* The single number the baseline exists to produce. */}
          {inflationBite > 1 && (
            <p className="text-[11px] text-text-secondary leading-relaxed mt-3 pt-3 border-t border-border/60">
              بحلول {yearLabel(lastYear.year)}، يتركك التضخم بـ{" "}
              <strong className="text-navy" style={NUM}>
                {fmt(inflationBite)} ريال
              </strong>{" "}
              أقل في الشهر مما لو بقيت الأسعار على أرقام اليوم — بنفس القسط تماماً.
            </p>
          )}
        </section>

        {/* ---------- Today's month, and what the financing really costs ---------- */}
        {flow && input && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up">
            <section className="bg-white rounded-[15px] border border-border p-5 sm:p-6">
              <h2 className="text-base font-bold text-navy mb-1">أين يذهب دخلك الشهري؟</h2>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                شهرك الأول بعد التمويل، من دخل {fmt(flow.income)} ريال.
              </p>
              <CashFlowBar flow={flow} />
            </section>

            <section className="bg-white rounded-[15px] border border-border p-5 sm:p-6">
              <h2 className="text-base font-bold text-navy mb-1">تكلفة التمويل الإجمالية</h2>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                ما ستدفعه فعلياً على مدى {input.termYears} سنوات — القسط وحده لا يقولها.
              </p>
              <CostMeter
                amount={input.financingAmount}
                installment={year1.installment}
                termYears={input.termYears}
                apr={apr}
                aprIsIndicative={aprIsIndicative}
              />

              <div className="mt-5 pt-4 border-t border-border/60">
                <h3 className="text-sm font-bold text-navy mb-3">شبكة أمانك</h3>
                <RunwayMeter savings={input.savings} monthlyOutgoings={outgoings} />
              </div>
            </section>
          </div>
        )}

        {/* ---------- Year by year ---------- */}
        <section className="animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-bold text-navy">سنة بسنة</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
              <span
                className="w-3 h-[3px] rounded-full"
                style={{ backgroundColor: SCEN_COLOR[focus] }}
                aria-hidden="true"
              />
              {SCEN_META[focus]}
            </span>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {years.map((y) => (
              <li key={y.year} className="bg-white rounded-[15px] border border-border overflow-hidden">
                <div className="bg-navy px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white" style={NUM}>
                    {yearLabel(y.year)}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: TIER_COLOR[y.riskTier] }}
                    aria-hidden="true"
                  />
                </div>

                <div className="p-4">
                  <div className="mb-3">
                    <StatusBadge status={RISK_STATUS[y.riskTier]} label={RISK_LABEL[y.riskTier]} size="sm" />
                  </div>

                  <dl className="space-y-1.5">
                    <Row label="القسط" value={`${fmt(y.installment)} ريال`} />
                    <Row label="المتبقي شهرياً" value={`${fmt(y.remainingMonthly)} ريال`} />
                    <Row label="الدين المتبقي" value={`${fmt(y.remainingDebt)} ريال`} />
                    <Row label="نسبة الاستقطاع" value={pct(y.dbr)} />
                  </dl>

                  <p className="text-[11px] text-text-secondary leading-relaxed border-t border-border/60 mt-3 pt-2.5">
                    {y.message}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- The safer option (scope §4.5: "Apply Suggestion recalculates") ---------- */}
        {result.saferOption && (
          <section className="bg-purple-light/40 border border-purple/20 rounded-[15px] p-5 sm:p-6 animate-fade-in-up">
            <h2 className="text-base font-bold text-navy mb-2">خيار أكثر أماناً</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-4">
              {result.saferOption.rationale}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Suggestion
                label="مبلغ مقترح"
                value={`${fmt(result.saferOption.suggestedAmount)} ريال`}
                was={
                  result.saferOption.suggestedAmount !== answers.financingAmount
                    ? `${fmt(answers.financingAmount ?? 0)} ريال`
                    : undefined
                }
              />
              <Suggestion
                label="مدة بديلة"
                value={`${result.saferOption.suggestedTermYears} سنوات`}
                was={
                  result.saferOption.suggestedTermYears !== answers.termYears
                    ? `${answers.termYears} سنوات`
                    : undefined
                }
              />
              <button
                onClick={() =>
                  rerun("safer", {
                    amount: result.saferOption!.suggestedAmount,
                    term: result.saferOption!.suggestedTermYears,
                  })
                }
                disabled={busy !== null}
                className="min-h-[44px] px-6 bg-navy hover:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-full transition-colors cursor-pointer"
              >
                {busy === "safer" ? "جارٍ إعادة التحليل…" : "طبّق الاقتراح"}
              </button>
            </div>
          </section>
        )}

        {/* ---------- The basis of the calculation ---------- */}
        <section className="bg-white rounded-[15px] border border-border p-5 animate-fade-in-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-sm font-bold text-navy">أساس حساب القسط</h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    aprIsIndicative
                      ? "bg-caution-bg text-caution border-caution/20"
                      : "bg-safe-bg text-safe border-safe/20"
                  }`}
                >
                  {aprIsIndicative ? "هامش تقديري" : "هامش فعلي"}
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
                {aprIsIndicative
                  ? "لا يوجد لديك عرض بعد، لذلك حُسب القسط بطريقة الإطفاء على هامش تقديري من المحرك. أدخل هامشاً فعلياً ليُعاد الحساب عليه."
                  : "أُعيد حساب التحليل بالكامل على الهامش الذي أدخلته."}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyRate()}
                  placeholder={(apr * 100).toFixed(1)}
                  aria-label="هامش المرابحة السنوي بالنسبة المئوية"
                  className="w-24 bg-warm-bg border border-border rounded-full px-4 py-2.5 ps-8 text-sm font-bold text-navy text-right placeholder:text-text-secondary/50 focus:outline-none focus:bg-white focus:border-navy/30 min-h-[44px]"
                  style={NUM}
                />
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">%</span>
              </div>
              <button
                onClick={applyRate}
                disabled={busy !== null || !rateInput.trim()}
                className="min-h-[44px] px-5 bg-navy hover:bg-navy/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap"
              >
                {busy === "rate" ? "جارٍ الحساب…" : "أعد الحساب"}
              </button>
            </div>
          </div>

          {actionError && (
            <p role="alert" className="text-[11px] text-danger font-semibold mt-3">
              {actionError}
            </p>
          )}

          {/* Where each figure came from. Badges read the backend's provenance verbatim — the
              analysis computes the numbers, this only reports which source supplied them. */}
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h3 className="text-sm font-bold text-navy">مصدر البيانات</h3>
              {dataSources.simah && (
                <span className="text-[10px] text-text-secondary" style={NUM}>
                  سمة · مرجع {dataSources.simah.referenceId} · درجة ائتمانية {dataSources.simah.creditScore}
                </span>
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between gap-2 bg-warm-bg rounded-[15px] border border-border/60 px-3.5 py-2.5">
                <dt className="text-[11px] text-text-secondary">الراتب الشهري</dt>
                <dd>
                  <DataSourceBadge source={dataSources.grossSalary} size="md" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 bg-warm-bg rounded-[15px] border border-border/60 px-3.5 py-2.5">
                <dt className="text-[11px] text-text-secondary">الالتزامات الشهرية</dt>
                <dd>
                  <DataSourceBadge source={dataSources.existingCommitments} size="md" />
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-[10.5px] text-text-secondary leading-relaxed mt-4 pt-3 border-t border-border/60" style={NUM}>
            هامش {pct(apr)} سنوياً · قواعد ساما {result.provenance.ruleVersion} · تضخم{" "}
            {pct(result.provenance.inflationValue)} ({result.provenance.inflationSource}) · نمو راتب
            مفترض {pct(result.provenance.assumptions.salaryGrowth)}. النتائج تقديرية توعوية ولا تمثل
            موافقة ائتمانية.
          </p>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 pb-2">
          <button
            onClick={() => setStep(3)}
            className="flex-1 bg-orange hover:bg-orange-hover text-white font-semibold py-4 rounded-full text-base transition-colors min-h-[52px] cursor-pointer shadow-sm"
          >
            اعرض العروض المناسبة
          </button>
          <button
            onClick={() => setStep(1)}
            className="sm:w-auto px-6 border border-border bg-white text-navy font-semibold py-4 rounded-full text-base transition-colors hover:bg-warm-bg min-h-[52px] cursor-pointer"
          >
            تعديل بياناتي
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  unit,
  sub,
  dots,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  dots?: string[];
}) {
  return (
    <div className="bg-warm-bg rounded-[15px] border border-border/60 p-3.5">
      <dt className="text-[11px] text-text-secondary mb-1">{label}</dt>
      <dd>
        <span className="text-lg font-bold text-navy" style={NUM}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-text-secondary mr-1">{unit}</span>}

        {dots && (
          <div className="flex gap-1 mt-2" aria-hidden="true">
            {dots.map((c, i) => (
              <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
        )}

        {sub && <p className="text-[10px] text-text-secondary mt-1.5 leading-relaxed">{sub}</p>}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11px] text-text-secondary">{label}</dt>
      <dd className="text-xs font-bold text-navy" style={NUM}>
        {value}
      </dd>
    </div>
  );
}

function Suggestion({ label, value, was }: { label: string; value: string; was?: string }) {
  return (
    <div className="bg-white rounded-[15px] border border-border px-4 py-3">
      <p className="text-[11px] text-text-secondary mb-0.5">{label}</p>
      <p className="text-sm font-bold text-navy" style={NUM}>
        {value}
        {was && (
          <span className="text-[11px] font-normal text-text-secondary line-through mr-2">{was}</span>
        )}
      </p>
    </div>
  );
}

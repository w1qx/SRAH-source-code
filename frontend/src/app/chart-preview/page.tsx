"use client";

import { useState } from "react";
import {
  CashFlowBar,
  CostMeter,
  DbrGauge,
  METRIC_META,
  RunwayMeter,
  ScenarioChart,
  cashFlowOf,
  type Metric,
  type ScenarioKey,
} from "@/features/analysis/charts";
import type { Scenario, UserFinancialData, YearBreakdown } from "@shared/types";

/**
 * A design harness for the analysis charts — sample numbers, not product data. It exists only so
 * they can be eyeballed without walking the whole advisor flow. The charts themselves live in
 * features/analysis/charts.tsx and are fed a real AnalysisResult on the analysis page.
 */
const baselineYears: YearBreakdown[] = [
  { year: 1, installment: 2950, remainingMonthly: 4050, remainingDebt: 125611, dbr: 0.2458, riskTier: "safe", message: "" },
  { year: 2, installment: 2950, remainingMonthly: 4050, remainingDebt: 96969, dbr: 0.2458, riskTier: "safe", message: "" },
  { year: 3, installment: 2950, remainingMonthly: 4050, remainingDebt: 66560, dbr: 0.2458, riskTier: "safe", message: "" },
  { year: 4, installment: 2950, remainingMonthly: 4050, remainingDebt: 32000, dbr: 0.2458, riskTier: "safe", message: "" },
  { year: 5, installment: 2950, remainingMonthly: 4050, remainingDebt: 0, dbr: 0.2458, riskTier: "safe", message: "" },
];

// Expected: a modest pay rise softens the squeeze. Bad: no rise, prices climb anyway.
const expectedYears: YearBreakdown[] = baselineYears.map((y, i) => ({
  ...y,
  remainingMonthly: y.remainingMonthly - i * 190,
  dbr: y.dbr - i * 0.004,
}));

const badYears: YearBreakdown[] = baselineYears.map((y, i) => ({
  ...y,
  remainingMonthly: y.remainingMonthly - i * 450,
  dbr: y.dbr + i * 0.02,
  riskTier: i >= 3 ? "high" : i >= 1 ? "caution" : "safe",
}));

const scenarios: Record<ScenarioKey, Scenario> = {
  baseline: { type: "baseline", years: baselineYears, resultSummary: "أرقام اليوم مجمّدة." },
  expected: { type: "expected", years: expectedYears, resultSummary: "الهدف يتحقق بضغط مالي محدود." },
  bad: { type: "bad", years: badYears, resultSummary: "الهدف يتحقق تحت ضغط مالي مرتفع." },
};

const input: UserFinancialData = {
  goal: "car",
  financingAmount: 150000,
  termYears: 5,
  grossSalary: 12000,
  additionalIncome: 0,
  existingCommitments: 800,
  monthlyExpenses: 4200,
  familyStatus: "married",
  savings: 22000,
  employmentSector: "private",
  tenureYears: 3,
};

const METRICS: Metric[] = ["remainingMonthly", "dbr", "remainingDebt"];
const KEYS: ScenarioKey[] = ["expected", "bad", "baseline"];

export default function Page() {
  const [metric, setMetric] = useState<Metric>("remainingMonthly");
  const [visible, setVisible] = useState<Record<ScenarioKey, boolean>>({
    expected: true,
    bad: true,
    baseline: true,
  });

  const flow = cashFlowOf(input, 2950);
  const outgoings = flow.installment + flow.commitments + flow.expenses;

  return (
    <main className="p-6 bg-warm-bg min-h-screen space-y-4" dir="rtl">
      <div className="bg-white border border-border rounded-[15px] p-6 max-w-3xl mx-auto">
        <div className="flex flex-wrap gap-1.5 mb-5">
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold cursor-pointer ${
                metric === m ? "bg-navy text-white" : "bg-warm-bg border border-border text-navy"
              }`}
            >
              {METRIC_META[m].label}
            </button>
          ))}
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border cursor-pointer ${
                visible[k]
                  ? "bg-warm-bg border-navy/20 text-navy"
                  : "bg-white border-border text-text-secondary"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <ScenarioChart
          scenarios={scenarios}
          visible={visible}
          metric={metric}
          cap={0.3333}
          safeMax={0.25}
          yearLabel={(n) => `السنة ${n} (منتصف ${2025 + n})`}
        />
      </div>

      <div className="bg-white border border-border rounded-[15px] p-6 max-w-3xl mx-auto flex justify-center">
        <DbrGauge dbr={0.2458} tier="safe" cap={0.3333} safeMax={0.25} />
      </div>

      <div className="bg-white border border-border rounded-[15px] p-6 max-w-3xl mx-auto">
        <CashFlowBar flow={flow} />
      </div>

      <div className="bg-white border border-border rounded-[15px] p-6 max-w-3xl mx-auto">
        <CostMeter amount={150000} installment={2950} termYears={5} apr={0.06} aprIsIndicative />
      </div>

      <div className="bg-white border border-border rounded-[15px] p-6 max-w-3xl mx-auto">
        <RunwayMeter savings={input.savings} monthlyOutgoings={outgoings} />
      </div>
    </main>
  );
}

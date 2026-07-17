/**
 * Plain-language message catalog. Pure string building — no I/O, no framework.
 *
 * Suraa is an Arabic-first product, so 'ar' is the default and the messages are written
 * to be read by someone with no financial background: no jargon, no ratios quoted at the
 * user, just what this means for their month. 'en' exists for tests, logs, and a future
 * language toggle.
 *
 * These strings are DESCRIPTIVE, never prescriptive: they explain what the numbers say.
 * They never tell the user to take or refuse a financing — that is advice, and Suraa is
 * an awareness tool, not an advisor.
 */
import type { RiskTier, ScenarioType } from '@shared/types';

export type MessageLocale = 'ar' | 'en';

export const SUPPORTED_LOCALES: readonly MessageLocale[] = ['ar', 'en'];

export const DEFAULT_LOCALE: MessageLocale = 'ar';

/** Money for humans: "4,050 SAR" / "4,050 ريال". Latin digits in both, for legibility. */
export function formatSar(amount: number, locale: MessageLocale): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');
  return locale === 'ar' ? `${formatted} ريال` : `${formatted} SAR`;
}

/** DBR for humans: 0.2458 → "24.6%". */
export function formatPercent(fraction: number, locale: MessageLocale, digits = 1): string {
  const value = (fraction * 100).toFixed(digits);
  return locale === 'ar' ? `${value}٪` : `${value}%`;
}

export const RISK_TIER_LABELS: Record<MessageLocale, Record<RiskTier, string>> = {
  ar: {
    safe: 'آمن',
    caution: 'مقبول بحذر',
    high: 'مخاطرة عالية',
  },
  en: {
    safe: 'Safe',
    caution: 'Acceptable with Caution',
    high: 'High Risk',
  },
};

export const SCENARIO_LABELS: Record<MessageLocale, Record<ScenarioType, string>> = {
  ar: {
    baseline: 'الوضع الحالي',
    expected: 'السيناريو المتوقع',
    bad: 'السيناريو السيئ',
  },
  en: {
    baseline: 'Baseline',
    expected: 'Expected Scenario',
    bad: 'Bad Scenario',
  },
};

export interface YearMessageContext {
  year: number;
  tier: RiskTier;
  remainingMonthly: number;
  dbr: number;
  /** True when the user's money runs out before the month does. */
  cashFlowNegative: boolean;
  /** True when a SAMA obligation ceiling is breached this year. */
  obligationBreached: boolean;
}

/** What this one year of the financing means for the user, in a sentence. */
export function yearMessage(locale: MessageLocale, ctx: YearMessageContext): string {
  const remaining = formatSar(Math.abs(ctx.remainingMonthly), locale);
  const dbr = formatPercent(ctx.dbr, locale);

  if (locale === 'ar') {
    if (ctx.cashFlowNegative) {
      return `في السنة ${ctx.year}: مصروفاتك والتزاماتك تتجاوز دخلك بمقدار ${remaining} شهرياً. هذا عجز شهري، وليس مجرد ضيق في الميزانية.`;
    }
    if (ctx.obligationBreached) {
      return `في السنة ${ctx.year}: إجمالي التزاماتك يتجاوز الحد الذي تسمح به مؤسسة النقد. يتبقى لك ${remaining} شهرياً.`;
    }
    switch (ctx.tier) {
      case 'safe':
        return `في السنة ${ctx.year}: يتبقى لك ${remaining} شهرياً بعد القسط والمصروفات، ونسبة الاستقطاع ${dbr}. هامش مريح يسمح بالادخار ومواجهة الطوارئ.`;
      case 'caution':
        return `في السنة ${ctx.year}: يتبقى لك ${remaining} شهرياً، ونسبة الاستقطاع ${dbr} — ضمن حد مؤسسة النقد لكنها مرتفعة. أي طارئ سيضغط على ميزانيتك.`;
      case 'high':
        return `في السنة ${ctx.year}: نسبة الاستقطاع ${dbr} تتجاوز حد مؤسسة النقد (33.33٪)، ويتبقى لك ${remaining} شهرياً. هذا مستوى مخاطرة عالٍ.`;
    }
  }

  if (ctx.cashFlowNegative) {
    return `Year ${ctx.year}: your expenses and instalments exceed your income by ${remaining} a month. That is a monthly shortfall, not a tight budget.`;
  }
  if (ctx.obligationBreached) {
    return `Year ${ctx.year}: your total obligations exceed the ceiling SAMA permits. ${remaining} a month is left over.`;
  }
  switch (ctx.tier) {
    case 'safe':
      return `Year ${ctx.year}: ${remaining} a month is left after the instalment and expenses, at a ${dbr} debt burden. A comfortable margin — room to save and to absorb an emergency.`;
    case 'caution':
      return `Year ${ctx.year}: ${remaining} a month is left, at a ${dbr} debt burden — within SAMA's limit but tight. Any emergency will strain the budget.`;
    case 'high':
      return `Year ${ctx.year}: a ${dbr} debt burden exceeds SAMA's 33.33% limit, leaving ${remaining} a month. This is a high-risk level.`;
  }
}

export interface ScenarioSummaryContext {
  type: ScenarioType;
  worstTier: RiskTier;
  finalRemainingMonthly: number;
  firstRemainingMonthly: number;
}

/** One sentence per scenario — the line the user reads on the results tab. */
export function scenarioSummary(locale: MessageLocale, ctx: ScenarioSummaryContext): string {
  const finalRemaining = formatSar(Math.abs(ctx.finalRemainingMonthly), locale);
  const erosion = ctx.firstRemainingMonthly - ctx.finalRemainingMonthly;
  const label = SCENARIO_LABELS[locale][ctx.type];
  const tier = RISK_TIER_LABELS[locale][ctx.worstTier];

  if (locale === 'ar') {
    switch (ctx.type) {
      case 'baseline':
        return `${label}: بافتراض ثبات دخلك ومصروفاتك، تنتهي المدة وأنت عند مستوى «${tier}» ويتبقى لك ${finalRemaining} شهرياً.`;
      case 'expected':
        return `${label}: مع نمو معقول في الراتب وارتفاع المصروفات حسب التضخم الفعلي، تنتهي المدة عند مستوى «${tier}» ويتبقى لك ${finalRemaining} شهرياً.`;
      case 'bad':
        return ctx.finalRemainingMonthly < 0
          ? `${label}: إذا ثبت راتبك واستمرت المصروفات في الارتفاع، ينتهي بك الأمر إلى عجز شهري قدره ${finalRemaining} — مستوى «${tier}».`
          : `${label}: إذا ثبت راتبك واستمرت المصروفات في الارتفاع، يتقلص المتبقي إلى ${finalRemaining} شهرياً (بانخفاض ${formatSar(Math.abs(erosion), locale)} عن السنة الأولى) — مستوى «${tier}».`;
    }
  }

  switch (ctx.type) {
    case 'baseline':
      case 'expected': {
      const opening =
        ctx.type === 'baseline'
          ? `${label}: with income and expenses held flat`
          : `${label}: with modest salary growth against expenses rising at the real inflation rate`;
      return `${opening}, the term ends at "${tier}" with ${finalRemaining} a month remaining.`;
    }
    case 'bad':
      return ctx.finalRemainingMonthly < 0
        ? `${label}: if your salary stays flat while expenses keep climbing, you end the term with a monthly shortfall of ${finalRemaining} — "${tier}".`
        : `${label}: if your salary stays flat while expenses keep climbing, what is left shrinks to ${finalRemaining} a month (down ${formatSar(Math.abs(erosion), locale)} from year one) — "${tier}".`;
  }
}

export interface SaferOptionContext {
  originalAmount: number;
  originalTermYears: number;
  suggestedAmount: number;
  suggestedTermYears: number;
  suggestedInstallment: number;
  suggestedDbr: number;
  /** No headroom at all — existing commitments already consume the safe budget. */
  noHeadroom: boolean;
}

export function saferOptionRationale(locale: MessageLocale, ctx: SaferOptionContext): string {
  const amount = formatSar(ctx.suggestedAmount, locale);
  const installment = formatSar(ctx.suggestedInstallment, locale);
  const dbr = formatPercent(ctx.suggestedDbr, locale);
  const termChanged = ctx.suggestedTermYears !== ctx.originalTermYears;
  const amountChanged = Math.round(ctx.suggestedAmount) !== Math.round(ctx.originalAmount);

  if (locale === 'ar') {
    if (ctx.noHeadroom) {
      return 'التزاماتك الحالية تستهلك كامل المساحة الآمنة من راتبك. لا يوجد مبلغ تمويل يبقيك ضمن النطاق الآمن اليوم؛ تقليل الالتزامات القائمة أولاً هو ما يفتح المجال.';
    }
    const changes: string[] = [];
    if (amountChanged) changes.push(`تخفيض المبلغ إلى ${amount}`);
    if (termChanged) changes.push(`تمديد المدة إلى ${ctx.suggestedTermYears} سنوات`);
    return `${changes.join(' و')} يجعل القسط ${installment} شهرياً ونسبة الاستقطاع ${dbr} — أي ضمن النطاق الآمن (أقل من 25٪)، مع هامش يمتص أي طارئ.${
      termChanged ? ' لاحظ أن تمديد المدة يزيد إجمالي تكلفة التمويل.' : ''
    }`;
  }

  if (ctx.noHeadroom) {
    return 'Your existing commitments already consume the safe portion of your salary. No financing amount keeps you in the safe range today — reducing existing commitments first is what opens room.';
  }
  const changes: string[] = [];
  if (amountChanged) changes.push(`reducing the amount to ${amount}`);
  if (termChanged) changes.push(`extending the term to ${ctx.suggestedTermYears} years`);
  return `${changes.join(' and ')} brings the instalment to ${installment} a month at a ${dbr} debt burden — inside the safe range (below 25%), with margin to absorb an emergency.${
    termChanged ? ' Note that a longer term increases the total cost of the financing.' : ''
  }`;
}

type PreflightKey = 'income_below_expenses' | 'invalid_amount' | 'invalid_term' | 'unstable_income';

export function preflightMessage(
  locale: MessageLocale,
  key: PreflightKey,
  params: { income?: number; expenses?: number; maxTerm?: number },
): string {
  if (locale === 'ar') {
    switch (key) {
      case 'income_below_expenses':
        return `مصروفاتك الشهرية (${formatSar(params.expenses ?? 0, locale)}) تساوي أو تتجاوز دخلك (${formatSar(
          params.income ?? 0,
          locale,
        )}). لا يمكن تحليل تمويل جديد قبل معالجة هذا العجز.`;
      case 'invalid_amount':
        return 'مبلغ التمويل المطلوب غير منطقي. يرجى إدخال مبلغ أكبر من صفر.';
      case 'invalid_term':
        return `مدة التمويل غير منطقية. يرجى إدخال مدة بين سنة و${params.maxTerm ?? 30} سنة.`;
      case 'unstable_income':
        return 'مدة عملك أقل من سنة، لذا استقرار الدخل غير مؤكد بعد. دقة التحليل أقل، ويُنصح بتوضيح مصدر السداد.';
    }
  }

  switch (key) {
    case 'income_below_expenses':
      return `Your monthly expenses (${formatSar(params.expenses ?? 0, locale)}) meet or exceed your income (${formatSar(
        params.income ?? 0,
        locale,
      )}). A new financing cannot be analysed until that shortfall is addressed.`;
    case 'invalid_amount':
      return 'The requested financing amount is not valid. Please enter an amount greater than zero.';
    case 'invalid_term':
      return `The financing term is not valid. Please enter a term between 1 and ${params.maxTerm ?? 30} years.`;
    case 'unstable_income':
      return 'Your tenure is under a year, so income stability is not yet established. This analysis is less certain, and the repayment source is worth clarifying.';
  }
}

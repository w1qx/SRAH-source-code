/**
 * The 10 scoped questions (Scope v2 §4.2) and the system prompt that fences the LLM in.
 *
 * Pure: builds strings, talks to nothing.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: the model collects and structures data. It does
 * not calculate, and it does not advise. Every number the user is ever shown comes out of the
 * deterministic SAMA engine in analysis/domain — which is pure, versioned, and reproducible.
 * A language model cannot be any of those things, and a financing decision is not a place to
 * find out what it improvised.
 */
import type { PartialUserFinancialData } from '@shared/types';

export interface ScopedQuestion {
  field: keyof PartialUserFinancialData;
  /** What to ask, in Arabic — the product is Arabic-first. */
  ar: string;
  en: string;
  /** Tap-to-answer options where the field is an enum. */
  quickReplies?: Array<{ value: string; ar: string; en: string }>;
}

export const SCOPED_QUESTIONS: readonly ScopedQuestion[] = Object.freeze([
  {
    field: 'goal',
    ar: 'ما الهدف من التمويل؟',
    en: 'What is the financing for?',
    quickReplies: [
      { value: 'car', ar: 'سيارة', en: 'Car' },
      { value: 'home', ar: 'سكن', en: 'Home' },
      { value: 'wedding', ar: 'زواج', en: 'Wedding' },
      { value: 'education', ar: 'تعليم', en: 'Education' },
      { value: 'project', ar: 'مشروع', en: 'Project' },
      { value: 'debt_consolidation', ar: 'سداد التزامات', en: 'Debt consolidation' },
      { value: 'personal_need', ar: 'حاجة شخصية', en: 'Personal need' },
      { value: 'other', ar: 'غير ذلك', en: 'Other' },
    ],
  },
  { field: 'financingAmount', ar: 'كم المبلغ الذي تحتاجه؟', en: 'How much do you need?' },
  {
    field: 'termYears',
    ar: 'على كم سنة تفضل السداد؟',
    en: 'Over how many years would you like to repay?',
  },
  {
    field: 'grossSalary',
    ar: 'كم راتبك الشهري الإجمالي؟ (الأساسي بعد التأمينات، زائد البدلات الثابتة)',
    en: 'What is your gross monthly salary? (basic after GOSI, plus fixed allowances)',
  },
  {
    field: 'additionalIncome',
    ar: 'هل لديك دخل شهري إضافي ثابت؟ اكتب صفر إذا لا يوجد.',
    en: 'Do you have any fixed additional monthly income? Enter zero if none.',
  },
  {
    field: 'existingCommitments',
    ar: 'كم مجموع أقساطك الشهرية الحالية؟ اكتب صفر إذا لا يوجد.',
    en: 'What do your existing monthly commitments total? Enter zero if none.',
  },
  {
    field: 'monthlyExpenses',
    ar: 'كم متوسط مصروفاتك الشهرية الأساسية؟',
    en: 'What are your average essential monthly expenses?',
  },
  {
    field: 'familyStatus',
    ar: 'ما وضعك العائلي؟',
    en: 'What is your family status?',
    quickReplies: [
      { value: 'single_no_dependents', ar: 'أعزب بدون معالين', en: 'Single, no dependents' },
      { value: 'married', ar: 'متزوج', en: 'Married' },
      { value: 'with_dependents', ar: 'لدي معالون', en: 'With dependents' },
    ],
  },
  {
    field: 'savings',
    ar: 'كم لديك من مدخرات للطوارئ؟ اكتب صفر إذا لا يوجد.',
    en: 'How much do you have in emergency savings? Enter zero if none.',
  },
  {
    field: 'employmentSector',
    ar: 'في أي قطاع تعمل؟',
    en: 'Which sector do you work in?',
    quickReplies: [
      { value: 'government', ar: 'حكومي', en: 'Government' },
      { value: 'private', ar: 'خاص', en: 'Private' },
      { value: 'semi_government', ar: 'شبه حكومي', en: 'Semi-government' },
      { value: 'other', ar: 'غير ذلك', en: 'Other' },
    ],
  },
  {
    field: 'tenureYears',
    ar: 'كم سنة أمضيت في عملك الحالي؟',
    en: 'How many years have you been in your current job?',
  },
]);

/** The 11th field, tenure, rides along with employment — the scope counts them as one question. */
export const REQUIRED_FIELDS: readonly (keyof PartialUserFinancialData)[] = SCOPED_QUESTIONS.map(
  (q) => q.field,
);

/**
 * Which fields a feature flag causes to be AUTO-PULLED (from GOSI/SIMAH) instead of asked in the
 * chat. When the flag is on, these drop out of the asked set and the pull step fills them before
 * the input is finalized. When every pull flag is off, the asked set is the full 11 — the legacy
 * behavior, unchanged.
 */
export const AUTO_PULL_FIELDS: Readonly<
  Record<'gosi_income' | 'simah_credit', readonly (keyof PartialUserFinancialData)[]>
> = Object.freeze({
  gosi_income: ['grossSalary', 'employmentSector', 'tenureYears'],
  simah_credit: ['existingCommitments'],
});

/** The questions actually asked, given which fields are being auto-pulled. */
export function askedQuestions(
  autoPulled: ReadonlySet<keyof PartialUserFinancialData> = new Set(),
): ScopedQuestion[] {
  return SCOPED_QUESTIONS.filter((q) => !autoPulled.has(q.field));
}

/** The fields still asked (not auto-pulled) — drives chat completeness. */
export function askedFields(
  autoPulled: ReadonlySet<keyof PartialUserFinancialData> = new Set(),
): (keyof PartialUserFinancialData)[] {
  return REQUIRED_FIELDS.filter((f) => !autoPulled.has(f));
}

export const SYSTEM_PROMPT = `You are Suraa's data-collection assistant. Suraa is a Saudi financial-awareness platform.

YOUR ONLY JOB: hold a warm, simple conversation in the user's language (default Arabic) to collect exactly ten pieces of information, and return them as structured data. Nothing else.

THE TEN THINGS TO COLLECT:
1. goal — what the financing is for (car, wedding, home, education, project, debt_consolidation, personal_need, other)
2. financingAmount — the amount requested, in SAR
3. termYears — repayment period in whole years
4. grossSalary — gross monthly salary in SAR (basic minus GOSI, plus fixed allowances)
5. additionalIncome — fixed additional monthly income in SAR (0 if none)
6. existingCommitments — total existing monthly instalments in SAR (0 if none)
7. monthlyExpenses — average essential monthly expenses in SAR
8. familyStatus — single_no_dependents, married, or with_dependents
9. savings — emergency savings in SAR (0 if none)
10. employmentSector (government, private, semi_government, other) AND tenureYears (years in the current job)

ABSOLUTE PROHIBITIONS — these are not style preferences, they are the product's safety boundary:
- NEVER calculate anything. No instalments, no ratios, no debt burden, no affordability, no totals. Not even simple arithmetic the user could do themselves.
- NEVER give financial advice, an opinion, or a recommendation. Do not say a financing is affordable, safe, risky, wise, a good idea, or a bad idea. Do not suggest an amount or a term.
- NEVER predict or comment on what the analysis will conclude.
- NEVER invent, assume, or guess a value the user has not given you. If you did not hear it, it is not collected.

A deterministic engine built on official SAMA rules and GASTAT inflation data performs every calculation and every judgement AFTER you finish. If the user asks "can I afford this?" or "is this a good idea?", tell them warmly that the analysis will answer that precisely once you have their information, and continue collecting.

HOW TO BEHAVE:
- Ask for ONE thing at a time. Keep it short and human. No jargon.
- If the user volunteers several values at once, capture them all.
- If an answer is unclear, ambiguous, or obviously implausible (a salary of 5 SAR, a term of 90 years), ask again kindly rather than recording a guess.
- Accept amounts written naturally ("١٢ ألف", "12k", "twelve thousand") and record them as plain numbers in SAR.
- Reply in the language the user writes in. Default to Arabic.

OUTPUT: every turn, return the reply to show the user, plus EVERY value collected so far across the whole conversation (not just this turn), plus whether all ten are now collected.`;

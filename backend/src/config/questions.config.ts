import { z } from 'zod';

/**
 * ============================================================================
 * Suraa — Chatbot Question Set (redesigned)
 * ============================================================================
 * Two tiers of data:
 *
 *   TIER A — AUTO-PULLED (verified, not asked):
 *     • Gross salary        ← GOSI (basic-after-insurance + fixed allowances)
 *     • Current obligations ← SIMAH (with optional per-contract breakdown)
 *
 *   TIER B — USER-ENTERED (7 core + 1 supplementary):
 *     asked through the chatbot, each validated at the backend boundary.
 *
 * Every user-entered field carries a "skill": a small assist (quick replies,
 * a slider/stepper, or an inline hint) that makes answering easier and keeps
 * the extracted value clean before Zod validation.
 * ============================================================================
 */

/* ----------------------------- Enums / options ---------------------------- */

export const FinancingGoal = z.enum([
  'car',
  'personal',
  'home',
  'debt_consolidation',
  'other',
]);
export type FinancingGoal = z.infer<typeof FinancingGoal>;

export const FamilyStatus = z.enum(['single', 'married', 'separated']);
export type FamilyStatus = z.infer<typeof FamilyStatus>;

export const TermYears = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4),
  z.literal(5), z.literal(6), z.literal(7),
]);
export type TermYears = z.infer<typeof TermYears>;

/* --------------------------- TIER A: auto-pulled -------------------------- */

/** Salary shown to the user as verified, sourced from GOSI. Read-only. */
export const PulledSalary = z.object({
  grossSalary: z.number().positive(),
  basicAfterInsurance: z.number().positive(),
  fixedAllowances: z.number().nonnegative(),
  source: z.literal('GOSI'),
});

/** Obligations shown as verified, sourced from SIMAH. Breakdown optional. */
export const PulledObligations = z.object({
  totalMonthlyObligations: z.number().nonnegative(),
  showBreakdown: z.boolean().default(true), // "هل يفضل التفصيل؟" → yes, collapsible
  source: z.literal('SIMAH'),
});

/* --------------------------- TIER B: user-entered ------------------------- */

export const UserFinancialInput = z.object({
  // Q1 — goal (choose)
  goal: FinancingGoal,

  // Q2 — requested amount (enter) + skill: stepper with sane bounds
  financingAmount: z.number().int().min(1000).max(5_000_000),

  // Q3 — term in years (choose)
  termYears: TermYears,

  // Q4 — extra fixed monthly income (enter, 0 allowed) + skill: 0 default
  additionalIncome: z.number().nonnegative().default(0),

  // Q5 — essential monthly expenses (enter) + skill: hint based on salary
  monthlyExpenses: z.number().nonnegative(),

  // Q6 — family status (choose)
  familyStatus: FamilyStatus,

  // Q7 — emergency savings (enter, 0 allowed) + skill: "months of expenses" hint
  emergencySavings: z.number().nonnegative().default(0),

  // Supplementary — annual bonus/allowance (enter, 0 allowed)
  annualBonus: z.number().nonnegative().default(0),
});
export type UserFinancialInput = z.infer<typeof UserFinancialInput>;

/* ------------------------------ Question specs ---------------------------- */
/**
 * UI-facing spec the chatbot renders. `skill` tells the frontend which assist
 * to attach. This is the single source of truth for both wording and input aid.
 */

export type QuestionSkill =
  | { kind: 'choice'; options: { value: string; label: string }[] }
  | { kind: 'stepper'; min: number; max: number; step: number; unit: string }
  | { kind: 'slider'; min: number; max: number; step: number; unit: string }
  | { kind: 'number_with_hint'; hint: string; allowZero: boolean }
  | { kind: 'number_zero_default'; allowZero: boolean };

export interface QuestionSpec {
  id: keyof UserFinancialInput;
  order: number;
  prompt: string; // Arabic, user-facing
  skill: QuestionSkill;
}

export const QUESTIONS: QuestionSpec[] = [
  {
    id: 'goal',
    order: 1,
    prompt: 'ما الهدف من التمويل؟',
    skill: {
      kind: 'choice',
      options: [
        { value: 'car', label: 'تمويل سيارة' },
        { value: 'personal', label: 'تمويل شخصي' },
        { value: 'home', label: 'تمويل عقاري' },
        { value: 'debt_consolidation', label: 'دمج ديون قائمة' },
        { value: 'other', label: 'غير ذلك' },
      ],
    },
  },
  {
    id: 'financingAmount',
    order: 2,
    prompt: 'كم المبلغ الذي تحتاجه؟',
    // skill: a stepper so the user nudges the amount instead of typing raw digits
    skill: { kind: 'stepper', min: 1000, max: 5_000_000, step: 1000, unit: 'ريال' },
  },
  {
    id: 'termYears',
    order: 3,
    prompt: 'على كم سنة تفضّل السداد؟',
    skill: {
      kind: 'choice',
      options: [1, 2, 3, 4, 5, 6, 7].map((y) => ({
        value: String(y),
        label: y === 1 ? 'سنة واحدة' : `${y} سنوات`,
      })),
    },
  },
  {
    id: 'additionalIncome',
    order: 4,
    prompt: 'هل لديك دخل شهري إضافي ثابت؟ اكتب صفر إذا لا يوجد.',
    // skill: pre-filled 0 so "no extra income" is one tap
    skill: { kind: 'number_zero_default', allowZero: true },
  },
  {
    id: 'monthlyExpenses',
    order: 5,
    prompt: 'كم متوسط مصروفاتك الشهرية الأساسية؟',
    // skill: a live hint anchored to the pulled salary (e.g. "غالباً بين X و Y")
    skill: {
      kind: 'number_with_hint',
      hint: 'المصروفات الأساسية تشمل السكن والطعام والفواتير والمواصلات.',
      allowZero: false,
    },
  },
  {
    id: 'familyStatus',
    order: 6,
    prompt: 'ما وضعك العائلي؟',
    skill: {
      kind: 'choice',
      options: [
        { value: 'single', label: 'أعزب' },
        { value: 'married', label: 'متزوج' },
        { value: 'separated', label: 'منفصل' },
      ],
    },
  },
  {
    id: 'emergencySavings',
    order: 7,
    prompt: 'كم لديك من مدخرات للطوارئ؟ اكتب صفر إذا لا يوجد.',
    // skill: hint that reframes savings as "months of expenses" of runway
    skill: {
      kind: 'number_with_hint',
      hint: 'قاعدة عامة: مدخرات تكفي 3–6 أشهر من مصروفاتك تُعدّ آماناً جيداً.',
      allowZero: true,
    },
  },
  {
    id: 'annualBonus',
    order: 8,
    prompt: 'كم مبلغ العلاوة السنوية؟ اكتب صفر إذا لا يوجد.',
    skill: { kind: 'number_zero_default', allowZero: true },
  },
];

/* --------------------------- Combined analysis input ---------------------- */
/** What the SAMA engine actually consumes: pulled + entered, merged. */
export const AnalysisInput = z.object({
  pulledSalary: PulledSalary,
  pulledObligations: PulledObligations,
  userInput: UserFinancialInput,
});
export type AnalysisInput = z.infer<typeof AnalysisInput>;

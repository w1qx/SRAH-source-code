import type { UserFinancialData } from "@shared/types";

/**
 * The backend's numeric bounds, mirrored on the client so a bad answer is caught AT THE
 * QUESTION instead of being accepted here and rejected by the API at submit time with an
 * opaque "Invalid request body".
 *
 * Shared by BOTH intake flows: the text chat (ConversationPage) validates typed answers
 * against it, and the voice assistant (AiOrbDrawer) bakes the same ranges into its system
 * prompt + submit_answers tool schema, then re-checks the submitted values. One list, so
 * the two flows can never accept different ranges.
 */
export const BOUNDS: Partial<
  Record<keyof UserFinancialData, { min: number; max: number; msg: string }>
> = {
  financingAmount: { min: 1, max: 10_000_000, msg: "أدخل مبلغاً أكبر من صفر (حتى 10,000,000 ريال)." },
  termYears: { min: 1, max: 30, msg: "مدة السداد يجب أن تكون بين سنة و30 سنة." },
  grossSalary: { min: 1, max: 1_000_000, msg: "أدخل راتباً أكبر من صفر." },
  additionalIncome: { min: 0, max: 1_000_000, msg: "أدخل مبلغاً بين 0 و1,000,000 ريال." },
  existingCommitments: { min: 0, max: 1_000_000, msg: "أدخل مبلغاً بين 0 و1,000,000 ريال." },
  monthlyExpenses: { min: 0, max: 1_000_000, msg: "أدخل مبلغاً بين 0 و1,000,000 ريال." },
  savings: { min: 0, max: 10_000_000, msg: "أدخل مبلغاً بين 0 و10,000,000 ريال." },
  tenureYears: { min: 0, max: 60, msg: "مدة الخدمة يجب أن تكون بين 0 و60 سنة." },
};

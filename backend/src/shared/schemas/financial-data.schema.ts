/**
 * The Zod mirror of UserFinancialData (shared/types.ts).
 *
 * It lives in shared/ rather than inside the analysis module because two very different
 * boundaries need exactly the same guarantee: the /analysis route (untrusted HTTP client)
 * and the chat extraction service (untrusted LLM output). One schema, so the two can never
 * drift apart and let the model write something the API would have rejected.
 *
 * The bounds are sanity rails, not regulation — they catch a misplaced decimal point or a
 * hallucinated number, and they are what §10.6's "illogical amount/term → reject" means in
 * practice.
 */
import { z } from 'zod';

export const FinancingGoalSchema = z.enum([
  'car',
  'wedding',
  'home',
  'education',
  'project',
  'debt_consolidation',
  'personal_need',
  // Redesigned question set's option, kept alongside the legacy values (superset — nothing dropped).
  'personal',
  'other',
]);

export const EmploymentSectorSchema = z.enum(['government', 'private', 'semi_government', 'other']);

export const FamilyStatusSchema = z.enum([
  'single_no_dependents',
  'married',
  'with_dependents',
  // Redesigned question set's options, kept as a superset so no stored row is orphaned.
  'single',
  'separated',
]);

const sar = (max: number) => z.number().finite().nonnegative().max(max);

export const MAX_FINANCING_AMOUNT = 10_000_000;
export const MAX_TERM_YEARS = 30;
export const MAX_MONTHLY_SAR = 1_000_000;

export const UserFinancialDataSchema = z
  .object({
    goal: FinancingGoalSchema,
    financingAmount: z.number().finite().positive().max(MAX_FINANCING_AMOUNT),
    termYears: z.number().int().min(1).max(MAX_TERM_YEARS),
    grossSalary: z.number().finite().positive().max(MAX_MONTHLY_SAR),
    additionalIncome: sar(MAX_MONTHLY_SAR),
    existingCommitments: sar(MAX_MONTHLY_SAR),
    monthlyExpenses: sar(MAX_MONTHLY_SAR),
    familyStatus: FamilyStatusSchema,
    savings: sar(MAX_FINANCING_AMOUNT),
    employmentSector: EmploymentSectorSchema,
    tenureYears: z.number().int().min(0).max(60),
    // Optional supplementary field from the redesigned question set; annual, so bounded by the
    // financing-amount rail rather than the monthly one. Optional → completeness is unaffected.
    annualBonus: sar(MAX_FINANCING_AMOUNT).optional(),
  })
  .strict();

/**
 * What the LLM is allowed to emit: every field optional, because the model reports what it
 * has heard so far and nothing more. `.strict()` matters here — a model that invents a
 * field name gets rejected rather than silently ignored.
 */
export const PartialUserFinancialDataSchema = UserFinancialDataSchema.partial().strict();

export type UserFinancialDataInput = z.infer<typeof UserFinancialDataSchema>;
export type PartialUserFinancialDataInput = z.infer<typeof PartialUserFinancialDataSchema>;

/** Has the chat collected everything the engine needs? */
export function isComplete(partial: unknown): boolean {
  return UserFinancialDataSchema.safeParse(partial).success;
}

/** The fields still outstanding — this is what drives the chatbot's next question. */
export function missingFields(partial: PartialUserFinancialDataInput): string[] {
  const result = UserFinancialDataSchema.safeParse(partial);
  if (result.success) return [];
  return [
    ...new Set(
      result.error.issues
        .filter((issue) => issue.path.length > 0)
        .map((issue) => String(issue.path[0])),
    ),
  ];
}

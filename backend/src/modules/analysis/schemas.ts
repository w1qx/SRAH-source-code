import { z } from 'zod';
import { UserFinancialDataSchema } from '@/shared/schemas/financial-data.schema';

/**
 * Traits SAMA's rules turn on that UserFinancialData does not carry. Optional, defaulting
 * to the common case (a working employee who is not an REDF beneficiary).
 */
export const SubjectTraitsSchema = z
  .object({
    isRetiree: z.boolean().optional(),
    isHousingBeneficiary: z.boolean().optional(),
  })
  .strict();

export const AnalyzeRequestSchema = z
  .object({
    /** Analyse data supplied inline (the review screen's "Analyze My Decision"). */
    input: UserFinancialDataSchema.optional(),
    /** Or analyse data already persisted — e.g. what the chatbot just extracted. */
    financialInputId: z.string().uuid().optional(),
    /**
     * A real profit rate, once the user has an actual offer in hand. Without it the engine
     * amortizes at its indicative-APR assumption, which is stamped into the result.
     */
    apr: z.number().finite().min(0).max(1).optional(),
    subject: SubjectTraitsSchema.optional(),
    locale: z.enum(['ar', 'en']).optional(),
  })
  .strict()
  .refine((body) => Boolean(body.input) !== Boolean(body.financialInputId), {
    message: 'Provide exactly one of "input" or "financialInputId".',
  });

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalysisIdParamSchema = z.object({ id: z.string().uuid() }).strict();

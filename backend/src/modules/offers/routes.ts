import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type { OffersService } from './application/offers.service';
import { UserFinancialDataSchema } from '@/shared/schemas/financial-data.schema';
import { asyncHandler } from '@/shared/http/error-handler';
import { parseBody } from '@/shared/http/validate';
import { authOf } from '@/modules/auth/middleware/auth-guard';

const OffersRequestSchema = z
  .object({
    input: UserFinancialDataSchema.optional(),
    financialInputId: z.string().uuid().optional(),
  })
  .strict()
  .refine((body) => Boolean(body.input) !== Boolean(body.financialInputId), {
    message: 'Provide exactly one of "input" or "financialInputId".',
  });

export function offersRouter(service: OffersService, guard: RequestHandler): Router {
  const router = Router();

  router.post(
    '/',
    guard,
    asyncHandler(async (req, res) => {
      const body = parseBody(OffersRequestSchema, req);

      res.json(
        await service.getOffers({
          userId: authOf(req).userId,
          input: body.input,
          financialInputId: body.financialInputId,
        }),
      );
    }),
  );

  return router;
}

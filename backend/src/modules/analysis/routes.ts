import type { RequestHandler } from 'express';
import { Router } from 'express';
import type { AnalysisService } from './application/analysis.service';
import { AnalysisIdParamSchema, AnalyzeRequestSchema } from './schemas';
import { asyncHandler } from '@/shared/http/error-handler';
import { parseBody, parseParams } from '@/shared/http/validate';
import { authOf } from '@/modules/auth/middleware/auth-guard';

export function analysisRouter(service: AnalysisService, guard: RequestHandler): Router {
  const router = Router();

  /**
   * The SAMA rules in force. Public and unauthenticated: these are published regulation, not
   * user data, and the UI shows the user the red lines their number is measured against.
   */
  router.get('/rules', (_req, res) => {
    res.json(service.currentRules());
  });

  /** Run an analysis. The one route this whole product exists to serve. */
  router.post(
    '/',
    guard,
    asyncHandler(async (req, res) => {
      const body = parseBody(AnalyzeRequestSchema, req);

      const { analysisId, result, input, warnings } = await service.run({
        userId: authOf(req).userId,
        input: body.input,
        financialInputId: body.financialInputId,
        apr: body.apr,
        subject: body.subject,
        locale: body.locale,
      });

      res.status(201).json({ analysisId, result, input, warnings });
    }),
  );

  /** Account history (FR-19), newest first. */
  router.get(
    '/',
    guard,
    asyncHandler(async (req, res) => {
      const analyses = await service.history(authOf(req).userId);
      res.json({ analyses });
    }),
  );

  /**
   * One past analysis, replayed exactly as it was given — including the rule version and the
   * CPI figure that produced it. It is never recomputed under today's rules; that would be a
   * different analysis wearing an old id.
   */
  router.get(
    '/:id',
    guard,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(AnalysisIdParamSchema, req);
      const analysis = await service.getById(authOf(req).userId, id);
      res.json(analysis);
    }),
  );

  return router;
}

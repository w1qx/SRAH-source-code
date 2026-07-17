import type { RequestHandler } from 'express';
import { Router, raw } from 'express';
import type { ChatService } from './application/chat.service';
import type { ChatPullConfig } from './application/financial-pull';
import { pullFinancialData, resolveAutoPulled } from './application/financial-pull';
import { extractStatement } from './application/statement-extraction';
import { ChatSessionParamSchema, SendMessageSchema } from './schemas';
import { asyncHandler } from '@/shared/http/error-handler';
import { parseBody, parseParams } from '@/shared/http/validate';
import { authOf } from '@/modules/auth/middleware/auth-guard';
import { askedQuestions } from './domain/questions';

export function chatRouter(
  service: ChatService,
  guard: RequestHandler,
  pull: ChatPullConfig = {},
): Router {
  const router = Router();

  /**
   * The questions to ask, so the UI can render quick-reply buttons without guessing. Flag-aware:
   * when GOSI/SIMAH auto-pull is on, the fields they supply drop out of the asked set — the
   * frontend then shows fewer questions and the pull fills the rest on the searching screen.
   */
  router.get(
    '/questions',
    asyncHandler(async (_req, res) => {
      const autoPulled = await resolveAutoPulled(pull);
      res.json({ questions: askedQuestions(autoPulled) });
    }),
  );

  /**
   * Run the auto-pull for the current user and return the verified values + their provenance.
   * The frontend calls this on the searching screen ("نجلب بياناتك") and merges the result into
   * its answers before running the analysis. With both flags off this returns empty objects.
   */
  router.post(
    '/pull',
    guard,
    asyncHandler(async (req, res) => {
      const result = await pullFinancialData(authOf(req).userId, pull);
      res.json(result);
    }),
  );

  /**
   * The "رفع تقرير سمة" gateway: the user uploads their SIMAH credit report as a PDF and the
   * salary/obligation figures are extracted server-side. The body is the raw PDF (no multipart,
   * no upload middleware) and the response is the same `{ pulled, provenance }` shape as /pull,
   * so the frontend merges it identically. See statement-extraction.ts for what is real vs mock.
   */
  router.post(
    '/statement',
    guard,
    raw({ type: ['application/pdf', 'application/octet-stream'], limit: '10mb' }),
    asyncHandler(async (req, res) => {
      res.json(await extractStatement(req.body as Buffer));
    }),
  );

  router.post(
    '/',
    guard,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.start(authOf(req).userId));
    }),
  );

  router.get(
    '/:id',
    guard,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(ChatSessionParamSchema, req);
      res.json(await service.get(authOf(req).userId, id));
    }),
  );

  router.post(
    '/:id/messages',
    guard,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(ChatSessionParamSchema, req);
      const { message } = parseBody(SendMessageSchema, req);
      res.json(await service.sendMessage(authOf(req).userId, id, message));
    }),
  );

  return router;
}

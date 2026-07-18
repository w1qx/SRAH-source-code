import type { RequestHandler } from 'express';
import { Router, raw } from 'express';
import type { ChatService } from './application/chat.service';
import type { ChatPullConfig } from './application/financial-pull';
import { pullFinancialData, resolveAutoPulled } from './application/financial-pull';
import { extractStatement } from './application/statement-extraction';
import { extractOffer } from './application/offer-extraction';
import { assertRelevantDocument } from './application/document-relevance';
import { ChatSessionParamSchema, SendMessageSchema } from './schemas';
import { asyncHandler } from '@/shared/http/error-handler';
import { parseBody, parseParams } from '@/shared/http/validate';
import { authOf } from '@/modules/auth/middleware/auth-guard';
import { askedQuestions } from './domain/questions';
import type { Mailer } from '@/modules/auth/infrastructure/mailer';
import type { AuthService } from '@/modules/auth/application/auth.service';
import { ApiError } from '../../shared/http/api-error';
import fs from 'fs';
import path from 'path';

/**
 * The client sends the original file name in the `X-File-Name` header (URL-encoded, since a
 * raw-body upload has no multipart part to carry it and Arabic can't ride a header verbatim).
 * It's the most reliable signal the relevance gate has, so decode it defensively.
 */
function fileNameOf(req: { get(name: string): string | undefined }): string {
  const raw = req.get('x-file-name');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function chatRouter(
  service: ChatService,
  guard: RequestHandler,
  pull: ChatPullConfig = {},
  mailer: Mailer,
  authService: AuthService,
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
   * Send the SIMAH HTML report directly to the user's email.
   */
  router.post(
    '/email-report',
    guard,
    asyncHandler(async (req, res) => {
      const auth = authOf(req);
      
      let email = req.body?.email;
      if (!email) {
        const profile = await authService.profile(auth.userId);
        email = profile.email;
      }

      if (!email || email.includes('@suraa.sa') || email.startsWith('nafath-')) {
        throw new ApiError(400, 'validation_failed', 'الرجاء إدخال بريدك الإلكتروني لإرسال التقرير.');
      }

      // Try multiple paths to find the simah_report.html
      const pathsToTry = [
        path.resolve(__dirname, '../../../../Sarat-frontend/public/simah_report.html'),
        path.resolve(__dirname, '../../../../serah/public/simah_report.html'),
        path.resolve(process.cwd(), '../Sarat-frontend/public/simah_report.html'),
        path.resolve(process.cwd(), '../serah/public/simah_report.html'),
        path.resolve(process.cwd(), '../frontend/public/simah_report.html')
      ];

      let html = '';
      let error: any = null;

      for (const p of pathsToTry) {
        try {
          if (fs.existsSync(p)) {
            html = fs.readFileSync(p, 'utf8');
            break;
          }
        } catch (e) {
          error = e;
        }
      }

      if (!html) {
        throw new Error(`Failed to load simah_report.html from any of: ${pathsToTry.join(', ')}. Last error: ${error?.message}`);
      }

      await mailer.sendHtmlReport({
        to: email,
        subject: 'تقرير سمة الائتماني الموحد - منصة سراة',
        html,
      });

      res.json({ success: true, email });
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
      const file = req.body as Buffer;
      assertRelevantDocument(file, fileNameOf(req));
      res.json(await extractStatement(file));
    }),
  );

  /**
   * The "ارفع عرض البنك" step: the user uploads a financing offer they hold from another bank
   * (raw PDF body, like /statement) and its terms — chiefly the real annual profit rate — are
   * extracted server-side so the analysis can compare the offer against Sarat's indicative
   * reference. See offer-extraction.ts for what is real vs mock.
   */
  router.post(
    '/offer',
    guard,
    raw({ type: ['application/pdf', 'application/octet-stream'], limit: '10mb' }),
    asyncHandler(async (req, res) => {
      const file = req.body as Buffer;
      assertRelevantDocument(file, fileNameOf(req));
      res.json({ offer: await extractOffer(file) });
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

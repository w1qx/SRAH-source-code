import type { RequestHandler } from 'express';
import { Router } from 'express';
import type { DashboardService } from './application/dashboard.service';
import { asyncHandler } from '@/shared/http/error-handler';
import { authOf } from '@/modules/auth/middleware/auth-guard';

export function dashboardRouter(service: DashboardService, guard: RequestHandler): Router {
  const router = Router();

  /** The signed-in user's dashboard: indicator, applications, past analyses. */
  router.get(
    '/',
    guard,
    asyncHandler(async (req, res) => {
      res.json(await service.get(authOf(req).userId));
    }),
  );

  return router;
}

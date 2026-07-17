import { Router } from 'express';
import type { FeatureFlagsService } from './application/feature-flags.service';
import { asyncHandler } from '@/shared/http/error-handler';

/**
 * The flag list is PUBLIC and unauthenticated by design: the landing page needs it to
 * render "Coming Soon" badges before anyone has logged in.
 *
 * There is deliberately no write route. Flipping a flag is an operational act — it goes
 * through a migration, a seed, or an operator with database access, not an HTTP call
 * from the internet.
 */
export function featureFlagsRouter(service: FeatureFlagsService): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const flags = await service.list();
      res.json({ flags });
    }),
  );

  return router;
}

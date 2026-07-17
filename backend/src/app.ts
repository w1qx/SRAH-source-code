import express from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import type { Container } from './container';
import { corsOrigins } from './config/env';
import { errorHandler, notFoundHandler } from './shared/http/error-handler';
import { analysisRouter } from './modules/analysis/routes';
import { authRouter } from './modules/auth/routes';
import { chatRouter } from './modules/chat/routes';
import { dashboardRouter } from './modules/dashboard/routes';
import { featureFlagsRouter } from './modules/feature-flags/routes';
import { offersRouter } from './modules/offers/routes';

export function createApp(container: Container): Express {
  const app = express();
  const { env } = container;

  // Behind a proxy (Railway/Render), req.ip is the proxy unless we trust the forwarded header —
  // and req.ip is what the auth rate limiter keys on, so getting this wrong would rate-limit the
  // entire internet as one client.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(env),
      credentials: true, // The refresh token rides in an httpOnly cookie.
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: process.env.npm_package_version ?? '0.1.0' });
  });

  app.use('/auth', authRouter({
    service: container.auth,
    guard: container.guard,
    emailOtp: container.emailOtp,
    nafath: container.nafath,
    isProduction: env.NODE_ENV === 'production',
  }));
  app.use('/analysis', analysisRouter(container.analysis, container.guard));
  app.use('/chat', chatRouter(container.chat, container.guard, container.pullConfig));
  app.use('/offers', offersRouter(container.offers, container.guard));
  app.use('/dashboard', dashboardRouter(container.dashboard, container.guard));
  app.use('/feature-flags', featureFlagsRouter(container.flags));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

import { createApp } from './app';
import { loadEnv } from './config/env';
import { buildContainer } from './container';
import { disconnectDb } from './db/prisma';
import { logger } from './shared/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const container = buildContainer(env);

  // Make sure every flag in the catalog exists as a row before the first request asks about it.
  // Existing values are never overwritten — an operator's deliberate flip survives a redeploy.
  await container.flags.syncDefaults();

  const app = createApp(container);
  const server = app.listen(env.PORT, () => {
    logger.info('Suraa backend listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      economicProvider: env.ECONOMIC_PROVIDER,
      offersProvider: env.OFFERS_PROVIDER,
      llmProvider: env.LLM_PROVIDER,
    });
  });

  const shutdown = (signal: string) => {
    logger.info('Shutting down', { signal });
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('Failed to start', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

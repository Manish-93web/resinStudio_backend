import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { startCronJobs } from './jobs';

async function main(): Promise<void> {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Resin by Richa API listening on http://localhost:${env.PORT}`);
  });

  startCronJobs();

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});

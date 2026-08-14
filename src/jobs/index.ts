import cron from 'node-cron';
import { logger } from '../config/logger';
import { runAbandonedCartJob } from './abandonedCart.job';
import { runLowStockDigestJob } from './lowStockDigest.job';
import { runWaitlistNotifyJob } from './waitlist.job';

/**
 * Scheduled from server.ts only (never from app.ts), so Jest/Supertest integration tests — which
 * import createApp() directly and never call this — stay free of dangling cron timers or
 * time-dependent flakiness.
 */
export function startCronJobs(): void {
  cron.schedule('0 * * * *', () => {
    runAbandonedCartJob()
      .then((sent) => sent > 0 && logger.info({ sent }, 'Abandoned-cart job sent reminder emails'))
      .catch((err) => logger.error({ err }, 'Abandoned-cart job failed'));
  });

  cron.schedule('0 8 * * *', () => {
    runLowStockDigestJob()
      .then((count) => count > 0 && logger.info({ count }, 'Low-stock digest sent'))
      .catch((err) => logger.error({ err }, 'Low-stock digest job failed'));
  });

  cron.schedule('*/5 * * * *', () => {
    runWaitlistNotifyJob()
      .then(
        ({ dropNotified, backInStockNotified }) =>
          (dropNotified > 0 || backInStockNotified > 0) &&
          logger.info({ dropNotified, backInStockNotified }, 'Waitlist notify job sent emails'),
      )
      .catch((err) => logger.error({ err }, 'Waitlist notify job failed'));
  });

  logger.info(
    'Cron jobs scheduled: abandoned-cart (hourly), low-stock digest (daily 8am), waitlist notify (every 5m)',
  );
}

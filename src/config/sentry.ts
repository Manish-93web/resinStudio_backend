import * as Sentry from '@sentry/node';
import { env } from './env';

export const isSentryConfigured = Boolean(env.SENTRY_DSN);

// Initializing with an empty/undefined DSN would make the SDK log its own warnings on every
// captured event, so this is gated the same way every other optional integration in this codebase
// is (see notification.service.ts) - a no-op until SENTRY_DSN is actually set.
if (isSentryConfigured) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
}

export { Sentry };

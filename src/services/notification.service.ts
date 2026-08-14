import { env } from '../config/env';
import { logger } from '../config/logger';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

interface SmsMessage {
  to: string;
  text: string;
}

/**
 * Provider-selectable dispatch (EMAIL_PROVIDER/SMS_PROVIDER env vars) so the full order/auth
 * lifecycle is demoable before Brevo/Twilio accounts exist — see IMPLEMENTATION_PROMPT.md §13.
 * "console" just logs; swap in a real provider by adding a branch here once configured.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.EMAIL_PROVIDER === 'console' || !env.BREVO_API_KEY) {
    logger.info({ message }, '📧 [console email provider] would send email');
    return;
  }
  // TODO: Brevo integration once BREVO_API_KEY is configured.
  logger.warn('EMAIL_PROVIDER=brevo but no integration wired up yet — falling back to console');
  logger.info({ message }, '📧 [console email provider] would send email');
}

export async function sendSms(message: SmsMessage): Promise<void> {
  if (env.SMS_PROVIDER === 'console' || !env.TWILIO_ACCOUNT_SID) {
    logger.info({ message }, '📱 [console SMS provider] would send SMS');
    return;
  }
  // TODO: Twilio integration once TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are configured.
  logger.warn('SMS_PROVIDER=twilio but no integration wired up yet — falling back to console');
  logger.info({ message }, '📱 [console SMS provider] would send SMS');
}

interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Same console-fallback shape as sendEmail/sendSms: sending a real FCM push requires the
 *  firebase-admin SDK plus a service account credential, neither configured in this environment
 *  (see .env.example FCM_SERVER_KEY) - logs what would be sent instead of failing the caller. */
export async function sendPushNotification(message: PushMessage): Promise<void> {
  if (message.tokens.length === 0) return;
  if (!env.FCM_SERVER_KEY) {
    logger.info({ message }, '🔔 [console push provider] would send push notification');
    return;
  }
  // TODO: firebase-admin integration once FCM_SERVER_KEY (service account) is configured.
  logger.warn('FCM_SERVER_KEY set but no integration wired up yet — falling back to console');
  logger.info({ message }, '🔔 [console push provider] would send push notification');
}

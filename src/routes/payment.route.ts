import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import { checkoutBodySchema, verifyPaymentBodySchema } from '../schemas/commerce.schema';

export const paymentRouter = Router();

paymentRouter.post(
  '/razorpay/create-order',
  optionalAuth,
  validate({ body: checkoutBodySchema.omit({ paymentMethod: true }) }),
  paymentController.createOrder,
);
paymentRouter.post(
  '/razorpay/verify',
  optionalAuth,
  validate({ body: verifyPaymentBodySchema }),
  paymentController.verify,
);

// No body-parsing/validate middleware here beyond raw-body capture (done globally in app.ts) —
// the webhook signature covers the exact raw bytes Razorpay sent.
paymentRouter.post('/razorpay/webhook', paymentController.webhook);

paymentRouter.post(
  '/stripe/create-intent',
  optionalAuth,
  validate({ body: checkoutBodySchema.omit({ paymentMethod: true }) }),
  paymentController.createStripeIntent,
);

// Same raw-body-signature story as the Razorpay webhook above.
paymentRouter.post('/stripe/webhook', paymentController.stripeWebhook);

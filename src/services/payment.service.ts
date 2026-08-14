import { createHmac, timingSafeEqual } from 'crypto';
import type Stripe from 'stripe';
import { razorpay, isRazorpayConfigured } from '../config/razorpay';
import { stripe, isStripeConfigured } from '../config/stripe';
import { env } from '../config/env';
import { CheckoutIntent } from '../models/CheckoutIntent';
import { Order } from '../models/Order';
import { ProcessedWebhookEvent } from '../models/ProcessedWebhookEvent';
import { User } from '../models/User';
import { ApiError } from '../utils/apiError';
import { logger } from '../config/logger';
import { getSettings } from './settings.service';
import { createOrderFromCart, previewCheckoutTotal, StockConflictError } from './order.service';
import type { Address } from '../models/Address';

interface CreateCheckoutOrderParams {
  userId?: string;
  sessionId?: string;
  guestEmail?: string;
  guestPhone?: string;
  shippingAddress: Address;
  billingAddress: Address;
  couponCode?: string;
  redeemPoints?: number;
}

function requireRazorpay() {
  if (!razorpay || !isRazorpayConfigured) {
    throw ApiError.internal(
      'Razorpay is not configured — add RAZORPAY_* to .env (see ACCOUNT_SETUP.md)',
    );
  }
  return razorpay;
}

function requireStripe() {
  if (!stripe || !isStripeConfigured) {
    throw ApiError.internal('Stripe is not configured — add STRIPE_* to .env');
  }
  return stripe;
}

/**
 * Validates a requested loyalty-point redemption against the caller's current balance and
 * returns the ₹ discount it produces, without mutating anything yet — the real balance deduction
 * only happens atomically inside createOrderFromCart once the order is actually created. Shared
 * by both the Razorpay and Stripe create-intent paths so the amount charged upfront already
 * reflects it, the same way an applied coupon already does below.
 */
async function previewLoyaltyDiscount(
  userId: string | undefined,
  redeemPoints: number | undefined,
  cap: number,
): Promise<number> {
  if (!redeemPoints || redeemPoints <= 0) return 0;
  if (!userId)
    throw ApiError.badRequest('Only logged-in customers with a loyalty balance can redeem points');

  const user = await User.findById(userId).select('loyaltyPoints');
  if (!user || redeemPoints > user.loyaltyPoints) {
    throw ApiError.badRequest('Not enough loyalty points to redeem that many');
  }

  const settings = await getSettings();
  return Math.min(redeemPoints * settings.loyalty.redemptionRate, cap);
}

export async function createCheckoutOrder(params: CreateCheckoutOrderParams) {
  const client = requireRazorpay();
  // Mirrors exactly what createOrderFromCart would charge (subtotal + weight-tiered/international
  // shipping + tax), not just the item subtotal — see previewCheckoutTotal's own comment for why
  // this was previously wrong (shipping/tax were silently free for every online-paid order).
  const preview = await previewCheckoutTotal({
    userId: params.userId,
    sessionId: params.sessionId,
    shippingAddress: params.shippingAddress,
    couponCode: params.couponCode,
  });
  const loyaltyDiscount = await previewLoyaltyDiscount(
    params.userId,
    params.redeemPoints,
    preview.total,
  );
  const amount = Math.max(0, preview.total - loyaltyDiscount);
  if (amount <= 0) throw ApiError.badRequest('Order total must be greater than zero to pay online');

  const razorpayOrder = await client.orders.create({
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    notes: { userId: params.userId ?? '', sessionId: params.sessionId ?? '' },
  });

  await CheckoutIntent.create({
    provider: 'razorpay',
    razorpayOrderId: razorpayOrder.id,
    user: params.userId ?? null,
    sessionId: params.sessionId ?? null,
    guestEmail: params.guestEmail,
    guestPhone: params.guestPhone,
    shippingAddress: params.shippingAddress,
    billingAddress: params.billingAddress,
    couponCode: params.couponCode,
    redeemPoints: params.redeemPoints,
  });

  return {
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: env.RAZORPAY_KEY_ID,
  };
}

// Fixed illustrative INR→USD rate — no live FX-rate provider is configured in this environment,
// the same class of simplification as the GST TODO in order.service.ts. Stripe is only used for
// the international/non-INR checkout path (§17 Phase 3), so USD is the settlement currency here.
const INR_TO_USD_RATE = 83;

export async function createStripePaymentIntent(params: CreateCheckoutOrderParams) {
  const client = requireStripe();
  // Same shipping/tax-inclusive preview as the Razorpay path above.
  const preview = await previewCheckoutTotal({
    userId: params.userId,
    sessionId: params.sessionId,
    shippingAddress: params.shippingAddress,
    couponCode: params.couponCode,
  });
  const loyaltyDiscount = await previewLoyaltyDiscount(
    params.userId,
    params.redeemPoints,
    preview.total,
  );
  const amountInr = Math.max(0, preview.total - loyaltyDiscount);
  if (amountInr <= 0)
    throw ApiError.badRequest('Order total must be greater than zero to pay online');
  const amountUsdCents = Math.round((amountInr / INR_TO_USD_RATE) * 100);

  const paymentIntent = await client.paymentIntents.create({
    amount: amountUsdCents,
    currency: 'usd',
    metadata: { userId: params.userId ?? '', sessionId: params.sessionId ?? '' },
  });

  await CheckoutIntent.create({
    provider: 'stripe',
    stripePaymentIntentId: paymentIntent.id,
    user: params.userId ?? null,
    sessionId: params.sessionId ?? null,
    guestEmail: params.guestEmail,
    guestPhone: params.guestPhone,
    shippingAddress: params.shippingAddress,
    billingAddress: params.billingAddress,
    couponCode: params.couponCode,
    redeemPoints: params.redeemPoints,
  });

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };
}

function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Shared by both providers' verify/webhook callbacks, so whichever arrives first fulfills the
 * order and the other becomes a no-op — idempotency keyed on the CheckoutIntent's `fulfilled`
 * flag plus a defensive check for an existing Order with the same paymentRef. Generalized to take
 * a `paymentMethod` rather than duplicating this whole function per provider (§17 Stripe).
 */
async function fulfillCheckoutIntent(
  lookup: { razorpayOrderId: string } | { stripePaymentIntentId: string },
  paymentRef: string,
  paymentMethod: 'razorpay' | 'stripe',
): Promise<void> {
  const intent = await CheckoutIntent.findOne(lookup);
  if (!intent) {
    logger.warn({ lookup, paymentMethod }, 'No checkout intent found for paid order');
    return;
  }
  if (intent.fulfilled) return;

  const existingOrder = await Order.findOne({ paymentRef });
  if (existingOrder) {
    intent.fulfilled = true;
    await intent.save();
    return;
  }

  try {
    await createOrderFromCart({
      userId: intent.user?.toString(),
      sessionId: intent.sessionId ?? undefined,
      guestEmail: intent.guestEmail,
      guestPhone: intent.guestPhone,
      shippingAddress: intent.shippingAddress,
      billingAddress: intent.billingAddress,
      paymentMethod,
      paymentRef,
      couponCode: intent.couponCode,
      redeemPoints: intent.redeemPoints,
    });
    intent.fulfilled = true;
    await intent.save();
  } catch (err) {
    if (err instanceof StockConflictError) {
      // Payment succeeded on the gateway's side but we can't fulfill it — refund rather than
      // silently keep money for an order we can't deliver.
      logger.error(
        { paymentRef, paymentMethod, unavailable: err.unavailable },
        'Stock conflict after payment — issuing refund',
      );
      if (paymentMethod === 'razorpay') {
        await requireRazorpay().payments.refund(paymentRef, { speed: 'optimum' });
      } else {
        await requireStripe().refunds.create({ payment_intent: paymentRef });
      }
      intent.fulfilled = true;
      await intent.save();
      throw ApiError.conflict(
        'Sorry — an item in your order just sold out. Your payment has been refunded.',
        { unavailable: err.unavailable },
      );
    }
    throw err;
  }
}

export async function verifyAndFulfillPayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<void> {
  const valid = verifyPaymentSignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
  );
  if (!valid) throw ApiError.unauthorized('Payment signature verification failed');

  await fulfillCheckoutIntent(
    { razorpayOrderId: input.razorpayOrderId },
    input.razorpayPaymentId,
    'razorpay',
  );
}

export async function handleRazorpayWebhook(rawBody: Buffer, signature: string): Promise<void> {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    logger.warn(
      'Received Razorpay webhook but RAZORPAY_WEBHOOK_SECRET is not configured — ignoring',
    );
    return;
  }

  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature ?? '');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw ApiError.unauthorized('Webhook signature verification failed');
  }

  const payload = JSON.parse(rawBody.toString('utf8'));
  const eventId: string | undefined =
    payload.id ?? payload.event + ':' + payload.payload?.payment?.entity?.id;
  if (!eventId) return;

  // Dedupe by event id via a unique-index upsert — races safely across concurrent deliveries.
  try {
    await ProcessedWebhookEvent.create({ provider: 'razorpay', eventId });
  } catch {
    logger.info({ eventId }, 'Webhook event already processed — skipping');
    return;
  }

  if (payload.event === 'payment.captured') {
    const payment = payload.payload.payment.entity;
    await fulfillCheckoutIntent({ razorpayOrderId: payment.order_id }, payment.id, 'razorpay');
  }
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  const client = requireStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    logger.warn('Received Stripe webhook but STRIPE_WEBHOOK_SECRET is not configured — ignoring');
    return;
  }

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw ApiError.unauthorized('Webhook signature verification failed');
  }

  // Dedupe by event id — Stripe retries webhook delivery just like Razorpay.
  try {
    await ProcessedWebhookEvent.create({ provider: 'stripe', eventId: event.id });
  } catch {
    logger.info({ eventId: event.id }, 'Webhook event already processed — skipping');
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await fulfillCheckoutIntent(
      { stripePaymentIntentId: paymentIntent.id },
      paymentIntent.id,
      'stripe',
    );
  }
}

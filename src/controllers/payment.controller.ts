import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { getCartIdentity } from '../utils/cartIdentity';
import * as paymentService from '../services/payment.service';

export const createOrder = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  const result = await paymentService.createCheckoutOrder({
    userId: identity.userId,
    sessionId: identity.sessionId,
    guestEmail: req.body.guestEmail,
    guestPhone: req.body.guestPhone,
    shippingAddress: req.body.shippingAddress,
    billingAddress: req.body.billingAddress ?? req.body.shippingAddress,
    couponCode: req.body.couponCode,
    redeemPoints: req.body.redeemPoints,
    shippingMethod: req.body.shippingMethod,
  });
  res.json(result);
});

export const verify = asyncHandler(async (req, res) => {
  await paymentService.verifyAndFulfillPayment(req.body);
  res.json({ message: 'Payment verified, order placed' });
});

export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string') throw ApiError.badRequest('Missing webhook signature');
  if (!req.rawBody) throw ApiError.badRequest('Missing raw request body');

  await paymentService.handleRazorpayWebhook(req.rawBody, signature);
  res.json({ received: true });
});

export const createStripeIntent = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  const result = await paymentService.createStripePaymentIntent({
    userId: identity.userId,
    sessionId: identity.sessionId,
    guestEmail: req.body.guestEmail,
    guestPhone: req.body.guestPhone,
    shippingAddress: req.body.shippingAddress,
    billingAddress: req.body.billingAddress ?? req.body.shippingAddress,
    couponCode: req.body.couponCode,
    redeemPoints: req.body.redeemPoints,
    shippingMethod: req.body.shippingMethod,
  });
  res.json(result);
});

export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') throw ApiError.badRequest('Missing webhook signature');
  if (!req.rawBody) throw ApiError.badRequest('Missing raw request body');

  await paymentService.handleStripeWebhook(req.rawBody, signature);
  res.json({ received: true });
});

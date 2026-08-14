import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { addressSchema, type Address } from './Address';

/**
 * Bridges a Razorpay order back to what should be fulfilled once payment is confirmed. Looked up
 * by both the frontend-verify endpoint and the webhook fallback, so whichever arrives first can
 * build the real Order from the checkout details captured at "place order" time (not whatever the
 * cart looks like later). TTL-expires after 24h - an intent that's never paid is abandoned, not
 * meaningful to keep.
 */
export interface CheckoutIntentAttrs {
  // Exactly one of razorpayOrderId/stripePaymentIntentId is set, depending on `provider` - kept
  // as two sparse-unique fields rather than one generic "providerRef" so each retains its own
  // natural lookup key/index without a compound-index workaround.
  provider: 'razorpay' | 'stripe';
  razorpayOrderId?: string;
  stripePaymentIntentId?: string;
  user?: Types.ObjectId | null;
  sessionId?: string | null;
  guestEmail?: string;
  guestPhone?: string;
  shippingAddress: Address;
  billingAddress: Address;
  couponCode?: string;
  // Loyalty points the customer chose to redeem at checkout - carried through to
  // createOrderFromCart once payment is confirmed (Razorpay/Stripe both create an intent first,
  // then fulfill it asynchronously via verify-callback or webhook).
  redeemPoints?: number;
  fulfilled: boolean;
  createdAt: Date;
}

const checkoutIntentSchema = new Schema<CheckoutIntentAttrs>({
  provider: { type: String, enum: ['razorpay', 'stripe'], required: true, default: 'razorpay' },
  // Sparse+unique rather than required+unique: a Stripe-originated intent has no Razorpay order
  // id (and vice versa) - see stripe payment-intent creation in payment.service.ts.
  razorpayOrderId: { type: String, unique: true, sparse: true },
  stripePaymentIntentId: { type: String, unique: true, sparse: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  sessionId: { type: String, default: null },
  guestEmail: { type: String },
  guestPhone: { type: String },
  shippingAddress: { type: addressSchema, required: true },
  billingAddress: { type: addressSchema, required: true },
  couponCode: { type: String },
  redeemPoints: { type: Number, min: 0 },
  fulfilled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

export type CheckoutIntentDoc = HydratedDocument<CheckoutIntentAttrs>;

export const CheckoutIntent = model<CheckoutIntentAttrs>('CheckoutIntent', checkoutIntentSchema);

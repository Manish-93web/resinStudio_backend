import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { addressSchema, type Address } from './Address';

export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Orders can still be self-service cancelled by the customer at these early statuses only.
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = ['placed', 'confirmed'];

export const PAYMENT_METHODS = ['razorpay', 'cod', 'stripe', 'gift_card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface OrderItem {
  // Optional because commission deposit/balance orders (§6.8) have no catalog product - they're
  // a payment against a Commission, not a purchase of stocked/variant inventory.
  product?: Types.ObjectId;
  variantSku?: string;
  title: string;
  qty: number;
  price: number;
  // Free-text customization carried over from the cart line (e.g. "Name: Priya, Date: 12/08").
  customization?: string;
}

export interface Refund {
  amount: number;
  reason?: string;
  // Gateway refund id (Razorpay/Stripe refund object id) when processed online.
  ref?: string;
  by: Types.ObjectId;
  at: Date;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: Date;
  note?: string;
}

// Additive beyond the spec's single paymentMethod/paymentStatus/paymentRef fields: a commission
// (§6.8) needs a separate deposit and balance payment, which those three scalar fields can't
// represent on their own. This array is the full payment history; the scalar fields still hold a
// summary/latest-payment view for the common (single full payment) case.
export interface OrderPayment {
  amount: number;
  method: PaymentMethod;
  ref?: string;
  status: PaymentStatus;
  type: 'deposit' | 'balance' | 'full';
  capturedAt?: Date;
}

export interface OrderAttrs {
  orderNumber: string;
  user?: Types.ObjectId | null;
  guestEmail?: string;
  guestPhone?: string;
  items: Types.DocumentArray<OrderItem>;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  couponCode?: string;
  shippingAddress: Address;
  billingAddress: Address;
  // Surcharge-priced upgrade chosen at checkout (order.service.ts's computeShippingAndTax) -
  // stored on the order itself, not just derived from `shipping`, so fulfillment/admin can tell a
  // customer paid for express without re-deriving it from the rate that happened to be configured
  // at order time.
  shippingMethod: 'standard' | 'express';
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentRef?: string;
  payments: Types.DocumentArray<OrderPayment>;
  status: OrderStatus;
  trackingCarrier?: string;
  trackingNumber?: string;
  timeline: Types.DocumentArray<OrderTimelineEntry>;
  cancelledAt?: Date;
  cancelReason?: string;
  // A commission deposit/balance payment (§6.8) is represented as its own Order (so it flows
  // through the same payment/fulfillment tooling as a catalog purchase) rather than forcing a
  // Commission to pretend it's a cart of real products.
  orderType: 'standard' | 'commission_deposit' | 'commission_balance' | 'gift_card_purchase';
  commission?: Types.ObjectId | null;
  // Set when a gift card was applied at checkout (§6.11) - the amount it covered, tracked
  // separately from `discount` (a coupon) since the two can both apply to the same order and a
  // refund/audit trail needs to distinguish them.
  giftCardCode?: string;
  giftCardAmount?: number;
  // Loyalty points redeemed at checkout (§17 Phase 3) and the ₹ discount they produced.
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: number;
  // Points earned on this order once it reaches 'delivered' (order.service.ts#updateOrderStatus).
  loyaltyPointsEarned: number;
  // Idempotency guard so the referrer's bonus is only ever credited once per referred user.
  referralBonusApplied: boolean;
  // OR of every line item's product.shippingConstraints.groundOnly/heatSensitive at checkout time.
  containsHazmat: boolean;
  isInternational: boolean;
  refunds: Types.DocumentArray<Refund>;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    variantSku: { type: String },
    title: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    customization: { type: String },
  },
  { _id: false },
);

// Mirrors Product.ts's stockAdjustmentSchema pattern exactly.
const refundSchema = new Schema<Refund>(
  {
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String },
    ref: { type: String },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderTimelineSchema = new Schema<OrderTimelineEntry>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false },
);

const orderPaymentSchema = new Schema<OrderPayment>(
  {
    amount: { type: Number, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    ref: { type: String },
    status: { type: String, enum: PAYMENT_STATUSES, required: true },
    type: { type: String, enum: ['deposit', 'balance', 'full'], required: true },
    capturedAt: { type: Date },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderAttrs>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestEmail: { type: String },
    guestPhone: { type: String },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    couponCode: { type: String },
    shippingAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema, required: true },
    shippingMethod: { type: String, enum: ['standard', 'express'], default: 'standard' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    paymentRef: { type: String },
    payments: { type: [orderPaymentSchema], default: [] },
    status: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    trackingCarrier: { type: String },
    trackingNumber: { type: String },
    timeline: {
      type: [orderTimelineSchema],
      default: () => [{ status: 'placed', at: new Date() }],
    },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    orderType: {
      type: String,
      enum: ['standard', 'commission_deposit', 'commission_balance', 'gift_card_purchase'],
      default: 'standard',
    },
    commission: { type: Schema.Types.ObjectId, ref: 'Commission', default: null, index: true },
    giftCardCode: { type: String },
    giftCardAmount: { type: Number },
    loyaltyPointsRedeemed: { type: Number, default: 0, min: 0 },
    loyaltyDiscount: { type: Number, default: 0, min: 0 },
    loyaltyPointsEarned: { type: Number, default: 0, min: 0 },
    referralBonusApplied: { type: Boolean, default: false },
    containsHazmat: { type: Boolean, default: false },
    isInternational: { type: Boolean, default: false },
    refunds: { type: [refundSchema], default: [] },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

export type OrderDoc = HydratedDocument<OrderAttrs>;

export const Order = model<OrderAttrs>('Order', orderSchema);

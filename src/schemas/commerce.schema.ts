import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// Used for the account address book, where label/isDefault are meaningful. `.default(...)`
// deliberately avoided here (and below) - it makes the *response* type required at the OpenAPI
// layer while frontend callers reasonably treat these as optional-with-a-fallback, which is
// friction not worth fighting; the small number of call sites just supply an explicit value.
export const addressBodySchema = z
  .object({
    label: z.string().trim().optional(),
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().min(1),
    pincode: z.string().trim().min(4).max(10),
    country: z.string().trim().optional(),
    phone: z.string().trim().min(6),
    isDefault: z.boolean().optional(),
  })
  .openapi('AddressRequest');

// A leaner address shape for one-off order shipping/billing addresses, which have no concept of
// a label or "default" flag - those only make sense for the saved address book above.
export const orderAddressSchema = z
  .object({
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().min(1),
    pincode: z.string().trim().min(4).max(10),
    country: z.string().trim().optional(),
    phone: z.string().trim().min(6),
  })
  .openapi('OrderAddressRequest');

export const addToCartBodySchema = z
  .object({
    productId: objectIdSchema,
    variantSku: z.string().min(1),
    qty: z.number().int().positive().optional(),
    customization: z.string().trim().max(500).optional(),
  })
  .openapi('AddToCartRequest');

export const updateCartItemBodySchema = z
  .object({
    qty: z.number().int().min(0),
  })
  .openapi('UpdateCartItemRequest');

export const applyCouponBodySchema = z
  .object({
    code: z.string().trim().min(1).nullable(),
  })
  .openapi('ApplyCouponRequest');

export const checkoutBodySchema = z
  .object({
    shippingAddress: orderAddressSchema,
    billingAddress: orderAddressSchema.optional(),
    guestEmail: z.string().email().optional(),
    guestPhone: z.string().min(6).optional(),
    couponCode: z.string().trim().optional(),
    giftCardCode: z.string().trim().optional(),
    paymentMethod: z.enum(['razorpay', 'cod']),
    redeemPoints: z.number().int().nonnegative().optional(),
    shippingMethod: z.enum(['standard', 'express']).optional(),
  })
  .openapi('CheckoutRequest');

export const verifyPaymentBodySchema = z
  .object({
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  })
  .openapi('VerifyPaymentRequest');

export const orderStatusUpdateBodySchema = z
  .object({
    status: z.enum(['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned']),
    note: z.string().optional(),
    trackingCarrier: z.string().optional(),
    trackingNumber: z.string().optional(),
  })
  .openapi('OrderStatusUpdateRequest');

export const cancelOrderBodySchema = z.object({
  reason: z.string().optional(),
});

export const refundOrderBodySchema = z
  .object({
    amount: z.number().positive().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .openapi('RefundOrderRequest');

export const trackOrderBodySchema = z
  .object({
    orderNumber: z.string().min(1),
    emailOrPhone: z.string().min(1),
  })
  .openapi('TrackOrderRequest');

export const createCouponBodySchema = z
  .object({
    code: z.string().trim().min(2),
    type: z.enum(['percent', 'flat']),
    value: z.number().positive(),
    minOrderValue: z.number().nonnegative().optional(),
    maxDiscount: z.number().positive().optional(),
    usageLimit: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().optional(),
    applicableCategories: z.array(objectIdSchema).optional(),
    applicableProducts: z.array(objectIdSchema).optional(),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    active: z.boolean().optional(),
  })
  .openapi('CreateCouponRequest');

export const updateCouponBodySchema = createCouponBodySchema.partial();

export const idParamSchema = z.object({ id: objectIdSchema });
export const cartItemIdParamSchema = z.object({ itemId: z.string() });
export const addressIdParamSchema = z.object({ addressId: z.string() });

export const orderListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sort: z.string().optional(),
    status: z
      .enum([
        'placed',
        'confirmed',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'returned',
      ])
      .optional(),
    paymentMethod: z.enum(['razorpay', 'cod', 'stripe', 'gift_card']).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    q: z.string().trim().min(1).optional(),
  })
  .openapi('OrderListQuery');

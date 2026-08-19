import mongoose from 'mongoose';
import { Cart } from '../models/Cart';
import { Product } from '../models/Product';
import {
  Order,
  type OrderDoc,
  CUSTOMER_CANCELLABLE_STATUSES,
  type OrderStatus,
} from '../models/Order';
import type { SettingsDoc } from '../models/Settings';
import { Coupon } from '../models/Coupon';
import type { Address } from '../models/Address';
import { ApiError } from '../utils/apiError';
import { generateOrderNumber } from '../utils/orderNumber';
import { validateCoupon } from './coupon.service';
import { sendEmail, sendSms, sendPushNotification } from './notification.service';
import { getSettings, renderTemplate } from './settings.service';
import { syncFromLinkedOrder } from './commission.service';
import { redeemGiftCardAmount } from './giftCard.service';
import { getTokensForUser } from './pushToken.service';
import { User } from '../models/User';
import { logger } from '../config/logger';
import { logActivity } from './activityLog.service';
import { razorpay, isRazorpayConfigured } from '../config/razorpay';
import { stripe, isStripeConfigured } from '../config/stripe';

// TODO: replace with real GST computation once business registration/HSN details are available
// (interstate vs intrastate CGST/SGST/IGST split) - see IMPLEMENTATION_PROMPT.md §18 assumption 4.
// The tax *rate* itself is now admin-configurable (Settings.taxRatePercent) even though the
// computation stays flat-percentage rather than a real interstate/intrastate split.

interface CheckoutParams {
  userId?: string;
  sessionId?: string;
  guestEmail?: string;
  guestPhone?: string;
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethod: 'cod' | 'razorpay' | 'stripe';
  paymentRef?: string;
  couponCode?: string;
  giftCardCode?: string;
  // Loyalty points the customer wants to redeem against this order (§17 Phase 3) - validated
  // against the user's current balance, capped so it can never take the order below zero.
  redeemPoints?: number;
  shippingMethod?: 'standard' | 'express';
}

/** `Settings.prepaidDiscountPercent` off the subtotal, applied automatically for any non-COD
 *  payment method - a store-wide incentive (not a coupon code), same shape as the tax calculation
 *  just above. 0 (the default) makes this a no-op. */
function computePrepaidDiscount(
  subtotal: number,
  paymentMethod: 'cod' | 'razorpay' | 'stripe',
  settings: SettingsDoc,
): number {
  if (paymentMethod === 'cod' || settings.prepaidDiscountPercent <= 0) return 0;
  return Math.round(subtotal * (settings.prepaidDiscountPercent / 100) * 100) / 100;
}

const DEFAULT_LINE_WEIGHT_GRAMS = 250;

/**
 * Shared by `createOrderFromCart` (the authoritative calculation, at actual order-creation time)
 * and `previewCheckoutTotal` below (used to set the upfront Razorpay/Stripe charge amount, before
 * an order exists) — extracted so the two can never drift apart. Pure: no I/O, no side effects.
 */
export function computeShippingAndTax(
  subtotal: number,
  discount: number,
  totalWeightGrams: number,
  allItemsTaxExempt: boolean,
  isInternational: boolean,
  settings: SettingsDoc,
  shippingMethod: 'standard' | 'express' = 'standard',
): { shipping: number; tax: number } {
  let shipping: number;
  if (isInternational) {
    const threshold = settings.shipping.internationalFreeShippingThreshold;
    const freeIntl = threshold !== undefined && subtotal - discount >= threshold;
    shipping = freeIntl ? 0 : settings.shipping.internationalRate;
  } else if (subtotal - discount >= settings.shipping.freeShippingThreshold) {
    shipping = 0;
  } else {
    const tiers = settings.shipping.weightTiers;
    const matchedTier = tiers.find((t) => t.maxGrams >= totalWeightGrams);
    shipping = matchedTier?.rate ?? tiers[tiers.length - 1]?.rate ?? settings.shipping.flatRate;
  }
  // Express is a flat surcharge on top of whatever the standard rate resolved to (including free
  // shipping) - a customer who'd otherwise get free shipping still pays for the faster upgrade,
  // they just pay only the surcharge rather than surcharge-on-top-of-a-paid-rate.
  if (shippingMethod === 'express') {
    shipping += settings.shipping.expressRate;
  }

  // A cart where every resolved product is tax-exempt owes no tax at all; otherwise the existing
  // flat-percentage simplification applies (see the GST TODO above).
  const tax = allItemsTaxExempt
    ? 0
    : Math.round((subtotal - discount) * (settings.taxRatePercent / 100) * 100) / 100;

  return { shipping, tax };
}

/**
 * Read-only preview of what `createOrderFromCart` would charge for the cart as it stands right
 * now — used by payment.service.ts to set the Razorpay/Stripe amount *before* an order exists (so
 * online-payment customers are charged shipping+tax too, not just the item subtotal). Does NOT
 * lock or decrement stock; the actual order creation re-resolves everything from scratch inside
 * its own transaction and remains the source of truth, so a product/settings change in the window
 * between "pay" and "verify" affects the real order, not this estimate — same inherent limitation
 * a fixed-amount-before-order-exists flow always has (already true of the coupon discount below).
 */
export async function previewCheckoutTotal(params: {
  userId?: string;
  sessionId?: string;
  shippingAddress: Address;
  couponCode?: string;
  paymentMethod?: 'cod' | 'razorpay' | 'stripe';
  shippingMethod?: 'standard' | 'express';
}): Promise<{
  subtotal: number;
  discount: number;
  prepaidDiscount: number;
  shipping: number;
  tax: number;
  total: number;
}> {
  const cartFilter = params.userId ? { user: params.userId } : { sessionId: params.sessionId };
  const cart = await Cart.findOne(cartFilter);
  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your cart is empty');

  const [settings, user, products] = await Promise.all([
    getSettings(),
    params.userId ? User.findById(params.userId).select('wholesaleApproved') : null,
    Product.find({ _id: { $in: cart.items.map((i) => i.product) } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  let totalWeightGrams = 0;
  let allItemsTaxExempt = true;
  for (const line of cart.items) {
    const product = productById.get(line.product.toString());
    if (!product) continue; // resolved fresh again (and enforced) at actual order-creation time
    const variant = product.variants.find((v) => v.sku === line.variantSku);
    if (!variant) continue;

    totalWeightGrams += (product.weightGrams ?? DEFAULT_LINE_WEIGHT_GRAMS) * line.qty;
    allItemsTaxExempt = allItemsTaxExempt && product.taxClass === 'exempt';

    const wholesaleEligible =
      Boolean(user?.wholesaleApproved) &&
      product.wholesalePrice != null &&
      product.wholesaleMinQty != null &&
      line.qty >= product.wholesaleMinQty;
    const price = wholesaleEligible ? product.wholesalePrice! : variant.price;
    subtotal += price * line.qty;
  }

  let discount = 0;
  if (params.couponCode) {
    const result = await validateCoupon(params.couponCode, subtotal, params.userId);
    discount = result.discount;
  }
  const prepaidDiscount = computePrepaidDiscount(
    subtotal,
    params.paymentMethod ?? 'razorpay',
    settings,
  );
  discount += prepaidDiscount;

  const isInternational =
    (params.shippingAddress.country ?? 'India').trim().toLowerCase() !== 'india';
  const { shipping, tax } = computeShippingAndTax(
    subtotal,
    discount,
    totalWeightGrams,
    allItemsTaxExempt,
    isInternational,
    settings,
    params.shippingMethod,
  );
  const total = Math.max(0, subtotal - discount + shipping + tax);

  return { subtotal, discount, prepaidDiscount, shipping, tax, total };
}

export class StockConflictError extends ApiError {
  constructor(
    public readonly unavailable: { productId: string; title: string; available: number }[],
  ) {
    super(409, 'One or more items in your cart are no longer available in the requested quantity', {
      unavailable,
    });
    this.name = 'StockConflictError';
  }
}

/**
 * The core commerce-critical operation: atomically decrements stock for every line item and
 * creates the Order in a single transaction, so two concurrent checkouts can never both "win" the
 * last unit of a low-stock item (this matters most for isUnique pieces, which have stock=1 and no
 * restock to fall back on). If any item's guard fails, the whole transaction aborts and every
 * stock decrement rolls back - no partial orders.
 */
export async function createOrderFromCart(params: CheckoutParams): Promise<OrderDoc> {
  if (!params.userId && !params.sessionId) throw ApiError.badRequest('Missing cart identity');

  const cartFilter = params.userId ? { user: params.userId } : { sessionId: params.sessionId };
  const precheckCart = await Cart.findOne(cartFilter);
  if (!precheckCart || precheckCart.items.length === 0)
    throw ApiError.badRequest('Your cart is empty');

  const settings = await getSettings();

  const session = await mongoose.startSession();
  let order: OrderDoc | undefined;

  try {
    await session.withTransaction(async () => {
      // Re-fetched here (not reused from the pre-check above) because `session.withTransaction`
      // retries this whole callback on a transient transaction error (e.g. a write conflict) —
      // mutating a Mongoose document fetched *outside* the callback (the `cart.items.splice(...)`
      // below) would otherwise leave `cart.items` already emptied-in-JS-memory on a retry, even
      // though the DB-side write never committed, silently producing a zero-item order. Every read
      // this callback depends on must come from inside it, using `session`, so a retry starts from
      // a truly fresh, consistent snapshot each time.
      const cart = await Cart.findOne(cartFilter).session(session);
      if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your cart is empty');

      const orderItems: {
        product: mongoose.Types.ObjectId;
        variantSku: string;
        title: string;
        qty: number;
        price: number;
        customization?: string;
      }[] = [];
      const unavailable: { productId: string; title: string; available: number }[] = [];

      // Fetched once, inside the transaction, so wholesale-price eligibility and loyalty-point
      // redemption both see a consistent snapshot of the buyer's account for this checkout.
      const user = params.userId
        ? await User.findById(params.userId)
            .select('wholesaleApproved loyaltyPoints')
            .session(session)
        : null;

      let totalWeightGrams = 0;
      let containsHazmat = false;
      let allItemsTaxExempt = true;

      for (const line of cart.items) {
        // Atomic guard: only decrements if enough stock is available *right now*, in the same
        // operation as the read - a plain read-then-write here is exactly the race this guards
        // against.
        const updated = await Product.findOneAndUpdate(
          {
            _id: line.product,
            status: 'published',
            // Re-checked here too (not just at add-to-cart) - a scheduled drop could be set on a
            // product *after* it was already sitting in someone's cart from before it had one.
            $or: [{ dropAt: null }, { dropAt: { $lte: new Date() } }],
            variants: { $elemMatch: { sku: line.variantSku, stock: { $gte: line.qty } } },
          },
          { $inc: { 'variants.$[v].stock': -line.qty } },
          { arrayFilters: [{ 'v.sku': line.variantSku }], returnDocument: 'after', session },
        );

        if (!updated) {
          const product = await Product.findById(line.product).session(session);
          const variant = product?.variants.find((v) => v.sku === line.variantSku);
          unavailable.push({
            productId: line.product.toString(),
            title: product?.title ?? 'Unknown product',
            available: variant?.stock ?? 0,
          });
          continue;
        }

        const variant = updated.variants.find((v) => v.sku === line.variantSku)!;

        totalWeightGrams += (updated.weightGrams ?? DEFAULT_LINE_WEIGHT_GRAMS) * line.qty;
        containsHazmat =
          containsHazmat ||
          updated.shippingConstraints.groundOnly ||
          updated.shippingConstraints.heatSensitive;
        allItemsTaxExempt = allItemsTaxExempt && updated.taxClass === 'exempt';

        // Wholesale pricing only kicks in when the buyer is approved AND the product has both a
        // wholesale price and minimum qty configured AND this line meets that minimum (§17).
        const wholesaleEligible =
          Boolean(user?.wholesaleApproved) &&
          updated.wholesalePrice != null &&
          updated.wholesaleMinQty != null &&
          line.qty >= updated.wholesaleMinQty;
        const price = wholesaleEligible ? updated.wholesalePrice! : variant.price;

        orderItems.push({
          product: updated._id,
          variantSku: line.variantSku,
          title: updated.title,
          qty: line.qty,
          price,
          customization: line.customization,
        });

        // A one-of-a-kind piece that just sold out moves to archived immediately, rather than
        // waiting for an admin to notice zero stock - see §6.7.
        if (updated.isUnique && variant.stock === 0 && updated.status === 'published') {
          updated.status = 'archived';
          await updated.save({ session });
        }
      }

      if (unavailable.length > 0) {
        throw new StockConflictError(unavailable);
      }

      const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);

      let discount = 0;
      let appliedCoupon: Awaited<ReturnType<typeof validateCoupon>>['coupon'] | undefined;
      if (params.couponCode) {
        const result = await validateCoupon(params.couponCode, subtotal, params.userId);
        discount = result.discount;
        appliedCoupon = result.coupon;
      }
      discount += computePrepaidDiscount(subtotal, params.paymentMethod, settings);

      // International is decided purely off the shipping address, not the buyer's account -
      // defaults to India (this store's home market) when no country is supplied.
      const isInternational =
        (params.shippingAddress.country ?? 'India').trim().toLowerCase() !== 'india';

      const { shipping, tax } = computeShippingAndTax(
        subtotal,
        discount,
        totalWeightGrams,
        allItemsTaxExempt,
        isInternational,
        settings,
        params.shippingMethod,
      );
      const totalBeforeLoyalty = Math.max(0, subtotal - discount + shipping + tax);

      // Loyalty redemption is applied before the gift card, both reducing a running total -
      // order doesn't matter for correctness as long as each step's cap reflects what's left.
      let loyaltyDiscount = 0;
      let redeemPointsApplied = 0;
      if (params.redeemPoints && params.redeemPoints > 0) {
        if (!user) {
          throw ApiError.badRequest(
            'Only logged-in customers with a loyalty balance can redeem points',
          );
        }
        if (params.redeemPoints > user.loyaltyPoints) {
          throw ApiError.badRequest('Not enough loyalty points to redeem that many');
        }
        redeemPointsApplied = params.redeemPoints;
        loyaltyDiscount = Math.min(
          redeemPointsApplied * settings.loyalty.redemptionRate,
          totalBeforeLoyalty,
        );
        user.loyaltyPoints -= redeemPointsApplied;
        await user.save({ session });
      }

      const totalBeforeGiftCard = Math.max(0, totalBeforeLoyalty - loyaltyDiscount);

      // Gift card redemption only applies to the COD checkout path for now - the Razorpay
      // create-order amount is fixed before this point (payment.service.ts), so wiring gift
      // cards into that flow too would need the charge amount recalculated there first.
      let giftCardAmount = 0;
      let giftCardCodeApplied: string | undefined;
      if (params.giftCardCode) {
        const result = await redeemGiftCardAmount(
          params.giftCardCode,
          totalBeforeGiftCard,
          session,
        );
        giftCardAmount = result.amountApplied;
        giftCardCodeApplied = result.giftCard.code;
      }

      const total = Math.max(0, totalBeforeGiftCard - giftCardAmount);
      const fullyPaidByGiftCard = total === 0 && giftCardAmount > 0;
      const isOnlinePayment =
        params.paymentMethod === 'razorpay' || params.paymentMethod === 'stripe';

      const payments: {
        amount: number;
        method: 'razorpay' | 'stripe' | 'gift_card';
        ref?: string;
        status: 'paid';
        type: 'full';
        capturedAt: Date;
      }[] = [];
      if (giftCardAmount > 0) {
        payments.push({
          amount: giftCardAmount,
          method: 'gift_card',
          status: 'paid',
          type: 'full',
          capturedAt: new Date(),
        });
      }
      if (isOnlinePayment) {
        payments.push({
          amount: total,
          method: params.paymentMethod as 'razorpay' | 'stripe',
          ref: params.paymentRef,
          status: 'paid',
          type: 'full',
          capturedAt: new Date(),
        });
      }

      const [created] = await Order.create(
        [
          {
            orderNumber: generateOrderNumber(),
            user: params.userId ?? null,
            guestEmail: params.guestEmail,
            guestPhone: params.guestPhone,
            items: orderItems,
            subtotal,
            discount,
            shipping,
            tax,
            total,
            couponCode: appliedCoupon?.code,
            giftCardCode: giftCardCodeApplied,
            giftCardAmount: giftCardAmount || undefined,
            loyaltyPointsRedeemed: redeemPointsApplied,
            loyaltyDiscount,
            containsHazmat,
            isInternational,
            shippingAddress: params.shippingAddress,
            billingAddress: params.billingAddress,
            shippingMethod: params.shippingMethod ?? 'standard',
            paymentMethod: fullyPaidByGiftCard ? 'gift_card' : params.paymentMethod,
            paymentStatus: fullyPaidByGiftCard || isOnlinePayment ? 'paid' : 'pending',
            paymentRef: params.paymentRef,
            payments,
            status: 'placed',
            timeline: [{ status: 'placed', at: new Date() }],
          },
        ],
        { session },
      );

      if (appliedCoupon) {
        await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } }, { session });
      }

      cart.items.splice(0, cart.items.length);
      cart.couponCode = null;
      await cart.save({ session });

      order = created;
    });
  } finally {
    await session.endSession();
  }

  if (!order) throw ApiError.internal('Order transaction completed without producing an order');

  sendEmail({
    to: params.guestEmail ?? '',
    subject: `Order confirmed: ${order.orderNumber}`,
    text: `Thanks for your order! Order ${order.orderNumber}, total ${order.total}.`,
  }).catch((err) => logger.error({ err }, 'Failed to send order confirmation email'));

  return order;
}

const STAFF_ROLES = ['staff', 'manager', 'owner'];

/**
 * Staff/manager/owner may view any order. Otherwise the caller must be authenticated as the
 * order's own customer - this also protects guest orders (order.user === null) and anonymous
 * callers, which would otherwise let anyone who obtains/guesses an order id read someone else's
 * shipping address and phone number (an IDOR gap - guest order lookup has its own dedicated,
 * verified path via POST /orders/track).
 */
export async function getOrderById(
  id: string,
  identity: { userId?: string; role?: string },
): Promise<OrderDoc> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  const isStaff = Boolean(identity.role && STAFF_ROLES.includes(identity.role));
  if (isStaff) return order;
  if (!identity.userId || !order.user || order.user.toString() !== identity.userId) {
    throw ApiError.forbidden();
  }
  return order;
}

export async function trackGuestOrder(
  orderNumber: string,
  emailOrPhone: string,
): Promise<OrderDoc> {
  const order = await Order.findOne({
    orderNumber,
    $or: [{ guestEmail: emailOrPhone }, { guestPhone: emailOrPhone }],
  });
  if (!order) throw ApiError.notFound('Order not found — check your order number and email/phone');
  return order;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note: string | undefined,
  actorId: string,
): Promise<OrderDoc> {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');

  order.status = status;
  order.timeline.push({ status, at: new Date(), note });

  const settings = await getSettings();

  if (status === 'delivered' && order.user) {
    const orderUser = await User.findById(order.user).select('loyaltyPoints referredBy');
    if (orderUser) {
      const pointsEarned = Math.floor(order.total * settings.loyalty.pointsPerRupee);
      orderUser.loyaltyPoints += pointsEarned;
      order.loyaltyPointsEarned = pointsEarned;

      // Referral bonus - idempotent via order.referralBonusApplied, and only ever credited on
      // the referred user's FIRST order to reach 'delivered'.
      if (!order.referralBonusApplied && orderUser.referredBy) {
        const priorDeliveredCount = await Order.countDocuments({
          user: order.user,
          status: 'delivered',
          _id: { $ne: order._id },
        });
        if (priorDeliveredCount === 0) {
          await User.updateOne(
            { _id: orderUser.referredBy },
            { $inc: { loyaltyPoints: settings.referral.bonusPoints } },
          );
          order.referralBonusApplied = true;
        }
      }

      await orderUser.save();
    }
  }

  await order.save();

  if (order.commission) {
    await syncFromLinkedOrder(order);
  }

  const vars = { orderNumber: order.orderNumber, status, note: note ? ` (${note})` : '' };
  const subject = renderTemplate(settings.notificationTemplates.orderStatusChanged.subject, vars);
  const text = renderTemplate(settings.notificationTemplates.orderStatusChanged.body, vars);

  // A registered customer's order has no guestEmail (that field only ever gets set for guest
  // checkouts) - resolving it that way unconditionally meant logged-in customers never actually
  // received this email at all. Look up the account's email for that case instead.
  const recipientEmail =
    order.guestEmail ??
    (order.user ? (await User.findById(order.user).select('email'))?.email : undefined);
  if (recipientEmail) {
    sendEmail({ to: recipientEmail, subject, text }).catch((err) =>
      logger.error({ err }, 'Failed to send order status email'),
    );
  }

  const recipientPhone =
    order.guestPhone ??
    (order.user ? (await User.findById(order.user).select('phone'))?.phone : undefined);
  if (recipientPhone) {
    sendSms({ to: recipientPhone, text }).catch((err) =>
      logger.error({ err }, 'Failed to send order status SMS'),
    );
  }

  if (order.user) {
    const tokens = await getTokensForUser(order.user.toString());
    sendPushNotification({
      tokens,
      title: subject,
      body: text,
      data: { type: 'order_status', orderId: order.id },
    }).catch((err) => logger.error({ err }, 'Failed to send order status push notification'));
  }

  logger.info({ orderId: id, status, actorId }, 'Order status updated');
  return order;
}

/** Same self-service window as cancellation (§6.4) - once an order is packed, changing the
 *  address could misdirect a shipment that's already being prepared. */
export async function customerUpdateShippingAddress(
  orderId: string,
  userId: string,
  address: Address,
): Promise<OrderDoc> {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.user || order.user.toString() !== userId) throw ApiError.forbidden();
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.conflict(
      'This order can no longer be edited — it has already been packed for shipping',
    );
  }

  order.shippingAddress = address;
  await order.save();
  return order;
}

/** Self-service cancel is only allowed while the order hasn't been packed yet (§6.4) - restores
 *  stock atomically since the whole point of cancelling is to release it back to other buyers. */
export async function customerCancelOrder(
  orderId: string,
  userId: string,
  reason?: string,
): Promise<OrderDoc> {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.user || order.user.toString() !== userId) throw ApiError.forbidden();
  if (order.commission) {
    throw ApiError.badRequest(
      'Commission deposit/balance payments cannot be self-cancelled — contact us instead',
    );
  }
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.conflict(
      'This order can no longer be cancelled — it has already been packed for shipping',
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of order.items) {
        if (!item.product) continue; // commission line items have no catalog stock to restore
        await Product.updateOne(
          { _id: item.product, 'variants.sku': item.variantSku },
          { $inc: { 'variants.$.stock': item.qty } },
          { session },
        );
      }
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancelReason = reason;
      order.timeline.push({ status: 'cancelled', at: new Date(), note: reason });
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  return order;
}

/**
 * Processes a refund for an order (manager/owner only, §7.2). Only razorpay- and
 * stripe-paid orders have a captured payment that can actually be reversed via an API call - COD
 * has nothing captured to reverse, and a gift_card-only order would need a manual balance
 * re-credit, so both of those are honest 400s rather than a fake success.
 */
export async function refundOrder(
  orderId: string,
  actorId: string,
  amount: number | undefined,
  reason: string | undefined,
): Promise<OrderDoc> {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const alreadyRefunded = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const paidTotal = order.payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);
  const refundable = paidTotal - alreadyRefunded;
  if (refundable <= 0) {
    throw ApiError.badRequest('Nothing left to refund on this order');
  }

  const refundAmount = amount ?? refundable;
  if (refundAmount > refundable) {
    throw ApiError.badRequest(`Refund amount exceeds what's refundable (${refundable})`);
  }

  let ref: string | undefined;

  if (order.paymentMethod === 'razorpay') {
    if (!razorpay || !isRazorpayConfigured) {
      throw ApiError.internal(
        'Razorpay is not configured — add RAZORPAY_* to .env (see ACCOUNT_SETUP.md)',
      );
    }
    if (!order.paymentRef)
      throw ApiError.internal('Order has no Razorpay payment reference to refund');
    const refund = await razorpay.payments.refund(order.paymentRef, {
      amount: Math.round(refundAmount * 100),
      speed: 'optimum',
    });
    ref = refund.id;
  } else if (order.paymentMethod === 'stripe') {
    if (!stripe || !isStripeConfigured) {
      throw ApiError.internal('Stripe is not configured — add STRIPE_* to .env');
    }
    if (!order.paymentRef)
      throw ApiError.internal('Order has no Stripe payment reference to refund');
    const refund = await stripe.refunds.create({
      payment_intent: order.paymentRef,
      amount: Math.round(refundAmount * 100),
    });
    ref = refund.id;
  } else {
    // gift_card and cod: no captured online payment exists to reverse via an API call.
    throw ApiError.badRequest(
      'Refunds for this payment method must be processed manually — no online refund path is configured',
    );
  }

  order.refunds.push({
    amount: refundAmount,
    reason,
    ref,
    by: new mongoose.Types.ObjectId(actorId),
    at: new Date(),
  });
  order.paymentStatus =
    alreadyRefunded + refundAmount >= paidTotal ? 'refunded' : 'partially_refunded';
  await order.save();

  await logActivity({
    actor: actorId,
    action: 'order.refund',
    targetType: 'Order',
    targetId: order.id,
    metadata: { amount: refundAmount },
  });

  return order;
}

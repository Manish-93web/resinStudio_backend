import { Coupon, type CouponDoc } from '../models/Coupon';
import { Order } from '../models/Order';
import { ApiError } from '../utils/apiError';

export interface CouponValidationResult {
  coupon: CouponDoc;
  discount: number;
}

/** Computes a coupon's discount against a subtotal, or throws a user-facing reason it can't be
 *  applied. Re-run at both cart-apply time and checkout time — never trust a discount amount
 *  carried from an earlier request. */
export async function validateCoupon(
  code: string,
  subtotal: number,
  userId?: string,
): Promise<CouponValidationResult> {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon || !coupon.active) throw ApiError.badRequest('Invalid coupon code');

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt)
    throw ApiError.badRequest('This coupon is not active yet');
  if (coupon.expiresAt && now > coupon.expiresAt)
    throw ApiError.badRequest('This coupon has expired');

  if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
    throw ApiError.badRequest(`Minimum order value for this coupon is ${coupon.minOrderValue}`);
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('This coupon has reached its usage limit');
  }

  if (coupon.perUserLimit && userId) {
    const usedByUser = await Order.countDocuments({
      user: userId,
      couponCode: coupon.code,
      status: { $ne: 'cancelled' },
    });
    if (usedByUser >= coupon.perUserLimit) {
      throw ApiError.badRequest('You have already used this coupon the maximum number of times');
    }
  }

  let discount = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);

  return { coupon, discount: Math.round(discount * 100) / 100 };
}

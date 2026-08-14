import { asyncHandler } from '../utils/asyncHandler';
import { Coupon } from '../models/Coupon';
import { ApiError } from '../utils/apiError';
import { validateCoupon } from '../services/coupon.service';
import { getCartDetail } from '../services/cart.service';
import { getCartIdentity } from '../utils/cartIdentity';

export const list = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  res.json({ data: coupons });
});

export const create = asyncHandler(async (req, res) => {
  const existing = await Coupon.findOne({ code: req.body.code.toUpperCase() });
  if (existing) throw ApiError.conflict('A coupon with this code already exists');
  const coupon = await Coupon.create({ ...req.body, code: req.body.code.toUpperCase() });
  res.status(201).json({ coupon });
});

export const update = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  Object.assign(coupon, req.body);
  await coupon.save();
  res.json({ coupon });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await Coupon.findByIdAndDelete(req.params.id);
  if (!result) throw ApiError.notFound('Coupon not found');
  res.status(204).send();
});

export const validate = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  const cart = await getCartDetail(identity);
  const result = await validateCoupon(req.body.code, cart.subtotal, identity.userId);
  res.json({ valid: true, discount: result.discount, code: result.coupon.code });
});

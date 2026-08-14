import { asyncHandler } from '../utils/asyncHandler';
import { getCartIdentity } from '../utils/cartIdentity';
import * as cartService from '../services/cart.service';

export const get = asyncHandler(async (req, res) => {
  const detail = await cartService.getCartDetail(getCartIdentity(req));
  res.json({ cart: detail });
});

export const addItem = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  await cartService.addItem(
    identity,
    req.body.productId,
    req.body.variantSku,
    req.body.qty ?? 1,
    req.body.customization,
  );
  const detail = await cartService.getCartDetail(identity);
  res.status(201).json({ cart: detail });
});

export const updateItem = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  await cartService.updateItemQty(identity, req.params.itemId as string, req.body.qty);
  const detail = await cartService.getCartDetail(identity);
  res.json({ cart: detail });
});

export const removeItem = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  await cartService.removeItem(identity, req.params.itemId as string);
  const detail = await cartService.getCartDetail(identity);
  res.json({ cart: detail });
});

export const applyCoupon = asyncHandler(async (req, res) => {
  const identity = getCartIdentity(req);
  await cartService.applyCoupon(identity, req.body.code);
  const detail = await cartService.getCartDetail(identity);
  res.json({ cart: detail });
});

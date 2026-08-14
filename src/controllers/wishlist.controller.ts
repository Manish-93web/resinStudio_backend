import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as wishlistService from '../services/wishlist.service';

export const get = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const products = await wishlistService.getWishlist(req.user.id);
  res.json({ data: products });
});

export const add = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await wishlistService.addToWishlist(req.user.id, req.params.productId as string);
  res.status(204).send();
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await wishlistService.removeFromWishlist(req.user.id, req.params.productId as string);
  res.status(204).send();
});

import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as giftCardService from '../services/giftCard.service';

export const purchase = asyncHandler(async (req, res) => {
  const { order, giftCard } = await giftCardService.purchaseGiftCard(req.user?.id, req.body);
  res
    .status(201)
    .json({ order, giftCard: { code: giftCard.code, initialValue: giftCard.initialValue } });
});

export const checkBalance = asyncHandler(async (req, res) => {
  const balance = await giftCardService.checkBalance(req.params.code as string);
  res.json(balance);
});

// --- Admin ---

export const issue = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const giftCard = await giftCardService.issueManually(req.user.id, req.body);
  res.status(201).json({ giftCard });
});

export const list = asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const giftCards = await giftCardService.listForAdmin(search);
  res.json({ data: giftCards });
});

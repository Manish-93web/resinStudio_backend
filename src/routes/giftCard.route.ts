import { Router } from 'express';
import * as giftCardController from '../controllers/giftCard.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import {
  purchaseGiftCardBodySchema,
  issueGiftCardBodySchema,
  giftCardCodeParamSchema,
} from '../schemas/giftCard.schema';

// Mounted at /api/gift-cards
export const giftCardRouter = Router();

giftCardRouter.post(
  '/purchase',
  optionalAuth,
  validate({ body: purchaseGiftCardBodySchema }),
  giftCardController.purchase,
);
giftCardRouter.get(
  '/:code/balance',
  authRateLimiter,
  validate({ params: giftCardCodeParamSchema }),
  giftCardController.checkBalance,
);

// Mounted at /api/admin/gift-cards - manual issuance (§7.11 goodwill/claim resolution) + directory.
export const adminGiftCardRouter = Router();

adminGiftCardRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  giftCardController.list,
);
adminGiftCardRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: issueGiftCardBodySchema }),
  giftCardController.issue,
);

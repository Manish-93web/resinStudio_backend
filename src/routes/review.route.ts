import { Router } from 'express';
import * as reviewController from '../controllers/review.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import {
  createReviewBodySchema,
  updateReviewBodySchema,
  moderateReviewBodySchema,
  reviewListQuerySchema,
  productIdParamSchema,
  reviewIdParamSchema,
} from '../schemas/review.schema';

// Mounted at /api/products/:productId/reviews - mergeParams so :productId is visible here.
export const productReviewRouter = Router({ mergeParams: true });

productReviewRouter.get(
  '/',
  optionalAuth,
  validate({ params: productIdParamSchema }),
  reviewController.listForProduct,
);
productReviewRouter.post(
  '/',
  requireAuth,
  validate({ params: productIdParamSchema, body: createReviewBodySchema }),
  reviewController.createForProduct,
);
productReviewRouter.get(
  '/mine',
  requireAuth,
  validate({ params: productIdParamSchema }),
  reviewController.getMineForProduct,
);

// Mounted at /api/reviews - editing/deleting your own review, plus the admin moderation queue.
export const reviewRouter = Router();

// Public - site-wide UGC gallery source (§6.12). Must precede the admin-only GET '/' below.
reviewRouter.get('/gallery', reviewController.gallery);
// Public - homepage testimonials source. Must precede the admin-only GET '/' below.
reviewRouter.get('/testimonials', reviewController.testimonials);

reviewRouter.get(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ query: reviewListQuerySchema }),
  reviewController.listQueue,
);
reviewRouter.put(
  '/:id',
  requireAuth,
  validate({ params: reviewIdParamSchema, body: updateReviewBodySchema }),
  reviewController.update,
);
reviewRouter.delete(
  '/:id',
  requireAuth,
  validate({ params: reviewIdParamSchema }),
  reviewController.remove,
);
reviewRouter.put(
  '/:id/moderate',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: reviewIdParamSchema, body: moderateReviewBodySchema }),
  reviewController.moderate,
);

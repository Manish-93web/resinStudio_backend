import { Router } from 'express';
import * as wishlistController from '../controllers/wishlist.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { wishlistProductParamSchema } from '../schemas/wishlist.schema';

// Mounted at /api/account/wishlist
export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

wishlistRouter.get('/', wishlistController.get);
wishlistRouter.post(
  '/:productId',
  validate({ params: wishlistProductParamSchema }),
  wishlistController.add,
);
wishlistRouter.delete(
  '/:productId',
  validate({ params: wishlistProductParamSchema }),
  wishlistController.remove,
);

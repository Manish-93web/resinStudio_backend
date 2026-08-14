import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import {
  addToCartBodySchema,
  updateCartItemBodySchema,
  applyCouponBodySchema,
} from '../schemas/commerce.schema';

export const cartRouter = Router();

cartRouter.use(optionalAuth);

cartRouter.get('/', cartController.get);
cartRouter.post('/items', validate({ body: addToCartBodySchema }), cartController.addItem);
cartRouter.put(
  '/items/:itemId',
  validate({ body: updateCartItemBodySchema }),
  cartController.updateItem,
);
cartRouter.delete('/items/:itemId', cartController.removeItem);
cartRouter.post('/coupon', validate({ body: applyCouponBodySchema }), cartController.applyCoupon);

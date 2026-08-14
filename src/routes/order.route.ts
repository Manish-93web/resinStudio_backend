import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import {
  checkoutBodySchema,
  orderStatusUpdateBodySchema,
  cancelOrderBodySchema,
  trackOrderBodySchema,
  idParamSchema,
  orderAddressSchema,
  orderListQuerySchema,
} from '../schemas/commerce.schema';
import { submitDamageClaimBodySchema } from '../schemas/damageClaim.schema';
import * as productBulkController from '../controllers/productBulk.controller';

export const orderRouter = Router();

orderRouter.post(
  '/',
  optionalAuth,
  validate({ body: checkoutBodySchema }),
  orderController.checkout,
);
orderRouter.post(
  '/track',
  authRateLimiter,
  validate({ body: trackOrderBodySchema }),
  orderController.track,
);

orderRouter.get('/mine', requireAuth, orderController.listMine);
orderRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  validate({ query: orderListQuerySchema }),
  orderController.listAll,
);
// Must come before /:id - "export.csv" would otherwise fail idParamSchema's ObjectId validation
// and 400 instead of matching this route.
orderRouter.get(
  '/export.csv',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  productBulkController.exportOrdersCsv,
);
orderRouter.get('/:id', optionalAuth, validate({ params: idParamSchema }), orderController.getOne);

orderRouter.put(
  '/:id/status',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema, body: orderStatusUpdateBodySchema }),
  orderController.updateStatus,
);

orderRouter.post(
  '/:id/cancel',
  requireAuth,
  validate({ params: idParamSchema, body: cancelOrderBodySchema }),
  orderController.cancelMine,
);

orderRouter.put(
  '/:id/shipping-address',
  requireAuth,
  validate({ params: idParamSchema, body: orderAddressSchema }),
  orderController.updateMyShippingAddress,
);

orderRouter.post(
  '/:id/damage-claims',
  requireAuth,
  validate({ params: idParamSchema, body: submitDamageClaimBodySchema }),
  orderController.submitDamageClaim,
);
orderRouter.get(
  '/:id/damage-claims',
  requireAuth,
  validate({ params: idParamSchema }),
  orderController.listDamageClaims,
);

import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import { searchRateLimiter } from '../middleware/rateLimiter';
import {
  createProductBodySchema,
  updateProductBodySchema,
  productQuerySchema,
  idParamSchema,
  slugParamSchema,
  stockAdjustmentBodySchema,
} from '../schemas/product.schema';

export const productRouter = Router();

productRouter.get(
  '/',
  searchRateLimiter,
  optionalAuth,
  validate({ query: productQuerySchema }),
  productController.list,
);
productRouter.get(
  '/id/:id',
  optionalAuth,
  validate({ params: idParamSchema }),
  productController.getById,
);
productRouter.get(
  '/:slug',
  optionalAuth,
  validate({ params: slugParamSchema }),
  productController.getBySlug,
);

productRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: createProductBodySchema }),
  productController.create,
);
productRouter.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema, body: updateProductBodySchema }),
  productController.update,
);
productRouter.post(
  '/:id/stock-adjustments',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema, body: stockAdjustmentBodySchema }),
  productController.adjustStock,
);
productRouter.delete(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema }),
  productController.remove,
);

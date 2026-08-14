import { Router } from 'express';
import * as couponController from '../controllers/coupon.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import {
  createCouponBodySchema,
  updateCouponBodySchema,
  idParamSchema,
} from '../schemas/commerce.schema';
import { z } from '../utils/zod';

export const couponRouter = Router();

couponRouter.post(
  '/validate',
  optionalAuth,
  validate({ body: z.object({ code: z.string().min(1) }) }),
  couponController.validate,
);

couponRouter.get('/', requireAuth, requireRole('manager', 'owner'), couponController.list);
couponRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: createCouponBodySchema }),
  couponController.create,
);
couponRouter.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema, body: updateCouponBodySchema }),
  couponController.update,
);
couponRouter.delete(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema }),
  couponController.remove,
);

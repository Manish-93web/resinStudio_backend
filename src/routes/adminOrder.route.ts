import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import { idParamSchema, refundOrderBodySchema } from '../schemas/commerce.schema';

// Mounted at /api/admin/orders - kept separate from orderRouter (/api/orders) rather than folded
// into it, matching the exact path called out in the implementation spec for the refund action.
export const adminOrderRouter = Router();

adminOrderRouter.post(
  '/:id/refund',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: idParamSchema, body: refundOrderBodySchema }),
  orderController.refund,
);

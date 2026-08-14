import { Router } from 'express';
import * as commissionController from '../controllers/commission.controller';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth';
import {
  createCommissionBodySchema,
  quoteCommissionBodySchema,
  declineCommissionBodySchema,
  commissionStatusUpdateBodySchema,
  payCommissionBodySchema,
  commissionListQuerySchema,
  commissionIdParamSchema,
} from '../schemas/commission.schema';

// Mounted at /api/commissions - customer-facing request/accept/pay flow.
export const commissionRouter = Router();

commissionRouter.post(
  '/',
  optionalAuth,
  validate({ body: createCommissionBodySchema }),
  commissionController.create,
);
commissionRouter.get('/mine', requireAuth, commissionController.listMine);
commissionRouter.get(
  '/:id',
  requireAuth,
  validate({ params: commissionIdParamSchema }),
  commissionController.getMine,
);
commissionRouter.post(
  '/:id/deposit',
  requireAuth,
  validate({ params: commissionIdParamSchema, body: payCommissionBodySchema }),
  commissionController.payDeposit,
);
commissionRouter.post(
  '/:id/balance',
  requireAuth,
  validate({ params: commissionIdParamSchema, body: payCommissionBodySchema }),
  commissionController.payBalance,
);

// Mounted at /api/admin/commissions - the moderation/production queue side (§7.10).
export const adminCommissionRouter = Router();

adminCommissionRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  validate({ query: commissionListQuerySchema }),
  commissionController.listQueue,
);
adminCommissionRouter.get(
  '/:id',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  validate({ params: commissionIdParamSchema }),
  commissionController.getOne,
);
adminCommissionRouter.put(
  '/:id/quote',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: commissionIdParamSchema, body: quoteCommissionBodySchema }),
  commissionController.sendQuote,
);
adminCommissionRouter.put(
  '/:id/decline',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: commissionIdParamSchema, body: declineCommissionBodySchema }),
  commissionController.decline,
);
adminCommissionRouter.put(
  '/:id/status',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: commissionIdParamSchema, body: commissionStatusUpdateBodySchema }),
  commissionController.updateProductionStatus,
);

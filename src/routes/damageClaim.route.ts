import { Router } from 'express';
import * as damageClaimController from '../controllers/damageClaim.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  resolveDamageClaimBodySchema,
  damageClaimListQuerySchema,
  damageClaimIdParamSchema,
} from '../schemas/damageClaim.schema';

// Mounted at /api/admin/damage-claims - the moderation queue side (§7.11). Self-service
// submission lives on the order itself (POST /api/orders/:id/damage-claims), since that's where
// the customer's authorization to act on the order is already checked.
export const damageClaimRouter = Router();

damageClaimRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  validate({ query: damageClaimListQuerySchema }),
  damageClaimController.listQueue,
);
damageClaimRouter.put(
  '/:id/resolve',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: damageClaimIdParamSchema, body: resolveDamageClaimBodySchema }),
  damageClaimController.resolve,
);

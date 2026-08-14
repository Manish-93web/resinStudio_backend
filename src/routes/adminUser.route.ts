import { Router } from 'express';
import * as adminUserController from '../controllers/adminUser.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import { z } from '../utils/zod';

export const adminUserRouter = Router();

adminUserRouter.use(requireAuth, requireRole('staff', 'manager', 'owner'));

adminUserRouter.get('/', adminUserController.list);
adminUserRouter.get(
  '/:id',
  validate({ params: z.object({ id: z.string() }) }),
  adminUserController.getOne,
);
adminUserRouter.put(
  '/:id/active',
  requireRole('manager', 'owner'),
  validate({ params: z.object({ id: z.string() }), body: z.object({ isActive: z.boolean() }) }),
  adminUserController.setActive,
);
adminUserRouter.patch(
  '/:id',
  requireRole('manager', 'owner'),
  validate({
    params: z.object({ id: z.string() }),
    body: z.object({
      isActive: z.boolean().optional(),
      wholesaleApproved: z.boolean().optional(),
      notes: z.string().trim().max(5000).optional(),
    }),
  }),
  adminUserController.update,
);

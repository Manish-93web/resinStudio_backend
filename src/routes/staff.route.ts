import { Router } from 'express';
import * as staffController from '../controllers/staff.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createStaffBodySchema,
  updateStaffBodySchema,
  staffIdParamSchema,
} from '../schemas/staff.schema';

export const staffRouter = Router();

staffRouter.get('/', requireAuth, requireRole('staff', 'manager', 'owner'), staffController.list);
// Creating/editing admin accounts (incl. role changes) is owner-only, per §7.8's role table.
staffRouter.post(
  '/',
  requireAuth,
  requireRole('owner'),
  validate({ body: createStaffBodySchema }),
  staffController.create,
);
staffRouter.put(
  '/:id',
  requireAuth,
  requireRole('owner'),
  validate({ params: staffIdParamSchema, body: updateStaffBodySchema }),
  staffController.update,
);

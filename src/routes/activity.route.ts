import { Router } from 'express';
import * as activityController from '../controllers/activity.controller';
import { requireAuth, requireRole } from '../middleware/auth';

export const activityRouter = Router();

activityRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  activityController.list,
);

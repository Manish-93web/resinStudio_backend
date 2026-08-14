import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { requireAuth, requireRole } from '../middleware/auth';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/stats',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  dashboardController.stats,
);

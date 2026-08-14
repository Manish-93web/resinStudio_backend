import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import { updateSettingsBodySchema } from '../schemas/settings.schema';

export const settingsRouter = Router();

// Mounted separately at /api/settings/public - no auth required. Deliberately a distinct router
// (not just an unauthenticated route inside settingsRouter) since that one is entirely mounted
// under /api/admin/settings, and a public route living under an /admin/ prefix would be
// confusing even though nothing here is actually gated by IP/network position.
export const publicSettingsRouter = Router();
publicSettingsRouter.get('/', settingsController.getPublic);

settingsRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  settingsController.get,
);
// Settings is owner-only to write, per IMPLEMENTATION_PROMPT.md §7.8's role table ("Manager:
// products/orders, no settings") - it governs store-critical values like shipping/tax rates.
settingsRouter.put(
  '/',
  requireAuth,
  requireRole('owner'),
  validate({ body: updateSettingsBodySchema }),
  settingsController.update,
);

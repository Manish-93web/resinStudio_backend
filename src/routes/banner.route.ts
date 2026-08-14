import { Router } from 'express';
import * as bannerController from '../controllers/banner.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createBannerBodySchema,
  updateBannerBodySchema,
  reorderBannersBodySchema,
  bannerIdParamSchema,
  bannerQuerySchema,
} from '../schemas/banner.schema';

// Mounted at /api/banners
export const bannerRouter = Router();
bannerRouter.get('/', validate({ query: bannerQuerySchema }), bannerController.listPublic);

// Mounted at /api/admin/banners
export const adminBannerRouter = Router();
adminBannerRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  bannerController.listAdmin,
);
adminBannerRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: createBannerBodySchema }),
  bannerController.create,
);
adminBannerRouter.put(
  '/reorder',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: reorderBannersBodySchema }),
  bannerController.reorder,
);
adminBannerRouter.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: bannerIdParamSchema, body: updateBannerBodySchema }),
  bannerController.update,
);
adminBannerRouter.delete(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: bannerIdParamSchema }),
  bannerController.remove,
);

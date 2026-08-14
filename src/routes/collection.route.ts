import { Router } from 'express';
import * as collectionController from '../controllers/collection.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createCollectionBodySchema,
  updateCollectionBodySchema,
  reorderCollectionsBodySchema,
  collectionIdParamSchema,
  collectionSlugParamSchema,
} from '../schemas/collection.schema';

// Mounted at /api/collections
export const collectionRouter = Router();
collectionRouter.get('/', collectionController.listPublic);
collectionRouter.get(
  '/:slug',
  validate({ params: collectionSlugParamSchema }),
  collectionController.getBySlug,
);

// Mounted at /api/admin/collections
export const adminCollectionRouter = Router();
adminCollectionRouter.get(
  '/',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  collectionController.listAdmin,
);
adminCollectionRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: createCollectionBodySchema }),
  collectionController.create,
);
adminCollectionRouter.put(
  '/reorder',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: reorderCollectionsBodySchema }),
  collectionController.reorder,
);
adminCollectionRouter.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: collectionIdParamSchema, body: updateCollectionBodySchema }),
  collectionController.update,
);
adminCollectionRouter.delete(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: collectionIdParamSchema }),
  collectionController.remove,
);

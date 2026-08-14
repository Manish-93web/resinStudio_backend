import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createCategoryBodySchema,
  updateCategoryBodySchema,
  categoryIdParamSchema,
} from '../schemas/category.schema';

export const categoryRouter = Router();

categoryRouter.get('/', categoryController.list);

categoryRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: createCategoryBodySchema }),
  categoryController.create,
);
categoryRouter.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: categoryIdParamSchema, body: updateCategoryBodySchema }),
  categoryController.update,
);
categoryRouter.delete(
  '/:id',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ params: categoryIdParamSchema }),
  categoryController.remove,
);

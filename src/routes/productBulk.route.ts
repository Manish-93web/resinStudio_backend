import { Router } from 'express';
import * as productBulkController from '../controllers/productBulk.controller';
import { validate } from '../middleware/validate';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  importProductsCsvBodySchema,
  bulkUpdatePriceBodySchema,
  bulkAssignCategoryBodySchema,
  bulkSetStatusBodySchema,
} from '../schemas/productBulk.schema';

// Mounted at /api/admin/products
export const adminProductBulkRouter = Router();

adminProductBulkRouter.get(
  '/export.csv',
  requireAuth,
  requireRole('staff', 'manager', 'owner'),
  productBulkController.exportCsv,
);
adminProductBulkRouter.post(
  '/import',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: importProductsCsvBodySchema }),
  productBulkController.importCsv,
);
adminProductBulkRouter.post(
  '/bulk/price',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: bulkUpdatePriceBodySchema }),
  productBulkController.bulkUpdatePrice,
);
adminProductBulkRouter.post(
  '/bulk/category',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: bulkAssignCategoryBodySchema }),
  productBulkController.bulkAssignCategory,
);
adminProductBulkRouter.post(
  '/bulk/status',
  requireAuth,
  requireRole('manager', 'owner'),
  validate({ body: bulkSetStatusBodySchema }),
  productBulkController.bulkSetStatus,
);

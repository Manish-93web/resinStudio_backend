import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as productBulkService from '../services/productBulk.service';
import { logActivity } from '../services/activityLog.service';

export const exportCsv = asyncHandler(async (_req, res) => {
  const csv = await productBulkService.exportProductsCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  res.send(csv);
});

export const importCsv = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await productBulkService.importProductsCsv(req.body.csv, req.user.id);
  await logActivity({
    actor: req.user.id,
    action: 'product.bulk_import',
    metadata: {
      created: result.created,
      updated: result.updated,
      errorCount: result.errors.length,
    },
  });
  res.json(result);
});

export const bulkUpdatePrice = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const modified = await productBulkService.bulkUpdatePrice(req.body.ids, req.body.basePrice);
  await logActivity({
    actor: req.user.id,
    action: 'product.bulk_price_update',
    metadata: { ids: req.body.ids, basePrice: req.body.basePrice, modified },
  });
  res.json({ modified });
});

export const bulkAssignCategory = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const modified = await productBulkService.bulkAssignCategory(req.body.ids, req.body.categoryId);
  await logActivity({
    actor: req.user.id,
    action: 'product.bulk_category_assign',
    metadata: { ids: req.body.ids, categoryId: req.body.categoryId, modified },
  });
  res.json({ modified });
});

export const bulkSetStatus = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const modified = await productBulkService.bulkSetStatus(req.body.ids, req.body.status);
  await logActivity({
    actor: req.user.id,
    action: 'product.bulk_status_update',
    metadata: { ids: req.body.ids, status: req.body.status, modified },
  });
  res.json({ modified });
});

export const exportOrdersCsv = asyncHandler(async (_req, res) => {
  const csv = await productBulkService.exportOrdersCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
});

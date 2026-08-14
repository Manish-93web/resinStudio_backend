import type { Request } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as productService from '../services/product.service';
import { logActivity } from '../services/activityLog.service';
import { ApiError } from '../utils/apiError';

const STAFF_ROLES = ['staff', 'manager', 'owner'];

/** Draft/archived products are only visible to admin-side roles — an ordinary logged-in
 *  customer should see exactly what a guest sees. */
function canSeeUnpublished(req: Request): boolean {
  return Boolean(req.user && STAFF_ROLES.includes(req.user.role));
}

export const list = asyncHandler(async (req, res) => {
  const { type, status, category, tag, q, minPrice, maxPrice, inStock } = req.query as Record<
    string,
    string | undefined
  >;

  const result = await productService.listProducts(req, {
    type: type as 'finished_art' | 'supply' | undefined,
    status: status as 'draft' | 'published' | 'archived' | undefined,
    category,
    tag,
    q,
    minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
    maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
    inStock: inStock === 'true',
    includeUnpublished: canSeeUnpublished(req),
  });

  res.json(result);
});

export const getBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug as string, {
    includeUnpublished: canSeeUnpublished(req),
  });
  res.json({ product });
});

export const getById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id as string);
  res.json({ product });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.createProduct(req.body);
  await logActivity({
    actor: req.user.id,
    action: 'product.create',
    targetType: 'Product',
    targetId: product.id,
  });
  res.status(201).json({ product });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.updateProduct(req.params.id as string, req.body);
  await logActivity({
    actor: req.user.id,
    action: 'product.update',
    targetType: 'Product',
    targetId: product.id,
    metadata: { fields: Object.keys(req.body) },
  });
  res.json({ product });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await productService.deleteProduct(req.params.id as string);
  await logActivity({
    actor: req.user.id,
    action: 'product.delete',
    targetType: 'Product',
    targetId: req.params.id,
  });
  res.status(204).send();
});

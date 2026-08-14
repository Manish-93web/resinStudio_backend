import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as collectionService from '../services/collection.service';
import { logActivity } from '../services/activityLog.service';

export const listPublic = asyncHandler(async (_req, res) => {
  const collections = await collectionService.listActive();
  res.json({ data: collections });
});

export const getBySlug = asyncHandler(async (req, res) => {
  const { collection, products } = await collectionService.getBySlugWithProducts(
    req.params.slug as string,
  );
  res.json({ collection, products });
});

export const listAdmin = asyncHandler(async (_req, res) => {
  const collections = await collectionService.listForAdmin();
  res.json({ data: collections });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const collection = await collectionService.createCollection(req.body);
  await logActivity({
    actor: req.user.id,
    action: 'collection.create',
    targetType: 'Collection',
    targetId: collection.id,
  });
  res.status(201).json({ collection });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const collection = await collectionService.updateCollection(req.params.id as string, req.body);
  await logActivity({
    actor: req.user.id,
    action: 'collection.update',
    targetType: 'Collection',
    targetId: collection.id,
  });
  res.json({ collection });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await collectionService.deleteCollection(req.params.id as string);
  await logActivity({
    actor: req.user.id,
    action: 'collection.delete',
    targetType: 'Collection',
    targetId: req.params.id,
  });
  res.status(204).send();
});

export const reorder = asyncHandler(async (req, res) => {
  await collectionService.reorderCollections(req.body.orderedIds);
  res.json({ ok: true });
});

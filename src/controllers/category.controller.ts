import { asyncHandler } from '../utils/asyncHandler';
import { Category } from '../models/Category';
import { ApiError } from '../utils/apiError';
import { cacheAsideVersioned, bumpCacheVersion } from '../utils/cache';

const CATEGORIES_CACHE_NAMESPACE = 'categories';
const CATEGORIES_CACHE_TTL_SECONDS = 60;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const list = asyncHandler(async (_req, res) => {
  const categories = await cacheAsideVersioned(
    CATEGORIES_CACHE_NAMESPACE,
    'all',
    CATEGORIES_CACHE_TTL_SECONDS,
    () => Category.find().sort({ order: 1, name: 1 }),
  );
  res.json({ data: categories });
});

export const create = asyncHandler(async (req, res) => {
  const slug = req.body.slug ? slugify(req.body.slug) : slugify(req.body.name);
  const category = await Category.create({ ...req.body, slug });
  await bumpCacheVersion(CATEGORIES_CACHE_NAMESPACE);
  res.status(201).json({ category });
});

export const update = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  if (req.body.slug) req.body.slug = slugify(req.body.slug);
  Object.assign(category, req.body);
  await category.save();
  await bumpCacheVersion(CATEGORIES_CACHE_NAMESPACE);
  res.json({ category });
});

export const remove = asyncHandler(async (req, res) => {
  const hasChildren = await Category.exists({ parent: req.params.id });
  if (hasChildren) throw ApiError.conflict('Reassign or delete subcategories first');

  const result = await Category.findByIdAndDelete(req.params.id);
  if (!result) throw ApiError.notFound('Category not found');
  await bumpCacheVersion(CATEGORIES_CACHE_NAMESPACE);
  res.status(204).send();
});

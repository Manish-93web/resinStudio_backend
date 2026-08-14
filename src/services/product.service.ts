import { QueryFilter } from 'mongoose';
import { Product, type ProductAttrs, type ProductDoc } from '../models/Product';
import { ApiError } from '../utils/apiError';
import { parsePagination, buildPaginatedResult, type PaginatedResult } from '../utils/pagination';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { cacheAsideVersioned, bumpCacheVersion } from '../utils/cache';
import { indexProduct, removeProductFromIndex, searchProducts } from './search.service';
import { isAlgoliaConfigured } from '../config/algolia';
import { logger } from '../config/logger';
import type { Request } from 'express';

// Cache-aside layer (§12/§17 Phase 3) over hot, read-heavy product queries - a no-op pass-through
// when REDIS_URL isn't configured (see utils/cache.ts). Short TTLs since this sits in front of
// data that changes via ordinary admin actions, not a source of truth in its own right.
const PRODUCTS_CACHE_NAMESPACE = 'products';
const LIST_CACHE_TTL_SECONDS = 60;
const SINGLE_CACHE_TTL_SECONDS = 300;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  // Small catalogs make a loop here perfectly fine; this only runs on create/rename, not on
  // every read.
  while (await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

/** Every product write invalidates the whole products cache namespace (a version bump, not a
 *  targeted per-key delete - see utils/cache.ts) and re-indexes into Algolia, fire-and-forget. */
async function afterProductWrite(product: ProductDoc): Promise<void> {
  await bumpCacheVersion(PRODUCTS_CACHE_NAMESPACE);
  indexProduct(product).catch((err) =>
    logger.error({ err, productId: product.id }, 'Failed to index product in Algolia'),
  );
}

export async function createProduct(
  input: Omit<
    ProductAttrs,
    'ratingAvg' | 'ratingCount' | 'stockAdjustments' | 'createdAt' | 'updatedAt'
  > & {
    slug?: string;
  },
): Promise<ProductDoc> {
  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title);
  const slug = await ensureUniqueSlug(baseSlug);

  const product = await Product.create({
    ...input,
    slug,
    description: sanitizeHtml(input.description),
  });
  await afterProductWrite(product);
  return product;
}

export async function updateProduct(id: string, input: Partial<ProductAttrs>): Promise<ProductDoc> {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  // Title changed without an explicit slug override: keep the existing slug stable (changing it
  // would break any links/SEO already pointing at the product) unless the caller opts in.
  if (input.slug) {
    input.slug = await ensureUniqueSlug(slugify(input.slug), id);
  }
  // Sanitized on write - this is the load-bearing XSS defense for rich text authored via Tiptap,
  // since the mobile app has no DOM to sanitize on render (§ IMPLEMENTATION_PROMPT.md risk flag).
  if (input.description !== undefined) {
    input.description = sanitizeHtml(input.description);
  }

  Object.assign(product, input);
  await product.save();
  await afterProductWrite(product);
  return product;
}

export async function deleteProduct(id: string): Promise<void> {
  const result = await Product.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Product not found');
  await bumpCacheVersion(PRODUCTS_CACHE_NAMESPACE);
  removeProductFromIndex(id).catch((err) =>
    logger.error({ err, productId: id }, 'Failed to remove product from Algolia index'),
  );
}

export async function getProductBySlug(
  slug: string,
  opts: { includeUnpublished?: boolean } = {},
): Promise<ProductDoc> {
  const cacheKey = `slug:${slug}:${opts.includeUnpublished ? 'all' : 'published'}`;
  return cacheAsideVersioned(
    PRODUCTS_CACHE_NAMESPACE,
    cacheKey,
    SINGLE_CACHE_TTL_SECONDS,
    async () => {
      const filter: QueryFilter<ProductAttrs> = { slug };
      if (!opts.includeUnpublished) filter.status = 'published';

      const product = await Product.findOne(filter).populate(
        'relatedSupplies relatedArtworks category',
      );
      if (!product) throw ApiError.notFound('Product not found');
      return product;
    },
  );
}

export async function getProductById(id: string): Promise<ProductDoc> {
  return cacheAsideVersioned(
    PRODUCTS_CACHE_NAMESPACE,
    `id:${id}`,
    SINGLE_CACHE_TTL_SECONDS,
    async () => {
      const product = await Product.findById(id);
      if (!product) throw ApiError.notFound('Product not found');
      return product;
    },
  );
}

export interface ProductListFilters {
  type?: 'finished_art' | 'supply';
  status?: 'draft' | 'published' | 'archived';
  category?: string;
  tag?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  /** Admin listings can see all statuses; storefront listings are always published-only. */
  includeUnpublished?: boolean;
}

export async function listProducts(
  req: Request,
  filters: ProductListFilters,
): Promise<PaginatedResult<ProductDoc>> {
  const pagination = parsePagination(req, '-createdAt');

  // Algolia (typo-tolerant, only when configured) serves free-text search; every other filter
  // combination (plain browse/category/price/etc.) always goes through MongoDB as before. A
  // failed/unconfigured Algolia call returns null and falls through to the $text path below.
  if (filters.q && isAlgoliaConfigured) {
    const searched = await searchProducts(filters.q, {
      page: pagination.page,
      limit: pagination.limit,
    });
    if (searched) return searched;
  }

  const cacheKey = `list:${JSON.stringify({ filters, page: pagination.page, limit: pagination.limit, sort: pagination.sort })}`;

  return cacheAsideVersioned(
    PRODUCTS_CACHE_NAMESPACE,
    cacheKey,
    LIST_CACHE_TTL_SECONDS,
    async () => {
      const filter: QueryFilter<ProductAttrs> = {};
      if (filters.includeUnpublished) {
        if (filters.status) filter.status = filters.status;
        // else: no status filter at all, so admin listings see draft/published/archived alike.
      } else {
        filter.status = 'published';
      }
      if (filters.type) filter.type = filters.type;
      if (filters.category) filter.category = filters.category;
      if (filters.tag) filter.tags = filters.tag;
      if (filters.q) filter.$text = { $search: filters.q };
      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        filter.basePrice = {};
        if (filters.minPrice !== undefined) filter.basePrice.$gte = filters.minPrice;
        if (filters.maxPrice !== undefined) filter.basePrice.$lte = filters.maxPrice;
      }
      if (filters.inStock) filter['variants.stock'] = { $gt: 0 };

      const sort =
        filters.q && pagination.sort === '-createdAt'
          ? { score: { $meta: 'textScore' } }
          : pagination.sort;
      const projection = filters.q ? { score: { $meta: 'textScore' } } : undefined;

      const [data, total] = await Promise.all([
        Product.find(filter, projection)
          .sort(sort as never)
          .skip(pagination.skip)
          .limit(pagination.limit),
        Product.countDocuments(filter),
      ]);

      return buildPaginatedResult(data, total, pagination);
    },
  );
}

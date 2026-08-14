import { algoliaClient, algoliaProductsIndexName, isAlgoliaConfigured } from '../config/algolia';
import { logger } from '../config/logger';
import { Product, type ProductDoc } from '../models/Product';
import type { PaginatedResult } from '../utils/pagination';

/** A deliberately lightweight record - just enough to search/rank/filter on. The full document
 *  is always re-fetched from MongoDB (still the source of truth) for the actual response. */
interface AlgoliaProductRecord {
  objectID: string;
  title: string;
  description: string;
  type: string;
  status: string;
  tags: string[];
  basePrice: number;
  salePrice?: number;
  featured: boolean;
}

function toRecord(product: ProductDoc): AlgoliaProductRecord {
  return {
    objectID: product.id,
    title: product.title,
    description: product.description,
    type: product.type,
    status: product.status,
    tags: product.tags,
    basePrice: product.basePrice,
    salePrice: product.salePrice,
    featured: product.featured,
  };
}

/** Fire-and-forget by design (called from product.service.ts's create/update) - an indexing
 *  failure should never fail the product write itself, mirroring notification.service.ts's and
 *  activityLog.service.ts's fire-and-forget conventions. No-op when Algolia isn't configured. */
export async function indexProduct(product: ProductDoc): Promise<void> {
  if (!isAlgoliaConfigured || !algoliaClient) return;
  await algoliaClient.saveObject({ indexName: algoliaProductsIndexName, body: toRecord(product) });
}

export async function removeProductFromIndex(productId: string): Promise<void> {
  if (!isAlgoliaConfigured || !algoliaClient) return;
  await algoliaClient.deleteObject({ indexName: algoliaProductsIndexName, objectID: productId });
}

/**
 * Typo-tolerant catalog search via Algolia - used by product.service.ts#listProducts only when
 * `filters.q` is set AND Algolia is configured. Returns null on any failure (not configured, or a
 * live API error) so the caller falls back to the existing MongoDB `$text` search path, which is
 * left completely untouched otherwise.
 */
export async function searchProducts(
  query: string,
  opts: { page: number; limit: number },
): Promise<PaginatedResult<ProductDoc> | null> {
  if (!isAlgoliaConfigured || !algoliaClient) return null;

  try {
    const result = await algoliaClient.searchSingleIndex<AlgoliaProductRecord>({
      indexName: algoliaProductsIndexName,
      searchParams: {
        query,
        page: Math.max(0, opts.page - 1), // Algolia pages are 0-indexed
        hitsPerPage: opts.limit,
      },
    });

    const orderedIds = result.hits.map((hit) => hit.objectID);
    const total = result.nbHits ?? orderedIds.length;
    const totalPages = Math.max(1, Math.ceil(total / opts.limit));

    if (orderedIds.length === 0) {
      return { data: [], total, page: opts.page, totalPages };
    }

    // Re-fetch full documents from MongoDB (Algolia's copy is intentionally partial) and restore
    // Algolia's relevance ranking, since Mongo's $in doesn't preserve input order.
    const products = await Product.find({ _id: { $in: orderedIds } });
    const productById = new Map(products.map((p) => [p.id, p]));
    const data = orderedIds
      .map((id) => productById.get(id))
      .filter((p): p is ProductDoc => Boolean(p));

    return { data, total, page: opts.page, totalPages };
  } catch (err) {
    logger.error({ err, query }, 'Algolia search failed — falling back to MongoDB $text search');
    return null;
  }
}

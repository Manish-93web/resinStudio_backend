import { Product, PRODUCT_STATUSES, type ProductStatus } from '../models/Product';
import { Category } from '../models/Category';
import { Order } from '../models/Order';
import { buildCsv, parseCsvToObjects } from '../utils/csv';
import { ApiError } from '../utils/apiError';
import type { Types } from 'mongoose';

const CSV_HEADER = [
  'slug',
  'title',
  'type',
  'description',
  'category',
  'tags',
  'basePrice',
  'salePrice',
  'costPrice',
  'status',
  'isUnique',
  'countryOfOrigin',
  'sku',
  'variantPrice',
  'variantStock',
  'variantColor',
  'variantSize',
  'variantVolume',
];

/** One row per variant, product-level fields repeated - the same shape used by CSV bulk-editing
 *  tools admins are already familiar with (Shopify et al.), and what makes round-trip
 *  export-edit-import of variant pricing/stock possible without a spreadsheet-unfriendly nested
 *  JSON cell. */
export async function exportProductsCsv(): Promise<string> {
  const products = await Product.find()
    .populate<{ category: { slug: string }[] }>('category', 'slug')
    .sort('title');

  const rows: unknown[][] = [];
  for (const product of products) {
    const categorySlugs = product.category.map((c) => c.slug).join(';');
    const tags = product.tags.join(';');
    for (const variant of product.variants) {
      rows.push([
        product.slug,
        product.title,
        product.type,
        product.description,
        categorySlugs,
        tags,
        product.basePrice,
        product.salePrice ?? '',
        product.costPrice ?? '',
        product.status,
        product.isUnique,
        product.countryOfOrigin,
        variant.sku,
        variant.price,
        variant.stock,
        variant.options.color ?? '',
        variant.options.size ?? '',
        variant.options.volume ?? '',
      ]);
    }
  }

  return buildCsv(CSV_HEADER, rows);
}

export interface CsvImportResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Rows sharing the same `slug` are grouped into one product with all of that group's rows as its
 * variants - an existing product's slug updates in place (variants fully replaced by the CSV's
 * rows for that slug, matching how a re-export/re-import round trip is expected to behave); a new
 * slug creates a fresh product. Unknown category slugs are skipped with a warning rather than
 * failing the whole import, since a typo in one row shouldn't block every other row.
 */
export async function importProductsCsv(
  csvText: string,
  actorId: string,
): Promise<CsvImportResult> {
  const objects = parseCsvToObjects(csvText);
  const result: CsvImportResult = { created: 0, updated: 0, errors: [] };

  const grouped = new Map<string, Record<string, string>[]>();
  for (const row of objects) {
    const slug = row.slug?.trim();
    if (!slug) {
      result.errors.push('Row missing a slug — skipped');
      continue;
    }
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug)!.push(row);
  }

  const allCategorySlugs = [
    ...new Set(objects.flatMap((r) => (r.category ?? '').split(';').filter(Boolean))),
  ];
  const categories = await Category.find({ slug: { $in: allCategorySlugs } });
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c._id]));

  for (const [slug, rows] of grouped) {
    try {
      const first = rows[0]!;
      const categorySlugs = (first.category ?? '').split(';').filter(Boolean);
      const unknownCategories = categorySlugs.filter((s) => !categoryBySlug.has(s));
      if (unknownCategories.length > 0) {
        result.errors.push(
          `${slug}: unknown category slug(s) ${unknownCategories.join(', ')} — skipped for those`,
        );
      }

      const variants = rows.map((row) => ({
        sku: row.sku?.trim() || `${slug}-${rows.indexOf(row) + 1}`,
        price: Number(row.variantPrice) || 0,
        stock: Number(row.variantStock) || 0,
        options: {
          color: row.variantColor || undefined,
          size: row.variantSize || undefined,
          volume: row.variantVolume || undefined,
        },
        images: [] as string[],
      }));

      const payload = {
        title: first.title?.trim() || slug,
        description: first.description ?? '',
        type: (first.type === 'supply' ? 'supply' : 'finished_art') as 'finished_art' | 'supply',
        category: categorySlugs
          .map((s) => categoryBySlug.get(s))
          .filter(Boolean) as Types.ObjectId[],
        tags: (first.tags ?? '').split(';').filter(Boolean),
        basePrice: Number(first.basePrice) || 0,
        salePrice: first.salePrice ? Number(first.salePrice) : undefined,
        costPrice: first.costPrice ? Number(first.costPrice) : undefined,
        status: (PRODUCT_STATUSES as readonly string[]).includes(first.status ?? '')
          ? (first.status as ProductStatus)
          : 'draft',
        isUnique: first.isUnique === 'true',
        countryOfOrigin: first.countryOfOrigin || 'India',
        variants,
      };

      // Direct model access (bypassing product.service's createProduct/updateProduct) is
      // deliberate here: this is an upsert-by-slug, so the collision-suffixing slug logic those
      // helpers apply on every create/rename would be actively wrong for a re-import of the same
      // slug. Matches the same direct-Product.create precedent scripts/seed.ts already uses.
      const existing = await Product.findOne({ slug });
      if (existing) {
        existing.set(payload);
        await existing.save();
        result.updated += 1;
      } else {
        await Product.create({
          ...payload,
          slug,
          images: [],
          currency: 'INR',
          relatedSupplies: [],
          relatedArtworks: [],
          dropAt: null,
          productionTimeDays: null,
          shippingConstraints: { groundOnly: false, heatSensitive: false },
          seo: {},
        });
        result.created += 1;
      }
    } catch (err) {
      result.errors.push(`${slug}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  void actorId; // caller-side activity log covers the import action itself
  return result;
}

export async function bulkUpdatePrice(ids: string[], basePrice: number): Promise<number> {
  const result = await Product.updateMany({ _id: { $in: ids } }, { basePrice });
  return result.modifiedCount;
}

export async function bulkAssignCategory(ids: string[], categoryId: string): Promise<number> {
  const category = await Category.findById(categoryId);
  if (!category) throw ApiError.notFound('Category not found');
  const result = await Product.updateMany(
    { _id: { $in: ids } },
    { $addToSet: { category: categoryId } },
  );
  return result.modifiedCount;
}

export async function bulkSetStatus(ids: string[], status: ProductStatus): Promise<number> {
  const result = await Product.updateMany({ _id: { $in: ids } }, { status });
  return result.modifiedCount;
}

export async function exportOrdersCsv(): Promise<string> {
  const orders = await Order.find()
    .populate<{ user: { email: string } | null }>('user', 'email')
    .sort('-createdAt');

  const header = [
    'orderNumber',
    'date',
    'customerEmail',
    'status',
    'paymentMethod',
    'paymentStatus',
    'itemCount',
    'subtotal',
    'discount',
    'shipping',
    'tax',
    'total',
  ];
  const rows = orders.map((order) => [
    order.orderNumber,
    order.createdAt.toISOString(),
    order.user?.email ?? order.guestEmail ?? '',
    order.status,
    order.paymentMethod,
    order.paymentStatus,
    order.items.length,
    order.subtotal,
    order.discount,
    order.shipping,
    order.tax,
    order.total,
  ]);

  return buildCsv(header, rows);
}

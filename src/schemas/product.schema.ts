import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().default(''),
  order: z.number().int().default(0),
});

const productVariantSchema = z.object({
  sku: z.string().trim().min(1),
  options: z
    .object({
      color: z.string().optional(),
      size: z.string().optional(),
      volume: z.string().optional(),
    })
    .default({}),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  images: z.array(z.string().url()).default([]),
});

// `.optional()` rather than `.default(...)` throughout this file, deliberately: `.partial()`
// (used below for updateProductBodySchema) does NOT suppress a field's `.default(...)` when the
// caller omits that key - Zod still materializes the default into the parsed output, which then
// silently overwrites the existing document via `Object.assign(product, input)` in
// product.service.ts#updateProduct. A partial edit that only sends `{ basePrice }` would otherwise
// reset status→'draft', isUnique→false, tags/category/images→[], etc. Create-time defaulting is
// unaffected: Product's own Mongoose schema already declares the equivalent default for every one
// of these fields, so an absent key is filled in exactly the same way at `Product.create()`.
const specsSchema = z
  .object({
    volume: z.string().optional(),
    mixRatio: z.string().optional(),
    cureTime: z.string().optional(),
    shelfLife: z.string().optional(),
    safetyInfo: z.string().optional(),
    dimensions: z.string().optional(),
    weight: z.string().optional(),
    materials: z.string().optional(),
    careInstructions: z.string().optional(),
  })
  .optional();

const shippingConstraintsSchema = z
  .object({
    groundOnly: z.boolean().optional(),
    heatSensitive: z.boolean().optional(),
    maxPackageVolumeMl: z.number().positive().optional(),
  })
  .optional();

const seoSchema = z
  .object({
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
  })
  .optional();

export const createProductBodySchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().min(1),
    type: z.enum(['finished_art', 'supply']),
    category: z.array(objectIdSchema).optional(),
    tags: z.array(z.string().trim()).optional(),
    images: z.array(productImageSchema).optional(),
    basePrice: z.number().nonnegative(),
    salePrice: z.number().nonnegative().optional(),
    costPrice: z.number().nonnegative().optional(),
    currency: z.string().optional(),
    variants: z.array(productVariantSchema).min(1, 'At least one variant is required'),
    specs: specsSchema,
    relatedSupplies: z.array(objectIdSchema).optional(),
    relatedArtworks: z.array(objectIdSchema).optional(),
    countryOfOrigin: z.string().trim().min(1).optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    isUnique: z.boolean().optional(),
    dropAt: z.coerce.date().optional().nullable(),
    productionTimeDays: z.number().int().positive().optional().nullable(),
    shippingConstraints: shippingConstraintsSchema,
    seo: seoSchema,
    lowStockThreshold: z.number().int().nonnegative().optional(),
    backorderAllowed: z.boolean().optional(),
    taxClass: z.enum(['standard', 'exempt']).optional(),
    weightGrams: z.number().nonnegative().optional(),
    model3dUrl: z.string().url().optional(),
    wholesalePrice: z.number().nonnegative().optional(),
    wholesaleMinQty: z.number().int().positive().optional(),
    featured: z.boolean().optional(),
  })
  .openapi('CreateProductRequest');

export const updateProductBodySchema = createProductBodySchema
  .partial()
  .openapi('UpdateProductRequest');

export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  type: z.enum(['finished_art', 'supply']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  category: objectIdSchema.optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: z.coerce.boolean().optional(),
});

export const idParamSchema = z.object({ id: objectIdSchema });
export const slugParamSchema = z.object({ slug: z.string().trim().toLowerCase() });

export const stockAdjustmentBodySchema = z
  .object({
    sku: z.string().trim().min(1),
    // Positive to add stock (e.g. restock), negative to remove it (e.g. damage/loss found during
    // a physical count) - zero is rejected below since it wouldn't be an adjustment at all.
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, 'delta must not be 0'),
    reason: z.string().trim().min(1).max(500),
  })
  .openapi('StockAdjustmentRequest');

export const uploadSignatureQuerySchema = z.object({
  folder: z
    .enum(['products', 'reviews', 'damage-claims', 'commissions', 'banners', 'blog'])
    .default('products'),
});

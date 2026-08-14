import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const seoSchema = z
  .object({
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
  })
  .optional();

// `.optional()` rather than `.default(...)`: `.partial()` (updateCollectionBodySchema below)
// does not suppress a field's default when the key is omitted, so a `.default([])` here would
// silently wipe an existing collection's `products` array on any partial edit that doesn't touch
// it (Object.assign(collection, input) in collection.service.ts#updateCollection). Create-time
// defaulting still works: the Collection Mongoose schema declares the equivalent default itself.
export const createCollectionBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    description: z.string().trim().optional(),
    image: z.string().url().optional(),
    products: z.array(objectIdSchema).optional(),
    ruleTag: z.string().trim().toLowerCase().optional(),
    order: z.number().int().optional(),
    active: z.boolean().optional(),
    seo: seoSchema,
  })
  .openapi('CreateCollectionRequest');

export const updateCollectionBodySchema = createCollectionBodySchema
  .partial()
  .openapi('UpdateCollectionRequest');

export const reorderCollectionsBodySchema = z
  .object({ orderedIds: z.array(objectIdSchema).min(1) })
  .openapi('ReorderCollectionsRequest');

export const collectionIdParamSchema = z.object({ id: objectIdSchema });
export const collectionSlugParamSchema = z.object({ slug: z.string().trim().toLowerCase() });

import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    parent: objectIdSchema.optional().nullable(),
    image: z.string().url().optional(),
    order: z.number().int().optional(),
    seo: z
      .object({
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
      })
      .optional(),
  })
  .openapi('CreateCategoryRequest');

export const updateCategoryBodySchema = createCategoryBodySchema.partial();

export const categoryIdParamSchema = z.object({ id: objectIdSchema });

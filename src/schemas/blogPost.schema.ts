import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const seoSchema = z
  .object({
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
  })
  .optional();

// `.optional()` rather than `.default(...)`: `.partial()` (updateBlogPostBodySchema below) does
// not suppress a field's default when the key is omitted, so a `.default([])`/`.default('draft')`
// here would silently wipe `tags`/`linkedProducts` or reset a published post back to draft on any
// partial edit that doesn't touch that field (Object.assign(post, input) in
// blogPost.service.ts#updateBlogPost). Create-time defaulting still works: the BlogPost Mongoose
// schema declares the equivalent default itself.
export const createBlogPostBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    excerpt: z.string().trim().max(500).optional(),
    content: z.string().min(1),
    coverImage: z.string().url().optional(),
    tags: z.array(z.string().trim()).optional(),
    linkedProducts: z.array(objectIdSchema).optional(),
    status: z.enum(['draft', 'published']).optional(),
    publishedAt: z.coerce.date().optional().nullable(),
    seo: seoSchema,
  })
  .openapi('CreateBlogPostRequest');

export const updateBlogPostBodySchema = createBlogPostBodySchema
  .partial()
  .openapi('UpdateBlogPostRequest');

export const blogPostIdParamSchema = z.object({ id: objectIdSchema });
export const blogPostSlugParamSchema = z.object({ slug: z.string().trim().toLowerCase() });

export const blogPostQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.string().optional(),
  tag: z.string().optional(),
});

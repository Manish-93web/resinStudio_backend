import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// `.optional()` rather than `.default(...)` for order/active: `.partial()`
// (updateBannerBodySchema below) does not suppress a field's default when the key is omitted, so
// a partial edit that only changes e.g. `title` would otherwise silently reset `active`→true and
// `order`→0 via `Banner.findByIdAndUpdate(id, input)` in banner.service.ts#updateBanner.
// Create-time defaulting still works: the Banner Mongoose schema declares the same defaults.
export const createBannerBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    image: z.string().url(),
    link: z.string().trim().optional(),
    placement: z.enum(['hero', 'promo_strip', 'collection_block']),
    order: z.number().int().optional(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    active: z.boolean().optional(),
  })
  .openapi('CreateBannerRequest');

export const updateBannerBodySchema = createBannerBodySchema
  .partial()
  .openapi('UpdateBannerRequest');

export const reorderBannersBodySchema = z
  .object({ orderedIds: z.array(objectIdSchema).min(1) })
  .openapi('ReorderBannersRequest');

export const bannerIdParamSchema = z.object({ id: objectIdSchema });

export const bannerQuerySchema = z.object({
  placement: z.enum(['hero', 'promo_strip', 'collection_block']).optional(),
});

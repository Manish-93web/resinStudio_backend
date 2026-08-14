import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createReviewBodySchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
    images: z.array(z.string().url()).max(6).optional(),
  })
  .openapi('CreateReviewRequest');

export const updateReviewBodySchema = createReviewBodySchema
  .partial()
  .openapi('UpdateReviewRequest');

export const moderateReviewBodySchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    replyText: z.string().trim().min(1).max(2000).optional(),
  })
  .openapi('ModerateReviewRequest');

export const reviewListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const productIdParamSchema = z.object({ productId: objectIdSchema });
export const reviewIdParamSchema = z.object({ id: objectIdSchema });

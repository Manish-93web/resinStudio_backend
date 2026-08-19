import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const submitDamageClaimBodySchema = z
  .object({
    productId: objectIdSchema,
    photos: z.array(z.string().url()).min(1, 'At least one photo is required').max(8),
    videoUrl: z.string().url().optional(),
    description: z.string().trim().min(1).max(2000),
  })
  .openapi('SubmitDamageClaimRequest');

export const resolveDamageClaimBodySchema = z
  .object({
    status: z.enum(['approved_replacement', 'approved_refund', 'rejected']),
    resolutionNote: z.string().trim().min(1).max(2000).optional(),
  })
  .openapi('ResolveDamageClaimRequest');

export const damageClaimListQuerySchema = z.object({
  status: z.enum(['pending', 'approved_replacement', 'approved_refund', 'rejected']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const damageClaimIdParamSchema = z.object({ id: objectIdSchema });

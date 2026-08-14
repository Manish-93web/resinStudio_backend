import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const joinWaitlistBodySchema = z
  .object({
    productId: objectIdSchema,
    email: z.string().trim().toLowerCase().email(),
    kind: z.enum(['back_in_stock', 'drop_notify']),
  })
  .openapi('JoinWaitlistRequest');

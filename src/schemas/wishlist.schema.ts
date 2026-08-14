import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const wishlistProductParamSchema = z.object({ productId: objectIdSchema });

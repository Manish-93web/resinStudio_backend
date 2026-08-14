import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const importProductsCsvBodySchema = z
  .object({ csv: z.string().min(1) })
  .openapi('ImportProductsCsvRequest');

export const bulkUpdatePriceBodySchema = z
  .object({ ids: z.array(objectIdSchema).min(1), basePrice: z.number().nonnegative() })
  .openapi('BulkUpdatePriceRequest');

export const bulkAssignCategoryBodySchema = z
  .object({ ids: z.array(objectIdSchema).min(1), categoryId: objectIdSchema })
  .openapi('BulkAssignCategoryRequest');

export const bulkSetStatusBodySchema = z
  .object({
    ids: z.array(objectIdSchema).min(1),
    status: z.enum(['draft', 'published', 'archived']),
  })
  .openapi('BulkSetStatusRequest');

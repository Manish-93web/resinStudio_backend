import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createStaffBodySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72),
    role: z.enum(['staff', 'manager', 'owner']),
  })
  .openapi('CreateStaffRequest');

export const updateStaffBodySchema = z
  .object({
    role: z.enum(['staff', 'manager', 'owner']).optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateStaffRequest');

export const staffIdParamSchema = z.object({ id: objectIdSchema });

import { z } from '../utils/zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createCommissionBodySchema = z
  .object({
    contactEmail: z.string().trim().toLowerCase().email(),
    contactPhone: z.string().trim().min(6).optional(),
    description: z.string().trim().min(1).max(4000),
    referenceImages: z.array(z.string().url()).max(8).optional(),
    dimensions: z.string().trim().max(200).optional(),
    colorNotes: z.string().trim().max(500).optional(),
    budgetRange: z.string().trim().max(100).optional(),
    neededBy: z.coerce.date().optional(),
  })
  .openapi('CreateCommissionRequest');

export const quoteCommissionBodySchema = z
  .object({
    price: z.number().positive(),
    productionTimeDays: z.number().int().positive(),
    note: z.string().trim().max(1000).optional(),
  })
  .openapi('QuoteCommissionRequest');

export const declineCommissionBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .openapi('DeclineCommissionRequest');

export const commissionStatusUpdateBodySchema = z
  .object({
    status: z.enum(['in_production', 'ready']),
    note: z.string().trim().max(1000).optional(),
  })
  .openapi('CommissionStatusUpdateRequest');

export const payCommissionBodySchema = z
  .object({
    shippingAddress: z.object({
      line1: z.string().trim().min(1),
      line2: z.string().trim().optional(),
      city: z.string().trim().min(1),
      state: z.string().trim().min(1),
      pincode: z.string().trim().min(4).max(10),
      country: z.string().trim().optional(),
      phone: z.string().trim().min(6),
    }),
    paymentMethod: z.enum(['cod']),
  })
  .openapi('PayCommissionRequest');

export const commissionListQuerySchema = z.object({
  status: z
    .enum([
      'requested',
      'quoted',
      'deposit_paid',
      'in_production',
      'ready',
      'balance_paid',
      'shipped',
      'declined',
    ])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const commissionIdParamSchema = z.object({ id: objectIdSchema });

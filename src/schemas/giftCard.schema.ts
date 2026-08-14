import { z } from '../utils/zod';

const addressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  pincode: z.string().trim().min(4).max(10),
  country: z.string().trim().optional(),
  phone: z.string().trim().min(6),
});

export const purchaseGiftCardBodySchema = z
  .object({
    amount: z.number().positive().max(50000),
    recipientEmail: z.string().trim().toLowerCase().email(),
    purchaserEmail: z.string().trim().toLowerCase().email().optional(),
    message: z.string().trim().max(500).optional(),
    shippingAddress: addressSchema,
  })
  .openapi('PurchaseGiftCardRequest');

export const issueGiftCardBodySchema = z
  .object({
    amount: z.number().positive().max(50000),
    recipientEmail: z.string().trim().toLowerCase().email(),
    expiresAt: z.coerce.date().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .openapi('IssueGiftCardRequest');

export const giftCardCodeParamSchema = z.object({ code: z.string().trim().min(1) });

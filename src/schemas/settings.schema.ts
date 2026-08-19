import { z } from '../utils/zod';

const notificationTemplateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
});

const weightTierSchema = z.object({
  maxGrams: z.number().nonnegative(),
  rate: z.number().nonnegative(),
});

export const updateSettingsBodySchema = z
  .object({
    storeName: z.string().trim().min(1).max(200).optional(),
    supportEmail: z.string().trim().toLowerCase().email().optional(),
    supportPhone: z.string().trim().max(20).optional(),
    gstin: z.string().trim().max(20).optional(),
    socialLinks: z
      .object({
        instagram: z.string().trim().max(300).optional(),
        facebook: z.string().trim().max(300).optional(),
        pinterest: z.string().trim().max(300).optional(),
        youtube: z.string().trim().max(300).optional(),
      })
      .optional(),
    shipping: z
      .object({
        flatRate: z.number().nonnegative(),
        freeShippingThreshold: z.number().nonnegative(),
        weightTiers: z.array(weightTierSchema).optional(),
        internationalRate: z.number().nonnegative().optional(),
        internationalFreeShippingThreshold: z.number().nonnegative().optional(),
        expressRate: z.number().nonnegative().optional(),
      })
      .optional(),
    prepaidDiscountPercent: z.number().min(0).max(100).optional(),
    taxRatePercent: z.number().min(0).max(100).optional(),
    commissionDepositPercent: z.number().min(1).max(100).optional(),
    notificationTemplates: z
      .object({
        orderStatusChanged: notificationTemplateSchema.optional(),
        passwordReset: notificationTemplateSchema.optional(),
        giftCardPurchase: notificationTemplateSchema.optional(),
        commissionQuoteReady: notificationTemplateSchema.optional(),
      })
      .optional(),
    loyalty: z
      .object({
        pointsPerRupee: z.number().nonnegative().optional(),
        redemptionRate: z.number().nonnegative().optional(),
      })
      .optional(),
    referral: z
      .object({
        bonusPoints: z.number().nonnegative().optional(),
      })
      .optional(),
    wholesale: z
      .object({
        minQtyDefault: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .openapi('UpdateSettingsRequest');

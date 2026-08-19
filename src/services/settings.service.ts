import { Settings, type SettingsDoc } from '../models/Settings';

/**
 * Settings is a singleton - always operate on the first (and only) document, creating it with
 * schema defaults on first access rather than requiring a separate seed/migration step.
 */
export async function getSettings(): Promise<SettingsDoc> {
  const existing = await Settings.findOne();
  if (existing) return existing;
  return Settings.create({});
}

export async function updateSettings(
  patch: Partial<{
    storeName: string;
    supportEmail: string;
    supportPhone: string;
    gstin: string;
    socialLinks: { instagram?: string; facebook?: string; pinterest?: string; youtube?: string };
    shipping: {
      flatRate: number;
      freeShippingThreshold: number;
      weightTiers?: { maxGrams: number; rate: number }[];
      internationalRate?: number;
      internationalFreeShippingThreshold?: number;
      expressRate?: number;
    };
    prepaidDiscountPercent: number;
    taxRatePercent: number;
    commissionDepositPercent: number;
    notificationTemplates: {
      orderStatusChanged?: { subject: string; body: string };
      passwordReset?: { subject: string; body: string };
      giftCardPurchase?: { subject: string; body: string };
      commissionQuoteReady?: { subject: string; body: string };
    };
    loyalty: { pointsPerRupee?: number; redemptionRate?: number };
    referral: { bonusPoints?: number };
    wholesale: { minQtyDefault?: number };
  }>,
  actorId: string,
): Promise<SettingsDoc> {
  const settings = await getSettings();

  // Nested objects (shipping/notificationTemplates/loyalty/referral/wholesale) are merged
  // field-by-field onto the existing subdocument, not wholesale-replaced via a top-level
  // Object.assign - several of their fields (e.g. shipping.internationalRate) are `required` on
  // the schema with their own default, and a caller reasonably sends a *partial* update (e.g.
  // just `{ flatRate, freeShippingThreshold }`, mirroring existing callers). A shallow top-level
  // Object.assign would replace the whole subdocument with that partial object, dropping the
  // fields it omitted and failing schema validation on save.
  const { shipping, notificationTemplates, loyalty, referral, wholesale, socialLinks, ...rest } =
    patch;
  Object.assign(settings, rest);

  if (socialLinks) Object.assign(settings.socialLinks, socialLinks);
  if (shipping) Object.assign(settings.shipping, shipping);
  if (notificationTemplates) {
    if (notificationTemplates.orderStatusChanged) {
      Object.assign(
        settings.notificationTemplates.orderStatusChanged,
        notificationTemplates.orderStatusChanged,
      );
    }
    if (notificationTemplates.passwordReset) {
      Object.assign(
        settings.notificationTemplates.passwordReset,
        notificationTemplates.passwordReset,
      );
    }
    if (notificationTemplates.giftCardPurchase) {
      Object.assign(
        settings.notificationTemplates.giftCardPurchase,
        notificationTemplates.giftCardPurchase,
      );
    }
    if (notificationTemplates.commissionQuoteReady) {
      Object.assign(
        settings.notificationTemplates.commissionQuoteReady,
        notificationTemplates.commissionQuoteReady,
      );
    }
  }
  if (loyalty) Object.assign(settings.loyalty, loyalty);
  if (referral) Object.assign(settings.referral, referral);
  if (wholesale) Object.assign(settings.wholesale, wholesale);

  settings.updatedBy = actorId as unknown as SettingsDoc['updatedBy'];
  await settings.save();
  return settings;
}

/** Substitutes {{orderNumber}}/{{status}}/{{note}} placeholders in a stored template. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

/** The safe-to-expose subset for public/customer-facing surfaces (invoice header, contact page,
 *  footer) - deliberately excludes shipping/tax rates and email template internals. */
export async function getPublicSettings(): Promise<{
  storeName: string;
  supportEmail: string;
  supportPhone?: string;
  gstin?: string;
  socialLinks: { instagram?: string; facebook?: string; pinterest?: string; youtube?: string };
  prepaidDiscountPercent: number;
  expressShippingRate: number;
}> {
  const settings = await getSettings();
  return {
    storeName: settings.storeName,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    gstin: settings.gstin,
    socialLinks: settings.socialLinks,
    // Exposed publicly (unlike the rest of `shipping`, which stays server-side-only so the actual
    // rate isn't shown pre-order) because checkout needs to advertise "save X% online" and the
    // express surcharge amount before a guest has authenticated or placed anything.
    prepaidDiscountPercent: settings.prepaidDiscountPercent,
    expressShippingRate: settings.shipping.expressRate,
  };
}

import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface NotificationTemplate {
  subject: string;
  body: string;
}

export interface WeightShippingTier {
  maxGrams: number;
  rate: number;
}

export interface SettingsAttrs {
  storeName: string;
  supportEmail: string;
  supportPhone?: string;
  gstin?: string;
  // Each optional independently - the storefront footer/homepage only render an icon for a
  // platform once its URL is set here (same disclosed-gap gating as every other integration).
  socialLinks: {
    instagram?: string;
    facebook?: string;
    pinterest?: string;
    youtube?: string;
  };
  shipping: {
    flatRate: number;
    freeShippingThreshold: number;
    // Weight-banded domestic shipping rate table (ascending by maxGrams) - see
    // order.service.ts#createOrderFromCart. The flat-rate fields above stay as the
    // free-shipping-threshold check; weightTiers is consulted only once that check fails.
    weightTiers: Types.DocumentArray<WeightShippingTier>;
    internationalRate: number;
    // Undefined means international shipping is never free.
    internationalFreeShippingThreshold?: number;
  };
  taxRatePercent: number;
  // Configurable deposit percentage charged upfront when a commission quote is accepted (§6.8) -
  // the balance is charged before shipping.
  commissionDepositPercent: number;
  // {{orderNumber}}/{{status}}/{{note}} (and per-template placeholders noted below), substituted
  // at send time - see notification.service.ts's renderTemplate().
  notificationTemplates: {
    orderStatusChanged: NotificationTemplate;
    // vars: resetUrl
    passwordReset: NotificationTemplate;
    // vars: code, amount
    giftCardPurchase: NotificationTemplate;
    // vars: commissionTitle, depositAmount
    commissionQuoteReady: NotificationTemplate;
  };
  // Customers earn loyalty.pointsPerRupee points per ₹1 spent on delivered orders; redeeming 1
  // point knocks loyalty.redemptionRate off the order total (§17 Phase 3).
  loyalty: {
    pointsPerRupee: number;
    redemptionRate: number;
  };
  // Points credited to the referrer once their referred user's first order reaches 'delivered'.
  referral: {
    bonusPoints: number;
  };
  // Purely an admin-UI default suggestion - actual wholesale gating is per-product via
  // Product.wholesaleMinQty, not enforced from here.
  wholesale: {
    minQtyDefault: number;
  };
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const notificationTemplateSchema = new Schema<NotificationTemplate>(
  {
    subject: { type: String, required: true },
    body: { type: String, required: true },
  },
  { _id: false },
);

const weightShippingTierSchema = new Schema<WeightShippingTier>(
  {
    maxGrams: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const DEFAULT_WEIGHT_TIERS: WeightShippingTier[] = [
  { maxGrams: 500, rate: 60 },
  { maxGrams: 1000, rate: 99 },
  { maxGrams: 2000, rate: 149 },
  { maxGrams: 5000, rate: 249 },
];

const settingsSchema = new Schema<SettingsAttrs>(
  {
    storeName: { type: String, required: true, default: 'Resin by Richa' },
    supportEmail: { type: String, required: true, default: 'hello@resinstudio.example' },
    supportPhone: { type: String },
    gstin: { type: String },
    socialLinks: {
      instagram: { type: String },
      facebook: { type: String },
      pinterest: { type: String },
      youtube: { type: String },
    },
    shipping: {
      flatRate: { type: Number, required: true, default: 99, min: 0 },
      freeShippingThreshold: { type: Number, required: true, default: 999, min: 0 },
      // A fresh shallow copy per document, never the shared module-level array itself - Mongoose
      // casts a `default` array into that document's own DocumentArray, but returning the same
      // literal array/object references from every call is a latent shared-mutable-state hazard
      // best avoided on principle even if today's Mongoose version happens to clone defensively.
      weightTiers: {
        type: [weightShippingTierSchema],
        default: () => DEFAULT_WEIGHT_TIERS.map((tier) => ({ ...tier })),
      },
      internationalRate: { type: Number, required: true, default: 999, min: 0 },
      internationalFreeShippingThreshold: { type: Number, min: 0 },
    },
    taxRatePercent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    commissionDepositPercent: { type: Number, required: true, default: 50, min: 1, max: 100 },
    notificationTemplates: {
      orderStatusChanged: {
        type: notificationTemplateSchema,
        default: () => ({
          subject: 'Order {{orderNumber}} update: {{status}}',
          body: 'Your order status is now: {{status}}{{note}}',
        }),
      },
      passwordReset: {
        type: notificationTemplateSchema,
        default: () => ({
          subject: 'Reset your Resin by Richa password',
          body: 'Reset your password: {{resetUrl}} (expires in 1 hour)',
        }),
      },
      giftCardPurchase: {
        type: notificationTemplateSchema,
        default: () => ({
          subject: "You've received a Resin by Richa gift card!",
          body: 'Gift card code: {{code}}\nValue: {{amount}}\nRedeem it at checkout.',
        }),
      },
      commissionQuoteReady: {
        type: notificationTemplateSchema,
        default: () => ({
          subject: 'Your custom order quote is ready',
          body:
            'Your commission "{{commissionTitle}}" has been quoted. ' +
            'A deposit of {{depositAmount}} is due to begin production.',
        }),
      },
    },
    loyalty: {
      pointsPerRupee: { type: Number, required: true, default: 1, min: 0 },
      redemptionRate: { type: Number, required: true, default: 0.25, min: 0 },
    },
    referral: {
      bonusPoints: { type: Number, required: true, default: 100, min: 0 },
    },
    wholesale: {
      minQtyDefault: { type: Number, required: true, default: 10, min: 1 },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type SettingsDoc = HydratedDocument<SettingsAttrs>;

export const Settings = model<SettingsAttrs>('Settings', settingsSchema);

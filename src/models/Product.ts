import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const PRODUCT_TYPES = ['finished_art', 'supply'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface ProductImage {
  url: string;
  alt: string;
  order: number;
}

export interface ProductVariant {
  sku: string;
  options: { color?: string; size?: string; volume?: string };
  price: number;
  stock: number;
  images: string[];
}

export interface StockAdjustment {
  sku: string;
  delta: number;
  reason: string;
  by: Types.ObjectId;
  at: Date;
}

export interface ProductAttrs {
  title: string;
  slug: string;
  description: string;
  type: ProductType;
  category: Types.ObjectId[];
  tags: string[];
  images: ProductImage[];
  basePrice: number;
  salePrice?: number;
  costPrice?: number;
  currency: string;
  variants: Types.DocumentArray<ProductVariant>;
  specs: {
    // supply-only
    volume?: string;
    mixRatio?: string;
    cureTime?: string;
    shelfLife?: string;
    safetyInfo?: string;
    // finished_art-only
    dimensions?: string;
    weight?: string;
    materials?: string;
    careInstructions?: string;
  };
  relatedSupplies: Types.ObjectId[];
  relatedArtworks: Types.ObjectId[];
  // Required disclosure under India's Consumer Protection (E-Commerce) Rules, 2020 - see
  // IMPLEMENTATION_PROMPT.md §6.5. Defaults to India since that's this store's default market.
  countryOfOrigin: string;
  ratingAvg: number;
  ratingCount: number;
  status: ProductStatus;
  isUnique: boolean;
  dropAt?: Date | null;
  productionTimeDays?: number | null;
  shippingConstraints: {
    groundOnly: boolean;
    heatSensitive: boolean;
    maxPackageVolumeMl?: number;
  };
  stockAdjustments: Types.DocumentArray<StockAdjustment>;
  seo: { metaTitle?: string; metaDescription?: string };
  // Per-product override of dashboard.service.ts's LOW_STOCK_THRESHOLD constant - falls back to
  // that shared default when unset (product.lowStockThreshold ?? LOW_STOCK_THRESHOLD).
  lowStockThreshold?: number;
  backorderAllowed: boolean;
  taxClass: 'standard' | 'exempt';
  // Unset means "unknown weight" - checkout falls back to a flat 250g estimate per line when
  // computing shipping weight tiers (see order.service.ts#createOrderFromCart).
  weightGrams?: number;
  model3dUrl?: string;
  // A product only participates in wholesale pricing when *both* are set (§17 Phase 3).
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productImageSchema = new Schema<ProductImage>(
  {
    url: { type: String, required: true },
    alt: { type: String, required: true, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const productVariantSchema = new Schema<ProductVariant>({
  sku: { type: String, required: true },
  options: {
    color: { type: String },
    size: { type: String },
    volume: { type: String },
  },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  images: { type: [String], default: [] },
});

const stockAdjustmentSchema = new Schema<StockAdjustment>({
  sku: { type: String, required: true },
  delta: { type: Number, required: true },
  reason: { type: String, required: true },
  by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now },
});

const productSchema = new Schema<ProductAttrs>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, required: true },
    type: { type: String, enum: PRODUCT_TYPES, required: true, index: true },
    category: { type: [Schema.Types.ObjectId], ref: 'Category', default: [], index: true },
    tags: { type: [String], default: [] },
    images: { type: [productImageSchema], default: [] },

    basePrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'INR' },

    variants: {
      type: [productVariantSchema],
      validate: {
        validator: (v: ProductVariant[]) => v.length > 0,
        message: 'A product must have at least one variant',
      },
    },

    specs: {
      volume: String,
      mixRatio: String,
      cureTime: String,
      shelfLife: String,
      safetyInfo: String,
      dimensions: String,
      weight: String,
      materials: String,
      careInstructions: String,
    },

    relatedSupplies: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    relatedArtworks: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },

    countryOfOrigin: { type: String, required: true, default: 'India' },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },

    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft', index: true },

    // One-of-a-kind pieces & scheduled drops — IMPLEMENTATION_PROMPT.md §6.7
    isUnique: { type: Boolean, default: false },
    dropAt: { type: Date, default: null },

    // Made-to-order lead time — §6.8
    productionTimeDays: { type: Number, default: null },

    // Liquid/hazmat shipping constraints for resin supplies — §6.9/§12
    shippingConstraints: {
      groundOnly: { type: Boolean, default: false },
      heatSensitive: { type: Boolean, default: false },
      maxPackageVolumeMl: { type: Number },
    },

    stockAdjustments: { type: [stockAdjustmentSchema], default: [] },

    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String },
    },

    lowStockThreshold: { type: Number, min: 0 },
    backorderAllowed: { type: Boolean, default: false },
    taxClass: { type: String, enum: ['standard', 'exempt'], default: 'standard' },
    weightGrams: { type: Number, min: 0 },
    model3dUrl: { type: String },
    wholesalePrice: { type: Number, min: 0 },
    wholesaleMinQty: { type: Number, min: 1 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// A one-of-a-kind piece has exactly one variant with stock capped at 1, regardless of what was
// submitted — this is the invariant the whole drop/sold-out UX (§6.7) depends on.
productSchema.pre('save', function enforceUniquePieceInvariant() {
  if (this.isUnique && this.variants.length > 0) {
    this.variants = [this.variants[0]] as unknown as Types.DocumentArray<ProductVariant>;
    const variant = this.variants[0];
    if (variant) variant.stock = Math.min(variant.stock, 1);
  }
});

productSchema.index({ title: 'text', description: 'text', tags: 'text' });
productSchema.index({ 'variants.sku': 1 });

export type ProductDoc = HydratedDocument<ProductAttrs>;

export const Product = model<ProductAttrs>('Product', productSchema);

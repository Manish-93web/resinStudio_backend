import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface CollectionAttrs {
  title: string;
  slug: string;
  description?: string;
  image?: string;
  // Manual curation (explicit product list) and rule-based curation (e.g. "tag=diwali") are both
  // supported per IMPLEMENTATION_PROMPT.md §7.3 - a collection can mix both; the effective product
  // list is the union of `products` and whatever currently matches `ruleTag`.
  products: Types.ObjectId[];
  ruleTag?: string;
  order: number;
  active: boolean;
  seo: { metaTitle?: string; metaDescription?: string };
  createdAt: Date;
  updatedAt: Date;
}

const collectionSchema = new Schema<CollectionAttrs>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true },
    image: { type: String },
    products: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    ruleTag: { type: String, trim: true, lowercase: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String },
    },
  },
  { timestamps: true },
);

export type CollectionDoc = HydratedDocument<CollectionAttrs>;

export const Collection = model<CollectionAttrs>('Collection', collectionSchema);

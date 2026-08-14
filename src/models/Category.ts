import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface CategoryAttrs {
  name: string;
  slug: string;
  parent?: Types.ObjectId | null;
  image?: string;
  order: number;
  seo: { metaTitle?: string; metaDescription?: string };
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryAttrs>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    image: { type: String },
    order: { type: Number, default: 0 },
    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String },
    },
  },
  { timestamps: true },
);

export type CategoryDoc = HydratedDocument<CategoryAttrs>;

export const Category = model<CategoryAttrs>('Category', categorySchema);

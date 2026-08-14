import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const BLOG_STATUSES = ['draft', 'published'] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export interface BlogPostAttrs {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  tags: string[];
  // Tutorials tied to product tags auto-link the supplies/molds/pigments used - IMPLEMENTATION_PROMPT.md
  // §6.5 ("How to make resin coasters" auto-links the resin, mold, and pigment products used).
  linkedProducts: Types.ObjectId[];
  author?: Types.ObjectId;
  status: BlogStatus;
  publishedAt?: Date | null;
  seo: { metaTitle?: string; metaDescription?: string };
  createdAt: Date;
  updatedAt: Date;
}

const blogPostSchema = new Schema<BlogPostAttrs>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    excerpt: { type: String, trim: true },
    content: { type: String, required: true },
    coverImage: { type: String },
    tags: { type: [String], default: [] },
    linkedProducts: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: BLOG_STATUSES, default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String },
    },
  },
  { timestamps: true },
);

blogPostSchema.index({ title: 'text', content: 'text', tags: 'text' });

export type BlogPostDoc = HydratedDocument<BlogPostAttrs>;

export const BlogPost = model<BlogPostAttrs>('BlogPost', blogPostSchema);

import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewReply {
  text: string;
  repliedBy: Types.ObjectId;
  repliedAt: Date;
}

export interface ReviewAttrs {
  product: Types.ObjectId;
  user: Types.ObjectId;
  rating: number;
  comment: string;
  images: string[];
  verifiedPurchase: boolean;
  status: ReviewStatus;
  reply?: ReviewReply;
  moderatedBy?: Types.ObjectId;
  moderatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reviewReplySchema = new Schema<ReviewReply>(
  {
    text: { type: String, required: true },
    repliedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repliedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reviewSchema = new Schema<ReviewAttrs>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
    images: { type: [String], default: [] },
    verifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', index: true },
    reply: { type: reviewReplySchema },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },
  },
  { timestamps: true },
);

// One review per customer per product - edit the existing one instead of piling up duplicates.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

export type ReviewDoc = HydratedDocument<ReviewAttrs>;

export const Review = model<ReviewAttrs>('Review', reviewSchema);

import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const COUPON_TYPES = ['percent', 'flat'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export interface CouponAttrs {
  code: string;
  type: CouponType;
  value: number;
  minOrderValue?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  perUserLimit?: number;
  applicableCategories: Types.ObjectId[];
  applicableProducts: Types.ObjectId[];
  startsAt?: Date;
  expiresAt?: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<CouponAttrs>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number },
    maxDiscount: { type: Number },
    usageLimit: { type: Number },
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number },
    applicableCategories: { type: [Schema.Types.ObjectId], ref: 'Category', default: [] },
    applicableProducts: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type CouponDoc = HydratedDocument<CouponAttrs>;

export const Coupon = model<CouponAttrs>('Coupon', couponSchema);

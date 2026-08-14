import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const DAMAGE_CLAIM_STATUSES = [
  'pending',
  'approved_replacement',
  'approved_refund',
  'rejected',
] as const;
export type DamageClaimStatus = (typeof DAMAGE_CLAIM_STATUSES)[number];

export interface DamageClaimAttrs {
  order: Types.ObjectId;
  product: Types.ObjectId;
  submittedBy?: Types.ObjectId | null;
  photos: string[];
  description: string;
  status: DamageClaimStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  resolutionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const damageClaimSchema = new Schema<DamageClaimAttrs>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    photos: {
      type: [String],
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one photo is required',
      },
    },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: DAMAGE_CLAIM_STATUSES, default: 'pending', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    resolutionNote: { type: String },
  },
  { timestamps: true },
);

export type DamageClaimDoc = HydratedDocument<DamageClaimAttrs>;

export const DamageClaim = model<DamageClaimAttrs>('DamageClaim', damageClaimSchema);

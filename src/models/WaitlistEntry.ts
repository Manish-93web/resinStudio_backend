import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

// Separate from the generic back-in-stock notify used for restockable supplies, per
// IMPLEMENTATION_PROMPT.md §6.7 - `back_in_stock` fires once a sold-out/restocked variant gets
// stock again, `drop_notify` fires the moment a scheduled drop's `dropAt` passes.
export const WAITLIST_KINDS = ['back_in_stock', 'drop_notify'] as const;
export type WaitlistKind = (typeof WAITLIST_KINDS)[number];

export interface WaitlistEntryAttrs {
  product: Types.ObjectId;
  email: string;
  kind: WaitlistKind;
  notifiedAt?: Date | null;
  createdAt: Date;
}

const waitlistEntrySchema = new Schema<WaitlistEntryAttrs>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    kind: { type: String, enum: WAITLIST_KINDS, required: true },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

waitlistEntrySchema.index({ product: 1, email: 1, kind: 1 }, { unique: true });
waitlistEntrySchema.index({ kind: 1, notifiedAt: 1 });

export type WaitlistEntryDoc = HydratedDocument<WaitlistEntryAttrs>;

export const WaitlistEntry = model<WaitlistEntryAttrs>('WaitlistEntry', waitlistEntrySchema);

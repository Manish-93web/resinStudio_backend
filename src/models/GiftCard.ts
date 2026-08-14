import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { randomBytes } from 'crypto';

export interface GiftCardAttrs {
  code: string;
  initialValue: number;
  balance: number;
  currency: string;
  issuedTo: string;
  purchasedByOrder?: Types.ObjectId | null;
  issuedBy?: Types.ObjectId | null;
  expiresAt?: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const giftCardSchema = new Schema<GiftCardAttrs>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    initialValue: { type: Number, required: true, min: 1 },
    balance: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    issuedTo: { type: String, required: true, trim: true, lowercase: true },
    purchasedByOrder: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** GC-XXXX-XXXX-XXXX - short enough to type/read aloud, long enough not to guess. */
export function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  const randomBlock = () =>
    Array.from(randomBytes(4))
      .map((b) => chars[b % chars.length])
      .join('');
  return `GC-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
}

export type GiftCardDoc = HydratedDocument<GiftCardAttrs>;

export const GiftCard = model<GiftCardAttrs>('GiftCard', giftCardSchema);

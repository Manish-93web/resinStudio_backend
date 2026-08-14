import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { addressSchema, type Address } from './Address';

export const USER_ROLES = ['customer', 'staff', 'manager', 'owner'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash?: string;
  phone?: string;
  role: UserRole;
  addresses: Types.DocumentArray<Address>;
  wishlist: Types.ObjectId[];
  googleId?: string;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  isActive: boolean;
  // Staff/admin-only content about a customer (§7.4) - stripped from the toJSON transform below
  // so a customer can never see their own admin notes via GET /api/auth/me.
  notes?: string;
  loyaltyPoints: number;
  // Every user gets one on creation (see the pre-save hook below) - not sparse, since it's never
  // absent once the hook has run.
  referralCode: string;
  referredBy?: Types.ObjectId | null;
  // Admin-toggled only (§17 Phase 3 wholesale) - gates Product.wholesalePrice eligibility.
  wholesaleApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, default: 'customer', index: true },

    addresses: { type: [addressSchema], default: [] },
    wishlist: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },

    googleId: { type: String, select: false },

    // 2FA (TOTP) - required for staff/manager/owner roles, see IMPLEMENTATION_PROMPT.md §7.8
    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },

    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    isActive: { type: Boolean, default: true },

    notes: { type: String },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, unique: true, index: true, uppercase: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    wholesaleApproved: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        for (const field of [
          'passwordHash',
          'twoFactorSecret',
          'passwordResetTokenHash',
          'passwordResetExpiresAt',
          'googleId',
          'notes',
          '__v',
        ]) {
          Reflect.deleteProperty(ret, field);
        }
        return ret;
      },
    },
  },
);

/** 8-char uppercase alphanumeric - doesn't need to be cryptographically unguessable, just
 *  unique-ish (mirrors the spirit of utils/orderNumber.ts's generateOrderNumber). */
function generateReferralCode(): string {
  return randomBytes(6)
    .toString('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X')
    .slice(0, 8);
}

// Every user gets a referral code at creation time - generated here (not left to the caller) so
// every path that creates a User (register, Google sign-in, admin-created staff, etc.) gets one
// for free. Retries a few times against the unique index before falling back to a
// timestamp-suffixed code, mirroring giftCard.service.ts#ensureUniqueCode's retry idiom.
userSchema.pre('save', async function assignReferralCodeOnCreate() {
  if (!this.isNew || this.referralCode) return;

  const Model = this.constructor as Model<UserAttrs>;
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateReferralCode();
    const exists = await Model.exists({ referralCode: candidate });
    if (!exists) {
      this.referralCode = candidate;
      return;
    }
  }
  this.referralCode = `${generateReferralCode().slice(0, 4)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
});

export type UserDoc = HydratedDocument<UserAttrs>;

export const User = model<UserAttrs>('User', userSchema);

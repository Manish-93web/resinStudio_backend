import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null },
    createdByIp: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

// TTL index: MongoDB automatically deletes documents once expiresAt is in the past.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDoc = HydratedDocument<InferSchemaType<typeof refreshTokenSchema>>;

export const RefreshToken = model('RefreshToken', refreshTokenSchema);

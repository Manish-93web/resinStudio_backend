import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const DEVICE_PLATFORMS = ['android', 'ios'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export interface DeviceTokenAttrs {
  user: Types.ObjectId;
  token: string;
  platform: DevicePlatform;
  createdAt: Date;
}

const deviceTokenSchema = new Schema<DeviceTokenAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: DEVICE_PLATFORMS, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type DeviceTokenDoc = HydratedDocument<DeviceTokenAttrs>;

export const DeviceToken = model<DeviceTokenAttrs>('DeviceToken', deviceTokenSchema);

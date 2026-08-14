import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const activityLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true }, // e.g. "product.update", "order.status_change"
    targetType: { type: String }, // e.g. "Product", "Order"
    targetId: { type: Schema.Types.ObjectId },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

activityLogSchema.index({ createdAt: -1 });

export type ActivityLogDoc = HydratedDocument<InferSchemaType<typeof activityLogSchema>>;

export const ActivityLog = model('ActivityLog', activityLogSchema);

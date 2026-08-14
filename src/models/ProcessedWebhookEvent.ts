import { Schema, model } from 'mongoose';

/** Dedupes webhook deliveries by provider event id - gateways retry delivery, so the same event
 *  can arrive more than once. A unique index is the actual enforcement; findOneAndUpdate with
 *  upsert races safely across concurrent deliveries of the same event. */
const processedWebhookEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
  },
  { timestamps: true },
);

processedWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const ProcessedWebhookEvent = model('ProcessedWebhookEvent', processedWebhookEventSchema);

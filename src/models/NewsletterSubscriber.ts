import { Schema, model, type HydratedDocument } from 'mongoose';

export interface NewsletterSubscriberAttrs {
  email: string;
  active: boolean;
  createdAt: Date;
}

const newsletterSubscriberSchema = new Schema<NewsletterSubscriberAttrs>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type NewsletterSubscriberDoc = HydratedDocument<NewsletterSubscriberAttrs>;

export const NewsletterSubscriber = model<NewsletterSubscriberAttrs>(
  'NewsletterSubscriber',
  newsletterSubscriberSchema,
);

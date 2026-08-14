import { NewsletterSubscriber } from '../models/NewsletterSubscriber';

export async function subscribe(email: string): Promise<{ alreadySubscribed: boolean }> {
  const normalized = email.toLowerCase().trim();
  const existing = await NewsletterSubscriber.findOne({ email: normalized });
  if (existing) {
    if (!existing.active) {
      existing.active = true;
      await existing.save();
    }
    return { alreadySubscribed: true };
  }
  await NewsletterSubscriber.create({ email: normalized, active: true });
  return { alreadySubscribed: false };
}

export async function unsubscribe(email: string): Promise<void> {
  await NewsletterSubscriber.updateOne({ email: email.toLowerCase().trim() }, { active: false });
}

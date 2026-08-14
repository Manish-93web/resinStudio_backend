import { WaitlistEntry, type WaitlistKind } from '../models/WaitlistEntry';
import { Product } from '../models/Product';
import { ApiError } from '../utils/apiError';
import { sendEmail } from './notification.service';
import { logger } from '../config/logger';

export async function joinWaitlist(
  productId: string,
  email: string,
  kind: WaitlistKind,
): Promise<void> {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  if (kind === 'back_in_stock' && product.variants.some((v) => v.stock > 0)) {
    throw ApiError.badRequest('This product is already in stock');
  }
  if (kind === 'drop_notify' && (!product.dropAt || product.dropAt.getTime() <= Date.now())) {
    throw ApiError.badRequest('This product has no upcoming drop to notify about');
  }

  // Idempotent: re-signing-up with the same email/product/kind is a harmless no-op, not an error -
  // the unique index would otherwise turn a duplicate click into a 500.
  await WaitlistEntry.updateOne(
    { product: productId, email: email.toLowerCase(), kind },
    { $setOnInsert: { product: productId, email: email.toLowerCase(), kind } },
    { upsert: true },
  );
}

/**
 * Called by the drop-live cron tick (and, for back-in-stock, by the stock-adjustment path once
 * that's wired up) - emails every not-yet-notified entry for a product/kind pair and marks them
 * notified so a re-run of the same cron tick never double-sends.
 */
export async function notifyWaitlist(productId: string, kind: WaitlistKind): Promise<number> {
  const product = await Product.findById(productId);
  if (!product) return 0;

  const entries = await WaitlistEntry.find({ product: productId, kind, notifiedAt: null });
  if (entries.length === 0) return 0;

  const subject =
    kind === 'drop_notify'
      ? `${product.title} just dropped!`
      : `${product.title} is back in stock!`;
  const text =
    kind === 'drop_notify'
      ? `The wait is over — "${product.title}" is now available. Grab it before it's gone.`
      : `Good news — "${product.title}" is back in stock and ready to order.`;

  await Promise.all(
    entries.map((entry) =>
      sendEmail({ to: entry.email, subject, text }).catch((err) =>
        logger.error({ err, entryId: entry.id }, 'Failed to send waitlist notification email'),
      ),
    ),
  );

  await WaitlistEntry.updateMany(
    { _id: { $in: entries.map((e) => e._id) } },
    { notifiedAt: new Date() },
  );

  return entries.length;
}

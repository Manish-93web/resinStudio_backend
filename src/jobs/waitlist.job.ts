import { Product } from '../models/Product';
import { WaitlistEntry } from '../models/WaitlistEntry';
import { notifyWaitlist } from '../services/waitlist.service';
import { logger } from '../config/logger';

/**
 * Two independent triggers checked on the same tick:
 * - drop_notify: any product whose `dropAt` has now passed and still has un-notified entries.
 * - back_in_stock: any product currently in stock that still has un-notified entries (covers
 *   both a manual restock and a scheduled drop going live with stock already loaded).
 * notifyWaitlist() is itself idempotent (marks entries `notifiedAt` after sending), so re-running
 * this job every tick is safe — most ticks will find nothing to do.
 */
export async function runWaitlistNotifyJob(): Promise<{
  dropNotified: number;
  backInStockNotified: number;
}> {
  let dropNotified = 0;
  let backInStockNotified = 0;

  const pendingDropProductIds = await WaitlistEntry.distinct('product', {
    kind: 'drop_notify',
    notifiedAt: null,
  });
  if (pendingDropProductIds.length > 0) {
    const droppedProducts = await Product.find({
      _id: { $in: pendingDropProductIds },
      dropAt: { $ne: null, $lte: new Date() },
    }).select('_id');
    for (const product of droppedProducts) {
      try {
        dropNotified += await notifyWaitlist(product.id, 'drop_notify');
      } catch (err) {
        logger.error({ err, productId: product.id }, 'Failed to notify drop waitlist');
      }
    }
  }

  const pendingStockProductIds = await WaitlistEntry.distinct('product', {
    kind: 'back_in_stock',
    notifiedAt: null,
  });
  if (pendingStockProductIds.length > 0) {
    const restockedProducts = await Product.find({
      _id: { $in: pendingStockProductIds },
      'variants.stock': { $gt: 0 },
    }).select('_id');
    for (const product of restockedProducts) {
      try {
        backInStockNotified += await notifyWaitlist(product.id, 'back_in_stock');
      } catch (err) {
        logger.error({ err, productId: product.id }, 'Failed to notify back-in-stock waitlist');
      }
    }
  }

  return { dropNotified, backInStockNotified };
}

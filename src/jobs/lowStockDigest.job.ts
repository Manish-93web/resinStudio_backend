import { Product } from '../models/Product';
import { LOW_STOCK_THRESHOLD } from '../services/dashboard.service';
import { getSettings } from '../services/settings.service';
import { sendEmail } from '../services/notification.service';
import { logger } from '../config/logger';

/** A daily digest, not a per-product alert, so a slow morning doesn't spam the inbox — one email
 *  summarizing everything at/under threshold, sent to the store's own support address. Each
 *  product may override the shared LOW_STOCK_THRESHOLD via its own lowStockThreshold field. */
export async function runLowStockDigestJob(): Promise<number> {
  // Can't push the per-product override into the query filter itself (it's a per-document
  // comparison), so cast a net wide enough to catch every possible per-product threshold and
  // filter precisely in JS below.
  const configuredThresholds = (await Product.distinct('lowStockThreshold')).filter(
    (n): n is number => typeof n === 'number',
  );
  const widestThreshold = Math.max(LOW_STOCK_THRESHOLD, ...configuredThresholds);

  const candidates = await Product.find({
    status: 'published',
    'variants.stock': { $lte: widestThreshold },
  }).select('title variants lowStockThreshold');

  const lowStockProducts = candidates.filter((product) => {
    const threshold = product.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
    return product.variants.some((v) => v.stock <= threshold);
  });

  if (lowStockProducts.length === 0) return 0;

  const settings = await getSettings();
  const lines = lowStockProducts.flatMap((product) => {
    const threshold = product.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
    return product.variants
      .filter((v) => v.stock <= threshold)
      .map((v) => `- ${product.title} (${v.sku}): ${v.stock} left`);
  });

  try {
    await sendEmail({
      to: settings.supportEmail,
      subject: `Low stock digest — ${lowStockProducts.length} product(s) need attention`,
      text: `The following variants are at or below the low-stock threshold (${LOW_STOCK_THRESHOLD}):\n\n${lines.join('\n')}`,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send low-stock digest email');
    return 0;
  }

  return lowStockProducts.length;
}

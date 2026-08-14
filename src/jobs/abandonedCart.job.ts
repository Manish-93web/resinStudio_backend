import { Cart } from '../models/Cart';
import { sendEmail } from '../services/notification.service';
import { logger } from '../config/logger';

const ABANDONED_AFTER_HOURS = 3;

/**
 * Guest carts have no email captured until checkout, so this can only reach carts belonging to
 * registered users (`user` populated) - a disclosed scope limit, not an oversight. Idempotent via
 * `abandonedEmailSentAt`, which cart.service.ts clears the moment the customer touches their cart
 * again, so a single email per abandonment episode is the intended behavior, not a bug.
 */
export async function runAbandonedCartJob(): Promise<number> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_HOURS * 60 * 60 * 1000);
  const carts = await Cart.find({
    user: { $ne: null },
    'items.0': { $exists: true },
    updatedAt: { $lte: cutoff },
    abandonedEmailSentAt: null,
  }).populate<{ user: { email: string; name: string } | null }>('user', 'email name');

  let sent = 0;
  for (const cart of carts) {
    if (!cart.user?.email) continue;
    try {
      await sendEmail({
        to: cart.user.email,
        subject: 'You left something in your cart',
        text: `Hi ${cart.user.name ?? 'there'}, you still have ${cart.items.length} item(s) waiting in your Resin by Richa cart. Come back and finish checking out before they sell out.`,
      });
      cart.abandonedEmailSentAt = new Date();
      await cart.save();
      sent += 1;
    } catch (err) {
      logger.error({ err, cartId: cart.id }, 'Failed to send abandoned-cart email');
    }
  }

  return sent;
}

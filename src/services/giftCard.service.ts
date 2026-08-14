import mongoose, { Types } from 'mongoose';
import { GiftCard, generateGiftCardCode, type GiftCardDoc } from '../models/GiftCard';
import { Order, type OrderDoc } from '../models/Order';
import { ApiError } from '../utils/apiError';
import { generateOrderNumber } from '../utils/orderNumber';
import { sendEmail } from './notification.service';
import { getSettings, renderTemplate } from './settings.service';
import { logger } from '../config/logger';
import { logActivity } from './activityLog.service';

async function ensureUniqueCode(): Promise<string> {
  let code = generateGiftCardCode();
  while (await GiftCard.exists({ code })) {
    code = generateGiftCardCode();
  }
  return code;
}

async function emailGiftCard(card: GiftCardDoc, purchaserNote?: string): Promise<void> {
  const settings = await getSettings();
  const vars = { code: card.code, amount: `${card.initialValue} ${card.currency}` };
  const subject = renderTemplate(settings.notificationTemplates.giftCardPurchase.subject, vars);
  const body = renderTemplate(settings.notificationTemplates.giftCardPurchase.body, vars);
  const text = purchaserNote ? `${body}\n\nMessage: ${purchaserNote}` : body;

  sendEmail({ to: card.issuedTo, subject, text }).catch((err) =>
    logger.error({ err, giftCardId: card.id }, 'Failed to send gift card email'),
  );
}

/**
 * A gift card is fulfilled instantly (no physical shipping), so unlike a catalog/commission
 * order there's no "packed/shipped" wait - the card is generated and emailed the moment payment
 * is recorded. The wrapping Order still exists so the purchase has the same receipt/history
 * trail as everything else, reusing generateOrderNumber/Order rather than a parallel record type.
 */
export async function purchaseGiftCard(
  userId: string | undefined,
  input: {
    amount: number;
    recipientEmail: string;
    purchaserEmail?: string;
    message?: string;
    shippingAddress: {
      line1: string;
      city: string;
      state: string;
      pincode: string;
      phone: string;
      country?: string;
    };
  },
): Promise<{ order: OrderDoc; giftCard: GiftCardDoc }> {
  const session = await mongoose.startSession();
  let order: OrderDoc | undefined;
  let giftCard: GiftCardDoc | undefined;

  try {
    await session.withTransaction(async () => {
      const [createdOrder] = await Order.create(
        [
          {
            orderNumber: generateOrderNumber(),
            user: userId ?? null,
            guestEmail: userId ? undefined : input.purchaserEmail,
            items: [{ title: `Gift card — ${input.amount} INR`, qty: 1, price: input.amount }],
            subtotal: input.amount,
            discount: 0,
            shipping: 0,
            tax: 0,
            total: input.amount,
            shippingAddress: input.shippingAddress,
            billingAddress: input.shippingAddress,
            paymentMethod: 'cod',
            paymentStatus: 'paid', // digital good, fulfilled immediately - see note above
            payments: [
              {
                amount: input.amount,
                method: 'cod',
                status: 'paid',
                type: 'full',
                capturedAt: new Date(),
              },
            ],
            status: 'delivered', // nothing to ship/track - the "delivery" is the emailed code
            orderType: 'gift_card_purchase',
            timeline: [
              { status: 'placed', at: new Date() },
              { status: 'delivered', at: new Date(), note: 'Gift card issued by email' },
            ],
          },
        ],
        { session },
      );
      if (!createdOrder) throw ApiError.internal('Failed to create the gift card order');
      order = createdOrder;

      const code = await ensureUniqueCode();
      const [createdCard] = await GiftCard.create(
        [
          {
            code,
            initialValue: input.amount,
            balance: input.amount,
            issuedTo: input.recipientEmail,
            purchasedByOrder: createdOrder._id,
            active: true,
          },
        ],
        { session },
      );
      if (!createdCard) throw ApiError.internal('Failed to create the gift card');
      giftCard = createdCard;
    });
  } finally {
    await session.endSession();
  }

  if (!order || !giftCard)
    throw ApiError.internal('Gift card purchase transaction completed without producing a result');

  await emailGiftCard(giftCard, input.message);

  return { order, giftCard };
}

export class GiftCardError extends ApiError {
  constructor(message: string) {
    super(400, message);
    this.name = 'GiftCardError';
  }
}

/**
 * Atomically deducts up to `maxAmount` from the card's balance (never more than what's actually
 * left), inside the caller's transaction session. The `balance >= deductAmount` guard in the
 * filter is what makes this safe against two concurrent checkouts double-spending the same card -
 * same pattern as the stock-guard in order.service.ts's createOrderFromCart.
 */
export async function redeemGiftCardAmount(
  code: string,
  maxAmount: number,
  session: mongoose.ClientSession,
): Promise<{ amountApplied: number; giftCard: GiftCardDoc }> {
  const card = await GiftCard.findOne({ code: code.toUpperCase() }).session(session);
  if (!card || !card.active) throw new GiftCardError('Gift card not found or inactive');
  if (card.expiresAt && card.expiresAt.getTime() < Date.now())
    throw new GiftCardError('This gift card has expired');
  if (card.balance <= 0) throw new GiftCardError('This gift card has no remaining balance');

  const deductAmount = Math.min(card.balance, maxAmount);
  const updated = await GiftCard.findOneAndUpdate(
    { _id: card._id, balance: { $gte: deductAmount } },
    { $inc: { balance: -deductAmount } },
    { session, returnDocument: 'after' },
  );
  if (!updated) throw new GiftCardError('This gift card balance just changed — please try again');

  return { amountApplied: deductAmount, giftCard: updated };
}

export async function issueManually(
  actorId: string,
  input: { amount: number; recipientEmail: string; expiresAt?: Date; note?: string },
): Promise<GiftCardDoc> {
  const code = await ensureUniqueCode();
  const card = await GiftCard.create({
    code,
    initialValue: input.amount,
    balance: input.amount,
    issuedTo: input.recipientEmail,
    issuedBy: new Types.ObjectId(actorId),
    expiresAt: input.expiresAt ?? null,
    active: true,
  });

  await emailGiftCard(card, input.note);
  await logActivity({
    actor: actorId,
    action: 'giftcard.issue',
    targetType: 'GiftCard',
    targetId: card.id,
    metadata: { amount: input.amount, recipientEmail: input.recipientEmail },
  });

  return card;
}

export async function listForAdmin(search?: string): Promise<GiftCardDoc[]> {
  const query = search
    ? { code: new RegExp(search.toUpperCase().replace(/[^A-Z0-9-]/g, ''), 'i') }
    : {};
  return GiftCard.find(query).sort('-createdAt').limit(100);
}

export async function checkBalance(
  code: string,
): Promise<{ balance: number; active: boolean; expiresAt: Date | null }> {
  const card = await GiftCard.findOne({ code: code.toUpperCase() });
  if (!card) throw ApiError.notFound('Gift card not found');
  return { balance: card.balance, active: card.active, expiresAt: card.expiresAt ?? null };
}

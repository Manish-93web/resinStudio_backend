import { Types } from 'mongoose';
import { Commission, type CommissionDoc, type CommissionStatus } from '../models/Commission';
import { Order, type OrderDoc } from '../models/Order';
import type { Address } from '../models/Address';
import { ApiError } from '../utils/apiError';
import { getSettings, renderTemplate } from './settings.service';
import { sendEmail } from './notification.service';
import { generateOrderNumber } from '../utils/orderNumber';
import {
  buildPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from '../utils/pagination';
import { logger } from '../config/logger';

export async function createCommissionRequest(
  userId: string | undefined,
  input: {
    contactEmail: string;
    contactPhone?: string;
    description: string;
    referenceImages?: string[];
    dimensions?: string;
    colorNotes?: string;
    budgetRange?: string;
    neededBy?: Date;
  },
): Promise<CommissionDoc> {
  return Commission.create({
    customer: userId ?? null,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    description: input.description,
    referenceImages: input.referenceImages ?? [],
    dimensions: input.dimensions,
    colorNotes: input.colorNotes,
    budgetRange: input.budgetRange,
    neededBy: input.neededBy,
    status: 'requested',
  });
}

export async function listMine(userId: string): Promise<CommissionDoc[]> {
  return Commission.find({ customer: userId }).sort('-createdAt');
}

export async function getOwnedById(id: string, userId: string): Promise<CommissionDoc> {
  const commission = await Commission.findById(id);
  if (!commission) throw ApiError.notFound('Commission not found');
  if (!commission.customer || commission.customer.toString() !== userId) throw ApiError.forbidden();
  return commission;
}

export async function listForModeration(
  filter: { status?: CommissionStatus },
  pagination: PaginationParams,
): Promise<PaginatedResult<CommissionDoc>> {
  const query = filter.status ? { status: filter.status } : {};
  const [data, total] = await Promise.all([
    Commission.find(query)
      .populate('customer', 'name email')
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Commission.countDocuments(query),
  ]);
  return buildPaginatedResult(data, total, pagination);
}

export async function getForAdmin(id: string): Promise<CommissionDoc> {
  const commission = await Commission.findById(id).populate('customer', 'name email');
  if (!commission) throw ApiError.notFound('Commission not found');
  return commission;
}

async function notifyCustomer(
  commission: CommissionDoc,
  subject: string,
  text: string,
): Promise<void> {
  sendEmail({ to: commission.contactEmail, subject, text }).catch((err) =>
    logger.error(
      { err, commissionId: commission.id },
      'Failed to send commission notification email',
    ),
  );
}

export async function sendQuote(
  commissionId: string,
  actorId: string,
  input: { price: number; productionTimeDays: number; note?: string },
): Promise<CommissionDoc> {
  const commission = await Commission.findById(commissionId);
  if (!commission) throw ApiError.notFound('Commission not found');
  if (commission.status !== 'requested') {
    throw ApiError.conflict(
      'A quote can only be sent for a commission that is still pending review',
    );
  }

  const settings = await getSettings();
  const depositPercent = settings.commissionDepositPercent;
  const depositAmount = Math.round(input.price * (depositPercent / 100) * 100) / 100;

  commission.quote = {
    price: input.price,
    productionTimeDays: input.productionTimeDays,
    quotedBy: new Types.ObjectId(actorId),
    quotedAt: new Date(),
    note: input.note,
  };
  commission.depositPercent = depositPercent;
  commission.depositAmount = depositAmount;
  commission.balanceAmount = Math.round((input.price - depositAmount) * 100) / 100;
  commission.status = 'quoted';
  commission.timeline.push({ status: 'quoted', at: new Date(), note: input.note });
  await commission.save();

  // {{commissionTitle}}/{{depositAmount}} placeholders (settings.service.ts#renderTemplate) -
  // there's no dedicated Commission.title field, so the same truncated-description stand-in used
  // for order line items elsewhere in this file (payDeposit/payBalance) doubles as the title here.
  const vars = {
    commissionTitle: commission.description.slice(0, 60),
    depositAmount: String(depositAmount),
  };
  await notifyCustomer(
    commission,
    renderTemplate(settings.notificationTemplates.commissionQuoteReady.subject, vars),
    renderTemplate(settings.notificationTemplates.commissionQuoteReady.body, vars) +
      (input.note ? ` Note: ${input.note}` : ''),
  );

  return commission;
}

export async function declineCommission(
  commissionId: string,
  actorId: string,
  reason: string,
): Promise<CommissionDoc> {
  const commission = await Commission.findById(commissionId);
  if (!commission) throw ApiError.notFound('Commission not found');
  if (!['requested', 'quoted'].includes(commission.status)) {
    throw ApiError.conflict(
      'This commission has already moved past the point where it can be declined',
    );
  }

  commission.status = 'declined';
  commission.declineReason = reason;
  commission.timeline.push({ status: 'declined', at: new Date(), note: reason });
  await commission.save();

  await notifyCustomer(
    commission,
    'Update on your custom order request',
    `We're unable to take on this commission: ${reason}`,
  );

  logger.info({ commissionId, actorId }, 'Commission declined');
  return commission;
}

/**
 * Creates the linked deposit Order directly (not via Cart, since a commission isn't a catalog
 * purchase) - a single synthetic line item representing the deposit payment, reusing the same
 * Order/payment/fulfillment machinery as a catalog checkout per §7.10 ("flows through the same
 * fulfillment/shipping tooling as catalog orders").
 */
export async function payDeposit(
  commissionId: string,
  userId: string,
  input: { shippingAddress: Address; paymentMethod: 'cod' },
): Promise<{ commission: CommissionDoc; order: OrderDoc }> {
  const commission = await getOwnedById(commissionId, userId);
  if (commission.status !== 'quoted') {
    throw ApiError.conflict('This commission does not have a pending quote to accept');
  }
  if (!commission.quote || commission.depositAmount === undefined) {
    throw ApiError.internal('Commission is missing quote data');
  }

  const [order] = await Order.create([
    {
      orderNumber: generateOrderNumber(),
      user: userId,
      items: [
        {
          title: `Commission deposit (${commission.depositPercent}%) — ${commission.description.slice(0, 60)}`,
          qty: 1,
          price: commission.depositAmount,
        },
      ],
      subtotal: commission.depositAmount,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: commission.depositAmount,
      shippingAddress: input.shippingAddress,
      billingAddress: input.shippingAddress,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      payments: [],
      status: 'placed',
      orderType: 'commission_deposit',
      commission: commission._id,
      timeline: [{ status: 'placed', at: new Date() }],
    },
  ]);
  if (!order) throw ApiError.internal('Failed to create the commission deposit order');

  commission.status = 'deposit_paid';
  commission.depositOrder = order._id;
  commission.timeline.push({ status: 'deposit_paid', at: new Date() });
  await commission.save();

  await notifyCustomer(
    commission,
    'Deposit received — your commission is queued for production',
    `Thanks! We've received your ${commission.depositPercent}% deposit and your piece is now queued for production ` +
      `(estimated ${commission.quote.productionTimeDays} days).`,
  );

  return { commission, order };
}

export async function updateProductionStatus(
  commissionId: string,
  actorId: string,
  input: { status: 'in_production' | 'ready'; note?: string },
): Promise<CommissionDoc> {
  const commission = await Commission.findById(commissionId);
  if (!commission) throw ApiError.notFound('Commission not found');

  const validTransitions: Record<string, string[]> = {
    deposit_paid: ['in_production'],
    in_production: ['ready'],
  };
  if (!validTransitions[commission.status]?.includes(input.status)) {
    throw ApiError.conflict(
      `Cannot move a commission from "${commission.status}" to "${input.status}"`,
    );
  }

  commission.status = input.status;
  commission.timeline.push({ status: input.status, at: new Date(), note: input.note });
  await commission.save();

  if (input.status === 'ready') {
    await notifyCustomer(
      commission,
      'Your commission is ready — balance payment due',
      `Your piece is finished! The remaining balance (${commission.balanceAmount}) is due before we ship it.`,
    );
  }

  logger.info(
    { commissionId, actorId, status: input.status },
    'Commission production status updated',
  );
  return commission;
}

export async function payBalance(
  commissionId: string,
  userId: string,
  input: { shippingAddress: Address; paymentMethod: 'cod' },
): Promise<{ commission: CommissionDoc; order: OrderDoc }> {
  const commission = await getOwnedById(commissionId, userId);
  if (commission.status !== 'ready') {
    throw ApiError.conflict('This commission is not yet ready for balance payment');
  }
  if (commission.balanceAmount === undefined) {
    throw ApiError.internal('Commission is missing balance amount');
  }

  const [order] = await Order.create([
    {
      orderNumber: generateOrderNumber(),
      user: userId,
      items: [
        {
          title: `Commission balance — ${commission.description.slice(0, 60)}`,
          qty: 1,
          price: commission.balanceAmount,
        },
      ],
      subtotal: commission.balanceAmount,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: commission.balanceAmount,
      shippingAddress: input.shippingAddress,
      billingAddress: input.shippingAddress,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      payments: [],
      status: 'confirmed',
      orderType: 'commission_balance',
      commission: commission._id,
      timeline: [
        { status: 'placed', at: new Date() },
        { status: 'confirmed', at: new Date(), note: 'Balance paid — ready for fulfillment' },
      ],
    },
  ]);
  if (!order) throw ApiError.internal('Failed to create the commission balance order');

  commission.status = 'balance_paid';
  commission.balanceOrder = order._id;
  commission.timeline.push({ status: 'balance_paid', at: new Date() });
  await commission.save();

  await notifyCustomer(
    commission,
    'Balance received — your commission will ship soon',
    "Thanks! We've received your balance payment and your piece will ship shortly.",
  );

  return { commission, order };
}

/** Called from order.service.ts whenever a commission-linked order's fulfillment status changes,
 *  so the commission's own status stays in sync once it enters normal shipping/delivery
 *  tracking (reusing the standard Order timeline UI per §6.8). */
export async function syncFromLinkedOrder(order: OrderDoc): Promise<void> {
  if (!order.commission || order.orderType !== 'commission_balance') return;
  if (order.status !== 'shipped') return;

  const commission = await Commission.findById(order.commission);
  if (!commission || commission.status === 'shipped') return;

  commission.status = 'shipped';
  commission.timeline.push({ status: 'shipped', at: new Date() });
  await commission.save();
}

import { Types } from 'mongoose';
import { DamageClaim, type DamageClaimDoc, type DamageClaimStatus } from '../models/DamageClaim';
import { Order } from '../models/Order';
import { User } from '../models/User';
import { ApiError } from '../utils/apiError';
import { sendEmail } from './notification.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from '../utils/pagination';
import { logger } from '../config/logger';

// The window (from delivery) within which a customer can report shipping damage - see
// IMPLEMENTATION_PROMPT.md §6.9 ("e.g., 48-72 hours").
const CLAIM_WINDOW_HOURS = 72;

export async function submitDamageClaim(
  orderId: string,
  userId: string,
  input: { productId: string; photos: string[]; description: string },
): Promise<DamageClaimDoc> {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.user || order.user.toString() !== userId) throw ApiError.forbidden();

  const item = order.items.find((i) => i.product?.toString() === input.productId);
  if (!item) throw ApiError.badRequest('That product is not part of this order');

  if (order.status !== 'delivered') {
    throw ApiError.conflict('Damage can only be reported once an order has been delivered');
  }

  const deliveredEntry = [...order.timeline].reverse().find((t) => t.status === 'delivered');
  const deliveredAt = deliveredEntry?.at ?? order.updatedAt;
  const windowMs = CLAIM_WINDOW_HOURS * 60 * 60 * 1000;
  if (Date.now() - deliveredAt.getTime() > windowMs) {
    throw ApiError.conflict(
      `Damage must be reported within ${CLAIM_WINDOW_HOURS} hours of delivery`,
    );
  }

  const existing = await DamageClaim.findOne({
    order: orderId,
    product: input.productId,
    status: { $in: ['pending', 'approved_replacement', 'approved_refund'] },
  });
  if (existing) throw ApiError.conflict('A claim for this item has already been submitted');

  return DamageClaim.create({
    order: orderId,
    product: input.productId,
    submittedBy: userId,
    photos: input.photos,
    description: input.description,
    status: 'pending',
  });
}

export async function listClaimsForOrder(
  orderId: string,
  userId: string,
): Promise<DamageClaimDoc[]> {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.user || order.user.toString() !== userId) throw ApiError.forbidden();
  return DamageClaim.find({ order: orderId }).sort('-createdAt');
}

export async function listForModeration(
  filter: { status?: DamageClaimStatus },
  pagination: PaginationParams,
): Promise<PaginatedResult<DamageClaimDoc>> {
  const query = filter.status ? { status: filter.status } : {};
  const [data, total] = await Promise.all([
    DamageClaim.find(query)
      .populate('order', 'orderNumber total')
      .populate('product', 'title slug')
      .populate('submittedBy', 'name email')
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit),
    DamageClaim.countDocuments(query),
  ]);
  return buildPaginatedResult(data, total, pagination);
}

export async function resolveClaim(
  claimId: string,
  actorId: string,
  input: {
    status: 'approved_replacement' | 'approved_refund' | 'rejected';
    resolutionNote?: string;
  },
): Promise<DamageClaimDoc> {
  const claim = await DamageClaim.findById(claimId);
  if (!claim) throw ApiError.notFound('Claim not found');
  if (claim.status !== 'pending') throw ApiError.conflict('This claim has already been resolved');

  claim.status = input.status;
  claim.reviewedBy = new Types.ObjectId(actorId);
  claim.reviewedAt = new Date();
  claim.resolutionNote = input.resolutionNote;
  await claim.save();

  if (input.status === 'approved_refund') {
    const order = await Order.findById(claim.order);
    if (order && order.paymentStatus === 'paid') {
      order.paymentStatus = 'partially_refunded';
      await order.save();
    }
  }

  if (claim.submittedBy) {
    const user = await User.findById(claim.submittedBy);
    if (user) {
      const outcomeText: Record<string, string> = {
        approved_replacement: 'approved — a replacement will be shipped to you',
        approved_refund: 'approved — a refund has been issued',
        rejected: 'not approved',
      };
      sendEmail({
        to: user.email,
        subject: 'Update on your damage claim',
        text: `Your damage claim has been ${outcomeText[input.status]}.${
          input.resolutionNote ? ` Note: ${input.resolutionNote}` : ''
        }`,
      }).catch((err) => logger.error({ err }, 'Failed to send damage claim resolution email'));
    }
  }

  return claim;
}

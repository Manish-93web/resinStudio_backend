import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { getCartIdentity } from '../utils/cartIdentity';
import * as orderService from '../services/order.service';
import * as damageClaimService from '../services/damageClaim.service';
import { logActivity } from '../services/activityLog.service';
import { Order } from '../models/Order';
import { User } from '../models/User';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';

export const checkout = asyncHandler(async (req, res) => {
  if (req.body.paymentMethod !== 'cod') {
    throw ApiError.badRequest(
      'Use /api/payments/razorpay/create-order or /api/payments/stripe/create-intent for online payment checkout',
    );
  }

  const identity = getCartIdentity(req);
  const order = await orderService.createOrderFromCart({
    userId: identity.userId,
    sessionId: identity.sessionId,
    guestEmail: req.body.guestEmail,
    guestPhone: req.body.guestPhone,
    shippingAddress: req.body.shippingAddress,
    billingAddress: req.body.billingAddress ?? req.body.shippingAddress,
    paymentMethod: 'cod',
    couponCode: req.body.couponCode,
    giftCardCode: req.body.giftCardCode,
    redeemPoints: req.body.redeemPoints,
  });

  res.status(201).json({ order });
});

export const listMine = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const pagination = parsePagination(req);
  const filter = { user: req.user.id };
  const [data, total] = await Promise.all([
    Order.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit),
    Order.countDocuments(filter),
  ]);
  res.json(buildPaginatedResult(data, total, pagination));
});

export const listAll = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const { status, paymentMethod, dateFrom, dateTo, q } = req.query as Record<
    string,
    string | undefined
  >;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo);
    filter.createdAt = createdAt;
  }
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingUserIds = await User.find({ $or: [{ name: regex }, { email: regex }] }).select(
      '_id',
    );
    filter.$or = [
      { orderNumber: regex },
      { guestEmail: regex },
      { guestPhone: regex },
      { user: { $in: matchingUserIds.map((u) => u._id) } },
    ];
  }

  const [data, total, revenueAgg] = await Promise.all([
    Order.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit),
    Order.countDocuments(filter),
    // Net total (order total minus any refunds against it) for every order matching the current
    // filter, not just the current page - lets the admin see "what's this filtered view worth"
    // without paging through every row. Deliberately respects whatever status filter is active
    // (e.g. filtering to `cancelled` correctly nets to ~0) rather than re-imposing the dashboard's
    // own fixed cancelled/returned exclusion - see dashboard.service.ts for that separate figure.
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: { $subtract: ['$total', { $sum: '$refunds.amount' }] } },
        },
      },
    ]),
  ]);
  const totalRevenue = (revenueAgg[0]?.total as number | undefined) ?? 0;
  res.json({ ...buildPaginatedResult(data, total, pagination), totalRevenue });
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id as string, {
    userId: req.user?.id,
    role: req.user?.role,
  });
  res.json({ order });
});

export const track = asyncHandler(async (req, res) => {
  const order = await orderService.trackGuestOrder(req.body.orderNumber, req.body.emailOrPhone);
  res.json({ order });
});

export const updateStatus = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.updateOrderStatus(
    req.params.id as string,
    req.body.status,
    req.body.note,
    req.user.id,
  );
  if (req.body.trackingCarrier) order.trackingCarrier = req.body.trackingCarrier;
  if (req.body.trackingNumber) order.trackingNumber = req.body.trackingNumber;
  await order.save();

  await logActivity({
    actor: req.user.id,
    action: 'order.status_change',
    targetType: 'Order',
    targetId: order.id,
    metadata: { status: req.body.status },
  });

  res.json({ order });
});

export const refund = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.refundOrder(
    req.params.id as string,
    req.user.id,
    req.body.amount,
    req.body.reason,
  );
  res.json({ order });
});

export const cancelMine = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.customerCancelOrder(
    req.params.id as string,
    req.user.id,
    req.body.reason,
  );
  res.json({ order });
});

export const updateMyShippingAddress = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.customerUpdateShippingAddress(
    req.params.id as string,
    req.user.id,
    req.body,
  );
  res.json({ order });
});

export const submitDamageClaim = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const claim = await damageClaimService.submitDamageClaim(
    req.params.id as string,
    req.user.id,
    req.body,
  );
  res.status(201).json({ claim });
});

export const listDamageClaims = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const claims = await damageClaimService.listClaimsForOrder(req.params.id as string, req.user.id);
  res.json({ data: claims });
});

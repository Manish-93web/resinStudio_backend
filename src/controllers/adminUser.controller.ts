import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { User, type UserDoc } from '../models/User';
import { Order } from '../models/Order';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';

/**
 * User.toJSON() strips `notes` unconditionally (see the model's toJSON transform) so a customer
 * can never see their own admin notes via GET /api/auth/me. That transform has no notion of who's
 * asking though, so every admin-facing response in this controller has to re-attach it explicitly
 * after serializing - the field is still on the live document, just dropped by toJSON().
 */
function serializeCustomerForAdmin(user: UserDoc) {
  return { ...user.toJSON(), notes: user.notes };
}

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req);
  const filter = { role: 'customer' as const };
  const [data, total] = await Promise.all([
    User.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit),
    User.countDocuments(filter),
  ]);
  res.json(buildPaginatedResult(data.map(serializeCustomerForAdmin), total, pagination));
});

export const getOne = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' });
  if (!user) throw ApiError.notFound('Customer not found');

  const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 });
  const lifetimeValue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  res.json({ user: serializeCustomerForAdmin(user), orders, lifetimeValue });
});

export const setActive = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' });
  if (!user) throw ApiError.notFound('Customer not found');
  user.isActive = req.body.isActive;
  await user.save();
  res.json({ user: serializeCustomerForAdmin(user) });
});

/** General customer-record patch (§7.4): active/ban status, wholesale approval, and admin-only
 *  notes, all in one call rather than three single-field endpoints. */
export const update = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' });
  if (!user) throw ApiError.notFound('Customer not found');

  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
  if (req.body.wholesaleApproved !== undefined) user.wholesaleApproved = req.body.wholesaleApproved;
  if (req.body.notes !== undefined) user.notes = req.body.notes;
  await user.save();

  res.json({ user: serializeCustomerForAdmin(user) });
});

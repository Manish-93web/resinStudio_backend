import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { User, type UserRole } from '../models/User';
import { logActivity } from '../services/activityLog.service';

const BCRYPT_ROUNDS = 12;
const ADMIN_ROLES: UserRole[] = ['staff', 'manager', 'owner'];

export const list = asyncHandler(async (_req, res) => {
  const staff = await User.find({ role: { $in: ADMIN_ROLES } }).sort({ createdAt: -1 });
  res.json({ data: staff });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const existing = await User.findOne({ email: req.body.email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    passwordHash,
    role: req.body.role,
  });

  await logActivity({
    actor: req.user.id,
    action: 'staff.create',
    targetType: 'User',
    targetId: user.id,
    metadata: { role: req.body.role },
  });

  res.status(201).json({ user });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findOne({ _id: req.params.id, role: { $in: ADMIN_ROLES } });
  if (!user) throw ApiError.notFound('Staff account not found');

  // An owner can't demote or deactivate their own account through this endpoint - that could
  // lock every admin out with no owner left to reverse it. They'd need another owner to do it.
  if (user.id === req.user.id && (req.body.role !== undefined || req.body.isActive === false)) {
    throw ApiError.badRequest('You cannot change your own role or deactivate your own account');
  }

  if (req.body.role !== undefined) user.role = req.body.role;
  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
  await user.save();

  await logActivity({
    actor: req.user.id,
    action: 'staff.update',
    targetType: 'User',
    targetId: user.id,
    metadata: { fields: Object.keys(req.body) },
  });

  res.json({ user });
});

import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { User } from '../models/User';

export const list = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ data: user.addresses });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  if (req.body.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
  }
  user.addresses.push(req.body);
  await user.save();
  res.status(201).json({ data: user.addresses });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  const address = user.addresses.id(req.params.addressId as string);
  if (!address) throw ApiError.notFound('Address not found');

  if (req.body.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
  }
  Object.assign(address, req.body);
  await user.save();
  res.json({ data: user.addresses });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  user.addresses.pull({ _id: req.params.addressId });
  await user.save();
  res.json({ data: user.addresses });
});

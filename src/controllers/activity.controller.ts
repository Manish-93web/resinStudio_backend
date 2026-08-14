import { asyncHandler } from '../utils/asyncHandler';
import { ActivityLog } from '../models/ActivityLog';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req, '-createdAt');
  const [data, total] = await Promise.all([
    ActivityLog.find()
      .populate('actor', 'name email role')
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit),
    ActivityLog.countDocuments(),
  ]);
  res.json(buildPaginatedResult(data, total, pagination));
});

import { asyncHandler } from '../utils/asyncHandler';
import { getDashboardStats } from '../services/dashboard.service';

export const stats = asyncHandler(async (req, res) => {
  const rangeDays = Number(req.query.days ?? 30);
  const stats = await getDashboardStats([7, 30, 90].includes(rangeDays) ? rangeDays : 30);
  res.json(stats);
});

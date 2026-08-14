import { asyncHandler } from '../utils/asyncHandler';
import * as waitlistService from '../services/waitlist.service';

export const join = asyncHandler(async (req, res) => {
  const { productId, email, kind } = req.body;
  await waitlistService.joinWaitlist(productId, email, kind);
  res.status(201).json({ ok: true });
});

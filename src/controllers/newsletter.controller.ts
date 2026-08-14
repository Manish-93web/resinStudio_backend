import { asyncHandler } from '../utils/asyncHandler';
import * as newsletterService from '../services/newsletter.service';

export const subscribe = asyncHandler(async (req, res) => {
  const result = await newsletterService.subscribe(req.body.email);
  res.status(201).json(result);
});

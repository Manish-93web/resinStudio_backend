import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as damageClaimService from '../services/damageClaim.service';
import { parsePagination } from '../utils/pagination';
import type { DamageClaimStatus } from '../models/DamageClaim';

// Self-service submit/list-for-order live on order.controller.ts instead (POST/GET
// /api/orders/:id/damage-claims), since that's where the caller's order ownership is already
// established. This controller only covers the admin moderation queue side.

export const listQueue = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req, '-createdAt');
  const status = req.query.status as DamageClaimStatus | undefined;
  const result = await damageClaimService.listForModeration({ status }, pagination);
  res.json(result);
});

export const resolve = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const claim = await damageClaimService.resolveClaim(
    req.params.id as string,
    req.user.id,
    req.body,
  );
  res.json({ claim });
});

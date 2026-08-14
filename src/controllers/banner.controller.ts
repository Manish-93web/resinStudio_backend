import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as bannerService from '../services/banner.service';
import { logActivity } from '../services/activityLog.service';
import type { BannerPlacement } from '../models/Banner';

export const listPublic = asyncHandler(async (req, res) => {
  const placement = req.query.placement as BannerPlacement | undefined;
  const banners = await bannerService.listActive(placement);
  res.json({ data: banners });
});

export const listAdmin = asyncHandler(async (_req, res) => {
  const banners = await bannerService.listForAdmin();
  res.json({ data: banners });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const banner = await bannerService.createBanner(req.body);
  await logActivity({
    actor: req.user.id,
    action: 'banner.create',
    targetType: 'Banner',
    targetId: banner.id,
  });
  res.status(201).json({ banner });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const banner = await bannerService.updateBanner(req.params.id as string, req.body);
  await logActivity({
    actor: req.user.id,
    action: 'banner.update',
    targetType: 'Banner',
    targetId: banner.id,
  });
  res.json({ banner });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await bannerService.deleteBanner(req.params.id as string);
  await logActivity({
    actor: req.user.id,
    action: 'banner.delete',
    targetType: 'Banner',
    targetId: req.params.id,
  });
  res.status(204).send();
});

export const reorder = asyncHandler(async (req, res) => {
  await bannerService.reorderBanners(req.body.orderedIds);
  res.json({ ok: true });
});

import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as settingsService from '../services/settings.service';
import { logActivity } from '../services/activityLog.service';

export const get = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getSettings();
  res.json({ settings });
});

export const getPublic = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getPublicSettings();
  res.json({ settings });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const settings = await settingsService.updateSettings(req.body, req.user.id);
  await logActivity({
    actor: req.user.id,
    action: 'settings.update',
    targetType: 'Settings',
    metadata: { fields: Object.keys(req.body) },
  });
  res.json({ settings });
});

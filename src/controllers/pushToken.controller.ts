import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import * as pushTokenService from '../services/pushToken.service';

export const register = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  await pushTokenService.registerToken(req.user.id, req.body.token, req.body.platform);
  res.status(204).send();
});

export const unregister = asyncHandler(async (req, res) => {
  await pushTokenService.unregisterToken(req.body.token);
  res.status(204).send();
});

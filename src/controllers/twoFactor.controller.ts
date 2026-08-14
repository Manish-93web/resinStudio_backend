import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { User } from '../models/User';
import {
  generateTwoFactorSecret,
  generateTwoFactorQrCode,
  verifyTwoFactorToken,
} from '../services/twoFactor.service';
import { logActivity } from '../services/activityLog.service';

export const setup = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.twoFactorEnabled)
    throw ApiError.conflict('Two-factor authentication is already enabled');

  const secret = generateTwoFactorSecret();
  user.twoFactorSecret = secret;
  await user.save();

  const qrCodeDataUrl = await generateTwoFactorQrCode(user.email, secret);
  res.json({ secret, qrCodeDataUrl });
});

export const verify = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id).select('+twoFactorSecret');
  if (!user?.twoFactorSecret) throw ApiError.badRequest('Call setup before verify');

  if (!verifyTwoFactorToken(req.body.token, user.twoFactorSecret)) {
    throw ApiError.badRequest('Invalid code — check your authenticator app and try again');
  }

  user.twoFactorEnabled = true;
  await user.save();
  await logActivity({ actor: user.id, action: 'auth.2fa_enabled' });

  res.json({ message: 'Two-factor authentication enabled' });
});

export const disable = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id).select('+twoFactorSecret');
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    throw ApiError.badRequest('Two-factor authentication is not enabled');
  }

  if (!verifyTwoFactorToken(req.body.token, user.twoFactorSecret)) {
    throw ApiError.badRequest('Invalid code');
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save();
  await logActivity({ actor: user.id, action: 'auth.2fa_disabled' });

  res.json({ message: 'Two-factor authentication disabled' });
});

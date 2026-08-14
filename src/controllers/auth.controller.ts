import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { isProduction } from '../config/env';
import * as authService from '../services/auth.service';
import { User } from '../models/User';
import type { TokenPair } from '../services/auth.service';

const REFRESH_COOKIE_NAME = 'rs_refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

function sessionMeta(req: Request) {
  const sessionId = req.headers['x-session-id'];
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30d ceiling; actual expiry enforced server-side too
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

/** Web sends the refresh token via httpOnly cookie; the mobile app (no shared cookie jar with
 *  the OS browser) sends it explicitly in the request body instead. Cookie wins if both present. */
function extractRefreshToken(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;
}

function respondWithSession(
  res: Response,
  status: number,
  user: InstanceType<typeof User>,
  tokens: TokenPair,
): void {
  setRefreshCookie(res, tokens.refreshToken);
  res.status(status).json({
    user: user.toJSON(),
    accessToken: tokens.accessToken,
    // Also returned in the body (not just the cookie) so the mobile app can persist it itself.
    refreshToken: tokens.refreshToken,
    // Surfaced here too (not just GET /auth/me) so the admin UI can gate on it immediately after
    // login without a second round trip.
    requiresTwoFactorSetup: authService.requiresTwoFactorSetup(user.role, user.twoFactorEnabled),
  });
}

export const register = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.register(req.body, sessionMeta(req));
  respondWithSession(res, 201, user, tokens);
});

export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body, sessionMeta(req));
  respondWithSession(res, 200, user, tokens);
});

export const refresh = asyncHandler(async (req, res) => {
  const rawToken = extractRefreshToken(req);
  if (!rawToken) throw ApiError.unauthorized('No refresh token provided');

  const { user, tokens } = await authService.refresh(rawToken, sessionMeta(req));
  respondWithSession(res, 200, user, tokens);
});

export const logout = asyncHandler(async (req, res) => {
  const rawToken = extractRefreshToken(req);
  if (rawToken) await authService.logout(rawToken);
  clearRefreshCookie(res);
  res.status(204).send();
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({
    user: user.toJSON(),
    requiresTwoFactorSetup: authService.requiresTwoFactorSetup(user.role, user.twoFactorEnabled),
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  // Same response whether or not the account exists (see service-level comment).
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.newPassword);
  res.json({ message: 'Password reset successfully. Please log in again.' });
});

export const googleAuth = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.loginWithGoogle(req.body.idToken, sessionMeta(req));
  respondWithSession(res, 200, user, tokens);
});

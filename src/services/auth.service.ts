import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { User, type UserDoc, type UserRole } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { ApiError } from '../utils/apiError';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  hashRefreshToken,
} from '../utils/jwt';
import { verifyTwoFactorToken } from './twoFactor.service';
import { sendEmail } from './notification.service';
import { mergeGuestCartIntoUser } from './cart.service';
import { getSettings, renderTemplate } from './settings.service';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = parseDurationMs(env.JWT_REFRESH_EXPIRY);
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const STAFF_ROLES: UserRole[] = ['manager', 'owner'];

function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30d
  const value = Number(match[1]);
  const unitMs =
    { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as string] ?? 86_400_000;
  return value * unitMs;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
  /** Guest cart session id (X-Session-Id header), if present — merged into the user's cart
   *  server-side on successful register/login/Google auth, never client-orchestrated. */
  sessionId?: string;
}

async function issueTokenPair(user: UserDoc, meta: SessionMeta): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = generateRefreshTokenValue();

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    createdByIp: meta.ip,
    userAgent: meta.userAgent,
  });

  return { accessToken, refreshToken };
}

export async function register(
  input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    referredByCode?: string;
  },
  meta: SessionMeta,
): Promise<{ user: UserDoc; tokens: TokenPair }> {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // An unknown/invalid referral code is ignored silently - it shouldn't block account creation.
  let referredBy: string | undefined;
  if (input.referredByCode) {
    const referrer = await User.findOne({ referralCode: input.referredByCode.toUpperCase() });
    if (referrer) referredBy = referrer.id;
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    phone: input.phone,
    role: 'customer',
    referredBy,
  });

  await mergeGuestCartIntoUser(meta.sessionId, user.id);
  const tokens = await issueTokenPair(user, meta);
  return { user, tokens };
}

export async function login(
  input: { email: string; password: string; twoFactorToken?: string },
  meta: SessionMeta,
): Promise<{ user: UserDoc; tokens: TokenPair }> {
  const user = await User.findOne({ email: input.email }).select(
    '+passwordHash +twoFactorSecret +twoFactorEnabled',
  );
  if (!user || !user.passwordHash) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) throw ApiError.unauthorized('Invalid email or password');

  if (user.twoFactorEnabled) {
    if (!input.twoFactorToken) {
      throw new ApiError(401, 'Two-factor authentication code required', {
        requiresTwoFactor: true,
      });
    }
    if (
      !user.twoFactorSecret ||
      !(await verifyTwoFactorToken(input.twoFactorToken, user.twoFactorSecret))
    ) {
      throw ApiError.unauthorized('Invalid two-factor authentication code');
    }
  }

  await mergeGuestCartIntoUser(meta.sessionId, user.id);
  const tokens = await issueTokenPair(user, meta);
  return { user, tokens };
}

export async function refresh(
  rawRefreshToken: string,
  meta: SessionMeta,
): Promise<{ user: UserDoc; tokens: TokenPair }> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored) throw ApiError.unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    // Reuse of an already-rotated-out token is a strong signal the token was stolen — revoke
    // every session for this user as a precaution rather than trusting this one request.
    logger.warn({ userId: stored.user }, 'Refresh token reuse detected — revoking all sessions');
    await RefreshToken.updateMany(
      { user: stored.user, revokedAt: null },
      { revokedAt: new Date() },
    );
    throw ApiError.unauthorized('Refresh token has been revoked');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Refresh token has expired');
  }

  const user = await User.findById(stored.user);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account no longer active');

  const tokens = await issueTokenPair(user, meta);

  stored.revokedAt = new Date();
  stored.replacedByTokenHash = hashRefreshToken(tokens.refreshToken);
  await stored.save();

  return { user, tokens };
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email });
  // Always behave the same whether the account exists or not, so this endpoint can't be used
  // to enumerate registered emails.
  if (!user) return;

  const rawToken = randomBytes(32).toString('hex');
  user.passwordResetTokenHash = createHash('sha256').update(rawToken).digest('hex');
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await user.save();

  const resetUrl = `${env.FRONTEND_URL}/auth/reset-password?token=${rawToken}`;
  const settings = await getSettings();
  const vars = { resetUrl };
  await sendEmail({
    to: user.email,
    subject: renderTemplate(settings.notificationTemplates.passwordReset.subject, vars),
    text: renderTemplate(settings.notificationTemplates.passwordReset.body, vars),
  });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) throw ApiError.badRequest('Invalid or expired reset token');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  // Invalidate every existing session — a password reset should log the user out everywhere.
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
}

const googleClient = env.GOOGLE_OAUTH_CLIENT_ID
  ? new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID)
  : null;

export async function loginWithGoogle(
  idToken: string,
  meta: SessionMeta,
): Promise<{ user: UserDoc; tokens: TokenPair }> {
  if (!googleClient) throw ApiError.internal('Google sign-in is not configured');

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw ApiError.unauthorized('Invalid Google token');

  let user = await User.findOne({ email: payload.email.toLowerCase() });
  if (!user) {
    user = await User.create({
      name: payload.name ?? payload.email,
      email: payload.email.toLowerCase(),
      googleId: payload.sub,
      role: 'customer',
    });
  } else if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save();
  }

  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  await mergeGuestCartIntoUser(meta.sessionId, user.id);
  const tokens = await issueTokenPair(user, meta);
  return { user, tokens };
}

export function requiresTwoFactorSetup(role: UserRole, twoFactorEnabled: boolean): boolean {
  return STAFF_ROLES.includes(role) && !twoFactorEnabled;
}

export { verifyAccessToken };

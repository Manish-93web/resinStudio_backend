import { z } from '../utils/zod';

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72),
    phone: z.string().trim().min(6).max(20).optional(),
    // An unknown/invalid code is ignored silently rather than failing registration - see
    // auth.service.ts#register.
    referredByCode: z.string().trim().toUpperCase().optional(),
  })
  .openapi('RegisterRequest');

export const loginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1),
    twoFactorToken: z.string().length(6).optional(),
  })
  .openapi('LoginRequest');

export const forgotPasswordBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
  })
  .openapi('ForgotPasswordRequest');

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8).max(72),
  })
  .openapi('ResetPasswordRequest');

export const googleAuthBodySchema = z
  .object({
    idToken: z.string().min(1),
  })
  .openapi('GoogleAuthRequest');

export const twoFactorVerifyBodySchema = z
  .object({
    token: z.string().length(6),
  })
  .openapi('TwoFactorVerifyRequest');

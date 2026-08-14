import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as twoFactorController from '../controllers/twoFactor.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import {
  registerBodySchema,
  loginBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  googleAuthBodySchema,
  twoFactorVerifyBodySchema,
} from '../schemas/auth.schema';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerBodySchema }),
  authController.register,
);
authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginBodySchema }),
  authController.login,
);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordBodySchema }),
  authController.forgotPassword,
);
authRouter.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordBodySchema }),
  authController.resetPassword,
);

authRouter.post(
  '/google',
  authRateLimiter,
  validate({ body: googleAuthBodySchema }),
  authController.googleAuth,
);

authRouter.post('/2fa/setup', requireAuth, twoFactorController.setup);
authRouter.post(
  '/2fa/verify',
  requireAuth,
  validate({ body: twoFactorVerifyBodySchema }),
  twoFactorController.verify,
);
authRouter.post(
  '/2fa/disable',
  requireAuth,
  validate({ body: twoFactorVerifyBodySchema }),
  twoFactorController.disable,
);

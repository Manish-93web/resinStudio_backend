import { Router } from 'express';
import * as waitlistController from '../controllers/waitlist.controller';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { joinWaitlistBodySchema } from '../schemas/waitlist.schema';

// Mounted at /api/waitlist
export const waitlistRouter = Router();
waitlistRouter.post(
  '/',
  authRateLimiter,
  validate({ body: joinWaitlistBodySchema }),
  waitlistController.join,
);

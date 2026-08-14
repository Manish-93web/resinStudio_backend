import { Router } from 'express';
import * as newsletterController from '../controllers/newsletter.controller';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { subscribeNewsletterBodySchema } from '../schemas/newsletter.schema';

// Mounted at /api/newsletter
export const newsletterRouter = Router();
newsletterRouter.post(
  '/subscribe',
  authRateLimiter,
  validate({ body: subscribeNewsletterBodySchema }),
  newsletterController.subscribe,
);

import { Router } from 'express';
import * as contactController from '../controllers/contact.controller';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { contactBodySchema } from '../schemas/contact.schema';

export const contactRouter = Router();

contactRouter.post(
  '/',
  authRateLimiter,
  validate({ body: contactBodySchema }),
  contactController.submit,
);

import { Router } from 'express';
import * as uploadController from '../controllers/upload.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { uploadSignatureQuerySchema } from '../schemas/product.schema';

export const uploadRouter = Router();

// Role gating happens inside the controller, not here - which folders a caller may upload to
// depends on the folder itself (any customer may upload review/damage-claim photos, but only
// admin roles may upload product/banner/blog/commission images), not a single flat role check.
uploadRouter.get(
  '/sign',
  requireAuth,
  validate({ query: uploadSignatureQuerySchema }),
  uploadController.sign,
);

import { Router } from 'express';
import * as addressController from '../controllers/address.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { addressBodySchema } from '../schemas/commerce.schema';
import { z } from '../utils/zod';

export const addressRouter = Router();

addressRouter.use(requireAuth);

addressRouter.get('/', addressController.list);
addressRouter.post('/', validate({ body: addressBodySchema }), addressController.create);
addressRouter.put(
  '/:addressId',
  validate({ params: z.object({ addressId: z.string() }), body: addressBodySchema.partial() }),
  addressController.update,
);
addressRouter.delete(
  '/:addressId',
  validate({ params: z.object({ addressId: z.string() }) }),
  addressController.remove,
);

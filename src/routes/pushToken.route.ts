import { Router } from 'express';
import * as pushTokenController from '../controllers/pushToken.controller';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import {
  registerPushTokenBodySchema,
  unregisterPushTokenBodySchema,
} from '../schemas/pushToken.schema';

// Mounted at /api/account/push-token
export const pushTokenRouter = Router();
pushTokenRouter.use(requireAuth);

pushTokenRouter.post(
  '/',
  validate({ body: registerPushTokenBodySchema }),
  pushTokenController.register,
);
pushTokenRouter.delete(
  '/',
  validate({ body: unregisterPushTokenBodySchema }),
  pushTokenController.unregister,
);

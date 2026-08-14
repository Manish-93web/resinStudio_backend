import { z } from '../utils/zod';

export const registerPushTokenBodySchema = z
  .object({
    token: z.string().trim().min(1),
    platform: z.enum(['android', 'ios']),
  })
  .openapi('RegisterPushTokenRequest');

export const unregisterPushTokenBodySchema = z
  .object({ token: z.string().trim().min(1) })
  .openapi('UnregisterPushTokenRequest');

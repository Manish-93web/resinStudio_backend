import { z } from '../utils/zod';

export const subscribeNewsletterBodySchema = z
  .object({ email: z.string().trim().toLowerCase().email() })
  .openapi('SubscribeNewsletterRequest');

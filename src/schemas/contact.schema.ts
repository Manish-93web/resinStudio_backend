import { z } from '../utils/zod';

export const contactBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email(),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(4000),
  })
  .openapi('ContactRequest');

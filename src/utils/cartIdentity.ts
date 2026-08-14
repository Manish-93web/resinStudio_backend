import type { Request } from 'express';
import { ApiError } from './apiError';

/** Guest carts are identified by a client-generated session id sent via header (not a
 *  server-set cookie), since the same cart API is consumed by both the web app (which could use
 *  cookies) and the React Native app (which has no cookie jar) — one mechanism for both. */
export interface CartIdentity {
  userId?: string;
  sessionId?: string;
}

export function getCartIdentity(req: Request): CartIdentity {
  const sessionId = req.headers['x-session-id'];
  const identity: CartIdentity = {
    userId: req.user?.id,
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
  };
  if (!identity.userId && !identity.sessionId) {
    throw ApiError.badRequest('Missing X-Session-Id header for guest cart access');
  }
  return identity;
}

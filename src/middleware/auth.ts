import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';
import type { UserRole } from '../models/User';

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return undefined;
}

/** Requires a valid access token; populates req.user. Rejects with 401 otherwise. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) return next(ApiError.unauthorized('Authentication required'));

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}

/** Populates req.user if a valid token is present, but never rejects — for routes that behave
 *  differently for guests vs logged-in users (e.g. cart) without requiring login. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // Invalid/expired token on an optional-auth route: proceed as a guest rather than erroring.
  }
  next();
}

/** Must run after requireAuth. Rejects with 403 unless req.user.role is one of `roles`.
 *  This is the server-side enforcement point — the admin UI hiding a button is not enough,
 *  since a modified client could still call the API directly (IMPLEMENTATION_PROMPT.md §12). */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden('Insufficient permissions'));
    next();
  };
}

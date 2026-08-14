import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';
import { Sentry, isSentryConfigured } from '../config/sentry';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, err.message);
    }
    res.status(err.statusCode).json({
      error: { message: err.message, details: err.details },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  // Only genuine 5xx/unhandled failures are worth an error-tracking event - ApiError's own 4xx
  // branch above (expected client errors) never reaches here. A no-op when SENTRY_DSN isn't set.
  if (isSentryConfigured) Sentry.captureException(err);
  logger.error({ err, path: req.originalUrl }, message);

  res.status(500).json({
    error: {
      message: isProduction ? 'Internal server error' : message,
      stack: isProduction || !(err instanceof Error) ? undefined : err.stack,
    },
  });
}

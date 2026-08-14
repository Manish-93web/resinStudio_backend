import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Validates and coerces req.body/query/params against Zod schemas; throws ZodError on failure
 *  (caught by the central error handler, which returns a consistent 400 shape). */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) req.body = schemas.body.parse(req.body) as unknown;
    if (schemas.query) req.query = schemas.query.parse(req.query) as Request['query'];
    if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
    next();
  };
}

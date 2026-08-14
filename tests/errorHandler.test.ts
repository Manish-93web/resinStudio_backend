import type { Request, Response } from 'express';
import { errorHandler } from '../src/middleware/errorHandler';
import { ApiError } from '../src/utils/apiError';
import { isSentryConfigured } from '../src/config/sentry';

function createMockRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
  return res;
}

describe('errorHandler (Sentry integration, §10)', () => {
  it('SENTRY_DSN is unset in .env.test, so Sentry is confirmed inert for this suite', () => {
    expect(isSentryConfigured).toBe(false);
  });

  it('handles a generic (non-ApiError) 500 without throwing, even with Sentry inert', () => {
    const req = { originalUrl: '/api/whatever' } as Request;
    const res = createMockRes();
    const next = jest.fn();

    expect(() => errorHandler(new Error('boom'), req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: 'boom' }) }),
    );
  });

  it('still returns the correct 4xx shape for an ApiError (Sentry is never invoked on that path)', () => {
    const req = { originalUrl: '/api/whatever' } as Request;
    const res = createMockRes();
    const next = jest.fn();

    errorHandler(ApiError.badRequest('bad input'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'bad input', details: undefined } });
  });
});

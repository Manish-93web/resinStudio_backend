import type { UserRole } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
      };
      /** Captured by the express.json() verify callback in app.ts so webhook handlers can check
       *  a provider's HMAC signature against the exact bytes received, not a re-serialized copy. */
      rawBody?: Buffer;
      /** Set by pino-http's genReqId (app.ts) - either the caller's X-Request-Id header or a
       *  freshly generated UUID, echoed back on the response for cross-service tracing. */
      id?: string;
    }
  }
}

export {};

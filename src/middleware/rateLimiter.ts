import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

// `skip` in test env only - integration tests routinely log in as several different roles across
// many `it()` blocks within one file (each a real request through this same middleware), which
// legitimately exceeds a limit sized for real-world abuse prevention and has nothing to do with
// what any individual test is verifying. Same reasoning as `autoLogging: env.NODE_ENV !== 'test'`
// in app.ts - production/development behavior is unchanged, this only relaxes the test process.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { message: 'Too many attempts, please try again later.' } },
});

export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { message: 'Too many requests, please slow down.' } },
});

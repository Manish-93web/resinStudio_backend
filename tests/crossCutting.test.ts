import request from 'supertest';
import { createApp } from '../src/app';
import { isRedisConfigured } from '../src/config/redis';
import { isAlgoliaConfigured } from '../src/config/algolia';
import { isStripeConfigured } from '../src/config/stripe';
import { isSentryConfigured } from '../src/config/sentry';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Request-id tracing (§9)', () => {
  const app = createApp();

  it('echoes a freshly generated UUID as X-Request-Id when the caller sends none', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });

  it('echoes back an inbound X-Request-Id unchanged, for cross-service tracing', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'trace-abc-123');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('generates a distinct request id per request when none is supplied', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/health'),
    ]);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});

describe('Optional integrations are fully inert with no credentials configured (.env.test)', () => {
  it('Sentry, Redis, Algolia, and Stripe all report unconfigured', () => {
    expect(isSentryConfigured).toBe(false);
    expect(isRedisConfigured).toBe(false);
    expect(isAlgoliaConfigured).toBe(false);
    expect(isStripeConfigured).toBe(false);
  });

  it('the app still boots and serves ordinary requests with every optional integration unconfigured', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

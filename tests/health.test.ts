import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('disconnected');
  });
});

describe('unknown route', () => {
  it('returns a consistent 404 error shape', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/Route not found/);
  });
});

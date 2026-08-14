import request from 'supertest';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Product } from '../../src/models/Product';

const app = createApp();

beforeAll(async () => {
  await setupTestDb();
}, 60_000);

afterAll(async () => {
  await teardownTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

describe('Public settings', () => {
  it('exposes only the safe subset, with no auth required', async () => {
    const res = await request(app).get('/api/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.settings.storeName).toBe('Resin by Richa');
    expect(res.body.settings).not.toHaveProperty('shipping');
    expect(res.body.settings).not.toHaveProperty('taxRatePercent');
    expect(res.body.settings).not.toHaveProperty('notificationTemplates');
  });
});

describe('Contact form', () => {
  it('accepts a valid submission with no auth required', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Jane Doe',
        email: 'jane@example.com',
        subject: 'Question about an order',
        message: 'Hi there!',
      });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Jane Doe', email: 'not-an-email', subject: 'x', message: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('Product country of origin', () => {
  it('defaults to India when not specified', async () => {
    const product = await Product.create({
      title: 'Origin Test Item',
      slug: 'origin-test-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 500,
      status: 'published',
      variants: [{ sku: 'ORIGIN-1', options: {}, price: 500, stock: 5, images: [] }],
    });
    expect(product.countryOfOrigin).toBe('India');
  });

  it('is surfaced on the public product detail response', async () => {
    await Product.create({
      title: 'Imported Item',
      slug: 'imported-item',
      description: 'x',
      type: 'supply',
      basePrice: 500,
      status: 'published',
      countryOfOrigin: 'Germany',
      variants: [{ sku: 'IMPORT-1', options: {}, price: 500, stock: 5, images: [] }],
    });
    const res = await request(app).get('/api/products/imported-item');
    expect(res.status).toBe(200);
    expect(res.body.product.countryOfOrigin).toBe('Germany');
  });
});

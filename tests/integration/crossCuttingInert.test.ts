import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Product } from '../../src/models/Product';
import { Order } from '../../src/models/Order';
import { User } from '../../src/models/User';

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

const address = { line1: 'x', city: 'x', state: 'x', pincode: '123456', phone: '9876543210' };

async function loginAs(role: 'manager' | 'owner', email = `${role}@example.com`) {
  const passwordHash = await bcrypt.hash('password123', 4);
  await User.create({ name: role, email, passwordHash, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

describe('Stripe endpoints are honest 500s (not crashes) when unconfigured (§13)', () => {
  it('POST /api/payments/stripe/create-intent fails cleanly instead of crashing the process', async () => {
    const product = await Product.create({
      title: 'Stripe Inert Item',
      slug: 'stripe-inert-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 500,
      status: 'published',
      variants: [{ sku: 'SI-1', options: {}, price: 500, stock: 5, images: [] }],
    });
    const sessionId = 'stripe-inert-session';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'SI-1', qty: 1 });

    const res = await request(app)
      .post('/api/payments/stripe/create-intent')
      .set('X-Session-Id', sessionId)
      .send({ shippingAddress: address, guestEmail: 'x@example.com' });

    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/stripe is not configured/i);

    // The app itself is still healthy afterward - this wasn't an unhandled crash.
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
  });

  it('POST /api/payments/stripe/webhook fails cleanly on a missing signature rather than crashing', async () => {
    const res = await request(app).post('/api/payments/stripe/webhook').send({ some: 'payload' });
    expect(res.status).toBe(400);
  });

  it('order refund on a stripe-paid order fails cleanly (not configured) rather than crashing', async () => {
    const order = await Order.create({
      orderNumber: 'RS-STRIPE-INERT-REFUND',
      items: [{ title: 'x', qty: 1, price: 500 }],
      subtotal: 500,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 500,
      shippingAddress: address,
      billingAddress: address,
      paymentMethod: 'stripe',
      paymentStatus: 'paid',
      paymentRef: 'pi_not_real',
      payments: [
        {
          amount: 500,
          method: 'stripe',
          ref: 'pi_not_real',
          status: 'paid',
          type: 'full',
          capturedAt: new Date(),
        },
      ],
      status: 'delivered',
    });

    const token = await loginAs('owner');
    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/stripe is not configured/i);
  });
});

describe('Redis/Algolia pass-through (§11/§12) — product reads/writes work identically with no cache/search backend', () => {
  it('lists, fetches by slug, and free-text searches products correctly with Redis and Algolia both unconfigured', async () => {
    await Product.create({
      title: 'Cache Pass-through Coaster',
      slug: 'cache-pass-through-coaster',
      description: 'A resin coaster',
      type: 'finished_art',
      basePrice: 300,
      status: 'published',
      tags: ['coaster'],
      variants: [{ sku: 'CACHE-1', options: {}, price: 300, stock: 5, images: [] }],
    });

    const listRes = await request(app).get('/api/products');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    // A second call must return the same (correct) data - proves the no-op cache layer never
    // serves stale/broken results, it just never caches at all.
    const listRes2 = await request(app).get('/api/products');
    expect(listRes2.body.total).toBe(listRes.body.total);

    const bySlug = await request(app).get('/api/products/cache-pass-through-coaster');
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.product.title).toBe('Cache Pass-through Coaster');

    // filters.q with Algolia unconfigured must still fall back to the existing $text search path.
    const searchRes = await request(app).get('/api/products?q=coaster');
    expect(searchRes.status).toBe(200);
    expect(
      searchRes.body.data.some((p: { slug: string }) => p.slug === 'cache-pass-through-coaster'),
    ).toBe(true);
  });

  it('a product update is immediately visible on the next read (no stale cache without Redis)', async () => {
    const token = await loginAs('manager');
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Freshness Test Item',
        description: 'x',
        type: 'supply',
        basePrice: 100,
        variants: [{ sku: 'FRESH-1', price: 100, stock: 5 }],
        status: 'published',
      });
    expect(created.status).toBe(201);

    await request(app).get('/api/products'); // warm whatever pass-through path exists

    const updated = await request(app)
      .put(`/api/products/${created.body.product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ basePrice: 250 });
    expect(updated.status).toBe(200);

    const refetched = await request(app).get(`/api/products/id/${created.body.product._id}`);
    expect(refetched.body.product.basePrice).toBe(250);
  });
});

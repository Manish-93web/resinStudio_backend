import request from 'supertest';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Product } from '../../src/models/Product';
import { User } from '../../src/models/User';
import bcrypt from 'bcryptjs';

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

async function seedProduct(overrides: Record<string, unknown> = {}) {
  return Product.create({
    title: 'Test Coaster',
    slug: 'test-coaster',
    description: 'x',
    type: 'finished_art',
    basePrice: 500,
    status: 'published',
    variants: [{ sku: 'SKU-1', options: {}, price: 500, stock: 5, images: [] }],
    ...overrides,
  });
}

describe('Guest cart', () => {
  it('adds items and computes subtotal from current price', async () => {
    const product = await seedProduct();
    const sessionId = 'guest-session-1';

    const res = await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'SKU-1', qty: 2 });

    expect(res.status).toBe(201);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.subtotal).toBe(1000);
  });

  it('rejects adding more than available stock', async () => {
    const product = await seedProduct({
      variants: [{ sku: 'SKU-1', options: {}, price: 500, stock: 2, images: [] }],
    });
    const res = await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', 'guest-session-2')
      .send({ productId: product.id, variantSku: 'SKU-1', qty: 3 });

    expect(res.status).toBe(409);
  });

  it('requires a session id for guest access', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(400);
  });

  it('rejects adding a product whose scheduled drop has not happened yet, even via a direct API call', async () => {
    const product = await seedProduct({ dropAt: new Date(Date.now() + 60 * 60 * 1000) });
    const res = await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', 'guest-drop-session')
      .send({ productId: product.id, variantSku: 'SKU-1', qty: 1 });

    expect(res.status).toBe(409);
  });

  it('allows adding a product once its drop time has passed', async () => {
    const product = await seedProduct({ dropAt: new Date(Date.now() - 60 * 1000) });
    const res = await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', 'guest-drop-passed-session')
      .send({ productId: product.id, variantSku: 'SKU-1', qty: 1 });

    expect(res.status).toBe(201);
  });
});

describe('Cart merge on login (§ risk flags)', () => {
  it('merges guest cart into user cart, capping at live stock and dropping the guest coupon', async () => {
    const product = await seedProduct({
      variants: [{ sku: 'SKU-1', options: {}, price: 500, stock: 3, images: [] }],
    });
    const sessionId = 'guest-session-merge';
    const email = 'merge@example.com';
    const passwordHash = await bcrypt.hash('password123', 4);
    await User.create({ name: 'Merge Test', email, passwordHash, role: 'customer' });

    // Guest adds 2 to cart and applies a coupon.
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'SKU-1', qty: 2 });
    await request(app)
      .post('/api/cart/coupon')
      .set('X-Session-Id', sessionId)
      .send({ code: 'WELCOME10' });

    // Login should merge the guest cart into the user's cart.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Session-Id', sessionId)
      .send({ email, password: 'password123' });
    expect(loginRes.status).toBe(200);

    const cartRes = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(cartRes.body.cart.items).toHaveLength(1);
    expect(cartRes.body.cart.items[0].qty).toBe(2);
    expect(cartRes.body.cart.couponCode).toBeNull();

    // The guest session's cart should be gone.
    const guestCartRes = await request(app).get('/api/cart').set('X-Session-Id', sessionId);
    expect(guestCartRes.body.cart.items).toHaveLength(0);
  });

  it('caps merged quantity at current stock rather than overselling', async () => {
    const product = await seedProduct({
      variants: [{ sku: 'SKU-1', options: {}, price: 500, stock: 1, images: [] }],
    });
    const sessionId = 'guest-session-cap';
    const email = 'cap@example.com';
    const passwordHash = await bcrypt.hash('password123', 4);
    await User.create({ name: 'Cap Test', email, passwordHash, role: 'customer' });

    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'SKU-1', qty: 1 });

    // Stock drops to 0 before the user logs in (someone else bought it via another channel).
    await Product.updateOne({ _id: product._id }, { $set: { 'variants.0.stock': 0 } });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Session-Id', sessionId)
      .send({ email, password: 'password123' });

    const cartRes = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    // Sold-out item should have been dropped entirely, not merged at qty 0.
    expect(cartRes.body.cart.items).toHaveLength(0);
  });
});

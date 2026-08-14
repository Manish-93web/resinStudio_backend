import request from 'supertest';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Product } from '../../src/models/Product';
import bcrypt from 'bcryptjs';
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

const domesticAddress = {
  line1: '1 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  phone: '9876543210',
};

async function addToCart(sessionId: string, productId: string, sku: string, qty = 1) {
  return request(app)
    .post('/api/cart/items')
    .set('X-Session-Id', sessionId)
    .send({ productId, variantSku: sku, qty });
}

async function checkout(sessionId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/orders')
    .set('X-Session-Id', sessionId)
    .send({
      shippingAddress: domesticAddress,
      guestEmail: `${sessionId}@example.com`,
      paymentMethod: 'cod',
      ...overrides,
    });
}

describe('Weight-tier domestic shipping', () => {
  // Defaults: [{maxGrams:500,rate:60},{maxGrams:1000,rate:99},{maxGrams:2000,rate:149},{maxGrams:5000,rate:249}]
  it.each([
    [400, 60],
    [500, 60],
    [900, 99],
    [1500, 149],
    [4000, 249],
    [10000, 249], // heavier than every tier - falls back to the last tier's rate
  ])(
    'charges the correct tier rate for a %ig item (under the free-shipping threshold)',
    async (weightGrams, expectedShipping) => {
      const product = await Product.create({
        title: `Weight Tier Item ${weightGrams}`,
        slug: `weight-tier-item-${weightGrams}`,
        description: 'x',
        type: 'supply',
        basePrice: 100, // low enough to stay under the ₹999 free-shipping threshold
        status: 'published',
        weightGrams,
        variants: [{ sku: 'WT-1', options: {}, price: 100, stock: 10, images: [] }],
      });
      const sessionId = `weight-tier-session-${weightGrams}`;
      await addToCart(sessionId, product.id, 'WT-1', 1);

      const res = await checkout(sessionId);
      expect(res.status).toBe(201);
      expect(res.body.order.shipping).toBe(expectedShipping);
    },
  );

  it('falls back to the 250g default weight when a product has no weightGrams set', async () => {
    const product = await Product.create({
      title: 'No Weight Item',
      slug: 'no-weight-item',
      description: 'x',
      type: 'supply',
      basePrice: 100,
      status: 'published',
      variants: [{ sku: 'NW-1', options: {}, price: 100, stock: 10, images: [] }],
    });
    const sessionId = 'no-weight-session';
    await addToCart(sessionId, product.id, 'NW-1', 1);

    const res = await checkout(sessionId);
    expect(res.status).toBe(201);
    expect(res.body.order.shipping).toBe(60); // 250g default → first tier
  });

  it('sums weight across quantity and multiple lines to pick the tier', async () => {
    const product = await Product.create({
      title: 'Heavy Multi Item',
      slug: 'heavy-multi-item',
      description: 'x',
      type: 'supply',
      basePrice: 50,
      status: 'published',
      weightGrams: 300,
      variants: [{ sku: 'HM-1', options: {}, price: 50, stock: 20, images: [] }],
    });
    const sessionId = 'heavy-multi-session';
    // 4 units * 300g = 1200g → the third tier (maxGrams 2000, rate 149)
    await addToCart(sessionId, product.id, 'HM-1', 4);

    const res = await checkout(sessionId);
    expect(res.status).toBe(201);
    expect(res.body.order.shipping).toBe(149);
  });
});

describe('International shipping', () => {
  it('uses the flat internationalRate (not weight tiers) when the shipping country is not India', async () => {
    const product = await Product.create({
      title: 'Intl Item',
      slug: 'intl-item',
      description: 'x',
      type: 'supply',
      basePrice: 100,
      status: 'published',
      variants: [{ sku: 'INTL-1', options: {}, price: 100, stock: 10, images: [] }],
    });
    const sessionId = 'intl-session';
    await addToCart(sessionId, product.id, 'INTL-1', 1);

    const res = await checkout(sessionId, {
      shippingAddress: { ...domesticAddress, country: 'USA' },
    });
    expect(res.status).toBe(201);
    expect(res.body.order.isInternational).toBe(true);
    expect(res.body.order.shipping).toBe(999); // default settings.shipping.internationalRate
  });

  it('treats an explicit "India" (any case) shipping country as domestic', async () => {
    const product = await Product.create({
      title: 'Explicit India Item',
      slug: 'explicit-india-item',
      description: 'x',
      type: 'supply',
      basePrice: 100,
      status: 'published',
      variants: [{ sku: 'IND-1', options: {}, price: 100, stock: 10, images: [] }],
    });
    const sessionId = 'explicit-india-session';
    await addToCart(sessionId, product.id, 'IND-1', 1);

    const res = await checkout(sessionId, {
      shippingAddress: { ...domesticAddress, country: 'india' },
    });
    expect(res.status).toBe(201);
    expect(res.body.order.isInternational).toBe(false);
  });

  it('is never free internationally when internationalFreeShippingThreshold is unset', async () => {
    const product = await Product.create({
      title: 'Intl Expensive Item',
      slug: 'intl-expensive-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 50000,
      status: 'published',
      variants: [{ sku: 'INTLX-1', options: {}, price: 50000, stock: 5, images: [] }],
    });
    const sessionId = 'intl-expensive-session';
    await addToCart(sessionId, product.id, 'INTLX-1', 1);

    const res = await checkout(sessionId, {
      shippingAddress: { ...domesticAddress, country: 'Canada' },
    });
    expect(res.status).toBe(201);
    expect(res.body.order.shipping).toBe(999);
  });

  it('waives international shipping once the order meets an admin-configured internationalFreeShippingThreshold', async () => {
    const passwordHash = await bcrypt.hash('password123', 4);
    await User.create({
      name: 'owner',
      email: 'intl-owner@example.com',
      passwordHash,
      role: 'owner',
    });
    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'intl-owner@example.com', password: 'password123' });

    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerLogin.body.accessToken}`)
      .send({
        shipping: {
          flatRate: 99,
          freeShippingThreshold: 999,
          internationalFreeShippingThreshold: 3000,
        },
      });

    const product = await Product.create({
      title: 'Intl Free Ship Item',
      slug: 'intl-free-ship-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 4000,
      status: 'published',
      variants: [{ sku: 'INTLF-1', options: {}, price: 4000, stock: 5, images: [] }],
    });
    const sessionId = 'intl-free-ship-session';
    await addToCart(sessionId, product.id, 'INTLF-1', 1);

    const res = await checkout(sessionId, {
      shippingAddress: { ...domesticAddress, country: 'UK' },
    });
    expect(res.status).toBe(201);
    expect(res.body.order.shipping).toBe(0);
  });
});

describe('Hazmat flag propagation', () => {
  it('flags containsHazmat when a cart item has groundOnly or heatSensitive set', async () => {
    const hazmatProduct = await Product.create({
      title: 'Epoxy Resin',
      slug: 'epoxy-resin-hazmat',
      description: 'x',
      type: 'supply',
      basePrice: 800,
      status: 'published',
      shippingConstraints: { groundOnly: true, heatSensitive: true },
      variants: [{ sku: 'HAZ-1', options: {}, price: 800, stock: 10, images: [] }],
    });
    const sessionId = 'hazmat-session';
    await addToCart(sessionId, hazmatProduct.id, 'HAZ-1', 1);

    const res = await checkout(sessionId);
    expect(res.status).toBe(201);
    expect(res.body.order.containsHazmat).toBe(true);
  });

  it('does not flag containsHazmat for an ordinary cart with no hazmat items', async () => {
    const product = await Product.create({
      title: 'Plain Coaster',
      slug: 'plain-coaster',
      description: 'x',
      type: 'finished_art',
      basePrice: 300,
      status: 'published',
      variants: [{ sku: 'PLAIN-1', options: {}, price: 300, stock: 10, images: [] }],
    });
    const sessionId = 'no-hazmat-session';
    await addToCart(sessionId, product.id, 'PLAIN-1', 1);

    const res = await checkout(sessionId);
    expect(res.status).toBe(201);
    expect(res.body.order.containsHazmat).toBe(false);
  });

  it('flags containsHazmat true if even one line item in a mixed cart is hazmat (OR across lines)', async () => {
    const safeProduct = await Product.create({
      title: 'Safe Mold',
      slug: 'safe-mold',
      description: 'x',
      type: 'supply',
      basePrice: 200,
      status: 'published',
      variants: [{ sku: 'SAFE-1', options: {}, price: 200, stock: 10, images: [] }],
    });
    const hazmatProduct = await Product.create({
      title: 'Heat Sensitive Pigment',
      slug: 'heat-sensitive-pigment',
      description: 'x',
      type: 'supply',
      basePrice: 150,
      status: 'published',
      shippingConstraints: { groundOnly: false, heatSensitive: true },
      variants: [{ sku: 'HAZ-2', options: {}, price: 150, stock: 10, images: [] }],
    });
    const sessionId = 'mixed-hazmat-session';
    await addToCart(sessionId, safeProduct.id, 'SAFE-1', 1);
    await addToCart(sessionId, hazmatProduct.id, 'HAZ-2', 1);

    const res = await checkout(sessionId);
    expect(res.status).toBe(201);
    expect(res.body.order.containsHazmat).toBe(true);
  });
});

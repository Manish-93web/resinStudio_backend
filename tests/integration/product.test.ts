import request from 'supertest';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
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

async function loginAs(role: 'customer' | 'staff' | 'manager' | 'owner') {
  const email = `${role}@example.com`;
  const passwordHash = await bcrypt.hash('password123', 4);
  await User.create({ name: role, email, passwordHash, role });

  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

const validProduct = {
  title: 'Test Coaster Set',
  description: 'A set of test coasters',
  type: 'finished_art' as const,
  basePrice: 500,
  variants: [{ sku: 'TEST-001', options: {}, price: 500, stock: 5, images: [] }],
};

describe('Product RBAC', () => {
  it('rejects product creation without auth', async () => {
    const res = await request(app).post('/api/products').send(validProduct);
    expect(res.status).toBe(401);
  });

  it('rejects product creation from a customer', async () => {
    const token = await loginAs('customer');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    expect(res.status).toBe(403);
  });

  it('rejects product creation from staff (read-only per §7.8)', async () => {
    const token = await loginAs('staff');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    expect(res.status).toBe(403);
  });

  it('allows product creation from a manager', async () => {
    const token = await loginAs('manager');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    expect(res.status).toBe(201);
    expect(res.body.product.slug).toBe('test-coaster-set');
  });

  it('allows product creation from an owner', async () => {
    const token = await loginAs('owner');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    expect(res.status).toBe(201);
  });
});

describe('Product visibility', () => {
  it('hides draft products from public listing', async () => {
    const token = await loginAs('owner');
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validProduct, status: 'draft' });

    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('shows draft products to staff/manager/owner', async () => {
    const ownerToken = await loginAs('owner');
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...validProduct, status: 'draft' });

    const staffToken = await loginAs('staff');
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.body.data).toHaveLength(1);
  });

  it('does not show draft products to an ordinary logged-in customer', async () => {
    const ownerToken = await loginAs('owner');
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...validProduct, status: 'draft' });

    const customerToken = await loginAs('customer');
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns a published product by slug', async () => {
    const token = await loginAs('owner');
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validProduct, status: 'published' });

    const res = await request(app).get('/api/products/test-coaster-set');
    expect(res.status).toBe(200);
    expect(res.body.product.title).toBe(validProduct.title);
  });
});

describe('Slug generation', () => {
  it('appends a numeric suffix on title collision', async () => {
    const token = await loginAs('owner');
    const first = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    const second = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);

    expect(first.body.product.slug).toBe('test-coaster-set');
    expect(second.body.product.slug).toBe('test-coaster-set-2');
  });
});

describe('One-of-a-kind product invariant (§6.7)', () => {
  it('caps stock at 1 and collapses to a single variant even if more were submitted', async () => {
    const token = await loginAs('owner');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validProduct,
        title: 'Unique River Panel',
        isUnique: true,
        variants: [
          { sku: 'UNIQUE-1', options: {}, price: 5000, stock: 3, images: [] },
          { sku: 'UNIQUE-2', options: {}, price: 5000, stock: 1, images: [] },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.product.variants).toHaveLength(1);
    expect(res.body.product.variants[0].stock).toBe(1);
  });
});

describe('Text search', () => {
  it('finds products by title/description/tags', async () => {
    const token = await loginAs('owner');
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validProduct, title: 'Ocean Wave Coaster', tags: ['ocean'], status: 'published' });
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validProduct, title: 'Forest Green Tray', tags: ['forest'], status: 'published' });

    const res = await request(app).get('/api/products').query({ q: 'ocean' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Ocean Wave Coaster');
  });
});

describe('Categories', () => {
  it('allows a manager to create a category and lists it publicly', async () => {
    const token = await loginAs('manager');
    const createRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Coasters & Trays' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.category.slug).toBe('coasters-trays');

    const listRes = await request(app).get('/api/categories');
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects category creation from a customer', async () => {
    const token = await loginAs('customer');
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test' });
    expect(res.status).toBe(403);
  });
});

describe('Product model guard: at least one variant', () => {
  it('rejects a product with zero variants at the schema/validation layer', async () => {
    const token = await loginAs('owner');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validProduct, variants: [] });

    expect(res.status).toBe(400);
  });
});

describe('Partial product updates do not reset fields the caller never touched', () => {
  it('editing only basePrice leaves status/isUnique/tags/category untouched', async () => {
    const token = await loginAs('owner');
    const categoryRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Wall Art' });
    const categoryId = categoryRes.body.category._id;

    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validProduct,
        title: 'Partial Update Guard Piece',
        status: 'published',
        isUnique: true,
        tags: ['wall-art', 'featured'],
        category: [categoryId],
        countryOfOrigin: 'India',
      });
    expect(createRes.status).toBe(201);
    const productId = createRes.body.product._id;

    // A caller doing a genuinely partial edit - only the price - must not silently reset
    // everything else back to its create-schema default (§ regression: Zod .partial() does not
    // suppress .default(...), so a naive updateProductBodySchema would have reset
    // status→'draft', isUnique→false, tags/category→[] here even though none of that was sent).
    const updateRes = await request(app)
      .put(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ basePrice: 777 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.product.basePrice).toBe(777);
    expect(updateRes.body.product.status).toBe('published');
    expect(updateRes.body.product.isUnique).toBe(true);
    expect(updateRes.body.product.tags).toEqual(['wall-art', 'featured']);
    expect(updateRes.body.product.category).toEqual([categoryId]);
    expect(updateRes.body.product.countryOfOrigin).toBe('India');
  });
});

describe('Rich-text XSS defense: description is sanitized on write', () => {
  it('strips <script> tags and inline event-handler attributes from a product description on create and update', async () => {
    const token = await loginAs('owner');
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validProduct,
        title: 'XSS Guard Piece',
        description: '<p>Nice piece</p><script>alert(1)</script><img src=x onerror=alert(2)>',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.product.description).not.toContain('<script');
    expect(createRes.body.product.description).not.toContain('onerror');
    expect(createRes.body.product.description).toContain('<p>Nice piece</p>');

    const updateRes = await request(app)
      .put(`/api/products/${createRes.body.product._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: '<p>Updated</p><script>alert(3)</script>' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.product.description).not.toContain('<script');
  });
});

describe('Manual stock adjustments', () => {
  async function createTestProduct(token: string) {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    return res.body.product._id as string;
  }

  it('lets a manager restock a variant and records it in stockAdjustments history', async () => {
    const token = await loginAs('manager');
    const productId = await createTestProduct(token);

    const res = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'TEST-001', delta: 10, reason: 'Restocked from supplier' });

    expect(res.status).toBe(200);
    expect(res.body.product.variants[0].stock).toBe(15); // started at 5
    expect(res.body.product.stockAdjustments).toHaveLength(1);
    expect(res.body.product.stockAdjustments[0]).toMatchObject({
      sku: 'TEST-001',
      delta: 10,
      reason: 'Restocked from supplier',
    });
  });

  it('lets a negative delta reduce stock (e.g. damage write-off)', async () => {
    const token = await loginAs('owner');
    const productId = await createTestProduct(token);

    const res = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'TEST-001', delta: -3, reason: 'Damaged in storage' });

    expect(res.status).toBe(200);
    expect(res.body.product.variants[0].stock).toBe(2); // started at 5
  });

  it('rejects an adjustment that would go negative', async () => {
    const token = await loginAs('manager');
    const productId = await createTestProduct(token);

    const res = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'TEST-001', delta: -100, reason: 'Too many' });

    expect(res.status).toBe(400);
  });

  it('404s for an unknown variant sku', async () => {
    const token = await loginAs('manager');
    const productId = await createTestProduct(token);

    const res = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'NOT-A-REAL-SKU', delta: 1, reason: 'x' });

    expect(res.status).toBe(404);
  });

  it('blocks staff (read-only) and customers from adjusting stock', async () => {
    const ownerToken = await loginAs('owner');
    const productId = await createTestProduct(ownerToken);

    const staffToken = await loginAs('staff');
    const staffRes = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ sku: 'TEST-001', delta: 1, reason: 'x' });
    expect(staffRes.status).toBe(403);

    const customerToken = await loginAs('customer');
    const customerRes = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ sku: 'TEST-001', delta: 1, reason: 'x' });
    expect(customerRes.status).toBe(403);
  });
});

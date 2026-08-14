import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Product } from '../../src/models/Product';
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

async function loginAs(
  role: 'customer' | 'staff' | 'manager' | 'owner',
  email = `${role}@example.com`,
) {
  const passwordHash = await bcrypt.hash('password123', 4);
  const user = await User.create({ name: role, email, passwordHash, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return { token: res.body.accessToken as string, userId: user.id as string };
}

async function createProduct(
  overrides: Partial<{ status: 'draft' | 'published' | 'archived'; title: string }> = {},
) {
  return Product.create({
    title: overrides.title ?? 'Wishlist Item',
    slug: `wishlist-item-${Math.random().toString(36).slice(2, 8)}`,
    description: 'x',
    type: 'finished_art',
    basePrice: 500,
    status: overrides.status ?? 'published',
    variants: [{ sku: 'WISH-1', options: {}, price: 500, stock: 5, images: [] }],
  });
}

describe('Wishlist (GET/POST/DELETE /api/account/wishlist)', () => {
  it('rejects every wishlist action without authentication', async () => {
    const product = await createProduct();
    expect((await request(app).get('/api/account/wishlist')).status).toBe(401);
    expect((await request(app).post(`/api/account/wishlist/${product.id}`)).status).toBe(401);
    expect((await request(app).delete(`/api/account/wishlist/${product.id}`)).status).toBe(401);
  });

  it('starts empty, adds a product, then removes it', async () => {
    const { token } = await loginAs('customer', 'wishlist1@example.com');
    const product = await createProduct();

    const emptyRes = await request(app)
      .get('/api/account/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data).toEqual([]);

    const addRes = await request(app)
      .post(`/api/account/wishlist/${product.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(addRes.status).toBe(204);

    const afterAddRes = await request(app)
      .get('/api/account/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(afterAddRes.body.data).toHaveLength(1);
    expect(afterAddRes.body.data[0]._id).toBe(product.id);

    const removeRes = await request(app)
      .delete(`/api/account/wishlist/${product.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removeRes.status).toBe(204);

    const afterRemoveRes = await request(app)
      .get('/api/account/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(afterRemoveRes.body.data).toEqual([]);
  });

  it('is idempotent — adding the same product twice does not duplicate it', async () => {
    const { token } = await loginAs('customer', 'wishlist2@example.com');
    const product = await createProduct();

    await request(app)
      .post(`/api/account/wishlist/${product.id}`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/account/wishlist/${product.id}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/account/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toHaveLength(1);
  });

  it('404s when adding a product that does not exist', async () => {
    const { token } = await loginAs('customer', 'wishlist3@example.com');
    const res = await request(app)
      .post('/api/account/wishlist/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('hides a wishlisted product that has since gone back to draft, without removing it from storage', async () => {
    const { token, userId } = await loginAs('customer', 'wishlist4@example.com');
    const product = await createProduct();

    await request(app)
      .post(`/api/account/wishlist/${product.id}`)
      .set('Authorization', `Bearer ${token}`);
    await Product.updateOne({ _id: product._id }, { status: 'draft' });

    const res = await request(app)
      .get('/api/account/wishlist')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toEqual([]);

    // Still present in the stored array — just filtered out of the response while unpublished.
    const user = await User.findById(userId);
    expect(user!.wishlist.map((id) => id.toString())).toContain(product.id);
  });
});

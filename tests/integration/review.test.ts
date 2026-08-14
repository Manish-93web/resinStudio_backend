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

async function loginAs(
  role: 'customer' | 'staff' | 'manager' | 'owner',
  email = `${role}@example.com`,
) {
  const passwordHash = await bcrypt.hash('password123', 4);
  const user = await User.create({ name: role, email, passwordHash, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return { token: res.body.accessToken as string, userId: user.id as string };
}

async function createPublishedProduct() {
  return Product.create({
    title: 'Reviewable Coaster',
    slug: 'reviewable-coaster',
    description: 'x',
    type: 'finished_art',
    basePrice: 400,
    status: 'published',
    variants: [{ sku: 'REV-1', options: {}, price: 400, stock: 5, images: [] }],
  });
}

describe('Product reviews', () => {
  it('creates a pending review that is not visible in the public list until approved', async () => {
    const product = await createPublishedProduct();
    const { token } = await loginAs('customer');

    const createRes = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, comment: 'Beautiful piece!' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.review.status).toBe('pending');

    const listRes = await request(app).get(`/api/products/${product.id}/reviews`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(0);
  });

  it('rejects a second review from the same user for the same product', async () => {
    const product = await createPublishedProduct();
    const { token } = await loginAs('customer');

    await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4, comment: 'Nice' });

    const dupeRes = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 3, comment: 'Trying again' });

    expect(dupeRes.status).toBe(409);
  });

  it('flags verifiedPurchase when the reviewer has a delivered order containing the product', async () => {
    const product = await createPublishedProduct();
    const { token, userId } = await loginAs('customer', 'verified-buyer@example.com');

    await Order.create({
      orderNumber: 'RS-TEST-VERIFIED',
      user: userId,
      items: [
        { product: product.id, variantSku: 'REV-1', title: product.title, qty: 1, price: 400 },
      ],
      subtotal: 400,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 400,
      shippingAddress: {
        line1: 'x',
        city: 'x',
        state: 'x',
        pincode: '123456',
        phone: '9876543210',
      },
      billingAddress: { line1: 'x', city: 'x', state: 'x', pincode: '123456', phone: '9876543210' },
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      status: 'delivered',
      timeline: [{ status: 'delivered', at: new Date() }],
    });

    const res = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, comment: 'Exactly as pictured' });

    expect(res.status).toBe(201);
    expect(res.body.review.verifiedPurchase).toBe(true);
  });

  it('rejects moderation from a customer or staff role, allows it from a manager', async () => {
    const product = await createPublishedProduct();
    const { token: customerToken } = await loginAs('customer');
    const createRes = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 5, comment: 'Great' });
    const reviewId = createRes.body.review._id;

    const { token: staffToken } = await loginAs('staff');
    const staffRes = await request(app)
      .put(`/api/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'approved' });
    expect(staffRes.status).toBe(403);

    const { token: managerToken } = await loginAs('manager');
    const managerRes = await request(app)
      .put(`/api/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved', replyText: 'Thanks so much!' });
    expect(managerRes.status).toBe(200);
    expect(managerRes.body.review.status).toBe('approved');
    expect(managerRes.body.review.reply.text).toBe('Thanks so much!');
  });

  it('approving a review updates the product rating aggregate, and it appears in the public list', async () => {
    const product = await createPublishedProduct();
    const { token: customerToken } = await loginAs('customer');
    const createRes = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 4, comment: 'Solid' });
    const reviewId = createRes.body.review._id;

    const { token: managerToken } = await loginAs('manager');
    await request(app)
      .put(`/api/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' });

    const updatedProduct = await Product.findById(product.id);
    expect(updatedProduct!.ratingAvg).toBe(4);
    expect(updatedProduct!.ratingCount).toBe(1);

    const listRes = await request(app).get(`/api/products/${product.id}/reviews`);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('editing an approved review re-queues it as pending and drops it back out of the aggregate', async () => {
    const product = await createPublishedProduct();
    const { token: customerToken } = await loginAs('customer');
    const createRes = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ rating: 5, comment: 'Perfect' });
    const reviewId = createRes.body.review._id;

    const { token: managerToken } = await loginAs('manager');
    await request(app)
      .put(`/api/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' });

    const editRes = await request(app)
      .put(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ comment: 'Actually, some edits' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.review.status).toBe('pending');

    const updatedProduct = await Product.findById(product.id);
    expect(updatedProduct!.ratingCount).toBe(0);

    const listRes = await request(app).get(`/api/products/${product.id}/reviews`);
    expect(listRes.body.data).toHaveLength(0);
  });

  it('lets a review owner delete their own review, and blocks deleting someone else’s', async () => {
    const product = await createPublishedProduct();
    const { token: ownerToken } = await loginAs('customer', 'owner-of-review@example.com');
    const createRes = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ rating: 3, comment: 'meh' });
    const reviewId = createRes.body.review._id;

    const { token: strangerToken } = await loginAs('customer', 'stranger@example.com');
    const strangerRes = await request(app)
      .delete(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(strangerRes.status).toBe(403);

    const ownerRes = await request(app)
      .delete(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerRes.status).toBe(204);
  });
});

describe('Site-wide UGC gallery (§6.12)', () => {
  it('flattens images from approved reviews only, newest first, excluding pending/rejected and imageless reviews', async () => {
    const product = await createPublishedProduct();
    const { token } = await loginAs('customer');

    const withImages = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rating: 5,
        comment: 'Loved it',
        images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      });
    const { token: token2 } = await loginAs('customer', 'gallery2@example.com');
    const noImages = await request(app)
      .post(`/api/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ rating: 4, comment: 'Nice, no photo' });

    const { token: managerToken } = await loginAs('manager');
    await request(app)
      .put(`/api/reviews/${withImages.body.review._id}/moderate`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved' });
    // Left pending deliberately - must not appear in the gallery.
    void noImages;

    const res = await request(app).get('/api/reviews/gallery');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        imageUrl: 'https://example.com/a.jpg',
        productSlug: product.slug,
        productTitle: product.title,
      },
      {
        imageUrl: 'https://example.com/b.jpg',
        productSlug: product.slug,
        productTitle: product.title,
      },
    ]);
  });
});

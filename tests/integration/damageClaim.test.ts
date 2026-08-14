import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Product } from '../../src/models/Product';
import { Order, type OrderDoc, type OrderStatus } from '../../src/models/Order';
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

const address = { line1: 'x', city: 'x', state: 'x', pincode: '123456', phone: '9876543210' };

async function createOrder(
  userId: string,
  productId: string,
  opts: { status?: OrderStatus; deliveredAt?: Date } = {},
): Promise<OrderDoc> {
  const status: OrderStatus = opts.status ?? 'delivered';
  const timeline: { status: OrderStatus; at: Date }[] = [
    { status: 'placed', at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
  ];
  if (status === 'delivered') {
    timeline.push({ status: 'delivered', at: opts.deliveredAt ?? new Date() });
  }
  return Order.create({
    orderNumber: `RS-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    user: userId,
    items: [{ product: productId, variantSku: 'DMG-1', title: 'Damaged Bowl', qty: 1, price: 600 }],
    subtotal: 600,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 600,
    shippingAddress: address,
    billingAddress: address,
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    status,
    timeline,
  });
}

async function createProduct() {
  return Product.create({
    title: 'Damaged Bowl',
    slug: 'damaged-bowl',
    description: 'x',
    type: 'finished_art',
    basePrice: 600,
    status: 'published',
    variants: [{ sku: 'DMG-1', options: {}, price: 600, stock: 5, images: [] }],
  });
}

describe('Damage claims', () => {
  it('rejects a claim for an order that has not been delivered yet', async () => {
    const product = await createProduct();
    const { token, userId } = await loginAs('customer');
    const order = await createOrder(userId, product.id, { status: 'placed' });

    const res = await request(app)
      .post(`/api/orders/${order.id}/damage-claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        photos: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
        description: 'Cracked in transit',
      });

    expect(res.status).toBe(409);
  });

  it('rejects a claim submitted outside the 72-hour window', async () => {
    const product = await createProduct();
    const { token, userId } = await loginAs('customer');
    const order = await createOrder(userId, product.id, {
      deliveredAt: new Date(Date.now() - 100 * 60 * 60 * 1000), // 100h ago
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/damage-claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        photos: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
        description: 'Cracked in transit',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/72 hours/i);
  });

  it('accepts a claim within the window, blocks a duplicate, and lets a manager resolve it with a refund', async () => {
    const product = await createProduct();
    const { token, userId } = await loginAs('customer');
    const order = await createOrder(userId, product.id);

    const claimRes = await request(app)
      .post(`/api/orders/${order.id}/damage-claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        photos: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
        description: 'Arrived shattered',
      });
    expect(claimRes.status).toBe(201);
    expect(claimRes.body.claim.status).toBe('pending');

    const dupeRes = await request(app)
      .post(`/api/orders/${order.id}/damage-claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: product.id,
        photos: ['https://res.cloudinary.com/demo/image/upload/y.jpg'],
        description: 'Still shattered',
      });
    expect(dupeRes.status).toBe(409);

    const { token: staffToken } = await loginAs('staff');
    const staffResolveRes = await request(app)
      .put(`/api/admin/damage-claims/${claimRes.body.claim._id}/resolve`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'approved_refund' });
    expect(staffResolveRes.status).toBe(403); // staff is read-only on claims (§7.8)

    const { token: managerToken } = await loginAs('manager');
    const resolveRes = await request(app)
      .put(`/api/admin/damage-claims/${claimRes.body.claim._id}/resolve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'approved_refund', resolutionNote: 'Refunded in full' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.claim.status).toBe('approved_refund');

    const updatedOrder = await Order.findById(order.id);
    expect(updatedOrder!.paymentStatus).toBe('partially_refunded');
  });

  it('lets staff/manager/owner list the claims queue but blocks a customer', async () => {
    const { token: customerToken } = await loginAs('customer');
    const customerRes = await request(app)
      .get('/api/admin/damage-claims')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerRes.status).toBe(403);

    const { token: staffToken } = await loginAs('staff');
    const staffRes = await request(app)
      .get('/api/admin/damage-claims')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffRes.status).toBe(200);
  });
});

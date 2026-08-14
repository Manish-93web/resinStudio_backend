import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Order, type OrderDoc } from '../../src/models/Order';
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

async function loginAs(role: 'staff' | 'manager' | 'owner', email = `${role}@example.com`) {
  const passwordHash = await bcrypt.hash('password123', 4);
  await User.create({ name: role, email, passwordHash, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

async function createOrder(
  overrides: Partial<{
    orderNumber: string;
    paymentMethod: 'cod' | 'razorpay' | 'stripe' | 'gift_card';
    guestEmail: string;
    guestPhone: string;
    createdAt: Date;
    userId: string;
  }>,
): Promise<OrderDoc> {
  const order = await Order.create({
    orderNumber:
      overrides.orderNumber ?? `RS-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    user: overrides.userId,
    guestEmail: overrides.guestEmail,
    guestPhone: overrides.guestPhone,
    items: [{ title: 'Filter Test Item', qty: 1, price: 500 }],
    subtotal: 500,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 500,
    shippingAddress: address,
    billingAddress: address,
    paymentMethod: overrides.paymentMethod ?? 'cod',
    paymentStatus: 'pending',
    status: 'placed',
  });
  if (overrides.createdAt) {
    // Order.updateOne (Mongoose's query API) silently no-ops on `createdAt` here — Mongoose 9's
    // `timestamps: true` marks `createdAt` `immutable` by default, so backdating a test fixture
    // has to go through the raw driver collection, bypassing Mongoose's schema/cast layer.
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: overrides.createdAt } },
    );
  }
  return order;
}

describe('GET /api/orders admin list filters', () => {
  it('filters by paymentMethod', async () => {
    await createOrder({
      orderNumber: 'RS-FILT-COD',
      paymentMethod: 'cod',
      guestEmail: 'a@example.com',
    });
    await createOrder({
      orderNumber: 'RS-FILT-RZP',
      paymentMethod: 'razorpay',
      guestEmail: 'b@example.com',
    });

    const token = await loginAs('staff');
    const res = await request(app)
      .get('/api/orders?paymentMethod=razorpay')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].orderNumber).toBe('RS-FILT-RZP');
  });

  it('filters by dateFrom/dateTo (createdAt range)', async () => {
    await createOrder({
      orderNumber: 'RS-OLD',
      guestEmail: 'old@example.com',
      createdAt: new Date('2020-01-01'),
    });
    await createOrder({
      orderNumber: 'RS-RECENT',
      guestEmail: 'recent@example.com',
      createdAt: new Date(),
    });

    const token = await loginAs('manager');
    const res = await request(app)
      .get('/api/orders?dateFrom=2024-01-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['RS-RECENT']);
  });

  it('free-text q matches orderNumber, guestEmail, guestPhone', async () => {
    await createOrder({ orderNumber: 'RS-SEARCHABLE-1', guestEmail: 'findme@example.com' });
    await createOrder({
      orderNumber: 'RS-OTHER-1',
      guestEmail: 'nomatch@example.com',
      guestPhone: '9998887776',
    });

    const token = await loginAs('owner');

    const byOrderNumber = await request(app)
      .get('/api/orders?q=SEARCHABLE')
      .set('Authorization', `Bearer ${token}`);
    expect(byOrderNumber.body.data).toHaveLength(1);
    expect(byOrderNumber.body.data[0].orderNumber).toBe('RS-SEARCHABLE-1');

    const byEmail = await request(app)
      .get('/api/orders?q=findme')
      .set('Authorization', `Bearer ${token}`);
    expect(byEmail.body.data).toHaveLength(1);

    const byPhone = await request(app)
      .get('/api/orders?q=9998887776')
      .set('Authorization', `Bearer ${token}`);
    expect(byPhone.body.data).toHaveLength(1);
    expect(byPhone.body.data[0].orderNumber).toBe('RS-OTHER-1');
  });

  it("free-text q also matches by the owning customer's name/email", async () => {
    const passwordHash = await bcrypt.hash('password123', 4);
    const customer = await User.create({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      passwordHash,
      role: 'customer',
    });
    await createOrder({ orderNumber: 'RS-BY-CUSTOMER', userId: customer.id });
    await createOrder({ orderNumber: 'RS-UNRELATED', guestEmail: 'unrelated@example.com' });

    const token = await loginAs('staff');
    const res = await request(app)
      .get('/api/orders?q=Priya')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].orderNumber).toBe('RS-BY-CUSTOMER');
  });

  it('keeps the existing status filter working alongside the new filters', async () => {
    const order = await createOrder({
      orderNumber: 'RS-STATUS-TEST',
      guestEmail: 'status@example.com',
    });
    await Order.updateOne({ _id: order._id }, { status: 'confirmed' });
    await createOrder({ orderNumber: 'RS-STATUS-OTHER', guestEmail: 'status2@example.com' });

    const token = await loginAs('manager');
    const res = await request(app)
      .get('/api/orders?status=confirmed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].orderNumber).toBe('RS-STATUS-TEST');
  });

  it('rejects a malformed dateFrom with a 400 (validated query)', async () => {
    const token = await loginAs('staff');
    const res = await request(app)
      .get('/api/orders?dateFrom=not-a-date')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

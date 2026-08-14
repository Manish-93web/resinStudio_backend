import request from 'supertest';
import bcrypt from 'bcryptjs';

// Razorpay/Stripe are unconfigured in .env.test (no real credentials), so their config modules
// are mocked here the same way order.test.ts mocks notification.service — a jest.mock factory
// (not jest.spyOn) survives swc's ESM->CJS interop, letting refundOrder's razorpay/stripe
// branches be exercised end-to-end without a live gateway.
const razorpayRefundMock = jest.fn().mockResolvedValue({ id: 'rfnd_test_123' });
jest.mock('../../src/config/razorpay', () => ({
  isRazorpayConfigured: true,
  razorpay: { payments: { refund: (...args: unknown[]) => razorpayRefundMock(...args) } },
}));

const stripeRefundMock = jest.fn().mockResolvedValue({ id: 're_test_123' });
jest.mock('../../src/config/stripe', () => ({
  isStripeConfigured: true,
  stripe: { refunds: { create: (...args: unknown[]) => stripeRefundMock(...args) } },
}));

import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { Order, type OrderDoc, type PaymentMethod } from '../../src/models/Order';
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
  razorpayRefundMock.mockClear();
  stripeRefundMock.mockClear();
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

async function createPaidOrder(
  paymentMethod: PaymentMethod,
  paymentRef?: string,
  total = 1000,
): Promise<OrderDoc> {
  return Order.create({
    orderNumber: `RS-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    items: [{ title: 'Refund Test Item', qty: 1, price: total }],
    subtotal: total,
    discount: 0,
    shipping: 0,
    tax: 0,
    total,
    shippingAddress: address,
    billingAddress: address,
    paymentMethod,
    paymentStatus: 'paid',
    paymentRef,
    payments: [
      {
        amount: total,
        method: paymentMethod,
        ref: paymentRef,
        status: 'paid',
        type: 'full',
        capturedAt: new Date(),
      },
    ],
    status: 'delivered',
  });
}

describe('POST /api/admin/orders/:id/refund', () => {
  it('rejects an unauthenticated caller', async () => {
    const order = await createPaidOrder('cod');
    const res = await request(app).post(`/api/admin/orders/${order.id}/refund`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects staff (requires manager/owner)', async () => {
    const order = await createPaidOrder('cod');
    const { token } = await loginAs('staff');
    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('honestly rejects a COD order — nothing was captured online to reverse', async () => {
    const order = await createPaidOrder('cod');
    const { token } = await loginAs('manager');
    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/manually/i);
  });

  it('honestly rejects a gift_card-only order — no online refund path exists', async () => {
    const order = await createPaidOrder('gift_card');
    const { token } = await loginAs('manager');
    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/manually/i);
  });

  it('processes a full razorpay refund, marks paymentStatus refunded, and calls the gateway with the right amount', async () => {
    const order = await createPaidOrder('razorpay', 'pay_test_abc', 1000);
    const { token, userId } = await loginAs('owner');

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Customer changed their mind' });

    expect(res.status).toBe(200);
    expect(res.body.order.paymentStatus).toBe('refunded');
    expect(res.body.order.refunds).toHaveLength(1);
    expect(res.body.order.refunds[0].amount).toBe(1000);
    expect(res.body.order.refunds[0].ref).toBe('rfnd_test_123');
    expect(res.body.order.refunds[0].by).toBe(userId);

    expect(razorpayRefundMock).toHaveBeenCalledWith('pay_test_abc', {
      amount: 100000,
      speed: 'optimum',
    });
  });

  it('processes a partial stripe refund and marks paymentStatus partially_refunded', async () => {
    const order = await createPaidOrder('stripe', 'pi_test_xyz', 1000);
    const { token } = await loginAs('manager');

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 400 });

    expect(res.status).toBe(200);
    expect(res.body.order.paymentStatus).toBe('partially_refunded');
    expect(res.body.order.refunds[0].amount).toBe(400);
    expect(stripeRefundMock).toHaveBeenCalledWith({ payment_intent: 'pi_test_xyz', amount: 40000 });
  });

  it('rejects a refund amount exceeding what is still refundable', async () => {
    const order = await createPaidOrder('razorpay', 'pay_test_over', 1000);
    const { token } = await loginAs('owner');

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000 });
    expect(res.status).toBe(400);
  });

  it('rejects a second refund once the order is already fully refunded', async () => {
    const order = await createPaidOrder('razorpay', 'pay_test_double', 500);
    const { token } = await loginAs('owner');

    const first = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(second.status).toBe(400);
    expect(second.body.error.message).toMatch(/nothing left to refund/i);
  });
});

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { User } from '../../src/models/User';
import { Order } from '../../src/models/Order';

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

const address = {
  line1: '1 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  phone: '9876543210',
};

describe('Commission request lifecycle', () => {
  it('supports a guest submitting a request without auth', async () => {
    const res = await request(app)
      .post('/api/commissions')
      .send({ contactEmail: 'guest@example.com', description: 'A custom river table, 120x60cm' });
    expect(res.status).toBe(201);
    expect(res.body.commission.status).toBe('requested');
    expect(res.body.commission.customer).toBeFalsy();
  });

  it('rejects manager quoting attempts from staff, allows manager', async () => {
    const { token: customerToken, userId } = await loginAs('customer');
    const createRes = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ contactEmail: 'customer@example.com', description: 'Custom coaster set' });
    const commissionId = createRes.body.commission._id;
    expect(createRes.body.commission.customer).toBe(userId);

    const { token: staffToken } = await loginAs('staff');
    const staffRes = await request(app)
      .put(`/api/admin/commissions/${commissionId}/quote`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ price: 5000, productionTimeDays: 10 });
    expect(staffRes.status).toBe(403);

    const { token: managerToken } = await loginAs('manager');
    const quoteRes = await request(app)
      .put(`/api/admin/commissions/${commissionId}/quote`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ price: 5000, productionTimeDays: 10, note: 'Can do walnut or oak base' });
    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.commission.status).toBe('quoted');
    expect(quoteRes.body.commission.depositAmount).toBe(2500); // default 50%
    expect(quoteRes.body.commission.balanceAmount).toBe(2500);
  });

  it('runs the full accept-deposit -> production -> ready -> balance -> ship flow', async () => {
    const { token: customerToken, userId } = await loginAs('customer', 'full-flow@example.com');
    const createRes = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ contactEmail: 'full-flow@example.com', description: 'Full flow test piece' });
    const commissionId = createRes.body.commission._id;

    const { token: managerToken } = await loginAs('manager');
    await request(app)
      .put(`/api/admin/commissions/${commissionId}/quote`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ price: 10000, productionTimeDays: 14 });

    // Accept quote by paying the deposit.
    const depositRes = await request(app)
      .post(`/api/commissions/${commissionId}/deposit`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });
    expect(depositRes.status).toBe(201);
    expect(depositRes.body.commission.status).toBe('deposit_paid');
    expect(depositRes.body.order.total).toBe(5000);
    expect(depositRes.body.order.orderType).toBe('commission_deposit');
    const depositOrderId = depositRes.body.order._id;

    // Move through production.
    const prodRes = await request(app)
      .put(`/api/admin/commissions/${commissionId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'in_production' });
    expect(prodRes.status).toBe(200);

    const readyRes = await request(app)
      .put(`/api/admin/commissions/${commissionId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'ready' });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.commission.status).toBe('ready');

    // Pay the balance.
    const balanceRes = await request(app)
      .post(`/api/commissions/${commissionId}/balance`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });
    expect(balanceRes.status).toBe(201);
    expect(balanceRes.body.commission.status).toBe('balance_paid');
    expect(balanceRes.body.order.total).toBe(5000);
    const balanceOrderId = balanceRes.body.order._id;

    // Admin ships the balance order (normal order fulfillment) - commission should sync to shipped.
    const shipRes = await request(app)
      .put(`/api/orders/${balanceOrderId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'shipped' });
    expect(shipRes.status).toBe(200);

    const finalCommission = await request(app)
      .get(`/api/commissions/${commissionId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(finalCommission.body.commission.status).toBe('shipped');

    // Both linked orders exist and belong to the customer, with distinct order types.
    const orders = await Order.find({ user: userId }).sort({ createdAt: 1 });
    expect(orders).toHaveLength(2);
    expect(orders[0]!.orderType).toBe('commission_deposit');
    expect(orders[1]!.orderType).toBe('commission_balance');
    expect(orders[0]!._id.toString()).toBe(depositOrderId);
    expect(orders[1]!._id.toString()).toBe(balanceOrderId);
  });

  it('blocks self-service cancellation of a commission-linked order', async () => {
    const { token: customerToken } = await loginAs('customer', 'cancel-guard@example.com');
    const createRes = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ contactEmail: 'cancel-guard@example.com', description: 'Cancel guard test' });
    const commissionId = createRes.body.commission._id;

    const { token: managerToken } = await loginAs('manager');
    await request(app)
      .put(`/api/admin/commissions/${commissionId}/quote`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ price: 1000, productionTimeDays: 5 });

    const depositRes = await request(app)
      .post(`/api/commissions/${commissionId}/deposit`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });

    const cancelRes = await request(app)
      .post(`/api/orders/${depositRes.body.order._id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    expect(cancelRes.status).toBe(400);
  });

  it('declines a commission and prevents further quoting', async () => {
    const { token: customerToken } = await loginAs('customer', 'decline-test@example.com');
    const createRes = await request(app)
      .post('/api/commissions')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ contactEmail: 'decline-test@example.com', description: 'Something we cannot make' });
    const commissionId = createRes.body.commission._id;

    const { token: managerToken } = await loginAs('manager');
    const declineRes = await request(app)
      .put(`/api/admin/commissions/${commissionId}/decline`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Outside what we can produce safely' });
    expect(declineRes.status).toBe(200);
    expect(declineRes.body.commission.status).toBe('declined');

    const quoteAfterDeclineRes = await request(app)
      .put(`/api/admin/commissions/${commissionId}/quote`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ price: 1000, productionTimeDays: 5 });
    expect(quoteAfterDeclineRes.status).toBe(409);
  });
});

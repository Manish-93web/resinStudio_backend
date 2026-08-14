import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { User } from '../../src/models/User';
import { Product } from '../../src/models/Product';

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

describe('Settings', () => {
  it('returns schema defaults on first access, readable by staff', async () => {
    const { token } = await loginAs('staff');
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.settings.shipping.flatRate).toBe(99);
    expect(res.body.settings.taxRatePercent).toBe(0);
  });

  it('blocks manager from writing settings, allows owner', async () => {
    const { token: managerToken } = await loginAs('manager');
    const managerRes = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ taxRatePercent: 18 });
    expect(managerRes.status).toBe(403);

    const { token: ownerToken } = await loginAs('owner');
    const ownerRes = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shipping: { flatRate: 50, freeShippingThreshold: 500 }, taxRatePercent: 18 });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.settings.shipping.flatRate).toBe(50);
    expect(ownerRes.body.settings.taxRatePercent).toBe(18);
  });

  it('applies updated shipping/tax settings to a new checkout', async () => {
    const { token: ownerToken } = await loginAs('owner');
    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        // Domestic non-free shipping is weight-tier-based (order.service.ts#createOrderFromCart),
        // not the flat `flatRate` field - a single wide tier here makes the expected shipping
        // cost deterministic regardless of the order's resolved weight.
        shipping: {
          flatRate: 50,
          freeShippingThreshold: 100000,
          weightTiers: [{ maxGrams: 100000, rate: 50 }],
        },
        taxRatePercent: 10,
      });

    const product = await Product.create({
      title: 'Settings Test Item',
      slug: 'settings-test-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 1000,
      status: 'published',
      variants: [{ sku: 'SET-1', options: {}, price: 1000, stock: 5, images: [] }],
    });
    const sessionId = 'settings-session';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'SET-1', qty: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: {
          line1: 'x',
          city: 'x',
          state: 'x',
          pincode: '123456',
          phone: '9876543210',
        },
        guestEmail: 'settings@example.com',
        paymentMethod: 'cod',
      });

    expect(res.status).toBe(201);
    expect(res.body.order.shipping).toBe(50);
    expect(res.body.order.tax).toBe(100); // 10% of 1000
    expect(res.body.order.total).toBe(1150);
  });
});

describe('Dashboard stats', () => {
  it('summarizes revenue/orders and needs-attention counts, blocked for customers', async () => {
    const { token: customerToken } = await loginAs('customer');
    const customerRes = await request(app)
      .get('/api/admin/dashboard/stats')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerRes.status).toBe(403);

    const product = await Product.create({
      title: 'Dashboard Test Item',
      slug: 'dashboard-test-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 500,
      status: 'published',
      variants: [{ sku: 'DASH-1', options: {}, price: 500, stock: 5, images: [] }],
    });
    const sessionId = 'dashboard-session';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'DASH-1', qty: 2 });
    await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: {
          line1: 'x',
          city: 'x',
          state: 'x',
          pincode: '123456',
          phone: '9876543210',
        },
        guestEmail: 'dash@example.com',
        paymentMethod: 'cod',
      });

    const { token: staffToken } = await loginAs('staff');
    const res = await request(app)
      .get('/api/admin/dashboard/stats?days=30')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.orders).toBe(1);
    expect(res.body.summary.revenue).toBeGreaterThan(0);
    expect(res.body.needsAttention.newOrders).toBe(1);
    expect(res.body.topProducts[0].title).toBe('Dashboard Test Item');
  });

  it('flags a published low-stock product', async () => {
    await Product.create({
      title: 'Low Stock Item',
      slug: 'low-stock-item',
      description: 'x',
      type: 'supply',
      basePrice: 200,
      status: 'published',
      variants: [{ sku: 'LOW-1', options: {}, price: 200, stock: 2, images: [] }],
    });

    const { token } = await loginAs('manager');
    const res = await request(app)
      .get('/api/admin/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.needsAttention.lowStockCount).toBe(1);
    expect(res.body.lowStock[0].sku).toBe('LOW-1');
  });
});

describe('Staff management', () => {
  it('lets owner create a staff account, blocks manager from doing so', async () => {
    const { token: managerToken } = await loginAs('manager');
    const managerRes = await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'New Staffer',
        email: 'new-staffer@example.com',
        password: 'password123',
        role: 'staff',
      });
    expect(managerRes.status).toBe(403);

    const { token: ownerToken } = await loginAs('owner');
    const ownerRes = await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'New Staffer',
        email: 'new-staffer@example.com',
        password: 'password123',
        role: 'staff',
      });
    expect(ownerRes.status).toBe(201);
    expect(ownerRes.body.user.role).toBe('staff');
  });

  it('lists only staff/manager/owner accounts, excluding customers', async () => {
    await loginAs('customer', 'plain-customer@example.com');
    const { token } = await loginAs('staff');
    const res = await request(app).get('/api/admin/staff').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { role: string }) => u.role !== 'customer')).toBe(true);
  });

  it('prevents an owner from demoting or deactivating their own account', async () => {
    const { token, userId } = await loginAs('owner');
    const res = await request(app)
      .put(`/api/admin/staff/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('lets owner change another staff member’s role', async () => {
    const { userId: staffUserId } = await loginAs('staff', 'promote-me@example.com');
    const { token: ownerToken } = await loginAs('owner');
    const res = await request(app)
      .put(`/api/admin/staff/${staffUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'manager' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('manager');
  });
});

describe('Activity log', () => {
  it('records staff creation and order status changes, readable by staff', async () => {
    const { token: ownerToken } = await loginAs('owner');
    await request(app)
      .post('/api/admin/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Logged Staffer',
        email: 'logged-staffer@example.com',
        password: 'password123',
        role: 'staff',
      });

    const { token: staffToken } = await loginAs('staff', 'reader@example.com');
    const res = await request(app)
      .get('/api/admin/activity')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((entry: { action: string }) => entry.action === 'staff.create')).toBe(
      true,
    );
  });

  it('blocks a customer from reading the activity log', async () => {
    const { token } = await loginAs('customer');
    const res = await request(app)
      .get('/api/admin/activity')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

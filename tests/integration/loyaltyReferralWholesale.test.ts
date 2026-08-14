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

const address = {
  line1: '1 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  phone: '9876543210',
};

async function loginAs(
  role: 'customer' | 'staff' | 'manager' | 'owner',
  email = `${role}@example.com`,
) {
  const passwordHash = await bcrypt.hash('password123', 4);
  const user = await User.create({ name: role, email, passwordHash, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return { token: res.body.accessToken as string, userId: user.id as string };
}

async function addToCart(
  token: string,
  sessionId: string,
  productId: string,
  sku: string,
  qty = 1,
) {
  return request(app)
    .post('/api/cart/items')
    .set('X-Session-Id', sessionId)
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, variantSku: sku, qty });
}

describe('Loyalty points: earn on delivery', () => {
  it('awards floor(total * pointsPerRupee) to the buyer once the order reaches delivered, and never for a guest order', async () => {
    const { token: customerToken, userId } = await loginAs('customer', 'earn-loyalty@example.com');
    const product = await Product.create({
      title: 'Loyalty Earn Item',
      slug: 'loyalty-earn-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 2000,
      status: 'published',
      variants: [{ sku: 'EARN-1', options: {}, price: 2000, stock: 5, images: [] }],
    });
    const sessionId = 'loyalty-earn-session';
    await addToCart(customerToken, sessionId, product.id, 'EARN-1', 1);

    const orderRes = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });
    expect(orderRes.status).toBe(201);
    const orderTotal = orderRes.body.order.total as number;

    const { token: ownerToken } = await loginAs('owner');
    const statusRes = await request(app)
      .put(`/api/orders/${orderRes.body.order._id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'delivered' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.order.loyaltyPointsEarned).toBe(Math.floor(orderTotal));

    const updatedUser = await User.findById(userId);
    expect(updatedUser!.loyaltyPoints).toBe(Math.floor(orderTotal));
  });
});

describe('Loyalty points: redemption round-trip at checkout', () => {
  it('deducts redeemed points from the balance and discounts the order by redeemPoints * redemptionRate', async () => {
    const { token, userId } = await loginAs('customer', 'redeem-loyalty@example.com');
    await User.updateOne({ _id: userId }, { loyaltyPoints: 200 });

    const product = await Product.create({
      title: 'Loyalty Redeem Item',
      slug: 'loyalty-redeem-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 1500,
      status: 'published',
      variants: [{ sku: 'REDEEM-1', options: {}, price: 1500, stock: 5, images: [] }],
    });
    const sessionId = 'loyalty-redeem-session';
    await addToCart(token, sessionId, product.id, 'REDEEM-1', 1);

    // 1500 is over the default free-shipping threshold (999), so shipping is 0 - keeps the math
    // in this test independent of the weight-tier shipping calculation.
    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: address, paymentMethod: 'cod', redeemPoints: 100 });

    expect(res.status).toBe(201);
    expect(res.body.order.loyaltyPointsRedeemed).toBe(100);
    expect(res.body.order.loyaltyDiscount).toBe(25); // 100 points * default redemptionRate 0.25
    expect(res.body.order.total).toBe(1500 - 25);

    const updatedUser = await User.findById(userId);
    expect(updatedUser!.loyaltyPoints).toBe(100); // 200 - 100 redeemed
  });

  it('rejects redeeming more points than the customer actually has', async () => {
    const { token, userId } = await loginAs('customer', 'redeem-insufficient@example.com');
    await User.updateOne({ _id: userId }, { loyaltyPoints: 10 });

    const product = await Product.create({
      title: 'Loyalty Insufficient Item',
      slug: 'loyalty-insufficient-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 1500,
      status: 'published',
      variants: [{ sku: 'INSUF-1', options: {}, price: 1500, stock: 5, images: [] }],
    });
    const sessionId = 'loyalty-insufficient-session';
    await addToCart(token, sessionId, product.id, 'INSUF-1', 1);

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: address, paymentMethod: 'cod', redeemPoints: 5000 });

    expect(res.status).toBe(400);
  });
});

describe('Referral bonus crediting', () => {
  it("registers a referred user, credits the referrer bonusPoints on the referred user's first delivered order, and does not double-credit on a second", async () => {
    const referrer = await User.create({
      name: 'Referrer',
      email: 'referrer@example.com',
      passwordHash: await bcrypt.hash('password123', 4),
      role: 'customer',
    });
    expect(referrer.referralCode).toBeTruthy();

    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Referred Customer',
      email: 'referred@example.com',
      password: 'password123',
      referredByCode: referrer.referralCode,
    });
    expect(registerRes.status).toBe(201);
    const referredToken = registerRes.body.accessToken as string;

    const referredUser = await User.findOne({ email: 'referred@example.com' });
    expect(referredUser!.referredBy?.toString()).toBe(referrer.id);

    const product = await Product.create({
      title: 'Referral Order Item',
      slug: 'referral-order-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      variants: [{ sku: 'REF-1', options: {}, price: 400, stock: 10, images: [] }],
    });

    const { token: ownerToken } = await loginAs('owner');

    // First order → delivered → referrer gets the bonus exactly once.
    const session1 = 'referral-session-1';
    await addToCart(referredToken, session1, product.id, 'REF-1', 1);
    const order1Res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', session1)
      .set('Authorization', `Bearer ${referredToken}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });
    await request(app)
      .put(`/api/orders/${order1Res.body.order._id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'delivered' });

    const referrerAfterFirst = await User.findById(referrer._id);
    expect(referrerAfterFirst!.loyaltyPoints).toBe(100); // default settings.referral.bonusPoints

    // Second order for the same referred user → delivered → no additional bonus.
    const session2 = 'referral-session-2';
    await addToCart(referredToken, session2, product.id, 'REF-1', 1);
    const order2Res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', session2)
      .set('Authorization', `Bearer ${referredToken}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });
    const statusRes2 = await request(app)
      .put(`/api/orders/${order2Res.body.order._id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'delivered' });
    expect(statusRes2.body.order.referralBonusApplied).toBe(false);

    const referrerAfterSecond = await User.findById(referrer._id);
    expect(referrerAfterSecond!.loyaltyPoints).toBe(100); // unchanged
  });

  it('silently ignores an unknown referral code at registration rather than failing signup', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'No Referrer',
      email: 'no-referrer@example.com',
      password: 'password123',
      referredByCode: 'NOTAREALCODE',
    });
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'no-referrer@example.com' });
    expect(user!.referredBy).toBeFalsy();
  });
});

describe('Wholesale pricing', () => {
  async function createWholesaleProduct() {
    return Product.create({
      title: 'Wholesale Item',
      slug: `wholesale-item-${Math.random().toString(36).slice(2, 8)}`,
      description: 'x',
      type: 'supply',
      basePrice: 100,
      status: 'published',
      wholesalePrice: 60,
      wholesaleMinQty: 5,
      variants: [{ sku: 'WS-1', options: {}, price: 100, stock: 50, images: [] }],
    });
  }

  it('applies wholesalePrice when the buyer is wholesaleApproved and meets wholesaleMinQty', async () => {
    const { token, userId } = await loginAs('customer', 'wholesale-eligible@example.com');
    await User.updateOne({ _id: userId }, { wholesaleApproved: true });
    const product = await createWholesaleProduct();

    const sessionId = 'wholesale-eligible-session';
    await addToCart(token, sessionId, product.id, 'WS-1', 5);
    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].price).toBe(60);
    expect(res.body.order.subtotal).toBe(300); // 5 * 60
  });

  it('does not apply wholesalePrice when the buyer is not wholesaleApproved, even at qty >= wholesaleMinQty', async () => {
    const { token } = await loginAs('customer', 'wholesale-not-approved@example.com');
    const product = await createWholesaleProduct();

    const sessionId = 'wholesale-not-approved-session';
    await addToCart(token, sessionId, product.id, 'WS-1', 5);
    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].price).toBe(100);
  });

  it('does not apply wholesalePrice when qty is below wholesaleMinQty, even for an approved buyer', async () => {
    const { token, userId } = await loginAs('customer', 'wholesale-low-qty@example.com');
    await User.updateOne({ _id: userId }, { wholesaleApproved: true });
    const product = await createWholesaleProduct();

    const sessionId = 'wholesale-low-qty-session';
    await addToCart(token, sessionId, product.id, 'WS-1', 2);
    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .set('Authorization', `Bearer ${token}`)
      .send({ shippingAddress: address, paymentMethod: 'cod' });

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].price).toBe(100);
  });

  it('does not apply wholesale pricing for a guest checkout (no user to be wholesaleApproved)', async () => {
    const product = await createWholesaleProduct();
    const sessionId = 'wholesale-guest-session';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'WS-1', qty: 5 });

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: address,
        guestEmail: 'guest-wholesale@example.com',
        paymentMethod: 'cod',
      });

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].price).toBe(100);
  });
});

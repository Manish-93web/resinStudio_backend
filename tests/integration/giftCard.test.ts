import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { User } from '../../src/models/User';
import { Product } from '../../src/models/Product';
import { GiftCard } from '../../src/models/GiftCard';

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

describe('Gift card purchase', () => {
  it('lets a guest buy a gift card, which is issued instantly and emailed', async () => {
    const res = await request(app).post('/api/gift-cards/purchase').send({
      amount: 2000,
      recipientEmail: 'lucky-friend@example.com',
      purchaserEmail: 'buyer@example.com',
      message: 'Happy birthday!',
      shippingAddress: address,
    });

    expect(res.status).toBe(201);
    expect(res.body.giftCard.initialValue).toBe(2000);
    expect(res.body.order.status).toBe('delivered');
    expect(res.body.order.paymentStatus).toBe('paid');

    const stored = await GiftCard.findOne({ code: res.body.giftCard.code });
    expect(stored).not.toBeNull();
    expect(stored!.balance).toBe(2000);
    expect(stored!.issuedTo).toBe('lucky-friend@example.com');
  });

  it('exposes the balance via the public balance-check endpoint', async () => {
    const purchaseRes = await request(app)
      .post('/api/gift-cards/purchase')
      .send({ amount: 1000, recipientEmail: 'someone@example.com', shippingAddress: address });
    const code = purchaseRes.body.giftCard.code;

    const balanceRes = await request(app).get(`/api/gift-cards/${code}/balance`);
    expect(balanceRes.status).toBe(200);
    expect(balanceRes.body.balance).toBe(1000);
    expect(balanceRes.body.active).toBe(true);
  });
});

describe('Gift card redemption at checkout', () => {
  it('fully covers an order when the balance is enough, marking it paid via gift_card with no COD due', async () => {
    const card = await GiftCard.create({
      code: 'GC-TEST-FULL-0001',
      initialValue: 500,
      balance: 500,
      issuedTo: 'redeemer@example.com',
    });

    const product = await Product.create({
      title: 'Gift Redeem Item',
      slug: 'gift-redeem-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      variants: [{ sku: 'GR-1', options: {}, price: 400, stock: 5, images: [] }],
    });
    const sessionId = 'gift-redeem-session';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'GR-1', qty: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: address,
        guestEmail: 'redeemer@example.com',
        paymentMethod: 'cod',
        giftCardCode: card.code,
      });

    expect(res.status).toBe(201);
    // 400 + 60 weight-tier shipping (250g default, under the 500g/₹60 tier) = 460, under the 500 balance
    expect(res.body.order.giftCardAmount).toBe(460);
    expect(res.body.order.total).toBe(0);
    expect(res.body.order.paymentMethod).toBe('gift_card');
    expect(res.body.order.paymentStatus).toBe('paid');

    const updatedCard = await GiftCard.findById(card._id);
    expect(updatedCard!.balance).toBe(40);
  });

  it('partially covers an order, leaving the rest due via the chosen payment method', async () => {
    const card = await GiftCard.create({
      code: 'GC-TEST-PARTIAL-0001',
      initialValue: 100,
      balance: 100,
      issuedTo: 'redeemer2@example.com',
    });

    const product = await Product.create({
      title: 'Gift Redeem Item 2',
      slug: 'gift-redeem-item-2',
      description: 'x',
      type: 'finished_art',
      basePrice: 1000,
      status: 'published',
      variants: [{ sku: 'GR-2', options: {}, price: 1000, stock: 5, images: [] }],
    });
    const sessionId = 'gift-redeem-session-2';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'GR-2', qty: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: address,
        guestEmail: 'redeemer2@example.com',
        paymentMethod: 'cod',
        giftCardCode: card.code,
      });

    expect(res.status).toBe(201);
    expect(res.body.order.giftCardAmount).toBe(100);
    expect(res.body.order.total).toBe(900); // 1000 - 100 gift card (over free-shipping threshold)
    expect(res.body.order.paymentMethod).toBe('cod');
    expect(res.body.order.paymentStatus).toBe('pending');

    const updatedCard = await GiftCard.findById(card._id);
    expect(updatedCard!.balance).toBe(0);
  });

  it('rejects an unknown or inactive gift card code', async () => {
    const product = await Product.create({
      title: 'Gift Redeem Item 3',
      slug: 'gift-redeem-item-3',
      description: 'x',
      type: 'finished_art',
      basePrice: 500,
      status: 'published',
      variants: [{ sku: 'GR-3', options: {}, price: 500, stock: 5, images: [] }],
    });
    const sessionId = 'gift-redeem-session-3';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'GR-3', qty: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: address,
        guestEmail: 'x@example.com',
        paymentMethod: 'cod',
        giftCardCode: 'GC-DOES-NOT-EXIST',
      });

    expect(res.status).toBe(400);
  });
});

describe('Admin manual gift card issuance (§7.11 goodwill/claim resolution)', () => {
  it('blocks staff, allows manager to issue a gift card', async () => {
    const { token: staffToken } = await loginAs('staff');
    const staffRes = await request(app)
      .post('/api/admin/gift-cards')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ amount: 300, recipientEmail: 'goodwill@example.com', note: 'Sorry for the trouble' });
    expect(staffRes.status).toBe(403);

    const { token: managerToken } = await loginAs('manager');
    const managerRes = await request(app)
      .post('/api/admin/gift-cards')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ amount: 300, recipientEmail: 'goodwill@example.com', note: 'Sorry for the trouble' });
    expect(managerRes.status).toBe(201);
    expect(managerRes.body.giftCard.balance).toBe(300);
    expect(managerRes.body.giftCard.issuedBy).toBeTruthy();
  });

  it('lists gift cards for staff', async () => {
    await GiftCard.create({
      code: 'GC-LIST-TEST-0001',
      initialValue: 200,
      balance: 200,
      issuedTo: 'a@example.com',
    });
    const { token } = await loginAs('staff');
    const res = await request(app)
      .get('/api/admin/gift-cards')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

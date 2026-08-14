import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { User } from '../../src/models/User';
import { Product } from '../../src/models/Product';
import { Cart } from '../../src/models/Cart';
import { WaitlistEntry } from '../../src/models/WaitlistEntry';
import { NewsletterSubscriber } from '../../src/models/NewsletterSubscriber';
import { Settings } from '../../src/models/Settings';
import { runAbandonedCartJob } from '../../src/jobs/abandonedCart.job';
import { runLowStockDigestJob } from '../../src/jobs/lowStockDigest.job';
import { runWaitlistNotifyJob } from '../../src/jobs/waitlist.job';

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

describe('Waitlist / notify-me (§6.7)', () => {
  it('lets a shopper join a back-in-stock waitlist only when the product is actually out of stock', async () => {
    const inStock = await Product.create({
      title: 'In Stock Item',
      slug: 'in-stock-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      variants: [{ sku: 'IS-1', options: {}, price: 400, stock: 5, images: [] }],
    });
    const blocked = await request(app)
      .post('/api/waitlist')
      .send({ productId: inStock.id, email: 'eager@example.com', kind: 'back_in_stock' });
    expect(blocked.status).toBe(400);

    const outOfStock = await Product.create({
      title: 'Sold Out Item',
      slug: 'sold-out-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      variants: [{ sku: 'OOS-1', options: {}, price: 400, stock: 0, images: [] }],
    });
    const joined = await request(app)
      .post('/api/waitlist')
      .send({ productId: outOfStock.id, email: 'eager@example.com', kind: 'back_in_stock' });
    expect(joined.status).toBe(201);

    // Re-joining the same product/email/kind is idempotent, not a duplicate-key error.
    const rejoined = await request(app)
      .post('/api/waitlist')
      .send({ productId: outOfStock.id, email: 'eager@example.com', kind: 'back_in_stock' });
    expect(rejoined.status).toBe(201);
    expect(await WaitlistEntry.countDocuments({ product: outOfStock.id })).toBe(1);
  });

  it('lets a shopper join a drop-notify waitlist only when there is an upcoming drop', async () => {
    const noDrop = await Product.create({
      title: 'No Drop Item',
      slug: 'no-drop-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      variants: [{ sku: 'ND-1', options: {}, price: 400, stock: 5, images: [] }],
    });
    const blocked = await request(app)
      .post('/api/waitlist')
      .send({ productId: noDrop.id, email: 'waiting@example.com', kind: 'drop_notify' });
    expect(blocked.status).toBe(400);

    const upcomingDrop = await Product.create({
      title: 'Upcoming Drop Item',
      slug: 'upcoming-drop-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      dropAt: new Date(Date.now() + 60 * 60 * 1000),
      variants: [{ sku: 'UD-1', options: {}, price: 400, stock: 1, images: [] }],
    });
    const joined = await request(app)
      .post('/api/waitlist')
      .send({ productId: upcomingDrop.id, email: 'waiting@example.com', kind: 'drop_notify' });
    expect(joined.status).toBe(201);
  });

  it('the drop-notify job emails everyone waiting once dropAt has passed, and is idempotent on the next tick', async () => {
    const product = await Product.create({
      title: 'Just Dropped Item',
      slug: 'just-dropped-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      dropAt: new Date(Date.now() - 1000), // already live
      variants: [{ sku: 'JD-1', options: {}, price: 400, stock: 1, images: [] }],
    });
    await WaitlistEntry.create({
      product: product.id,
      email: 'a@example.com',
      kind: 'drop_notify',
    });
    await WaitlistEntry.create({
      product: product.id,
      email: 'b@example.com',
      kind: 'drop_notify',
    });

    const firstRun = await runWaitlistNotifyJob();
    expect(firstRun.dropNotified).toBe(2);

    const entries = await WaitlistEntry.find({ product: product.id });
    expect(entries.every((e) => e.notifiedAt !== null)).toBe(true);

    const secondRun = await runWaitlistNotifyJob();
    expect(secondRun.dropNotified).toBe(0);
  });

  it('the back-in-stock job emails everyone waiting once a variant is restocked', async () => {
    const product = await Product.create({
      title: 'Restocked Item',
      slug: 'restocked-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 400,
      status: 'published',
      variants: [{ sku: 'RS-1', options: {}, price: 400, stock: 0, images: [] }],
    });
    await WaitlistEntry.create({
      product: product.id,
      email: 'c@example.com',
      kind: 'back_in_stock',
    });

    const beforeRestock = await runWaitlistNotifyJob();
    expect(beforeRestock.backInStockNotified).toBe(0);

    await Product.updateOne({ _id: product.id }, { 'variants.0.stock': 10 });
    const afterRestock = await runWaitlistNotifyJob();
    expect(afterRestock.backInStockNotified).toBe(1);
  });
});

describe('Newsletter signup', () => {
  it('subscribes a new email and is idempotent on re-subscribe', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'Fan@Example.com' });
    expect(res.status).toBe(201);
    expect(res.body.alreadySubscribed).toBe(false);

    const stored = await NewsletterSubscriber.findOne({ email: 'fan@example.com' });
    expect(stored).not.toBeNull();

    const again = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'fan@example.com' });
    expect(again.status).toBe(201);
    expect(again.body.alreadySubscribed).toBe(true);
    expect(await NewsletterSubscriber.countDocuments()).toBe(1);
  });
});

describe('Abandoned cart cron job', () => {
  async function loginAs(role: 'customer', email: string) {
    const passwordHash = await bcrypt.hash('password123', 4);
    const user = await User.create({ name: role, email, passwordHash, role });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    return { token: res.body.accessToken as string, userId: user.id as string };
  }

  it('emails only registered-user carts stale past the threshold, then skips them on the next tick', async () => {
    const product = await Product.create({
      title: 'Abandonable Item',
      slug: 'abandonable-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 300,
      status: 'published',
      variants: [{ sku: 'AB-1', options: {}, price: 300, stock: 5, images: [] }],
    });

    const { token, userId } = await loginAs('customer', 'abandoner@example.com');
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, variantSku: 'AB-1', qty: 1 });

    // Simulate the cart having gone stale hours ago (timestamps:false so this update doesn't
    // immediately get overwritten back to "now" by the schema's own timestamps plugin).
    const staleDate = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await Cart.updateOne({ user: userId }, { updatedAt: staleDate }, { timestamps: false });

    // A fresh guest cart should never be emailed - no email is ever captured for it.
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', 'guest-abandoner')
      .send({ productId: product.id, variantSku: 'AB-1', qty: 1 });

    const firstRun = await runAbandonedCartJob();
    expect(firstRun).toBe(1);

    const cart = await Cart.findOne({ user: userId });
    expect(cart!.abandonedEmailSentAt).not.toBeNull();

    const secondRun = await runAbandonedCartJob();
    expect(secondRun).toBe(0);
  });
});

describe('Low-stock digest cron job', () => {
  it('sends a digest listing every at/under-threshold variant and no-ops when nothing qualifies', async () => {
    await Settings.create({ supportEmail: 'ops@resinstudio.example' });
    await Product.create({
      title: 'Almost Gone Item',
      slug: 'almost-gone-item',
      description: 'x',
      type: 'supply',
      basePrice: 100,
      status: 'published',
      variants: [{ sku: 'AG-1', options: {}, price: 100, stock: 2, images: [] }],
    });

    const withLowStock = await runLowStockDigestJob();
    expect(withLowStock).toBe(1);

    await Product.updateOne({ slug: 'almost-gone-item' }, { 'variants.0.stock': 50 });
    const withoutLowStock = await runLowStockDigestJob();
    expect(withoutLowStock).toBe(0);
  });
});

import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { User } from '../../src/models/User';
import { Product } from '../../src/models/Product';
import { Banner } from '../../src/models/Banner';

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

async function loginAs(role: 'staff' | 'manager' | 'owner', email = `${role}@example.com`) {
  const passwordHash = await bcrypt.hash('password123', 4);
  await User.create({ name: role, email, passwordHash, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  return { token: res.body.accessToken as string };
}

describe('Banners (homepage/collection content CMS, §7.5)', () => {
  it('blocks staff, allows manager to create a banner, and it appears in the public listing', async () => {
    const { token: staffToken } = await loginAs('staff');
    const staffRes = await request(app)
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ title: 'Diwali Sale', image: 'https://example.com/hero.jpg', placement: 'hero' });
    expect(staffRes.status).toBe(403);

    const { token: managerToken } = await loginAs('manager');
    const createRes = await request(app)
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'Diwali Sale', image: 'https://example.com/hero.jpg', placement: 'hero' });
    expect(createRes.status).toBe(201);

    const publicRes = await request(app).get('/api/banners?placement=hero');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data).toHaveLength(1);
    expect(publicRes.body.data[0].title).toBe('Diwali Sale');
  });

  it('excludes banners outside their scheduled start/end window and inactive banners', async () => {
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await Banner.create([
      { title: 'Live now', image: 'x.jpg', placement: 'promo_strip', active: true },
      {
        title: 'Already ended',
        image: 'x.jpg',
        placement: 'promo_strip',
        active: true,
        startsAt: past,
        endsAt: past,
      },
      {
        title: 'Not started yet',
        image: 'x.jpg',
        placement: 'promo_strip',
        active: true,
        startsAt: future,
      },
      { title: 'Disabled', image: 'x.jpg', placement: 'promo_strip', active: false },
    ]);

    const res = await request(app).get('/api/banners?placement=promo_strip');
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual(['Live now']);
  });

  it('reorders banners in a single bulk call', async () => {
    const { token } = await loginAs('owner');
    const [a, b] = await Banner.create([
      { title: 'A', image: 'a.jpg', placement: 'hero', order: 0 },
      { title: 'B', image: 'b.jpg', placement: 'hero', order: 1 },
    ]);

    const res = await request(app)
      .put('/api/admin/banners/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderedIds: [b!.id, a!.id] });
    expect(res.status).toBe(200);

    const reordered = await Banner.find().sort('order');
    expect(reordered.map((x) => x.title)).toEqual(['B', 'A']);
  });
});

describe('Curated collections (manual + rule-based, §7.3)', () => {
  it("resolves a collection's effective product list as the union of manual products and ruleTag matches", async () => {
    const manual = await Product.create({
      title: 'Manually Curated Piece',
      slug: 'manually-curated-piece',
      description: 'x',
      type: 'finished_art',
      basePrice: 500,
      status: 'published',
      variants: [{ sku: 'MAN-1', options: {}, price: 500, stock: 5, images: [] }],
    });
    await Product.create({
      title: 'Diwali Tagged Item',
      slug: 'diwali-tagged-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 700,
      status: 'published',
      tags: ['diwali'],
      variants: [{ sku: 'DIW-1', options: {}, price: 700, stock: 5, images: [] }],
    });
    await Product.create({
      title: 'Unrelated Draft',
      slug: 'unrelated-draft',
      description: 'x',
      type: 'finished_art',
      basePrice: 300,
      status: 'draft',
      tags: ['diwali'],
      variants: [{ sku: 'UNR-1', options: {}, price: 300, stock: 5, images: [] }],
    });

    const { token } = await loginAs('manager');
    const createRes = await request(app)
      .post('/api/admin/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Diwali Gifting', products: [manual.id], ruleTag: 'diwali' });
    expect(createRes.status).toBe(201);
    const slug = createRes.body.collection.slug;

    const res = await request(app).get(`/api/collections/${slug}`);
    expect(res.status).toBe(200);
    const titles = res.body.products.map((p: { title: string }) => p.title).sort();
    // The draft item is tag-matched but unpublished, so it must not leak into the storefront view.
    expect(titles).toEqual(['Diwali Tagged Item', 'Manually Curated Piece']);
  });

  it('404s for an unknown or inactive collection slug', async () => {
    const res = await request(app).get('/api/collections/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('Blog/tutorials with product linking (§6.5/§7.5)', () => {
  it('hides drafts from the public list/detail and shows them once published, with linked products populated', async () => {
    const resin = await Product.create({
      title: 'Clear Casting Resin 1L',
      slug: 'clear-casting-resin-1l',
      description: 'x',
      type: 'supply',
      basePrice: 1200,
      status: 'published',
      variants: [{ sku: 'RESIN-1L', options: {}, price: 1200, stock: 20, images: [] }],
    });

    const { token } = await loginAs('manager');
    const createRes = await request(app)
      .post('/api/admin/blog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'How to Make Resin Coasters',
        content: 'Full tutorial content...',
        tags: ['tutorial', 'coasters'],
        linkedProducts: [resin.id],
        status: 'draft',
      });
    expect(createRes.status).toBe(201);
    const { _id: postId, slug } = createRes.body.post;

    const draftListRes = await request(app).get('/api/blog');
    expect(draftListRes.body.data).toHaveLength(0);
    const draftDetailRes = await request(app).get(`/api/blog/${slug}`);
    expect(draftDetailRes.status).toBe(404);

    const publishRes = await request(app)
      .put(`/api/admin/blog/${postId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.post.publishedAt).toBeTruthy();

    const listRes = await request(app).get('/api/blog');
    expect(listRes.body.data).toHaveLength(1);

    const detailRes = await request(app).get(`/api/blog/${slug}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.post.linkedProducts[0].title).toBe('Clear Casting Resin 1L');
  });

  it('lets admin fetch a draft by id (populated) for the edit screen, and blocks customers', async () => {
    const resin = await Product.create({
      title: 'Silicone Coaster Mold',
      slug: 'silicone-coaster-mold',
      description: 'x',
      type: 'supply',
      basePrice: 350,
      status: 'published',
      variants: [{ sku: 'MOLD-1', options: {}, price: 350, stock: 10, images: [] }],
    });
    const { token } = await loginAs('manager');
    const createRes = await request(app)
      .post('/api/admin/blog')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Draft Post', content: 'x', linkedProducts: [resin.id], status: 'draft' });
    const postId = createRes.body.post._id;

    const res = await request(app)
      .get(`/api/admin/blog/${postId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.post.linkedProducts[0].title).toBe('Silicone Coaster Mold');

    const unauth = await request(app).get(`/api/admin/blog/${postId}`);
    expect(unauth.status).toBe(401);
  });

  it('strips <script> tags from post content on write (same XSS defense as Product.description)', async () => {
    const { token } = await loginAs('manager');
    const res = await request(app)
      .post('/api/admin/blog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'XSS Guard Post',
        content: '<p>Safe content</p><script>alert(1)</script><img src=x onerror=alert(2)>',
        status: 'published',
      });
    expect(res.status).toBe(201);
    expect(res.body.post.content).not.toContain('<script');
    expect(res.body.post.content).not.toContain('onerror');
    expect(res.body.post.content).toContain('<p>Safe content</p>');
  });
});

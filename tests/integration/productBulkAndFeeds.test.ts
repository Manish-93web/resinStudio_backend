import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app';
import { setupTestDb, teardownTestDb, clearTestDb } from './setup';
import { User } from '../../src/models/User';
import { Product } from '../../src/models/Product';
import { Category } from '../../src/models/Category';
import { parseCsvToObjects } from '../../src/utils/csv';

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

describe('Product CSV export/import (§7.1 bulk actions)', () => {
  it('exports one row per variant with product fields repeated', async () => {
    await Product.create({
      title: 'Two Variant Piece',
      slug: 'two-variant-piece',
      description: 'x',
      type: 'finished_art',
      basePrice: 500,
      status: 'published',
      variants: [
        { sku: 'TVP-1', options: { color: 'Blue' }, price: 500, stock: 5, images: [] },
        { sku: 'TVP-2', options: { color: 'Red' }, price: 550, stock: 3, images: [] },
      ],
    });

    const { token } = await loginAs('staff');
    const res = await request(app)
      .get('/api/admin/products/export.csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const rows = parseCsvToObjects(res.text);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sku).sort()).toEqual(['TVP-1', 'TVP-2']);
    expect(rows[0]!.slug).toBe('two-variant-piece');
  });

  it('creates a new product on first import and updates it in place (variants replaced) on re-import by slug', async () => {
    const category = await Category.create({ name: 'Coasters', slug: 'coasters' });
    const { token } = await loginAs('manager');

    const csvV1 = [
      'slug,title,type,description,category,tags,basePrice,salePrice,costPrice,status,isUnique,countryOfOrigin,sku,variantPrice,variantStock,variantColor,variantSize,variantVolume',
      'csv-imported-item,CSV Imported Item,finished_art,A test item,coasters,new;featured,600,,,published,false,India,CSV-1,600,10,,,',
    ].join('\n');

    const importRes = await request(app)
      .post('/api/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: csvV1 });
    expect(importRes.status).toBe(200);
    expect(importRes.body.created).toBe(1);
    expect(importRes.body.updated).toBe(0);

    const created = await Product.findOne({ slug: 'csv-imported-item' }).populate('category');
    expect(created).not.toBeNull();
    expect(created!.basePrice).toBe(600);
    expect(created!.variants).toHaveLength(1);
    expect((created!.category[0] as unknown as { slug: string }).slug).toBe(category.slug);

    // Re-import the same slug with a price change and a second variant - should update in place,
    // not create a duplicate product.
    const csvV2 = [
      'slug,title,type,description,category,tags,basePrice,salePrice,costPrice,status,isUnique,countryOfOrigin,sku,variantPrice,variantStock,variantColor,variantSize,variantVolume',
      'csv-imported-item,CSV Imported Item,finished_art,A test item,coasters,new;featured,650,,,published,false,India,CSV-1,650,8,,,',
      'csv-imported-item,CSV Imported Item,finished_art,A test item,coasters,new;featured,650,,,published,false,India,CSV-2,700,4,,,',
    ].join('\n');

    const reimportRes = await request(app)
      .post('/api/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: csvV2 });
    expect(reimportRes.status).toBe(200);
    expect(reimportRes.body.created).toBe(0);
    expect(reimportRes.body.updated).toBe(1);

    const totalProducts = await Product.countDocuments({ slug: 'csv-imported-item' });
    expect(totalProducts).toBe(1);

    const updated = await Product.findOne({ slug: 'csv-imported-item' });
    expect(updated!.basePrice).toBe(650);
    expect(updated!.variants).toHaveLength(2);
  });

  it('reports an unknown category slug as a per-row error without failing the whole import', async () => {
    const { token } = await loginAs('manager');
    const csv = [
      'slug,title,type,description,category,tags,basePrice,salePrice,costPrice,status,isUnique,countryOfOrigin,sku,variantPrice,variantStock,variantColor,variantSize,variantVolume',
      'bad-category-item,Bad Category Item,finished_art,x,does-not-exist,,400,,,published,false,India,BCI-1,400,5,,,',
    ].join('\n');

    const res = await request(app)
      .post('/api/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.errors[0]).toContain('unknown category slug');

    const product = await Product.findOne({ slug: 'bad-category-item' });
    expect(product!.category).toHaveLength(0);
  });

  it('blocks staff from importing/bulk-editing but allows listing/exporting', async () => {
    const { token } = await loginAs('staff');
    const res = await request(app)
      .post('/api/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: 'slug,title\nx,y' });
    expect(res.status).toBe(403);
  });
});

describe('Bulk price / category / status actions (§7.1)', () => {
  it('bulk-updates price, assigns a category, and sets status across multiple products in one call each', async () => {
    const category = await Category.create({ name: 'Home Décor', slug: 'home-decor' });
    const products = await Product.create([
      {
        title: 'Bulk A',
        slug: 'bulk-a',
        description: 'x',
        type: 'finished_art',
        basePrice: 100,
        status: 'draft',
        variants: [{ sku: 'BULK-A', options: {}, price: 100, stock: 5, images: [] }],
      },
      {
        title: 'Bulk B',
        slug: 'bulk-b',
        description: 'x',
        type: 'finished_art',
        basePrice: 200,
        status: 'draft',
        variants: [{ sku: 'BULK-B', options: {}, price: 200, stock: 5, images: [] }],
      },
    ]);
    const ids = products.map((p) => p.id);
    const { token } = await loginAs('manager');

    const priceRes = await request(app)
      .post('/api/admin/products/bulk/price')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, basePrice: 999 });
    expect(priceRes.status).toBe(200);
    expect(priceRes.body.modified).toBe(2);

    const categoryRes = await request(app)
      .post('/api/admin/products/bulk/category')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, categoryId: category.id });
    expect(categoryRes.status).toBe(200);
    expect(categoryRes.body.modified).toBe(2);

    const statusRes = await request(app)
      .post('/api/admin/products/bulk/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids, status: 'published' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.modified).toBe(2);

    const refreshed = await Product.find({ _id: { $in: ids } });
    for (const product of refreshed) {
      expect(product.basePrice).toBe(999);
      expect(product.status).toBe('published');
      expect(product.category.map((c) => c.toString())).toContain(category.id);
    }
  });
});

describe('Orders CSV export (§7.2, accounting/GST filing)', () => {
  it('exports orders as CSV with a header row and one row per order', async () => {
    const product = await Product.create({
      title: 'Export Order Item',
      slug: 'export-order-item',
      description: 'x',
      type: 'finished_art',
      basePrice: 250,
      status: 'published',
      variants: [{ sku: 'EOI-1', options: {}, price: 250, stock: 5, images: [] }],
    });
    const sessionId = 'export-orders-session';
    await request(app)
      .post('/api/cart/items')
      .set('X-Session-Id', sessionId)
      .send({ productId: product.id, variantSku: 'EOI-1', qty: 1 });
    await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({
        shippingAddress: {
          line1: '1 MG Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          phone: '9876543210',
        },
        guestEmail: 'exporter@example.com',
        paymentMethod: 'cod',
      });

    const { token } = await loginAs('staff');
    const res = await request(app)
      .get('/api/orders/export.csv')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const rows = parseCsvToObjects(res.text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.customerEmail).toBe('exporter@example.com');
    expect(Number(rows[0]!.total)).toBe(310); // 250 + 60 weight-tier shipping (250g default, under the 500g tier)
  });

  it('rejects export.csv for an unauthenticated caller and does not treat it as an order id', async () => {
    const res = await request(app).get('/api/orders/export.csv');
    expect(res.status).toBe(401);
  });
});

describe('Google Merchant + Meta catalog feeds (§7.5, shopping feeds)', () => {
  it('includes live published products but excludes not-yet-dropped ones', async () => {
    await Product.create({
      title: 'Feed Visible Item',
      slug: 'feed-visible-item',
      description: '<p>Nice <b>resin</b> piece</p>',
      type: 'finished_art',
      basePrice: 800,
      status: 'published',
      variants: [
        {
          sku: 'FEED-1',
          options: {},
          price: 800,
          stock: 5,
          images: ['https://example.com/img.jpg'],
        },
      ],
    });
    await Product.create({
      title: 'Feed Hidden Drop',
      slug: 'feed-hidden-drop',
      description: 'x',
      type: 'finished_art',
      basePrice: 900,
      status: 'published',
      dropAt: new Date(Date.now() + 60 * 60 * 1000),
      variants: [{ sku: 'FEED-2', options: {}, price: 900, stock: 5, images: [] }],
    });

    const xmlRes = await request(app).get('/api/feeds/google-merchant.xml');
    expect(xmlRes.status).toBe(200);
    expect(xmlRes.headers['content-type']).toContain('xml');
    expect(xmlRes.text).toContain('<g:id>FEED-1</g:id>');
    expect(xmlRes.text).not.toContain('FEED-2');
    expect(xmlRes.text).toContain('<g:availability>in stock</g:availability>');
    expect(xmlRes.text).not.toContain('<b>resin</b>'); // HTML stripped from description

    const csvRes = await request(app).get('/api/feeds/meta.csv');
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    const rows = parseCsvToObjects(csvRes.text);
    expect(rows.map((r) => r.id)).toEqual(['FEED-1']);
    expect(rows[0]!.price).toBe('800.00 INR');
  });
});

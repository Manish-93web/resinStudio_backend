import { Product } from '../models/Product';
import { env } from '../config/env';
import { buildCsv } from '../utils/csv';
import { getSettings } from './settings.service';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: 'in stock' | 'out of stock';
  price: string;
  brand: string;
}

async function buildFeedItems(): Promise<FeedItem[]> {
  const [products, settings] = await Promise.all([
    Product.find({ status: 'published' }),
    getSettings(),
  ]);

  const items: FeedItem[] = [];
  for (const product of products) {
    // Scheduled drops that haven't gone live yet are excluded — no point advertising something
    // that would 409 if a shopper actually tried to buy it (§6.7 server-side dropAt enforcement).
    if (product.dropAt && product.dropAt.getTime() > Date.now()) continue;

    for (const variant of product.variants) {
      items.push({
        id: variant.sku,
        title: product.title,
        description: product.description.replace(/<[^>]*>/g, '').slice(0, 5000),
        link: `${env.FRONTEND_URL}/product/${product.slug}`,
        imageLink: variant.images[0] ?? product.images[0]?.url ?? '',
        availability: variant.stock > 0 ? 'in stock' : 'out of stock',
        price: `${variant.price.toFixed(2)} ${product.currency}`,
        brand: settings.storeName,
      });
    }
  }
  return items;
}

/** Google Merchant Center product feed - RSS 2.0 with the `g:` namespace, per Google's documented
 *  feed spec. Field/image/availability data is already exactly what's in the Product schema. */
export async function buildGoogleMerchantFeed(): Promise<string> {
  const items = await buildFeedItems();
  const settings = await getSettings();

  const itemXml = items
    .map(
      (item) => `
  <item>
    <g:id>${xmlEscape(item.id)}</g:id>
    <title>${xmlEscape(item.title)}</title>
    <description>${xmlEscape(item.description)}</description>
    <link>${xmlEscape(item.link)}</link>
    <g:image_link>${xmlEscape(item.imageLink)}</g:image_link>
    <g:availability>${item.availability}</g:availability>
    <g:price>${item.price}</g:price>
    <g:brand>${xmlEscape(item.brand)}</g:brand>
    <g:condition>new</g:condition>
  </item>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${xmlEscape(settings.storeName)} Product Feed</title>
  <link>${xmlEscape(env.FRONTEND_URL)}</link>
  <description>${xmlEscape(settings.storeName)} product catalog</description>${itemXml}
</channel>
</rss>`;
}

/** Meta (Facebook/Instagram Shop) catalog feed - CSV is one of Meta's documented supported
 *  formats, simpler to produce/inspect than their XML variant. */
export async function buildMetaCatalogFeed(): Promise<string> {
  const items = await buildFeedItems();
  const header = [
    'id',
    'title',
    'description',
    'availability',
    'condition',
    'price',
    'link',
    'image_link',
    'brand',
  ];
  const rows = items.map((item) => [
    item.id,
    item.title,
    item.description,
    item.availability,
    'new',
    item.price,
    item.link,
    item.imageLink,
    item.brand,
  ]);
  return buildCsv(header, rows);
}

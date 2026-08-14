import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { connectDb, disconnectDb } from '../src/config/db';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Category } from '../src/models/Category';
import { Product } from '../src/models/Product';
import { Banner } from '../src/models/Banner';
import { Collection } from '../src/models/Collection';
import { BlogPost } from '../src/models/BlogPost';
import { Settings } from '../src/models/Settings';
import { Review } from '../src/models/Review';
import { logger } from '../src/config/logger';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@resinstudio.test';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
// .png suffix requests a raster image - Next.js's image optimizer disallows the SVG placehold.co
// serves by default (svg is blocked without opting into dangerouslyAllowSVG). Color matches the
// site's own primary token (app/globals.css --primary) so a not-yet-generated product image still
// looks intentional rather than a random mismatched color.
const PLACEHOLDER_IMAGE = 'https://placehold.co/800x800/0F6F58/FFFFFF.png?text=ResinStudio';

// Real product photography generated via scripts/generateProductImages.ts, served from this
// backend's own /static mount (see src/app.ts) since Cloudinary isn't configured in this dev
// environment. Falls back to the placeholder for any file that wasn't generated (e.g. the
// OpenRouter free-tier key ran out of credits partway through the batch) rather than a broken
// image link - see generateProductImages.ts's own run output for exactly which ones landed.
const GENERATED_DIR = path.join(__dirname, '..', 'public', 'generated');
function generatedImage(filename: string): string {
  const exists = fs.existsSync(path.join(GENERATED_DIR, filename));
  return exists ? `${env.BACKEND_PUBLIC_URL}/static/generated/${filename}` : PLACEHOLDER_IMAGE;
}

async function seedAdmin(): Promise<void> {
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    logger.info(`Admin user already exists: ${ADMIN_EMAIL}`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.create({ name: 'Store Owner', email: ADMIN_EMAIL, passwordHash, role: 'owner' });

  logger.info(`Seeded admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  logger.warn(
    'Log in and enable 2FA immediately (owner/manager roles require it, §7.8) — this is a dev-only default password.',
  );
}

const CATEGORY_SEED = [
  { name: 'Coasters & Trays', slug: 'coasters-trays', order: 1 },
  { name: 'Wall Art & Clocks', slug: 'wall-art-clocks', order: 2 },
  { name: 'Jewelry', slug: 'jewelry', order: 3 },
  { name: 'Epoxy Resin', slug: 'epoxy-resin', order: 4 },
  { name: 'Pigments & Colorants', slug: 'pigments-colorants', order: 5 },
];

async function seedCategories(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();

  for (const cat of CATEGORY_SEED) {
    const existing = await Category.findOneAndUpdate(
      { slug: cat.slug },
      { $setOnInsert: cat },
      { upsert: true, returnDocument: 'after' },
    );
    idBySlug.set(cat.slug, existing.id);
  }

  logger.info(`Seeded ${CATEGORY_SEED.length} categories`);
  return idBySlug;
}

async function seedProducts(categoryIds: Map<string, string>): Promise<void> {
  const catRef = (slug: string): string[] => {
    const id = categoryIds.get(slug);
    return id ? [id] : [];
  };

  const products = [
    {
      title: 'Ocean Wave Resin Coaster Set',
      slug: 'ocean-wave-resin-coaster-set',
      description:
        'A set of 4 handmade coasters with a swirling blue-and-white ocean effect, each one-of-a-kind.',
      type: 'finished_art' as const,
      category: catRef('coasters-trays'),
      tags: ['coasters', 'ocean', 'gift'],
      images: [
        {
          url: generatedImage('ocean-wave-resin-coaster-set.png'),
          alt: 'Ocean wave resin coaster set',
          order: 0,
        },
      ],
      basePrice: 899,
      status: 'published' as const,
      variants: [{ sku: 'COAST-OCEAN-4PK', options: {}, price: 899, stock: 12, images: [] }],
      specs: {
        dimensions: '10cm x 10cm each',
        weight: '400g set',
        materials: 'Epoxy resin, wood base',
        careInstructions: 'Wipe clean, avoid direct heat',
      },
    },
    {
      title: 'One-of-a-Kind Amber River Wall Panel',
      slug: 'amber-river-wall-panel',
      description:
        'A large single-piece wall art panel with a poured amber "river" effect through dark walnut — no two pieces will ever be alike, and this is the only one of this pour.',
      type: 'finished_art' as const,
      category: catRef('wall-art-clocks'),
      tags: ['wall-art', 'one-of-a-kind', 'river'],
      images: [
        {
          url: generatedImage('amber-river-wall-panel.png'),
          alt: 'Amber river resin wall panel',
          order: 0,
        },
      ],
      basePrice: 12500,
      status: 'published' as const,
      isUnique: true,
      dropAt: null,
      productionTimeDays: null,
      variants: [{ sku: 'WALL-AMBER-RIVER-001', options: {}, price: 12500, stock: 1, images: [] }],
      specs: {
        dimensions: '90cm x 45cm',
        weight: '3.2kg',
        materials: 'Epoxy resin, walnut',
        careInstructions: 'Dust with a dry cloth',
      },
    },
    {
      title: 'Geode Agate Resin Coaster Set',
      slug: 'geode-agate-coaster-set',
      description:
        'A set of 4 geode-inspired coasters with concentric bands of white, gold, and deep purple resin mimicking a crystal agate slice, finished with a gold-leaf edge.',
      type: 'finished_art' as const,
      category: catRef('coasters-trays'),
      tags: ['coasters', 'geode', 'gift'],
      images: [
        {
          url: generatedImage('geode-agate-coaster-set.png'),
          alt: 'Geode agate resin coaster set',
          order: 0,
        },
      ],
      basePrice: 1099,
      status: 'published' as const,
      variants: [{ sku: 'COAST-GEODE-4PK', options: {}, price: 1099, stock: 15, images: [] }],
      specs: {
        dimensions: '10cm diameter each',
        weight: '420g set',
        materials: 'Epoxy resin, gold leaf',
        careInstructions: 'Wipe clean, avoid direct heat',
      },
    },
    {
      title: 'Pressed Flower Resin Pendant Necklace',
      slug: 'pressed-flower-pendant-necklace',
      description:
        'A real pressed wildflower encased in a gold-rimmed epoxy resin pendant, on a delicate gold-plated chain.',
      type: 'finished_art' as const,
      category: catRef('jewelry'),
      tags: ['jewelry', 'necklace', 'botanical', 'gift'],
      images: [
        {
          url: generatedImage('pressed-flower-pendant-necklace.png'),
          alt: 'Pressed flower resin pendant necklace',
          order: 0,
        },
      ],
      basePrice: 649,
      status: 'published' as const,
      variants: [{ sku: 'NECK-PRESSFLOWER-01', options: {}, price: 649, stock: 20, images: [] }],
      specs: {
        dimensions: '2.5cm pendant, 45cm chain',
        weight: '8g',
        materials: 'Epoxy resin, gold-plated brass, real pressed flower',
        careInstructions: 'Keep dry, avoid prolonged direct sunlight',
      },
    },
    {
      title: 'Galaxy Swirl Resin Stud Earrings',
      slug: 'galaxy-swirl-stud-earrings',
      description:
        'Deep-purple and black galaxy-swirl resin studs flecked with fine gold glitter, on gold-plated posts.',
      type: 'finished_art' as const,
      category: catRef('jewelry'),
      tags: ['jewelry', 'earrings', 'galaxy', 'gift'],
      images: [
        {
          url: generatedImage('galaxy-swirl-stud-earrings.png'),
          alt: 'Galaxy swirl resin stud earrings',
          order: 0,
        },
      ],
      basePrice: 449,
      status: 'published' as const,
      variants: [{ sku: 'EAR-GALAXY-01', options: {}, price: 449, stock: 30, images: [] }],
      specs: {
        dimensions: '1.2cm diameter',
        weight: '4g pair',
        materials: 'Epoxy resin, gold-plated brass',
        careInstructions: 'Keep dry, remove before swimming',
      },
    },
    {
      title: 'Gold Leaf Resin Serving Tray',
      slug: 'gold-leaf-serving-tray',
      description:
        'A wooden serving tray with a glossy clear epoxy resin surface embedded with genuine gold leaf flakes and brass side handles.',
      type: 'finished_art' as const,
      category: catRef('coasters-trays'),
      tags: ['tray', 'serving', 'gold-leaf', 'gift'],
      images: [
        {
          url: generatedImage('gold-leaf-serving-tray.png'),
          alt: 'Gold leaf resin serving tray',
          order: 0,
        },
      ],
      basePrice: 2199,
      status: 'published' as const,
      variants: [{ sku: 'TRAY-GOLDLEAF-01', options: {}, price: 2199, stock: 8, images: [] }],
      specs: {
        dimensions: '35cm x 22cm',
        weight: '900g',
        materials: 'Epoxy resin, wood, gold leaf, brass',
        careInstructions: 'Wipe clean, hand items only — not dishwasher safe',
      },
    },
    {
      title: 'Marbled Ivory Resin Wall Clock',
      slug: 'marbled-wall-clock',
      description:
        'A round wall clock with an ivory-and-gold marbled epoxy resin face and slim black hands — a quiet statement piece for any room.',
      type: 'finished_art' as const,
      category: catRef('wall-art-clocks'),
      tags: ['wall-art', 'clock', 'marble', 'gift'],
      images: [
        {
          url: generatedImage('marbled-wall-clock.png'),
          alt: 'Marbled ivory resin wall clock',
          order: 0,
        },
      ],
      basePrice: 1899,
      status: 'published' as const,
      variants: [{ sku: 'CLOCK-MARBLE-IVORY-01', options: {}, price: 1899, stock: 10, images: [] }],
      specs: {
        dimensions: '30cm diameter',
        weight: '650g',
        materials: 'Epoxy resin, quartz clock movement',
        careInstructions: 'Dust with a dry cloth, battery not included',
      },
    },
    {
      title: 'Crystal Clear Casting Epoxy Resin — 1L Kit',
      slug: 'crystal-clear-casting-epoxy-resin-1l',
      description:
        'A 1:1 mix ratio clear casting epoxy resin and hardener kit for coasters, jewelry, and small castings.',
      type: 'supply' as const,
      category: catRef('epoxy-resin'),
      tags: ['epoxy', 'beginner-friendly'],
      images: [
        {
          url: generatedImage('crystal-clear-casting-epoxy-resin-1l.png'),
          alt: 'Clear casting epoxy resin kit',
          order: 0,
        },
      ],
      basePrice: 1450,
      status: 'published' as const,
      shippingConstraints: { groundOnly: true, heatSensitive: true, maxPackageVolumeMl: 2000 },
      variants: [
        { sku: 'EPOXY-CLEAR-1L', options: { volume: '1L' }, price: 1450, stock: 40, images: [] },
      ],
      specs: {
        volume: '1L (500ml resin + 500ml hardener)',
        mixRatio: '1:1 by volume',
        cureTime: '24-72 hours',
        shelfLife: '12 months unopened',
        safetyInfo: 'Use in a ventilated area, wear gloves and eye protection',
      },
    },
    {
      title: 'Mica Powder Pigment Set (12 Colors)',
      slug: 'mica-powder-pigment-set-12-colors',
      description:
        'A 12-color mica powder set for tinting resin art — highly pigmented, shimmer finish.',
      type: 'supply' as const,
      category: catRef('pigments-colorants'),
      tags: ['pigment', 'mica', 'color'],
      images: [
        {
          url: generatedImage('mica-powder-pigment-set-12-colors.png'),
          alt: 'Mica powder pigment set',
          order: 0,
        },
      ],
      basePrice: 699,
      status: 'published' as const,
      variants: [{ sku: 'MICA-12PK', options: {}, price: 699, stock: 60, images: [] }],
      specs: {
        safetyInfo: 'Avoid inhalation; use a dust mask when mixing',
        shelfLife: 'Indefinite if kept dry',
      },
    },
    {
      title: 'Round Silicone Coaster Mold Set (6-Cavity)',
      slug: 'silicone-coaster-mold-set',
      description:
        'A flexible 6-cavity silicone mold set for casting your own round resin coasters at home.',
      type: 'supply' as const,
      category: catRef('epoxy-resin'),
      tags: ['mold', 'coasters', 'tools'],
      images: [
        {
          url: generatedImage('silicone-coaster-mold-set.png'),
          alt: 'Round silicone coaster mold set',
          order: 0,
        },
      ],
      basePrice: 549,
      status: 'published' as const,
      variants: [{ sku: 'MOLD-COASTER-6C', options: {}, price: 549, stock: 35, images: [] }],
      specs: {
        safetyInfo: 'Food-safe silicone, reusable',
        shelfLife: 'Reusable — replace if torn',
      },
    },
    {
      title: 'Concentrated Liquid Resin Dye Set (8 Colors)',
      slug: 'liquid-resin-dye-set',
      description:
        'Eight highly-concentrated liquid dyes for tinting epoxy resin — a few drops go a long way.',
      type: 'supply' as const,
      category: catRef('pigments-colorants'),
      tags: ['pigment', 'dye', 'color'],
      images: [
        { url: generatedImage('liquid-resin-dye-set.png'), alt: 'Liquid resin dye set', order: 0 },
      ],
      basePrice: 799,
      status: 'published' as const,
      variants: [{ sku: 'DYE-LIQUID-8PK', options: {}, price: 799, stock: 45, images: [] }],
      specs: { safetyInfo: 'Avoid skin/eye contact, wear gloves', shelfLife: '24 months unopened' },
    },
    {
      title: 'Chunky Holographic Glitter Mix for Resin',
      slug: 'chunky-glitter-mix',
      description:
        'A jar of chunky holographic glitter flakes for adding sparkle and dimension to resin art.',
      type: 'supply' as const,
      category: catRef('pigments-colorants'),
      tags: ['glitter', 'sparkle', 'pigment'],
      images: [
        {
          url: generatedImage('chunky-glitter-mix.png'),
          alt: 'Chunky holographic glitter mix',
          order: 0,
        },
      ],
      basePrice: 349,
      status: 'published' as const,
      variants: [{ sku: 'GLITTER-CHUNKY-HOLO', options: {}, price: 349, stock: 70, images: [] }],
      specs: { safetyInfo: 'Non-toxic craft glitter', shelfLife: 'Indefinite if kept dry' },
    },
    {
      title: 'Silicone Jewelry Mold Kit (Pendants & Earrings)',
      slug: 'silicone-jewelry-mold-kit',
      description:
        'A multi-cavity silicone sheet mold for casting your own resin pendants, earrings, and rings.',
      type: 'supply' as const,
      category: catRef('epoxy-resin'),
      tags: ['mold', 'jewelry', 'tools'],
      images: [
        {
          url: generatedImage('silicone-jewelry-mold-kit.png'),
          alt: 'Silicone jewelry mold kit',
          order: 0,
        },
      ],
      basePrice: 449,
      status: 'published' as const,
      variants: [{ sku: 'MOLD-JEWELRY-KIT', options: {}, price: 449, stock: 25, images: [] }],
      specs: { safetyInfo: 'Reusable silicone', shelfLife: 'Reusable — replace if torn' },
    },
    {
      title: 'Butane Micro Torch for Bubble-Free Resin',
      slug: 'butane-micro-torch',
      description:
        'A handheld butane micro torch for popping air bubbles out of curing resin — refillable, not included.',
      type: 'supply' as const,
      category: catRef('epoxy-resin'),
      tags: ['tools', 'torch'],
      images: [
        { url: generatedImage('butane-micro-torch.png'), alt: 'Butane micro torch', order: 0 },
      ],
      basePrice: 899,
      status: 'published' as const,
      shippingConstraints: { groundOnly: true, heatSensitive: false },
      variants: [{ sku: 'TOOL-TORCH-BUTANE', options: {}, price: 899, stock: 18, images: [] }],
      specs: {
        safetyInfo: 'Butane fuel not included — refill separately, keep away from flammables',
        shelfLife: 'N/A',
      },
    },
  ];

  for (const p of products) {
    await Product.findOneAndUpdate(
      { slug: p.slug },
      { $set: p },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  logger.info(`Seeded ${products.length} products (upserted by slug)`);
}

async function seedHeroBanner(): Promise<void> {
  const filename = 'hero-flatlay.png';
  if (!fs.existsSync(path.join(GENERATED_DIR, filename))) {
    logger.info('Hero flat-lay image not generated yet — skipping hero banner seed');
    return;
  }

  await Banner.findOneAndUpdate(
    { title: 'Handmade Resin Art, Made By Hand' },
    {
      $set: {
        title: 'Handmade Resin Art, Made By Hand',
        image: generatedImage(filename),
        link: '/shop/art',
        placement: 'hero',
        order: 0,
        active: true,
      },
    },
    { upsert: true },
  );
  logger.info('Seeded hero banner');
}

/** Activates the homepage's promo-strip announcement bar (built since an earlier phase but never
 *  seeded, so it never actually rendered) - ties the copy to a real setting (Settings.shipping's
 *  free-shipping threshold) rather than an arbitrary made-up discount, so it can't drift out of
 *  sync with what checkout actually does. `image` is schema-required even for this placement (the
 *  promo strip only ever renders `title` as text) - reuses the hero image rather than a second
 *  unused file. */
async function seedPromoBanner(): Promise<void> {
  const filename = 'hero-flatlay.png';
  if (!fs.existsSync(path.join(GENERATED_DIR, filename))) return;

  await Banner.findOneAndUpdate(
    { placement: 'promo_strip' },
    {
      $set: {
        title: 'Free shipping on orders over ₹999 — every order is handmade to order',
        image: generatedImage(filename),
        placement: 'promo_strip',
        order: 0,
        active: true,
      },
    },
    { upsert: true },
  );
  logger.info('Seeded promo-strip banner');
}

/** `/collections/one-of-a-kind` has been a real, live nav link (Nav.tsx) and homepage/mega-menu
 *  section since earlier phases, but no Collection document with that slug ever existed - every
 *  click has 404'd/shown an empty state. Found while testing the new nav mega-menu (it rendered
 *  zero tiles for "Collections" since usePublicCollections() had nothing to return at all - not
 *  specific to one-of-a-kind, no Collection existed whatsoever). Fixes that and gives the
 *  Collections mega-menu/homepage section real content instead of silently hiding. */
async function seedCollections(): Promise<void> {
  const bySlug = async (slug: string) => (await Product.findOne({ slug }).select('_id'))?._id;

  const oneOfAKind = await bySlug('amber-river-wall-panel');
  await Collection.findOneAndUpdate(
    { slug: 'one-of-a-kind' },
    {
      $set: {
        title: 'One of a Kind',
        slug: 'one-of-a-kind',
        description: 'Single-pour pieces — once it sells, that exact piece never exists again.',
        image: generatedImage('amber-river-wall-panel.png'),
        products: oneOfAKind ? [oneOfAKind] : [],
        order: 0,
        active: true,
      },
    },
    { upsert: true },
  );

  const oceanGeodeIds = (
    await Promise.all(['ocean-wave-resin-coaster-set', 'geode-agate-coaster-set'].map(bySlug))
  ).filter(Boolean);
  await Collection.findOneAndUpdate(
    { slug: 'ocean-and-geode' },
    {
      $set: {
        title: 'Ocean & Geode',
        slug: 'ocean-and-geode',
        description: 'Poured wave patterns and crystal-inspired bands, inspired by the sea.',
        image: generatedImage('ocean-wave-resin-coaster-set.png'),
        products: oceanGeodeIds,
        order: 1,
        active: true,
      },
    },
    { upsert: true },
  );

  const giftingIds = (
    await Promise.all(
      [
        'pressed-flower-pendant-necklace',
        'galaxy-swirl-stud-earrings',
        'gold-leaf-serving-tray',
      ].map(bySlug),
    )
  ).filter(Boolean);
  await Collection.findOneAndUpdate(
    { slug: 'gifting-edit' },
    {
      $set: {
        title: 'The Gifting Edit',
        slug: 'gifting-edit',
        description: 'Ready-to-gift pieces for birthdays, housewarmings, and everything between.',
        image: generatedImage('pressed-flower-pendant-necklace.png'),
        products: giftingIds,
        order: 2,
        active: true,
      },
    },
    { upsert: true },
  );

  logger.info('Seeded 3 collections');
}

/** `/blog` ("Tutorials" in the nav) has shown only a "we're building this out" stub message since
 *  it was built - the BlogPost model/admin CRUD have existed since an earlier phase, but nothing
 *  was ever actually published through them. Found during a broader page sweep (same class of gap
 *  as the empty Collections list). Real, substantive posts, each linking the actual products used
 *  (§6.5's "how to make X auto-links the supplies used") rather than placeholder lorem ipsum. */
async function seedBlogPosts(): Promise<void> {
  const admin = await User.findOne({ email: ADMIN_EMAIL }).select('_id');
  const bySlug = async (slug: string) => (await Product.findOne({ slug }).select('_id'))?._id;

  const posts = [
    {
      slug: 'how-to-make-ocean-wave-resin-coasters',
      title: 'How to Make Ocean-Wave Resin Coasters at Home',
      excerpt:
        'A beginner-friendly walkthrough for pouring your own swirled ocean-effect coasters.',
      cover: 'ocean-wave-resin-coaster-set.png',
      linkedSlugs: [
        'crystal-clear-casting-epoxy-resin-1l',
        'chunky-glitter-mix',
        'silicone-coaster-mold-set',
      ],
      content: `<h2>What you'll need</h2>
<ul>
<li>Clear casting epoxy resin (a 2:1 mix ratio kit is easiest for beginners)</li>
<li>Blue and white mica or liquid pigments</li>
<li>A round silicone coaster mold</li>
<li>A heat gun or butane torch, for popping bubbles</li>
</ul>
<h2>Steps</h2>
<ol>
<li>Mix your resin and hardener slowly, scraping the sides and bottom of the cup to avoid soft spots.</li>
<li>Split the mixed resin into two cups - tint one deep blue, leave the other mostly clear with a touch of white for foam.</li>
<li>Pour the blue layer first, then drag the white through it in a wave pattern with a toothpick.</li>
<li>Pass a torch lightly over the surface to release trapped air bubbles.</li>
<li>Let it cure undisturbed for 24-72 hours before demolding.</li>
</ol>
<p>Every batch comes out a little different — that's the point. Two coasters poured side by side will never be identical.</p>`,
    },
    {
      slug: 'getting-started-your-first-resin-pour',
      title: 'Getting Started: Your First Resin Pour',
      excerpt:
        'New to resin art? Start here — what to buy, what to avoid, and how to not waste your first batch.',
      cover: 'crystal-clear-casting-epoxy-resin-1l.png',
      linkedSlugs: [
        'crystal-clear-casting-epoxy-resin-1l',
        'silicone-coaster-mold-set',
        'butane-micro-torch',
      ],
      content: `<h2>Before you buy anything</h2>
<p>Resin work is messy and the fumes matter — work somewhere ventilated, and always wear gloves. A cheap plastic drop sheet will save you more cleanup time than almost any tool you buy.</p>
<h2>Your first kit</h2>
<p>Skip the huge multi-pigment bundles until you've done a few pours. A single 1L clear casting resin kit, one silicone coaster mold, and a basic bubble-popping torch will teach you 80% of what matters: correct mix ratio, working time, and cure patience.</p>
<blockquote>The single most common first-timer mistake isn't the pour — it's rushing the cure. Give it the full 24-72 hours before you touch it.</blockquote>
<p>Once that first coaster comes out clean, you'll know exactly what to upgrade next.</p>`,
    },
    {
      slug: 'ways-to-use-mica-powder-in-resin-art',
      title: '5 Ways to Use Mica Powder in Resin Art',
      excerpt: 'Beyond just tinting — mica powder can do a lot more than color your resin.',
      cover: 'geode-agate-coaster-set.png',
      linkedSlugs: ['mica-powder-pigment-set-12-colors', 'chunky-glitter-mix'],
      content: `<h2>1. Solid tinting</h2>
<p>A small scoop stirred thoroughly into your resin gives an opaque, even color — the classic use.</p>
<h2>2. Shimmer edges</h2>
<p>Dust a dry brush with mica and run it along a mold's edge before pouring for a metallic rim effect, like the gold-leaf edge on our geode coasters.</p>
<h2>3. Geode banding</h2>
<p>Layer 2-3 colors in concentric rings, letting each partially cure before adding the next, for a crystal-slice look.</p>
<h2>4. Marbling</h2>
<p>Swirl a contrasting mica color through a poured layer with a toothpick, dragging in one direction only for cleaner veins.</p>
<h2>5. Layered depth</h2>
<p>Thin, sparse mica in an otherwise clear pour reads as depth and shadow rather than solid color — useful for the "river" effect in wall panels.</p>`,
    },
  ];

  for (const p of posts) {
    const linkedProducts = (await Promise.all(p.linkedSlugs.map(bySlug))).filter(Boolean);
    await BlogPost.findOneAndUpdate(
      { slug: p.slug },
      {
        $set: {
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          content: p.content,
          coverImage: generatedImage(p.cover),
          tags: ['tutorial'],
          linkedProducts,
          author: admin?._id,
          status: 'published',
          publishedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  logger.info(`Seeded ${posts.length} blog posts`);
}

// Demo store contact info + social profile links shown in the footer/homepage/WhatsApp button -
// same category as the rest of the seeded demo content (product copy, blog posts). Each social
// link is independently optional on the model; the storefront only renders an icon once its URL
// is set, so leaving any of these blank in a real deployment just hides that one icon.
async function seedSettings(): Promise<void> {
  await Settings.findOneAndUpdate(
    {},
    {
      $set: {
        storeName: 'Resin by Richa',
        supportPhone: '+91 98765 43210',
        socialLinks: {
          instagram: 'https://instagram.com/resinbyricha',
          facebook: 'https://facebook.com/resinbyricha',
          pinterest: 'https://pinterest.com/resinbyricha',
          youtube: 'https://youtube.com/@resinbyricha',
        },
      },
    },
    { upsert: true },
  );
  logger.info('Seeded store name + support phone + social links');
}

const DEMO_CUSTOMERS = [
  { name: 'Ananya Rao', email: 'ananya.demo@resinstudio.test' },
  { name: 'Priya Sharma', email: 'priya.demo@resinstudio.test' },
  { name: 'Rohan Mehta', email: 'rohan.demo@resinstudio.test' },
  { name: 'Kavya Iyer', email: 'kavya.demo@resinstudio.test' },
];

const REVIEW_SEED = [
  {
    productSlug: 'ocean-wave-resin-coaster-set',
    customer: 'Ananya Rao',
    rating: 5,
    comment:
      'The blue swirl on mine looks exactly like the photos — genuinely one of a kind. Packaging was careful too, nothing arrived chipped.',
  },
  {
    productSlug: 'marbled-wall-clock',
    customer: 'Priya Sharma',
    rating: 5,
    comment:
      'Bought this as a housewarming gift and almost kept it for myself. The gold veining catches the light beautifully in our living room.',
  },
  {
    productSlug: 'crystal-clear-casting-epoxy-resin-1l',
    customer: 'Rohan Mehta',
    rating: 4,
    comment:
      'Good clarity, cured without yellowing after two weeks. Mix ratio instructions on the bottle are clear even for a first-timer like me.',
  },
  {
    productSlug: 'pressed-flower-pendant-necklace',
    customer: 'Kavya Iyer',
    rating: 5,
    comment:
      'So much more delicate in person. I get asked about it constantly — love that no two are the same.',
  },
  {
    productSlug: 'geode-agate-coaster-set',
    customer: 'Ananya Rao',
    rating: 5,
    comment:
      'The gold-leaf edge is thicker and more even than I expected for the price. Set of 4 all came out looking cohesive as a set.',
  },
  {
    productSlug: 'mica-powder-pigment-set-12-colors',
    customer: 'Rohan Mehta',
    rating: 4,
    comment:
      'Colors are vivid and a little goes a long way. Wish the jars were slightly bigger, but repurchasing once I run low.',
  },
  {
    productSlug: 'gold-leaf-serving-tray',
    customer: 'Priya Sharma',
    rating: 5,
    comment:
      'Sturdier than it looks in photos, and the resin edge is glass-smooth. Using it daily, not just for guests.',
  },
];

async function seedReviews(): Promise<void> {
  const customerIds = new Map<string, string>();
  for (const c of DEMO_CUSTOMERS) {
    // .create() (not findOneAndUpdate-upsert) so the User model's pre-save hook generates a
    // unique referralCode - findOneAndUpdate bypasses Mongoose 'save' middleware entirely, which
    // left referralCode null on every upserted user and collided on its unique index.
    let user = await User.findOne({ email: c.email }).select('_id');
    if (!user) {
      const passwordHash = await bcrypt.hash('DemoCustomer123!', 12);
      user = await User.create({ name: c.name, email: c.email, passwordHash, role: 'customer' });
    }
    customerIds.set(c.name, user._id.toString());
  }

  let seeded = 0;
  for (const r of REVIEW_SEED) {
    const product = await Product.findOne({ slug: r.productSlug }).select('_id');
    const userId = customerIds.get(r.customer);
    if (!product || !userId) continue;

    await Review.findOneAndUpdate(
      { product: product._id, user: userId },
      {
        $set: {
          rating: r.rating,
          comment: r.comment,
          verifiedPurchase: true,
          status: 'approved',
          moderatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    seeded += 1;
  }

  // Recompute each product's ratingAvg/ratingCount from the reviews just seeded, mirroring
  // review.service.ts#recomputeProductRating - a direct upsert above bypasses that service
  // function, so products would otherwise show 0 reviews despite having approved ones.
  const productIds = [...new Set(REVIEW_SEED.map((r) => r.productSlug))];
  for (const slug of productIds) {
    const product = await Product.findOne({ slug }).select('_id');
    if (!product) continue;
    const [agg] = await Review.aggregate([
      { $match: { product: product._id, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.updateOne(
      { _id: product._id },
      { ratingAvg: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.count ?? 0 },
    );
  }

  logger.info(`Seeded ${seeded} reviews across ${productIds.length} products`);
}

async function main(): Promise<void> {
  await connectDb();
  await seedAdmin();
  const categoryIds = await seedCategories();
  await seedProducts(categoryIds);
  await seedHeroBanner();
  await seedPromoBanner();
  await seedCollections();
  await seedBlogPosts();
  await seedSettings();
  await seedReviews();
  await disconnectDb();
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});

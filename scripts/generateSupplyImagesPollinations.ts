// One-off dev tool: fills in the remaining supply-product photos using Pollinations.ai (free,
// keyless image generation) since the OpenRouter key's one-time free credit grant was exhausted
// after the finished_art line (see scripts/generateProductImages.ts). Generates 2 seed variants per
// product into public/generated/candidates/ for manual review - NOT auto-wired into seed.ts, since
// this weaker model needs a human pick per item (it handles simple jars/bottles well but distorts
// complex mechanical shapes badly, confirmed via manual spot-check before writing this script).
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'public', 'generated', 'candidates');

interface ImageSpec {
  slug: string;
  prompt: string;
}

const STYLE_SUFFIX =
  'on a warm cream fabric or linen background, soft natural studio lighting, e-commerce product ' +
  'photo, photorealistic, no hands, no people, no text, no watermark';

const IMAGES: ImageSpec[] = [
  {
    slug: 'crystal-clear-casting-epoxy-resin-1l',
    prompt: `Two matching plastic bottles labeled "Part A" and "Part B" standing side by side, filled with crystal-clear liquid, no visible brand logos, ${STYLE_SUFFIX}`,
  },
  {
    slug: 'liquid-resin-dye-set',
    prompt: `Eight small squeeze bottles of concentrated liquid dye in a row, each a different saturated color (red, orange, yellow, green, blue, purple, pink, black), simple clean bottle design with no visible text, ${STYLE_SUFFIX}`,
  },
  {
    slug: 'mica-powder-pigment-set-12-colors',
    prompt: `Twelve small round glass jars with cork lids, each filled with a different vividly colored shimmering mica powder pigment (teal, magenta, gold, purple, coral, emerald), arranged in a neat grid, ${STYLE_SUFFIX}`,
  },
  {
    slug: 'silicone-coaster-mold-set',
    prompt: `A stack of flexible translucent pale-pink round silicone molds for casting resin coasters, fanned out slightly to show their circular cavities, ${STYLE_SUFFIX}`,
  },
  {
    slug: 'silicone-jewelry-mold-kit',
    prompt: `A flat translucent pink silicone mold sheet with several small round and teardrop-shaped cavities for jewelry pendants, lying flat, ${STYLE_SUFFIX}`,
  },
  {
    slug: 'butane-micro-torch',
    prompt: `A small handheld butane micro torch lighter tool, sleek brushed metal cylindrical body with a black grip, standing upright alone with the flame off, simple and clean, ${STYLE_SUFFIX}`,
  },
];

async function generateOne(spec: ImageSpec, seed: number): Promise<void> {
  const outPath = path.join(OUT_DIR, `${spec.slug}__seed${seed}.png`);
  if (fs.existsSync(outPath)) {
    console.log(`skip (exists): ${path.basename(outPath)}`);
    return;
  }
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(spec.prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${spec.slug} seed ${seed}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`generated: ${path.basename(outPath)} (${Math.round(buf.length / 1024)}KB)`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const spec of IMAGES) {
    for (const seed of [11, 42]) {
      try {
        await generateOne(spec, seed);
      } catch (err) {
        console.warn(`failed ${spec.slug} seed ${seed}:`, (err as Error).message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('\nDone. Review images in', OUT_DIR);
}

main().catch((err) => {
  console.error('generateSupplyImagesPollinations failed:', err);
  process.exit(1);
});

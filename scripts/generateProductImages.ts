// One-off dev tool: generates real product photography via an OpenRouter image-capable model
// and saves it to public/generated/, so seed.ts can reference real images instead of the
// placehold.co text-stamped placeholder. Never imported by the running app. Run with:
//   npx tsx scripts/generateProductImages.ts
import fs from 'fs';
import path from 'path';
import { env } from '../src/config/env';

const OUT_DIR = path.join(__dirname, '..', 'public', 'generated');

const STYLE_SUFFIX =
  'Professional e-commerce product photography, soft natural studio lighting, shallow depth of ' +
  'field, warm minimalist styling on a clean cream or white surface, no text or watermarks, ' +
  'photorealistic, high detail, square framing.';

interface ImageSpec {
  filename: string;
  prompt: string;
}

const IMAGES: ImageSpec[] = [
  {
    filename: 'hero-flatlay.png',
    prompt:
      "A styled overhead flat-lay photograph for a resin art studio's website hero banner: an " +
      'assortment of handmade epoxy resin pieces (a blue ocean-wave coaster, a small amber wall ' +
      'art panel corner, a pair of resin earrings, jars of colorful mica pigment powder, a mixing ' +
      'cup and stir stick) arranged artfully on a warm cream linen surface, dried flowers and a ' +
      'few dried pigment sprinkles scattered around, warm terracotta and gold color palette, soft ' +
      'diffused natural light from one side, wide cinematic 16:9 framing, no text, photorealistic.',
  },
  {
    filename: 'ocean-wave-resin-coaster-set.png',
    prompt: `A set of 4 round handmade epoxy resin coasters with a swirling deep blue, teal, and white ocean-wave pattern, stacked and fanned out on a light wood surface. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'amber-river-wall-panel.png',
    prompt: `A large rectangular wall art panel made of dark walnut wood with a glowing amber-orange poured epoxy resin "river" running through the center, mounted upright against a plain cream wall, dramatic side lighting highlighting the resin's translucency. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'geode-agate-coaster-set.png',
    prompt: `A set of 4 geode-agate-style epoxy resin coasters, each with concentric bands of white, gold, and deep purple resin mimicking a crystal geode slice, edges finished in gold leaf, arranged on a marble surface. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'pressed-flower-pendant-necklace.png',
    prompt: `A delicate gold-rimmed epoxy resin pendant necklace with a real pressed purple and yellow wildflower encased inside, hanging on a thin gold chain, displayed on a small ceramic jewelry stand against a soft cream background. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'galaxy-swirl-stud-earrings.png',
    prompt: `A pair of small round epoxy resin stud earrings with a deep-purple-and-black galaxy swirl pattern flecked with fine gold glitter like stars, gold stud posts, resting on a soft grey fabric pad. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'gold-leaf-serving-tray.png',
    prompt: `An elegant rectangular wooden serving tray with a glossy clear epoxy resin surface embedded with scattered genuine gold leaf flakes, brass side handles, photographed at a slight angle on a linen tablecloth. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'marbled-wall-clock.png',
    prompt: `A round wall clock with an ivory-and-gold marbled epoxy resin face, thin black minute and hour hands, no visible brand text, mounted on a plain cream wall with soft shadow. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'crystal-clear-casting-epoxy-resin-1l.png',
    prompt: `Two matching plastic bottles labeled "Part A: Resin" and "Part B: Hardener" (no other visible text or brand logos) standing side by side, filled with crystal-clear liquid, condensation-free, next to a small poured clear resin sample coaster, on a clean white surface. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'mica-powder-pigment-set-12-colors.png',
    prompt: `Twelve small round glass jars with cork lids, each filled with a different vividly colored shimmering mica powder pigment (teal, magenta, gold, purple, coral, emerald, etc.), arranged in a neat 3x4 grid on a cream surface, a small pile of loose gold mica powder and a tiny spoon in the foreground. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'silicone-coaster-mold-set.png',
    prompt: `A set of 6 flexible round silicone molds for making resin coasters, translucent pale-pink silicone, stacked and fanned slightly to show their circular cavities, on a light wood surface. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'liquid-resin-dye-set.png',
    prompt: `Eight small squeeze bottles of concentrated liquid resin dye in a row, each a different saturated color (red, orange, yellow, green, blue, purple, pink, black), clean minimal bottle design with no visible brand text, on a white background with a few dye droplets artfully placed nearby. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'chunky-glitter-mix.png',
    prompt: `A small clear glass jar filled with chunky holographic glitter flakes in rainbow iridescent colors, lid off, with a scattered pile of the same glitter spilling artfully next to the jar on a dark cream surface catching the light. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'silicone-jewelry-mold-kit.png',
    prompt: `A flat silicone mold sheet with multiple small cavities shaped for pendants, earrings, and rings, translucent soft-pink silicone, laid on a wooden table next to a couple of finished clear resin pendant blanks popped out of similar molds. ${STYLE_SUFFIX}`,
  },
  {
    filename: 'butane-micro-torch.png',
    prompt: `A sleek small handheld butane micro torch tool (the kind used to remove bubbles from curing resin), brushed metal and black finish, no visible brand text, standing upright next to a glossy just-poured resin coaster with a visible torch flame subtly grazing its surface. ${STYLE_SUFFIX}`,
  },
];

async function generateOne(spec: ImageSpec): Promise<void> {
  const outPath = path.join(OUT_DIR, spec.filename);
  if (fs.existsSync(outPath)) {
    console.log(`skip (already exists): ${spec.filename}`);
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [{ role: 'user', content: spec.prompt }],
          modalities: ['image', 'text'],
          max_tokens: 2000,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
      };
      const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUrl?.startsWith('data:image/')) {
        throw new Error(`No image in response: ${JSON.stringify(json).slice(0, 300)}`);
      }

      const base64 = dataUrl.split(',')[1]!;
      fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
      console.log(
        `generated: ${spec.filename} (${Math.round(fs.statSync(outPath).size / 1024)}KB)`,
      );
      return;
    } catch (err) {
      console.warn(`attempt ${attempt}/3 failed for ${spec.filename}:`, (err as Error).message);
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main(): Promise<void> {
  if (!env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set in .env — nothing to do.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let failures = 0;
  for (const spec of IMAGES) {
    try {
      await generateOne(spec);
    } catch (err) {
      failures++;
      console.error(`giving up on ${spec.filename}:`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 1500)); // be polite to the free-tier rate limit
  }

  console.log(
    `\nDone. ${IMAGES.length - failures}/${IMAGES.length} images generated into ${OUT_DIR}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('generateProductImages failed:', err);
  process.exit(1);
});

// One-off: another attempt at the 2 products that didn't land well in the first Pollinations pass
// (scripts/generateSupplyImagesPollinations.ts) - simpler, more literal prompts and more seeds.
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'public', 'generated', 'candidates');

interface ImageSpec {
  slug: string;
  prompt: string;
}

const IMAGES: ImageSpec[] = [
  {
    slug: 'mica-powder-pigment-set-12-colors',
    prompt:
      'Photo of twelve small glass spice jars with cork lids in a 3x4 grid, each jar filled with a different bright colored powder (red, blue, green, yellow, purple, orange, pink, teal, gold, white, black, magenta), on a plain light wood table, overhead flat lay photography, sharp focus, no people, no hands, no text',
  },
  {
    slug: 'silicone-jewelry-mold-kit',
    prompt:
      'Photo of a flat pink rubber silicone mold sheet for jewelry making, with several small round and oval indentations pressed into it like a muffin tray, lying flat on a wooden table, product photography, no people, no hands, no text',
  },
];

async function generateOne(spec: ImageSpec, seed: number): Promise<void> {
  const outPath = path.join(OUT_DIR, `${spec.slug}__v2seed${seed}.png`);
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
    for (const seed of [101, 202, 303]) {
      try {
        await generateOne(spec, seed);
      } catch (err) {
        console.warn(`failed ${spec.slug} seed ${seed}:`, (err as Error).message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('\nDone. Review in', OUT_DIR);
}

main().catch((err) => {
  console.error('failed:', err);
  process.exit(1);
});

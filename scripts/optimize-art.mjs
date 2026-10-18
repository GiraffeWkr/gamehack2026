// Optimizes generated art: crops to the intended aspect ratio and exports
// compact WebP files for the game. Raw PNGs are kept in art-raw/source.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const artDir = path.join(root, 'public', 'art');
const sourceDir = path.join(root, 'art-raw', 'source');
await fs.mkdir(sourceDir, { recursive: true });

const wide = new Set(['title_splash', 'hub_bridge', 'planet_map']);

const files = (await fs.readdir(artDir)).filter((f) => f.endsWith('.png'));
for (const file of files) {
  const id = path.basename(file, '.png');
  const source = path.join(artDir, file);
  const rawTarget = path.join(sourceDir, file);
  try {
    await fs.access(rawTarget);
  } catch {
    await fs.copyFile(source, rawTarget);
  }
  const meta = await sharp(source).metadata();
  const targetRatio = wide.has(id) ? 16 / 9 : 1;
  const width = wide.has(id) ? 1280 : 768;
  const height = wide.has(id) ? 720 : 768;
  let pipeline = sharp(source).rotate();
  const ratio = meta.width / meta.height;
  if (Math.abs(ratio - targetRatio) > 0.02) {
    let cropW = meta.width;
    let cropH = Math.round(meta.width / targetRatio);
    if (cropH > meta.height) {
      cropH = meta.height;
      cropW = Math.round(meta.height * targetRatio);
    }
    pipeline = pipeline.extract({
      left: Math.round((meta.width - cropW) / 2),
      top: Math.round((meta.height - cropH) / 2),
      width: cropW,
      height: cropH,
    });
  }
  await pipeline
    .resize(width, height, { fit: 'cover' })
    .modulate({ saturation: 0.92 })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(artDir, `${id}.webp`));
  console.log(`optimized ${id}: ${meta.width}x${meta.height} -> ${width}x${height} webp`);
}

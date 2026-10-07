// Temporary helper: dump PNG dimensions for every file under public/art.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'public/art';
const out = [];

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.toLowerCase().endsWith('.png')) {
      const b = readFileSync(p);
      const w = b.readUInt32BE(16);
      const h = b.readUInt32BE(20);
      const bitDepth = b[24];
      const colorType = b[25];
      const types = { 0: 'Gray', 2: 'RGB', 3: 'Palette', 4: 'GrayA', 6: 'RGBA' };
      out.push({ path: relative(root, p).replaceAll('\\', '/'), w, h, kb: +(statSync(p).size / 1024).toFixed(1), bitDepth, colorType: types[colorType] ?? colorType, hasAlpha: colorType === 4 || colorType === 6 || colorType === 3 });
    }
  }
}
walk(root);
out.sort((a, b) => a.path.localeCompare(b.path));
console.log('file\tw\th\tKB\tbitDepth\tcolorType');
for (const o of out) console.log(`${o.path}\t${o.w}\t${o.h}\t${o.kb}\t${o.bitDepth}\t${o.colorType}`);
console.log(`\nTOTAL ${out.length} PNG`);

/**
 * Restores public/art from a backup made before the space reskin.
 *
 *   node tools/restore-art.mjs                 # restore the newest backup
 *   node tools/restore-art.mjs --list          # show the available backups
 *   node tools/restore-art.mjs --from=art-original-20260928-014028
 *   node tools/restore-art.mjs --dry
 *
 * Backups live in backup-art/ and are plain copies of public/art.
 */
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BACKUPS = join(ROOT, 'backup-art');
const ART = join(ROOT, 'public', 'art');
const args = new Set(process.argv.slice(2));

const dirs = existsSync(BACKUPS)
  ? readdirSync(BACKUPS, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('art-original-'))
      .map((e) => e.name)
      .sort()
  : [];

if (args.has('--list') || dirs.length === 0) {
  console.log(dirs.length ? `backups:\n  ${dirs.join('\n  ')}` : 'no backups found in backup-art/');
  process.exit(dirs.length ? 0 : 1);
}

const want = [...args].find((a) => a.startsWith('--from='))?.split('=')[1];
const chosen = want ?? dirs[dirs.length - 1];
if (!dirs.includes(chosen)) {
  console.error(`unknown backup "${chosen}"; available:\n  ${dirs.join('\n  ')}`);
  process.exit(1);
}

const src = join(BACKUPS, chosen);
const dry = args.has('--dry');
console.log(`${dry ? '(dry run) would restore' : 'restoring'} ${chosen} -> public/art`);

if (!dry) {
  rmSync(ART, { recursive: true, force: true });
  cpSync(src, ART, { recursive: true });
  const n = readdirSync(ART, { recursive: true }).filter((f) => String(f).endsWith('.png')).length;
  console.log(`done: ${n} PNG files restored`);
}

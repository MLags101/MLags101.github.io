#!/usr/bin/env node
/**
 * One-shot migration of the legacy Jekyll media into the Astro content tree.
 *
 *   node scripts/migrate/migrate-media.mjs           # dry run: prints the plan
 *   node scripts/migrate/migrate-media.mjs --apply   # writes files + manifest + contact sheet
 *
 * What it does
 *  1. Scans every legacy page (<Folder>/index.html, index.html, _layouts, _data/projects.yml)
 *     for media references and resolves them relative to the page that uses them.
 *  2. Matches references to files case-insensitively (GitHub Pages is case-sensitive,
 *     Windows is not — this is how the broken TyphoonBGC/IMG_7873.jpg slipped through).
 *  3. Copies each used image to src/content/projects/<slug>/images/<kebab-name>,
 *     baking in EXIF orientation + the CSS rotation the old page applied, resizing to
 *     <= 2400px and stripping metadata (incl. GPS).
 *  4. Copies every file that is NOT used to _archive/ (git-ignored), preserving its path.
 *     Full-resolution originals of used files go to _archive/originals/.
 *  5. Writes scripts/migrate/manifest.json (old → new) and _archive/contact-sheet.html.
 *
 * Videos are not re-encoded here — see scripts/encode-videos.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const APPLY = process.argv.includes('--apply');
const MAX_EDGE = 2400;

/** Legacy page folder → new project slug. */
const PAGE_DIRS = {
  Glider: 'glider', Marlin: 'marlin', MrToad: 'mr-toad', Quadfrog: 'quadfrog',
  Remote: 'custom-remote', robin: 'robin', STMRemote: 'stm-remote',
  Shuttle_Model: 'shuttle-model', TyphoonBGC: 'typhoon-bgc', eevi: 'eevi',
  electronicsbox: 'electronics-box',
};
/** projects.yml entries without a local page. */
const EXTERNAL_SLUGS = { 'Kermit V3': 'kermit-v3', 'Kermit V2': 'kermit-v2', 'DUM-I(S)': 'dum-i' };

/** Unreferenced files worth keeping (repo-relative path → destination slug or "site:<name>"). */
const EXTRAS = {
  'images/20250530_085411.jpg': 'eevi',
  'images/IMG_2826.jpg': 'eevi',
  'images/IMG_2828.jpg': 'eevi',
  'images/IMG_9766.jpg': 'eevi',
  'images/IMG_8129.jpg': 'eevi',
  'eevi/images/IMG_7624.jpg': 'eevi',
  'eevi/images/IMG_7634.jpg': 'eevi',
  'images/IMG_8093.jpg': 'kermit-v3',
  'images/IMG_8095.jpg': 'kermit-v3',
  'MrToad/images/rover_2.png': 'mr-toad',
  'MrToad/images/rover_3.png': 'mr-toad',
  'MrToad/images/IMG_7543.jpg': 'mr-toad',
  'images/IMG_7791.jpg': 'mr-toad',
  'STMRemote/images/stm_sch.png': 'stm-remote',
  'Shuttle_Model/images/IMG_5868.jpg': 'shuttle-model',
  'Marlin/images/IMG_6189.jpg': 'marlin',
  'Marlin/images/IMG_6202.jpg': 'marlin',
  'Quadfrog/images/IMG_5830.jpg': 'quadfrog',
  'Quadfrog/images/IMG_6252.jpg': 'quadfrog',
  'Glider/images/IMG_4776.jpg': 'glider',
  'images/myphoto.jpg': 'site:portrait.jpg',
  'images/robo4.jpg': 'site:robojackets-team.jpg',
  'images/IMG_4750.jpg': 'site:invention-studio.jpg',
};

/** Files referenced by the legacy site that the new site intentionally drops. */
const DROP = new Set([
  'images/hero/1.jpg', 'images/hero/2.png', 'images/hero/3.jpg', 'images/hero/4.png',
  'images/hero/5.jpg', 'images/hero/6.jpg', 'images/hero/7.jpg', 'images/hero/8.jpg',
  'images/hero/9.jpg', 'images/hero/10.jpg', 'images/hero/drone.mp4',
  'images/sidebar/gt_logo.png', 'images/sidebar/us_flag.png', 'images/icons8-rocket-32.png',
]);

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);
/** Legacy top-level entries that are part of the old site and get archived wholesale. */
const LEGACY_TOP = ['assets', 'images', 'media', '_data', '_layouts', 'Project_Template',
  'index.html', 'LICENSE.txt', 'ADDING_A_PROJECT.md', 'EMBEDDING_3D_MODELS.md', ...Object.keys(PAGE_DIRS)];

// ---------------------------------------------------------------- helpers
const posix = (p) => p.split(path.sep).join('/');
const rel = (abs) => posix(path.relative(ROOT, abs));

function walk(target, out = []) {
  if (!fs.existsSync(target)) return out;
  if (fs.statSync(target).isFile()) { out.push(target); return out; }
  for (const e of fs.readdirSync(target, { withFileTypes: true })) walk(path.join(target, e.name), out);
  return out;
}

/** lowercase repo-relative path → actual repo-relative path */
const allLegacyFiles = LEGACY_TOP.flatMap((t) => walk(path.join(ROOT, t))).map(rel);
const ciIndex = new Map(allLegacyFiles.map((f) => [f.toLowerCase(), f]));

function kebab(name) {
  const ext = path.extname(name).toLowerCase().replace('.jpeg', '.jpg');
  const base = path.basename(name, path.extname(name))
    .toLowerCase().replace(/[()]/g, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9.-]/g, '').replace(/-+/g, '-');
  return base + ext;
}

/** Parse a CSS `transform: rotate(Ndeg)` into clockwise degrees (0/90/180/270). */
function cssRotation(tag) {
  const m = tag.match(/rotate\((-?\d+)deg\)/);
  if (!m) return 0;
  return ((Number(m[1]) % 360) + 360) % 360;
}

// ---------------------------------------------------------------- 1. collect references
/** @type {Map<string, {owners:Set<string>, rotate:number}>} keyed by actual repo path */
const used = new Map();
const warnings = [];
const errors = [];

function addRef(rawRef, pageDir, owner, rotate = 0) {
  const ref = rawRef.trim()
    .replace(/^\{\{\s*'/, '').replace(/'\s*\|\s*relative_url\s*\}\}$/, '')
    .split('#')[0].split('?')[0];
  if (!ref || /^(https?:|mailto:|data:)/.test(ref)) return;
  const resolved = ref.startsWith('/') ? ref.slice(1) : posix(path.join(pageDir, ref));
  const ext = path.extname(resolved).toLowerCase();
  if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) return;
  const actual = ciIndex.get(resolved.toLowerCase());
  if (!actual) { errors.push(`missing: ${resolved} (from ${owner})`); return; }
  if (actual !== resolved) warnings.push(`case mismatch: "${resolved}" → actual file "${actual}" (from ${owner})`);
  const rec = used.get(actual) ?? { owners: new Set(), rotate: 0 };
  rec.owners.add(owner);
  rec.rotate = rec.rotate || rotate;
  used.set(actual, rec);
}

function scanHtml(file, pageDir, owner) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  html = html.replace(/<!--[\s\S]*?-->/g, ''); // ignore commented-out markup (e.g. demo.mp4)
  const fm = html.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const data = yaml.load(fm[1]) ?? {};
    if (data.hero_image) addRef(data.hero_image, pageDir, owner);
  }
  for (const tag of html.match(/<(img|source|video)\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\b(?:src|poster)\s*=\s*"([^"]+)"/i);
    if (src) addRef(src[1], pageDir, owner, cssRotation(tag));
  }
  for (const m of html.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) addRef(m[1], pageDir, owner);
}

for (const [dir, slug] of Object.entries(PAGE_DIRS)) scanHtml(`${dir}/index.html`, dir, slug);
scanHtml('index.html', '', 'site');
scanHtml('_layouts/default.html', '', 'site');

const projectsYml = yaml.load(fs.readFileSync(path.join(ROOT, '_data/projects.yml'), 'utf8'));
for (const p of projectsYml) {
  const slug = EXTERNAL_SLUGS[p.title] ?? PAGE_DIRS[p.url?.replace(/\//g, '')];
  if (!slug) { errors.push(`projects.yml: no slug for "${p.title}"`); continue; }
  addRef(p.image, '', slug);
}
for (const [file, dest] of Object.entries(EXTRAS)) addRef('/' + file, '', dest);

// ---------------------------------------------------------------- 2. plan destinations
const plan = [];
const taken = new Set();

for (const [file, rec] of used) {
  const ext = path.extname(file).toLowerCase();
  const owners = [...rec.owners];
  if (DROP.has(file)) { plan.push({ from: file, to: null, kind: 'drop', rotate: 0, owners }); continue; }
  if (VIDEO_EXT.has(ext)) { plan.push({ from: file, to: null, kind: 'video', rotate: rec.rotate, owners }); continue; }
  for (const owner of owners) {
    if (owner === 'site') continue; // homepage/layout chrome we are not carrying over
    let to = owner.startsWith('site:')
      ? `src/assets/site/${owner.slice(5)}`
      : `src/content/projects/${owner}/images/${kebab(path.basename(file))}`;
    if (taken.has(to)) { const p = path.parse(to); to = `${p.dir}/${p.name}-2${p.ext}`; }
    taken.add(to);
    plan.push({ from: file, to, kind: 'image', rotate: rec.rotate, owners: [owner] });
  }
}

// ---------------------------------------------------------------- 3. report / apply
const usedSet = new Set(used.keys());
const unused = allLegacyFiles.filter((f) => !usedSet.has(f));
const mb = (files) => (files.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0) / 1e6).toFixed(1);

console.log(`\nLegacy files scanned: ${allLegacyFiles.length}`);
console.log(`Referenced media:      ${used.size}`);
console.log(`Images to migrate:     ${plan.filter((p) => p.kind === 'image').length}`);
console.log(`Videos (→ encode):     ${plan.filter((p) => p.kind === 'video').map((p) => p.from).join(', ')}`);
console.log(`Unused → _archive/:    ${unused.length} files, ${mb(unused)} MB`);
for (const w of warnings) console.log('WARN ', w);
for (const e of errors) console.log('ERROR', e);

if (!APPLY) {
  console.log('\nDry run. Planned image moves:');
  for (const p of plan.filter((q) => q.kind === 'image')) console.log(`  ${p.from}  →  ${p.to}${p.rotate ? `  (rotate ${p.rotate}°)` : ''}`);
  console.log('\nRe-run with --apply to execute.');
  process.exit(errors.length ? 1 : 0);
}

const archive = (file, sub = '') => {
  const dest = path.join(ROOT, '_archive', sub, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, file), dest);
};

const manifest = [];
for (const p of plan) {
  if (p.kind !== 'image') continue;
  const dest = path.join(ROOT, p.to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // EXIF orientation first (what the browser showed), then the CSS rotation the page applied
  let buf = await sharp(path.join(ROOT, p.from)).rotate().toBuffer();
  if (p.rotate) buf = await sharp(buf).rotate(p.rotate).toBuffer();
  const img = sharp(buf).resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  if (path.extname(dest) === '.png') await img.png({ compressionLevel: 9 }).toFile(dest);
  else await img.jpeg({ quality: 85, mozjpeg: true }).toFile(dest); // metadata (EXIF/GPS) is stripped by default
  const { width, height } = await sharp(dest).metadata();
  manifest.push({ from: p.from, to: p.to, rotate: p.rotate, width, height });
}

for (const f of usedSet) archive(f, 'originals');
for (const f of unused) archive(f);

fs.writeFileSync(path.join(ROOT, 'scripts/migrate/manifest.json'),
  JSON.stringify({ generated: new Date().toISOString(), warnings, errors, images: manifest,
    videos: plan.filter((p) => p.kind === 'video').map((p) => p.from), archived: unused }, null, 2) + '\n');

const sheet = manifest.map((m) => `<figure><img src="../${m.to}" loading="lazy"><figcaption>${m.to.replace('src/content/projects/', '')}${m.rotate ? ` ⟳${m.rotate}°` : ''}</figcaption></figure>`).join('\n');
fs.writeFileSync(path.join(ROOT, '_archive/contact-sheet.html'), `<!doctype html><meta charset="utf-8"><title>Migrated images</title>
<style>body{background:#111;color:#ddd;font:12px monospace;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;padding:8px}
figure{margin:0}img{width:100%;height:200px;object-fit:contain;background:#222}</style>${sheet}`);

console.log(`\nWrote ${manifest.length} images; copied ${unused.length} unused files + ${usedSet.size} originals to _archive/.`);
console.log('Manifest: scripts/migrate/manifest.json · Contact sheet: _archive/contact-sheet.html');

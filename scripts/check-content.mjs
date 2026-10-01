#!/usr/bin/env node
/**
 * Content lint — catches what the schemas can't. Runs in CI; run locally with
 *   npm run lint:content
 *
 * Errors (exit 1): referenced videos/models/posters missing from public/.
 * Warnings: images nobody uses, TODO markers, drafts, featured count outside 3–6.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJECTS = path.join(ROOT, 'src/content/projects');
const errors = [];
const warnings = [];
const info = [];
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? yaml.load(m[1]) ?? {} : {};
}

const allMdx = fs.readdirSync(PROJECTS).map((d) => path.join(PROJECTS, d, 'index.mdx')).filter((f) => fs.existsSync(f));
const allSources = allMdx.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
let featured = 0;

for (const file of allMdx) {
  const dir = path.dirname(file);
  const slug = path.basename(dir);
  const src = fs.readFileSync(file, 'utf8');
  const fm = frontmatter(src);
  if (fm.featured && !fm.draft) featured++;
  if (fm.draft) info.push(`draft: ${slug}`);

  // Images in the folder that neither this page nor any other page references.
  const imgDir = path.join(dir, 'images');
  if (fs.existsSync(imgDir))
    for (const img of fs.readdirSync(imgDir)) {
      const used = src.includes(img) || allSources.includes(`${slug}/${img}`);
      if (!used) warnings.push(`unused image: ${rel(path.join(imgDir, img))}`);
    }

  // Public media referenced by path must exist (Vite can't check these).
  // Ignore YAML (#) and MDX ({/* */}) comments — template examples live there.
  const live = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*#.*$/gm, '');
  for (const m of live.matchAll(/["'(](\/(?:media|models)\/[^"')\s]+)/g)) {
    const p = path.join(ROOT, 'public', m[1]);
    if (!fs.existsSync(p)) errors.push(`${slug}: missing public file ${m[1]}`);
    if (m[1].endsWith('.mp4') && !fs.existsSync(p.replace(/\.mp4$/, '.jpg')))
      warnings.push(`${slug}: no poster for ${m[1]} (re-run npm run media:videos)`);
  }

  const todos = src.split('\n').filter((l) => /\bTODO\b/.test(l)).length;
  if (todos) warnings.push(`${slug}: ${todos} TODO line(s)`);
}

// Videos over budget.
const mediaDir = path.join(ROOT, 'public/media');
if (fs.existsSync(mediaDir))
  for (const d of fs.readdirSync(mediaDir))
    for (const f of fs.readdirSync(path.join(mediaDir, d)))
      if (f.endsWith('.mp4')) {
        const mb = fs.statSync(path.join(mediaDir, d, f)).size / 1e6;
        if (mb > 6) warnings.push(`large video (${mb.toFixed(1)} MB): public/media/${d}/${f}`);
      }

// 3D models: GLB + poster present.
const modelsDir = path.join(ROOT, 'src/content/models');
if (fs.existsSync(modelsDir))
  for (const f of fs.readdirSync(modelsDir).filter((f) => f.endsWith('.yaml'))) {
    const m = yaml.load(fs.readFileSync(path.join(modelsDir, f), 'utf8'));
    if (!fs.existsSync(path.join(ROOT, 'public', m.src))) errors.push(`model ${f}: missing ${m.src}`);
    if (!fs.existsSync(path.join(ROOT, 'public', m.poster))) warnings.push(`model ${f}: missing poster ${m.poster}`);
    if (m.sizeMB > 5) warnings.push(`model ${f}: ${m.sizeMB} MB is over the 5 MB budget`);
  }

if (featured < 3 || featured > 6) warnings.push(`${featured} featured projects — aim for 3–6 on the home page`);

for (const e of errors) console.log(`✗ ${e}`);
for (const w of warnings) console.log(`! ${w}`);
for (const i of info) console.log(`· ${i}`);
console.log(`\n${allMdx.length} projects · ${errors.length} error(s) · ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);

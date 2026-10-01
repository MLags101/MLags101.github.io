#!/usr/bin/env node
/**
 * Content lint — catches what the schemas can't. Runs in CI; run locally with
 *   npm run lint:content
 *
 * Errors (exit 1): referenced videos / models / robots / PCBs missing from public/, a project in
 *   projects.yaml without a write-up folder (or the reverse), a cover file that doesn't exist.
 * Warnings: images nobody uses, TODO markers, drafts, featured count outside 3–6.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJECTS = path.join(ROOT, 'src/content/projects');
const DATA = path.join(ROOT, 'src/data');
const errors = [];
const warnings = [];
const info = [];
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const load = (f) => yaml.load(fs.readFileSync(f, 'utf8')) ?? {};

const meta = load(path.join(DATA, 'projects.yaml'));
const folders = fs.readdirSync(PROJECTS).filter((d) => fs.existsSync(path.join(PROJECTS, d, 'index.mdx')));
for (const slug of Object.keys(meta)) if (!folders.includes(slug)) errors.push(`projects.yaml: "${slug}" has no src/content/projects/${slug}/index.mdx`);
for (const slug of folders) if (!meta[slug]) errors.push(`src/content/projects/${slug}/ has no "${slug}:" entry in projects.yaml`);

const allSources = folders.map((d) => fs.readFileSync(path.join(PROJECTS, d, 'index.mdx'), 'utf8')).join('\n');
const yamlText = fs.readFileSync(path.join(DATA, 'projects.yaml'), 'utf8');
let featured = 0;

/** Public paths referenced in text, ignoring YAML (#) and MDX ({/* *\/}) comments. */
function publicRefs(text) {
  const live = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*#.*$/gm, '').replace(/\s#\s.*$/gm, '');
  return [...live.matchAll(/["'(\s](\/(?:media|models|robots)\/[^"')\s]+)/g)].map((m) => m[1]);
}

for (const slug of folders) {
  const dir = path.join(PROJECTS, slug);
  const src = fs.readFileSync(path.join(dir, 'index.mdx'), 'utf8');
  const m = meta[slug] ?? {};
  if (m.featured && !m.draft) featured++;
  if (m.draft) info.push(`draft: ${slug}`);

  const imgDir = path.join(dir, 'images');
  if (m.cover && !fs.existsSync(path.join(imgDir, m.cover))) errors.push(`${slug}: cover "${m.cover}" not found in ${rel(imgDir)}/`);

  // Images in the folder that neither this page, another page, nor the cover uses.
  if (fs.existsSync(imgDir))
    for (const img of fs.readdirSync(imgDir)) {
      const used = src.includes(img) || allSources.includes(`${slug}/${img}`) || m.cover === img;
      if (!used) warnings.push(`unused image: ${rel(path.join(imgDir, img))}`);
    }

  for (const ref of [...publicRefs(src), ...(m.heroVideo ? [m.heroVideo] : [])]) {
    const p = path.join(ROOT, 'public', ref);
    if (!fs.existsSync(p)) errors.push(`${slug}: missing public file ${ref}`);
    if (ref.endsWith('.mp4') && !fs.existsSync(p.replace(/\.mp4$/, '.jpg')))
      warnings.push(`${slug}: no poster for ${ref} (re-run npm run media:videos)`);
  }

  const todos = src.split('\n').filter((l) => /\bTODO\b/.test(l) && !/^\s*(\{\/\*|\*|<)/.test(l)).length;
  if (todos) warnings.push(`${slug}: ${todos} TODO line(s) in the write-up`);
}
const yamlTodos = yamlText.split('\n').filter((l) => /\bTODO\b/.test(l) && !/^\s*#/.test(l)).length;
if (yamlTodos) warnings.push(`projects.yaml: ${yamlTodos} TODO value(s)`);

// Videos over budget.
const mediaDir = path.join(ROOT, 'public/media');
if (fs.existsSync(mediaDir))
  for (const d of fs.readdirSync(mediaDir))
    for (const f of fs.readdirSync(path.join(mediaDir, d)))
      if (f.endsWith('.mp4')) {
        const mb = fs.statSync(path.join(mediaDir, d, f)).size / 1e6;
        if (mb > 6) warnings.push(`large video (${mb.toFixed(1)} MB): public/media/${d}/${f}`);
      }

// 3D models: GLB, parts map and poster present; part names exist.
const modelsDir = path.join(DATA, 'models');
for (const f of fs.existsSync(modelsDir) ? fs.readdirSync(modelsDir).filter((f) => f.endsWith('.yaml')) : []) {
  const m = load(path.join(modelsDir, f));
  if (!fs.existsSync(path.join(ROOT, 'public', m.src))) errors.push(`model ${f}: missing ${m.src}`);
  if (!fs.existsSync(path.join(ROOT, 'public', m.poster))) warnings.push(`model ${f}: missing poster ${m.poster} (Save poster in ?author mode)`);
  if (m.sizeMB > 5) warnings.push(`model ${f}: ${m.sizeMB} MB is over the 5 MB budget`);
  const partsFile = path.join(ROOT, 'public', path.dirname(m.src), 'parts.json');
  const parts = fs.existsSync(partsFile) ? JSON.parse(fs.readFileSync(partsFile, 'utf8')).parts : null;
  for (const h of m.hotspots ?? [])
    if (h.part && !parts) errors.push(`model ${f}: hotspot "${h.id}" uses part names but ${rel(partsFile)} is missing (re-run npm run model:optimize)`);
    else if (h.part && !parts[h.part]) errors.push(`model ${f}: hotspot "${h.id}" — no part named "${h.part}" (npm run model:parts -- ${f.replace('.yaml', '')})`);
}

// Robots: URDF present.
const robotsDir = path.join(DATA, 'robots');
for (const f of fs.existsSync(robotsDir) ? fs.readdirSync(robotsDir).filter((f) => f.endsWith('.yaml')) : []) {
  const r = load(path.join(robotsDir, f));
  const urdf = path.join(ROOT, 'public', r.urdf);
  if (!fs.existsSync(urdf)) {
    errors.push(`robot ${f}: missing ${r.urdf}`);
    continue;
  }
  for (const [, mesh] of fs.readFileSync(urdf, 'utf8').matchAll(/<mesh\s+filename="([^"]+)"/g))
    if (!mesh.startsWith('package://') && !fs.existsSync(path.join(path.dirname(urdf), mesh)))
      errors.push(`robot ${f}: URDF mesh ${mesh} not found (re-run npm run robot:import)`);
}

// PCBs: renders + every layer in the manifest present; the 3D model is registered.
const pcbsDir = path.join(DATA, 'pcbs');
for (const f of fs.existsSync(pcbsDir) ? fs.readdirSync(pcbsDir).filter((f) => f.endsWith('.yaml')) : []) {
  const id = f.replace('.yaml', '');
  const p = load(path.join(pcbsDir, f));
  const dir = path.join(ROOT, 'public/pcbs', id);
  const manifest = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    errors.push(`pcb ${f}: missing ${rel(manifest)} (npm run pcb:import -- <folder> ${id})`);
    continue;
  }
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  for (const file of ['top.svg', 'bottom.svg', ...m.layers.map((l) => l.file)])
    if (!fs.existsSync(path.join(dir, file))) errors.push(`pcb ${f}: missing public/pcbs/${id}/${file}`);
  if (p.model && !fs.existsSync(path.join(modelsDir, `${p.model}.yaml`))) errors.push(`pcb ${f}: model "${p.model}" has no src/data/models/${p.model}.yaml`);
}

// Experience: featured-lab gallery images and videos exist.
const experience = load(path.join(DATA, 'experience.yaml'));
for (const [id, e] of Object.entries(experience)) {
  for (const g of e.gallery ?? []) {
    const [slug, file] = g.src.split('/');
    if (!fs.existsSync(path.join(PROJECTS, slug, 'images', file))) errors.push(`experience.yaml → ${id}.gallery: ${g.src} not found in src/content/projects/${slug}/images/`);
  }
  if (e.video && !fs.existsSync(path.join(ROOT, 'public', e.video))) errors.push(`experience.yaml → ${id}.video: missing public file ${e.video}`);
}

// Tools: every project should appear on at least one tool's `projects:` list.
const tools = load(path.join(DATA, 'skills.yaml'));
const withTools = new Set(Object.values(tools).flatMap((t) => t.projects ?? []));
for (const slug of folders) if (!withTools.has(slug)) warnings.push(`${slug}: no tools list it in src/data/skills.yaml`);

if (featured < 3 || featured > 6) warnings.push(`${featured} featured projects — aim for 3–6 on the home page`);

for (const e of errors) console.log(`✗ ${e}`);
for (const w of warnings) console.log(`! ${w}`);
for (const i of info) console.log(`· ${i}`);
console.log(`\n${folders.length} projects · ${errors.length} error(s) · ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);

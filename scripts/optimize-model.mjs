#!/usr/bin/env node
/**
 * Optimize a CAD export for the web and register it with the site.
 *
 *   npm run model:optimize -- path/to/export.glb <model-id> [--ratio 0.5]
 *
 * 1. Cleans and compresses the GLB (dedupe, weld, simplify, quantize, meshopt, WebP textures)
 *    → public/models/<id>/model.glb
 * 2. Creates src/content/models/<id>.yaml (or updates sizeMB if it exists).
 *
 * Then: `npm run dev`, open a page that uses <ModelViewer id="<id>" /> with `?author`
 * on the URL, Shift+click parts to capture hotspots, and press "Save poster".
 * Full walkthrough (SolidWorks / Fusion export settings): docs/3D-MODELS.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUDGET_MB = 5;

const args = process.argv.slice(2);
const [input, id] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--ratio');
const ratioArg = args.indexOf('--ratio');
const ratio = ratioArg >= 0 ? Number(args[ratioArg + 1]) : 0.5;

if (!input || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run model:optimize -- <input.glb> <model-id>   (id: kebab-case, e.g. kermit-v3)');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const before = fs.statSync(input).size / 1e6;

await doc.transform(
  dedup(),
  // Named nodes (CAD part names) are kept — no flatten/join — so parts stay addressable.
  resample(),
  prune(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

const outDir = path.join(ROOT, 'public/models', id);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'model.glb');
await io.write(out, doc);
const after = fs.statSync(out).size / 1e6;

const yamlPath = path.join(ROOT, 'src/content/models', `${id}.yaml`);
fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
if (fs.existsSync(yamlPath)) {
  const y = fs.readFileSync(yamlPath, 'utf8').replace(/^sizeMB:.*$/m, `sizeMB: ${Math.max(0.1, after).toFixed(1)}`);
  fs.writeFileSync(yamlPath, y);
} else {
  fs.writeFileSync(
    yamlPath,
    `# 3D model registry entry — used by <ModelViewer id="${id}" />. See docs/3D-MODELS.md.
src: /models/${id}/model.glb
# Capture with the "Save poster" button in ?author mode, then save as public/models/${id}/poster.webp
poster: /models/${id}/poster.webp
alt: TODO describe the model for screen readers
sizeMB: ${Math.max(0.1, after).toFixed(1)}
cameraOrbit: 35deg 70deg auto
# Paste hotspots captured with Shift+click in ?author mode:
hotspots: []
`,
  );
}

console.log(`\n✓ ${path.relative(ROOT, out)}  ${before.toFixed(2)} MB → ${after.toFixed(2)} MB`);
if (after > BUDGET_MB)
  console.warn(`! Over the ${BUDGET_MB} MB budget. Re-run with a lower --ratio (e.g. --ratio 0.25) or reduce detail in CAD.`);
console.log(`✓ ${path.relative(ROOT, yamlPath)}`);
console.log(`\nNext: add <ModelViewer id="${id}" /> to a project (or \`model: ${id}\` in its frontmatter),`);
console.log(`run \`npm run dev\`, open the page with ?author, Shift+click parts, and Save poster.`);

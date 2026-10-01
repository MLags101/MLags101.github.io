#!/usr/bin/env node
/**
 * Optimize a CAD export for the web and register it with the site.
 *
 *   npm run model:optimize -- path/to/export.glb <model-id> [--ratio 0.5]
 *
 * 1. Cleans and compresses the GLB (dedupe, weld, simplify, quantize, meshopt, WebP
 *    textures) → public/models/<id>/model.glb. Part names and animations are kept.
 * 2. Writes public/models/<id>/parts.json — every CAD part's surface points, so a hotspot
 *    can just say `part: "Here4-1"` (list them with `npm run model:parts -- <id>`).
 * 3. Creates src/data/models/<id>.yaml (or updates sizeMB if it exists).
 *
 * Full walkthrough (export settings, colors, hotspots, animations): docs/3D-MODELS.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as yaml from 'js-yaml';
import { buildPartsMap } from './lib/parts.mjs';

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

// ── appearance overrides (src/data/models/<id>.yaml → appearance:) ─────────
// Lets you fix colors without re-exporting from CAD. Re-run this script after editing.
const yamlPathEarly = path.join(ROOT, 'src/data/models', `${id}.yaml`);
const cfg = fs.existsSync(yamlPathEarly) ? (yaml.load(fs.readFileSync(yamlPathEarly, 'utf8')) ?? {}) : {};
const appearance = cfg.appearance ?? {};
const hex = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
};
const matCache = new Map();
const material = (spec) => {
  const key = JSON.stringify(spec);
  if (!matCache.has(key))
    matCache.set(
      key,
      doc
        .createMaterial(`site:${spec.color}`)
        .setBaseColorFactor([...hex(spec.color), 1])
        .setRoughnessFactor(spec.roughness ?? 0.55)
        .setMetallicFactor(spec.metalness ?? 0),
    );
  return matCache.get(key);
};
let recolored = 0;
// 1. SolidWorks' unassigned appearance (pale lavender ≈ 0.60/0.65/0.86) → a neutral color.
if (appearance.defaultColor) {
  const isDefault = (m) => {
    const [r, g, b] = m.getBaseColorFactor();
    return !m.getBaseColorTexture() && Math.abs(r - 0.6) < 0.08 && Math.abs(g - 0.65) < 0.08 && b > 0.8 && b - r > 0.18;
  };
  for (const m of doc.getRoot().listMaterials())
    if (isDefault(m)) {
      m.setBaseColorFactor([...hex(appearance.defaultColor), 1]).setRoughnessFactor(0.5);
      recolored++;
    }
}
// 2. Textured materials (e.g. carbon fiber) alias into noise at web resolution → flat color.
if (appearance.flattenTextures)
  for (const m of doc.getRoot().listMaterials())
    if (m.getBaseColorTexture()) {
      m.setBaseColorTexture(null).setBaseColorFactor([...hex(appearance.flattenTextures === true ? '#1b1d21' : appearance.flattenTextures), 1]).setRoughnessFactor(0.45);
      recolored++;
    }
// 3. Per-part rules, in order (later rules win). `parts` accepts * wildcards.
const glob = (p) => new RegExp(`^${String(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
for (const rule of appearance.parts ?? []) {
  const res = [].concat(rule.match).map(glob);
  let hit = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (!res.some((r) => r.test(node.getName()))) continue;
    const apply = (n) => {
      n.getMesh()?.listPrimitives().forEach((p) => p.setMaterial(material(rule)));
      n.listChildren().forEach(apply);
    };
    apply(node);
    hit++;
  }
  if (!hit) console.warn(`! appearance rule ${JSON.stringify(rule.match)} matched no parts`);
  recolored += hit;
}
if (recolored) console.log(`✓ appearance: ${recolored} material/part override(s)`);

// Stage 1 — geometry cleanup. Named nodes (CAD part names) are kept — no flatten/join —
// so parts stay addressable for hotspots and animations.
await doc.transform(dedup(), resample(), prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }));

// Parts map from the (still uncompressed) geometry.
const parts = buildPartsMap(doc);
const animations = doc.getRoot().listAnimations().map((a) => a.getName() || '(unnamed)');

// Stage 2 — compression.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

const outDir = path.join(ROOT, 'public/models', id);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'model.glb');
await io.write(out, doc);
fs.writeFileSync(path.join(outDir, 'parts.json'), JSON.stringify({ generated: new Date().toISOString(), animations, parts }));
const after = fs.statSync(out).size / 1e6;
const sizeMB = Math.max(0.1, after).toFixed(1);

// Suggest `forward` as the model's longer horizontal axis (sign is a guess — confirm it
// by checking where a `from: front` hotspot lands).
const all = Object.values(parts);
const span = [0, 1, 2].map(
  (k) => Math.max(...all.map((p) => p.center[k] + p.size[k] / 2)) - Math.min(...all.map((p) => p.center[k] - p.size[k] / 2)),
);

const yamlPath = yamlPathEarly;
fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
if (fs.existsSync(yamlPath)) {
  fs.writeFileSync(yamlPath, fs.readFileSync(yamlPath, 'utf8').replace(/^sizeMB:.*$/m, `sizeMB: ${sizeMB}`));
} else {
  const anim = animations.length
    ? `animations:\n${animations.map((a) => `  - { name: ${JSON.stringify(a)}, label: ${JSON.stringify(a)} }`).join('\n')}\n`
    : '# animations: []   # none found in this GLB — see docs/3D-MODELS.md to add some\n';
  fs.writeFileSync(
    yamlPath,
    `# 3D model — used by <ModelViewer id="${id}" /> (or \`model: ${id}\` in projects.yaml).
# Guide: docs/3D-MODELS.md · list part names: npm run model:parts -- ${id}
src: /models/${id}/model.glb
# Still shown while the model loads. Make one with "Save poster" in ?author mode
# (npm run dev, open the page with ?author) → save as public/models/${id}/poster.webp
poster: /models/${id}/poster.webp
alt: TODO describe the model for screen readers
sizeMB: ${sizeMB}
forward: ${span[0] >= span[2] ? '+x' : '+z'}   # model axis the front faces: +x | -x | +z | -z
cameraOrbit: 35deg 70deg auto
hotspots: []
#  - id: fc
#    part: "CUBE Orange-1"      # exact CAD part name (npm run model:parts -- ${id})
#    from: top                  # top | bottom | front | back | left | right
#    label: Flight controller
#    partNo: KV3-FC
#    detail: One or two sentences about the part.
${anim}`,
  );
}

console.log(`\n✓ ${path.relative(ROOT, out)}  ${before.toFixed(2)} MB → ${after.toFixed(2)} MB`);
if (after > BUDGET_MB)
  console.warn(`! Over the ${BUDGET_MB} MB budget. Re-run with a lower --ratio (e.g. --ratio 0.25) or reduce detail in CAD.`);
console.log(`✓ parts.json — ${Object.keys(parts).length} named parts${animations.length ? `; animations: ${animations.join(', ')}` : ''}`);
console.log(`✓ ${path.relative(ROOT, yamlPath)}`);
console.log(`\nNext: npm run model:parts -- ${id}   (part names for hotspots) · guide: docs/3D-MODELS.md`);

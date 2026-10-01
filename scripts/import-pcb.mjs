#!/usr/bin/env node
/**
 * Import a PCB design for <PcbViewer>: Gerbers → board renders + per-layer SVGs, and an
 * optional STEP → 3D model.
 *
 *   npm run pcb:import -- path/to/design-folder <pcb-id>
 *
 * The folder can hold Gerbers anywhere inside it (Gerber X2 from Altium/KiCad is best —
 * layers are identified from their %TF.FileFunction% attributes; older files fall back to
 * file-name guessing) and optionally a .step/.stp of the assembled board.
 *
 * Writes public/pcbs/<id>/{top.svg, bottom.svg, layers/*.svg, manifest.json}. If a STEP is
 * found it becomes model "<id>-board" (public/models/<id>-board/, src/data/models/) via
 * npm run model:optimize. Creates src/data/pcbs/<id>.yaml the first time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pcbStackup from 'pcb-stackup';
import gerberToSvg from 'gerber-to-svg';
import whatsThatGerber from 'whats-that-gerber';
import { Document, NodeIO } from '@gltf-transform/core';

const ROOT = path.resolve(import.meta.dirname, '..');
const [dir, id] = process.argv.slice(2);
if (!dir || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run pcb:import -- <design-folder> <pcb-id>   (id: kebab-case, e.g. typhoon)');
  process.exit(1);
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dir);

// ── identify Gerber layers from X2 attributes ───────────────────────────────
const LAYER_COLORS = { copper: '#d9a441', soldermask: '#2f8f4e', silkscreen: '#f2f2ee', outline: '#9aa0a8', drill: '#050506', solderpaste: '#b8b8b8' };
const layers = [];
const seen = new Set();
const legacy = [];
for (const f of files) {
  const head = fs.readFileSync(f, 'latin1').slice(0, 4000);
  const fn = head.match(/%TF\.FileFunction,([^*]+)\*%/)?.[1];
  if (!fn) {
    if (!/\.(step|stp|pdf|zip|html?|json|md|png|jpe?g)$/i.test(f)) legacy.push(f);
    continue;
  }
  const parts = fn.split(',');
  const kind = parts[0];
  let type, side, label;
  if (kind === 'Copper') {
    type = 'copper';
    side = parts.includes('Top') ? 'top' : parts.includes('Bot') ? 'bottom' : 'inner';
    label = side === 'inner' ? `Inner copper ${parts[1]}` : `${side === 'top' ? 'Top' : 'Bottom'} copper`;
  } else if (kind === 'Soldermask') ((type = 'soldermask'), (side = parts[1] === 'Top' ? 'top' : 'bottom'), (label = `${side === 'top' ? 'Top' : 'Bottom'} solder mask`));
  else if (kind === 'Legend') ((type = 'silkscreen'), (side = parts[1] === 'Top' ? 'top' : 'bottom'), (label = `${side === 'top' ? 'Top' : 'Bottom'} silkscreen`));
  else if (kind === 'Paste') ((type = 'solderpaste'), (side = parts[1] === 'Top' ? 'top' : 'bottom'), (label = `${side === 'top' ? 'Top' : 'Bottom'} paste`));
  else if (kind === 'Profile') ((type = 'outline'), (side = 'all'), (label = 'Board outline'));
  else if (kind === 'Plated' || kind === 'NonPlated') ((type = 'drill'), (side = 'all'), (label = kind === 'Plated' ? 'Plated holes' : 'Non-plated holes'));
  else continue;
  // Altium writes each layer twice (X2 named file + legacy extension) — keep one.
  const key = `${type}|${side}|${label}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const order = parseInt(parts[1]?.replace('L', ''), 10);
  layers.push({ file: f, type, side, label, order: Number.isFinite(order) ? order : 0 });
}
// Older exports (no X2): guess the layer from the file name (.GTL, .GBL, .G1, .GKO, -F_Cu.gbr…).
// A layer X2 already supplied is skipped, since Altium writes both kinds.
const NOUN = { copper: 'copper', soldermask: 'solder mask', silkscreen: 'silkscreen', solderpaste: 'paste' };
const SIDE_NAME = { top: 'Top', bottom: 'Bottom' };
const guessed = whatsThatGerber(legacy.map((f) => path.basename(f)));
const hadInner = layers.some((l) => l.side === 'inner');
let inner = 0;
for (const f of legacy) {
  const g = guessed[path.basename(f)];
  if (!g?.type || g.type === 'drawing') continue;
  if (g.side === 'inner') {
    if (hadInner) continue;
    inner += 1;
    layers.push({ file: f, type: 'copper', side: 'inner', label: `Inner copper L${inner + 1}`, order: inner + 1 });
    continue;
  }
  if (layers.some((l) => l.type === g.type && l.side === g.side)) continue;
  const label = NOUN[g.type] ? `${SIDE_NAME[g.side]} ${NOUN[g.type]}` : g.type === 'outline' ? 'Board outline' : 'Holes';
  layers.push({ file: f, type: g.type, side: g.side, label, order: 0 });
}
if (!layers.length) {
  console.error('No Gerber layers found. Export Gerber X2 if your EDA tool supports it (Altium: Fabrication Outputs → Gerber X2), or keep the standard file extensions.');
  process.exit(1);
}

const stack = await pcbStackup(
  layers.map((l) => ({ filename: path.basename(l.file), gerber: fs.createReadStream(l.file), side: l.side, type: l.type })),
  { outlineGapFill: 0.05 },
);

const out = path.join(ROOT, 'public/pcbs', id);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'layers'), { recursive: true });
fs.writeFileSync(path.join(out, 'top.svg'), stack.top.svg);
fs.writeFileSync(path.join(out, 'bottom.svg'), stack.bottom.svg);

// Per-layer SVGs on the board's shared viewBox so they stack exactly (x-ray view).
const vb = stack.top.viewBox; // [x, y, w, h] in 1/1000 units
const flip = `translate(0,${2 * vb[1] + vb[3]}) scale(1,-1)`;
const manifest = { id, units: stack.top.units, width: stack.top.width, height: stack.top.height, viewBox: vb, layers: [] };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const sorted = stack.layers
  .map((sl) => ({ sl, meta: layers.find((l) => path.basename(l.file) === sl.filename) }))
  .sort((a, b) => {
    const rank = { top: 0, inner: 1, bottom: 2, all: 3 };
    return rank[a.meta.side] - rank[b.meta.side] || a.meta.order - b.meta.order || a.meta.type.localeCompare(b.meta.type);
  });
for (const { sl, meta } of sorted) {
  const c = sl.converter;
  if (!c?.layer?.length) continue;
  const color = meta.type === 'copper' && meta.side === 'inner' ? (meta.order % 2 ? '#c46a3a' : '#7f9fd8') : LAYER_COLORS[meta.type];
  const body = gerberToSvg.render(c, `${id}-${slug(meta.label)}`);
  // Outlines are drawn as a thin line; everything else as filled shapes.
  const paint =
    meta.type === 'outline'
      ? `fill="none" stroke="${color}" color="${color}" stroke-width="120" stroke-linecap="round" stroke-linejoin="round"`
      : `fill="${color}" stroke="${color}" color="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="0" fill-rule="evenodd"`;
  // Re-wrap the layer's geometry in the shared board coordinate frame.
  const inner = body.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<g transform="translate\([^)]*\) scale\(1,-1\)"/, `<g transform="${flip}"`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${stack.top.width}${stack.top.units}" height="${stack.top.height}${stack.top.units}" viewBox="${vb.join(' ')}" ${paint}>${inner}</svg>`;
  const file = `${slug(meta.label)}.svg`;
  fs.writeFileSync(path.join(out, 'layers', file), svg);
  manifest.layers.push({ id: slug(meta.label), label: meta.label, type: meta.type, side: meta.side, color, file: `layers/${file}` });
}
const copper = manifest.layers.filter((l) => l.type === 'copper').length;
manifest.copperLayers = copper;
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`✓ public/pcbs/${id}/ — ${stack.top.width.toFixed(1)} × ${stack.top.height.toFixed(1)} ${stack.top.units}, ${copper} copper layers, ${manifest.layers.length} layer views`);

// ── STEP → 3D board model ──────────────────────────────────────────────────
const step = files.find((f) => /\.(step|stp)$/i.test(f));
let modelId = null;
if (step) {
  const { default: occtimportjs } = await import('occt-import-js');
  const occt = await occtimportjs();
  const r = occt.ReadStepFile(new Uint8Array(fs.readFileSync(step)), {
    linearUnit: 'meter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.002,
    angularDeflection: 0.5,
  });
  if (!r.success) console.warn('! STEP import failed — skipping the 3D model');
  else {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    // STEP is Z-up; glTF is Y-up.
    const root = doc.createNode('board').setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    scene.addChild(root);
    const mats = new Map();
    r.meshes.forEach((m, i) => {
      const rgb = m.color ?? [0.6, 0.62, 0.65];
      const key = rgb.map((x) => x.toFixed(3)).join(',');
      if (!mats.has(key)) mats.set(key, doc.createMaterial(`c${mats.size}`).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(0.55).setMetallicFactor(0));
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.attributes.position.array)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(m.index.array)).setBuffer(buffer))
        .setMaterial(mats.get(key));
      if (m.attributes.normal) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.attributes.normal.array)).setBuffer(buffer));
      root.addChild(doc.createNode(m.name && !/^Open CASCADE/.test(m.name) ? m.name : `part-${i}`).setMesh(doc.createMesh().addPrimitive(prim)));
    });
    const raw = path.join(ROOT, '_archive/cad-src', `${id}-board.glb`);
    fs.mkdirSync(path.dirname(raw), { recursive: true });
    await new NodeIO().write(raw, doc);
    modelId = `${id}-board`;
    const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts/optimize-model.mjs'), raw, modelId, '--ratio', '0.6'], { stdio: 'inherit' });
    if (res.status !== 0) modelId = null;
  }
}

const dataPath = path.join(ROOT, 'src/data/pcbs', `${id}.yaml`);
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(
    dataPath,
    `# PCB — used by <PcbViewer id="${id}" />. Re-import: npm run pcb:import -- <folder> ${id}
name: TODO board name
alt: TODO describe the board for screen readers
${modelId ? `model: ${modelId}   # 3D board from the STEP file (shown in the "3D" tab)\n` : ''}`,
  );
  console.log(`✓ ${path.relative(ROOT, dataPath)}`);
}

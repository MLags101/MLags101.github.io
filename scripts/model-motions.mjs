#!/usr/bin/env node
/**
 * Re-bake the `motions:` from src/data/models/<id>.yaml into public/models/<id>/model.glb
 * without re-optimizing the CAD export (fast; no raw file needed).
 *
 *   npm run model:motions -- <model-id>
 *
 * Writes the GLB in place and public/models/<id>/motions.json (durations, camera hints)
 * for <ModelViewer>. `npm run model:optimize` runs the same step, so motions survive a
 * re-optimize. Guide: docs/3D-MODELS.md → "Motions".
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as yaml from 'js-yaml';
import { bakeMotions, writeMotionsJson } from './lib/motions.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const [id] = process.argv.slice(2);
if (!id) {
  console.error('Usage: npm run model:motions -- <model-id>');
  process.exit(1);
}
const yamlPath = path.join(ROOT, 'src/data/models', `${id}.yaml`);
const glb = path.join(ROOT, 'public/models', id, 'model.glb');
for (const f of [yamlPath, glb])
  if (!fs.existsSync(f)) {
    console.error(`Not found: ${path.relative(ROOT, f)}`);
    process.exit(1);
  }

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const cfg = yaml.load(fs.readFileSync(yamlPath, 'utf8')) ?? {};
const doc = await io.read(glb);
const before = fs.statSync(glb).size / 1e6;
const meta = bakeMotions(doc, cfg.motions ?? [], { forward: cfg.forward });
await doc.transform(prune());
await io.write(glb, doc);
writeMotionsJson(path.dirname(glb), meta);
console.log(`✓ ${path.relative(ROOT, glb)}  ${before.toFixed(2)} MB → ${(fs.statSync(glb).size / 1e6).toFixed(2)} MB`);
for (const m of meta) console.log(`  ${m.type.padEnd(8)} ${m.id}  ${m.seconds}s${m.moved !== undefined ? `, ${m.moved} part(s) moving` : ''}`);
if (!meta.length) console.log('  (no motions in the YAML — previous ones removed)');


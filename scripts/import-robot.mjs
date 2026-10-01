#!/usr/bin/env node
/**
 * Import a ROS description package (URDF + meshes) for <RobotViewer>.
 *
 *   npm run robot:import -- path/to/my_robot_description <robot-id> [--ratio 0.5]
 *
 * - Finds the package's .urdf (export one from xacro first if you only have .xacro).
 * - Converts every visual mesh (DAE / STL / GLB) to a compressed GLB, colored per link
 *   from `appearance.links` in src/data/robots/<id>.yaml (else the URDF material color).
 * - Writes public/robots/<id>/<id>.urdf with mesh paths rewritten to meshes/<link>.glb.
 * - Creates src/data/robots/<id>.yaml the first time, listing the joints it found.
 *
 * Re-run after editing colors. Guide: docs/3D-MODELS.md → "Robots (URDF)".
 */
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { DOMParser } from '@xmldom/xmldom';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

globalThis.DOMParser = DOMParser; // three's ColladaLoader parses XML with DOMParser
const THREE = await import('three');
const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const [pkg, id] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--ratio');
const ratioArg = args.indexOf('--ratio');
const ratio = ratioArg >= 0 ? Number(args[ratioArg + 1]) : 0.5;
if (!pkg || !id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run robot:import -- <ros_description_folder> <robot-id>   (id: kebab-case)');
  process.exit(1);
}

const urdfDir = path.join(pkg, 'urdf');
const urdfFile = fs.existsSync(urdfDir) ? fs.readdirSync(urdfDir).find((f) => f.endsWith('.urdf')) : null;
if (!urdfFile) {
  console.error(`No .urdf in ${urdfDir}. If you only have .xacro, run: xacro my_robot.urdf.xacro > my_robot.urdf`);
  process.exit(1);
}
let urdf = fs.readFileSync(path.join(urdfDir, urdfFile), 'utf8');
const xml = new DOMParser().parseFromString(urdf, 'application/xml');

const dataPath = path.join(ROOT, 'src/data/robots', `${id}.yaml`);
const cfg = fs.existsSync(dataPath) ? (yaml.load(fs.readFileSync(dataPath, 'utf8')) ?? {}) : {};
const linkColors = cfg.appearance?.links ?? {};
const defaultColor = cfg.appearance?.default;

// URDF materials (name → rgba) and each link's visual meshes.
const materials = {};
for (const m of [...xml.getElementsByTagName('material')]) {
  const c = m.getElementsByTagName('color')[0];
  if (m.getAttribute('name') && c) materials[m.getAttribute('name')] = c.getAttribute('rgba').split(/\s+/).map(Number);
}
const visuals = [];
for (const link of [...xml.getElementsByTagName('link')]) {
  for (const v of [...link.getElementsByTagName('visual')]) {
    const mesh = v.getElementsByTagName('mesh')[0];
    if (!mesh) continue;
    const mat = v.getElementsByTagName('material')[0];
    const inline = mat?.getElementsByTagName('color')[0]?.getAttribute('rgba');
    visuals.push({
      link: link.getAttribute('name'),
      filename: mesh.getAttribute('filename'),
      scale: (mesh.getAttribute('scale') || '1 1 1').split(/\s+/).map(Number),
      rgba: inline ? inline.split(/\s+/).map(Number) : materials[mat?.getAttribute('name')],
    });
  }
}

const resolveMesh = (filename) => {
  const rel = filename.replace(/^package:\/\/[^/]+\//, '').replace(/^file:\/\//, '');
  return path.isAbsolute(rel) ? rel : path.join(pkg, rel);
};

const hex = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Load any supported mesh file as a three.js Object3D. */
function loadThree(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.dae') return new ColladaLoader().parse(fs.readFileSync(file, 'utf8'), '').scene;
  if (ext === '.stl') {
    const buf = fs.readFileSync(file);
    const geo = new STLLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  }
  return null;
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const outDir = path.join(ROOT, 'public/robots', id);
fs.mkdirSync(path.join(outDir, 'meshes'), { recursive: true });

let total = 0;
for (const v of visuals) {
  const src = resolveMesh(v.filename);
  if (!fs.existsSync(src)) {
    console.warn(`! missing mesh for ${v.link}: ${src}`);
    continue;
  }
  const outName = `${path.basename(src, path.extname(src))}.glb`;
  const color = linkColors[v.link] ? [...hex(linkColors[v.link]), 1] : defaultColor ? [...hex(defaultColor), 1] : v.rgba ?? [0.7, 0.72, 0.75, 1];
  let doc;
  if (path.extname(src).toLowerCase() === '.glb') {
    doc = await io.read(src);
  } else {
    // three.js scene → gltf-transform document, baking each mesh's transform (incl. Collada up-axis).
    const obj = loadThree(src);
    obj.updateMatrixWorld(true);
    doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    const material = doc
      .createMaterial(v.link)
      .setBaseColorFactor([toLinear(color[0]), toLinear(color[1]), toLinear(color[2]), color[3] ?? 1])
      .setRoughnessFactor(0.6)
      .setMetallicFactor(0);
    const root = doc.createNode(v.link);
    scene.addChild(root);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      const pos = g.attributes.position.array;
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)).setBuffer(buffer))
        .setMaterial(material);
      if (g.index) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.index.array)).setBuffer(buffer));
      root.addChild(doc.createNode(o.name || 'mesh').setMesh(doc.createMesh().addPrimitive(prim)));
    });
    if (v.scale.some((s) => s !== 1)) root.setScale(v.scale);
  }
  await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0005 }), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(outDir, 'meshes', outName);
  await io.write(out, doc);
  total += fs.statSync(out).size;
  urdf = urdf.split(`filename="${v.filename}"`).join(`filename="meshes/${outName}"`);
  console.log(`✓ ${v.link.padEnd(22)} ${path.basename(src)} → meshes/${outName}  ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}
// Collision meshes aren't converted (the viewer only shows visuals).
fs.writeFileSync(path.join(outDir, `${id}.urdf`), urdf);

const joints = [...xml.getElementsByTagName('joint')]
  .filter((j) => ['revolute', 'continuous', 'prismatic'].includes(j.getAttribute('type')))
  .map((j) => {
    const l = j.getElementsByTagName('limit')[0];
    return { name: j.getAttribute('name'), lower: Number(l?.getAttribute('lower') ?? -Math.PI), upper: Number(l?.getAttribute('upper') ?? Math.PI) };
  });
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(
    dataPath,
    `# Robot — used by <RobotViewer id="${id}" />. Guide: docs/3D-MODELS.md
urdf: /robots/${id}/${id}.urdf
alt: TODO describe the robot for screen readers
up: +z
# Joint angles in radians. Movable joints found in the URDF:
${joints.map((j) => `#   ${j.name}  [${j.lower.toFixed(2)}, ${j.upper.toFixed(2)}]`).join('\n')}
poses:
  - { id: home, label: Home, joints: { ${joints.map((j) => `${j.name}: 0`).join(', ')} } }
# sequence: { poses: [home, other], seconds: 1.6, hold: 0.6 }
# Colors per link (re-run npm run robot:import after editing):
# appearance:
#   default: '#9aa0a8'
#   links: { ${visuals[0]?.link ?? 'base_link'}: '#24272c' }
`,
  );
  console.log(`✓ ${path.relative(ROOT, dataPath)}`);
}
console.log(`\n✓ public/robots/${id}/ — ${visuals.length} meshes, ${(total / 1e6).toFixed(2)} MB total`);

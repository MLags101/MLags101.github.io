/**
 * Bakes the `motions:` in src/data/models/<id>.yaml into the GLB as real glTF animations,
 * so <model-viewer> can play them (it can play animations but can't move parts itself).
 *
 * Each moving part gets an invisible wrapper node (identity at rest) that the animation
 * drives, so CAD transforms, quantization and part names are left untouched. Re-baking
 * first removes previous wrappers and `motion:` animations, so it's safe to run repeatedly.
 *
 *   explode  parts move apart (radial / along an axis / outward in a plane) and back
 *   fold     named parts rotate about a hinge or slide (landing gear, folding arms)
 *   path     the whole model drives or flies a figure 8 / circle; props or wheels can spin
 *
 * Math shared with the URDF viewer lives in src/lib/motion.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  explodeOffsets,
  explodeProgress,
  globMatch,
  parseAxis,
  parseVec,
  pathPose,
  pathCenter,
  spinAngle,
  cross,
} from '../../src/lib/motion.ts';

const FPS = 30;
export const MOTION_PREFIX = 'motion:';

const isWrapper = (n) => n.getExtras()?.siteMotion === true;
const worldMatrix = (n) => (n ? new THREE.Matrix4().fromArray(n.getWorldMatrix()) : new THREE.Matrix4());

/** Remove wrappers and animations from a previous bake. */
export function unbake(doc) {
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (a.getName().startsWith(MOTION_PREFIX)) a.dispose();
  for (const w of root.listNodes().filter(isWrapper)) {
    const parent = w.getParentNode();
    const scenes = root.listScenes().filter((s) => s.listChildren().includes(w));
    for (const c of w.listChildren()) {
      w.removeChild(c);
      if (parent) parent.addChild(c);
      else scenes.forEach((s) => s.addChild(c));
    }
    w.dispose();
  }
  // Orphaned accessors from old animations are cleaned by prune() later in the pipeline.
}

/** Insert an identity wrapper above `node`; returns it. Its frame = node's parent's frame. */
function wrap(doc, node, label) {
  const w = doc.createNode('').setExtras({ siteMotion: true, motion: label });
  const parent = node.getParentNode();
  if (parent) {
    parent.removeChild(node);
    parent.addChild(w);
  } else {
    for (const s of doc.getRoot().listScenes())
      if (s.listChildren().includes(node)) {
        s.removeChild(node);
        s.addChild(w);
      }
  }
  w.addChild(node);
  return w;
}

/**
 * Wrap `node` so it can rotate about `pivot` (parent-local): parent → [to pivot] → [rotor] →
 * [back] → node. Only the rotor is animated (rotation, plus any slide), so interpolation
 * never pulls the part off its hinge. The three wrappers compose to identity at rest.
 */
function wrapPivot(doc, node, pivot, label) {
  const back = wrap(doc, node, label).setTranslation([-pivot.x, -pivot.y, -pivot.z]);
  const rotor = wrap(doc, back, label);
  wrap(doc, rotor, label).setTranslation([pivot.x, pivot.y, pivot.z]);
  return rotor;
}

/** Wrap every scene root in one wrapper (for whole-model motion). */
function wrapScene(doc, label) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const w = doc.createNode('').setExtras({ siteMotion: true, motion: label });
  for (const c of scene.listChildren()) {
    scene.removeChild(c);
    w.addChild(c);
  }
  scene.addChild(w);
  return w;
}

/** World-space bounding box of everything under a node. */
function boxOf(node) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const visit = (n) => {
    const mesh = n.getMesh();
    if (mesh) {
      const m = worldMatrix(n);
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const lo = pos.getMinNormalized([]), hi = pos.getMaxNormalized([]);
        for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) box.expandByPoint(v.set(x, y, z).applyMatrix4(m));
      }
    }
    n.listChildren().forEach(visit);
  };
  visit(node);
  return box;
}

/** The assembly's parts: descend through single-child containers, then take `level` levels. */
export function listParts(doc, level = 1) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  let nodes = scene.listChildren().filter((n) => !isWrapper(n) || n.listChildren().length);
  const unwrap = (ns) => ns.flatMap((n) => (isWrapper(n) ? unwrap(n.listChildren()) : [n]));
  // Skip empty nodes (SolidWorks exports a "current camera" node beside the assembly).
  const solid = (ns) => ns.filter((n) => !boxOf(n).isEmpty());
  nodes = solid(unwrap(nodes));
  while (nodes.length === 1 && !nodes[0].getMesh() && nodes[0].listChildren().length) nodes = unwrap(nodes[0].listChildren());
  for (let l = 1; l < level; l++) nodes = nodes.flatMap((n) => (n.listChildren().length ? unwrap(n.listChildren()) : [n]));
  return nodes.filter((n) => !boxOf(n).isEmpty());
}

function findNodes(doc, match) {
  return doc
    .getRoot()
    .listNodes()
    .filter((n) => !isWrapper(n) && n.getName() && globMatch(match, n.getName()));
}

function bufferOf(doc) {
  return doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
}

/** Add a sampled channel (translation: vec3 list; rotation: quaternion list). */
function addTrack(doc, anim, node, path, times, values) {
  const buffer = bufferOf(doc);
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
    .setArray(new Float32Array(values.flat()))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
  anim.addSampler(sampler).addChannel(channel);
}

const samples = (seconds) => {
  const n = Math.max(2, Math.round(seconds * FPS) + 1);
  return Array.from({ length: n }, (_, i) => (i / (n - 1)) * seconds);
};

/** Point (world) → parent-local. */
const toLocalPoint = (parentWorld, p) => new THREE.Vector3(...p).applyMatrix4(new THREE.Matrix4().copy(parentWorld).invert());

/** Vector (world, keeps length) → parent-local. */
function toLocalVec(parentWorld, v) {
  const inv = new THREE.Matrix4().copy(parentWorld).invert();
  const o = new THREE.Vector3().applyMatrix4(inv);
  return new THREE.Vector3(...v).applyMatrix4(inv).sub(o);
}

// ── motion types ───────────────────────────────────────────────────────────

function bakeExplode(doc, m, modelBox) {
  const size = modelBox.getSize(new THREE.Vector3());
  const modelSize = Math.max(size.x, size.y, size.z);
  const parts = listParts(doc, m.level ?? 1);
  const centers = parts.map((n) => ({ name: n.getName() || '(unnamed)', center: boxOf(n).getCenter(new THREE.Vector3()).toArray() }));
  const offsets = explodeOffsets(centers, m, modelSize);
  const anim = doc.createAnimation(MOTION_PREFIX + m.id);
  const seconds = m.seconds ?? 1.6;
  const stagger = Math.min(0.9, Math.max(0, m.stagger ?? 0.25));
  const times = samples(seconds);
  let moved = 0;
  // Bounds of the fully exploded assembly, so the viewer can pull the camera back to fit it.
  const exploded = new THREE.Box3();
  parts.forEach((node, i) => exploded.union(boxOf(node).translate(new THREE.Vector3(...offsets[i].offset))));
  parts.forEach((node, i) => {
    const { offset, delay } = offsets[i];
    if (Math.hypot(...offset) < 1e-9) return;
    const parentWorld = worldMatrix(node.getParentNode());
    const local = toLocalVec(parentWorld, offset);
    const w = wrap(doc, node, m.id);
    addTrack(doc, anim, w, 'translation', times, times.map((t) => local.clone().multiplyScalar(explodeProgress(t / seconds, delay, stagger)).toArray()));
    moved++;
  });
  const es = exploded.getSize(new THREE.Vector3());
  return {
    moved,
    parts: parts.length,
    seconds,
    center: exploded.getCenter(new THREE.Vector3()).toArray().map((x) => +x.toFixed(4)),
    extent: +Math.max(es.x, es.y, es.z).toFixed(4),
  };
}

function bakeFold(doc, m) {
  const anim = doc.createAnimation(MOTION_PREFIX + m.id);
  const seconds = m.seconds ?? 1.4;
  const times = samples(seconds);
  const stagger = Math.min(0.9, Math.max(0, m.stagger ?? 0));
  let moved = 0;
  m.joints.forEach((j, ji) => {
    const nodes = findNodes(doc, j.match);
    if (!nodes.length) console.warn(`! motion ${m.id}: no part matches ${JSON.stringify(j.match)}`);
    for (const node of nodes) {
      const parentWorld = worldMatrix(node.getParentNode());
      const delay = m.joints.length > 1 ? (ji / (m.joints.length - 1)) * stagger : 0;
      const progress = (t) => explodeProgress(t / seconds, delay, stagger);
      // Hinge point: explicit "x y z" (model coords, e.g. from ?author Shift+click), "center", or another part's center.
      const pivotWorld =
        typeof j.pivot === 'string' && j.pivot !== 'center'
          ? parseVec(j.pivot)
          : (j.pivot?.part ? boxOf(findNodes(doc, j.pivot.part)[0] ?? node) : boxOf(node)).getCenter(new THREE.Vector3()).toArray();
      const p = toLocalPoint(parentWorld, pivotWorld);
      const axis = toLocalVec(parentWorld, parseAxis(j.axis)).normalize();
      const slide = j.translate ? toLocalVec(parentWorld, parseVec(j.translate)) : null;
      const angle = ((j.angle ?? 0) * Math.PI) / 180;
      const rotor = wrapPivot(doc, node, p, m.id);
      if (angle) addTrack(doc, anim, rotor, 'rotation', times, times.map((t) => new THREE.Quaternion().setFromAxisAngle(axis, angle * progress(t)).toArray()));
      if (slide) addTrack(doc, anim, rotor, 'translation', times, times.map((t) => slide.clone().multiplyScalar(progress(t)).toArray()));
      moved++;
    }
  });
  return { moved, seconds };
}

function bakePath(doc, m, modelBox, forwardAxis) {
  const size = modelBox.getSize(new THREE.Vector3());
  const modelSize = Math.max(size.x, size.y, size.z);
  const seconds = m.seconds ?? 8;
  const times = samples(seconds);
  const up = [0, 1, 0];
  const forward = parseAxis(forwardAxis ?? '+x');
  const right = cross(forward, up);
  const frame = { forward, right, up };
  const anim = doc.createAnimation(MOTION_PREFIX + m.id);

  // Spinning parts first (wrapped inside the moving root, about their own centers).
  for (const s of m.spin ?? []) {
    const nodes = findNodes(doc, s.match);
    if (!nodes.length) console.warn(`! motion ${m.id}: no part matches spin ${JSON.stringify(s.match)}`);
    for (const node of nodes) {
      const parentWorld = worldMatrix(node.getParentNode());
      const p = toLocalPoint(parentWorld, boxOf(node).getCenter(new THREE.Vector3()).toArray());
      const axis = toLocalVec(parentWorld, parseAxis(s.axis ?? '+y')).normalize();
      const rotor = wrapPivot(doc, node, p, m.id);
      // Enough keyframes that no step exceeds 90° (slerp takes the short way round, so a
      // half-turn step would make the part stutter or spin backwards).
      const total = Math.abs(spinAngle(1, s.rpm ?? 600, seconds));
      const n = Math.max(times.length, Math.ceil(total / (Math.PI / 2)) + 1);
      const st = Array.from({ length: n }, (_, i) => (i / (n - 1)) * seconds);
      addTrack(doc, anim, rotor, 'rotation', st, st.map((t) => new THREE.Quaternion().setFromAxisAngle(axis, spinAngle(t / seconds, s.rpm ?? 600, seconds)).toArray()));
    }
  }

  // The whole model: position along the path; yaw about up, then roll about forward,
  // both about the model's center so it turns in place rather than swinging around the origin.
  const c = modelBox.getCenter(new THREE.Vector3());
  const rootW = wrapScene(doc, m.id);
  const pos = [];
  const rot = [];
  for (const t of times) {
    const pose = pathPose(t / seconds, m, frame, modelSize);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(...up), pose.yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...forward), pose.roll));
    rot.push(q.toArray());
    pos.push(c.clone().sub(c.clone().applyQuaternion(q)).add(new THREE.Vector3(...pose.position)).toArray());
  }
  addTrack(doc, anim, rootW, 'rotation', times, rot);
  addTrack(doc, anim, rootW, 'translation', times, pos);
  const center = new THREE.Vector3(...pathCenter(m, frame, modelSize)).add(c);
  return { seconds, center: center.toArray().map((x) => +x.toFixed(4)), extent: +(((m.size ?? 2.5) + 1) * modelSize).toFixed(4) };
}

/**
 * Bake every motion; returns metadata for <ModelViewer> (saved as motions.json).
 * `forward` is the model's front axis from the YAML (+x | -x | +z | -z).
 */
export function bakeMotions(doc, motions = [], { forward } = {}) {
  unbake(doc);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const modelBox = new THREE.Box3();
  scene.listChildren().forEach((n) => modelBox.union(boxOf(n)));
  const meta = [];
  for (const m of motions) {
    let info;
    if (m.type === 'explode') info = bakeExplode(doc, m, modelBox);
    else if (m.type === 'fold') info = bakeFold(doc, m);
    else if (m.type === 'path') info = bakePath(doc, m, modelBox, forward);
    else {
      console.warn(`! motion ${m.id}: unknown type "${m.type}"`);
      continue;
    }
    meta.push({ id: m.id, type: m.type, animation: MOTION_PREFIX + m.id, config: motionHash(m), ...info });
  }
  return meta;
}

/** Fingerprint of a motion's YAML, so the content lint can tell when it changed since the bake. */
export function motionHash(m) {
  let h = 2166136261;
  for (const c of JSON.stringify(m)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}

/** public/models/<id>/motions.json — read by <ModelViewer> at build time. Removed when there are none. */
export function writeMotionsJson(dir, meta) {
  const f = path.join(dir, 'motions.json');
  if (meta.length) fs.writeFileSync(f, JSON.stringify({ generated: new Date().toISOString(), motions: meta }, null, 1));
  else fs.rmSync(f, { force: true });
}

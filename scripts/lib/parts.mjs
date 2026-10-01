/**
 * Builds a "parts map" for a glTF document: for every named node (a CAD part or
 * sub-assembly), its world bounding box and — for each of the six axis directions — the
 * outermost surface point and normal found by ray-casting that part's own triangles.
 *
 * Saved as public/models/<id>/parts.json by `npm run model:optimize`, and read at build
 * time by <ModelViewer> so a hotspot can say `part: "CUBE Orange-1"` + `from: top`.
 */
const DIRS = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

function transform(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

/** World-space triangles (flat Float64Array of 9 numbers each) under a node. */
function trianglesOf(node) {
  const out = [];
  const visit = (n) => {
    const mesh = n.getMesh();
    if (mesh) {
      const m = n.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue; // TRIANGLES only
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const idx = prim.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        const v = [0, 0, 0];
        const world = new Float64Array(pos.getCount() * 3);
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          const w = transform(m, v[0], v[1], v[2]);
          world.set(w, i * 3);
        }
        for (let i = 0; i < count; i += 3) {
          const a = idx ? idx.getScalar(i) : i;
          const b = idx ? idx.getScalar(i + 1) : i + 1;
          const c = idx ? idx.getScalar(i + 2) : i + 2;
          out.push(world[a * 3], world[a * 3 + 1], world[a * 3 + 2], world[b * 3], world[b * 3 + 1], world[b * 3 + 2], world[c * 3], world[c * 3 + 1], world[c * 3 + 2]);
        }
      }
    }
    n.listChildren().forEach(visit);
  };
  visit(node);
  return Float64Array.from(out);
}

/** Möller–Trumbore; returns { t, n } of the nearest hit or null. */
function raycast(tris, o, d) {
  let best = null;
  for (let i = 0; i < tris.length; i += 9) {
    const e1x = tris[i + 3] - tris[i], e1y = tris[i + 4] - tris[i + 1], e1z = tris[i + 5] - tris[i + 2];
    const e2x = tris[i + 6] - tris[i], e2y = tris[i + 7] - tris[i + 1], e2z = tris[i + 8] - tris[i + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - tris[i], ty = o[1] - tris[i + 1], tz = o[2] - tris[i + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t <= 0 || (best && t >= best.t)) continue;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (nx * d[0] + ny * d[1] + nz * d[2] > 0) { nx = -nx; ny = -ny; nz = -nz; } // face the viewer
    best = { t, n: [nx, ny, nz] };
  }
  return best;
}

function bounds(tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (tris[i + k] < min[k]) min[k] = tris[i + k];
      if (tris[i + k] > max[k]) max[k] = tris[i + k];
    }
  return { min, max };
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;

export function buildPartsMap(doc) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const parts = {};
  const seen = new Set();
  const visit = (node, depth) => {
    const name = node.getName();
    const tris = trianglesOf(node);
    if (name && tris.length && !seen.has(name)) {
      seen.add(name);
      const { min, max } = bounds(tris);
      const c = min.map((v, k) => (v + max[k]) / 2);
      const size = max.map((v, k) => v - min[k]);
      const diag = Math.hypot(...size) || 1;
      const sides = {};
      for (const [key, dir] of Object.entries(DIRS)) {
        const d = dir.map((x) => -x); // ray travels toward the part
        const axis = dir.findIndex((x) => x !== 0);
        const [a, b] = [0, 1, 2].filter((k) => k !== axis);
        let pick = null;
        // Sample a grid over the face; prefer outermost hits near the face center.
        for (const fa of [0, -0.25, 0.25, -0.45, 0.45])
          for (const fb of [0, -0.25, 0.25, -0.45, 0.45]) {
            const o = [...c];
            o[axis] = c[axis] + dir[axis] * (size[axis] / 2 + diag);
            o[a] = c[a] + fa * size[a];
            o[b] = c[b] + fb * size[b];
            const hit = raycast(tris, o, d);
            if (!hit) continue;
            const p = o.map((v, k) => v + d[k] * hit.t);
            const depthOut = p[axis] * dir[axis];
            const off = Math.hypot(fa, fb);
            const score = depthOut - off * 0.15 * size[axis];
            if (!pick || score > pick.score) pick = { p, n: hit.n, score };
          }
        if (pick) sides[key] = { position: pick.p.map(r4), normal: pick.n.map(r4) };
      }
      parts[name] = { center: c.map(r4), size: size.map(r4), sides };
    }
    node.listChildren().forEach((ch) => visit(ch, depth + 1));
  };
  scene.listChildren().forEach((n) => visit(n, 0));
  return parts;
}

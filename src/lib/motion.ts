/**
 * Motion math shared by the GLB baker (scripts/lib/motions.mjs, run under Node) and the
 * URDF viewer (RobotViewer, in the browser). Pure functions, no dependencies, so both can
 * import this file directly. Configs come from `motions:` in src/data/models|robots/<id>.yaml.
 */
export type Vec3 = [number, number, number];

const AXES: Record<string, Vec3> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

/** "+y" or "0.2 1 0" → a unit vector. */
export function parseAxis(a: string | Vec3 | undefined, fallback: Vec3 = [0, 1, 0]): Vec3 {
  if (!a) return fallback;
  const v = Array.isArray(a) ? a : (AXES[a.trim()] ?? (a.trim().split(/\s+/).map((s) => parseFloat(s)) as Vec3));
  return norm(v);
}

/** "0.1m 0.02m 0" → [0.1, 0.02, 0] (meters; the m suffix is optional). */
export const parseVec = (s: string): Vec3 => s.trim().split(/\s+/).map((x) => parseFloat(x)) as Vec3;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** CAD part-name match with * wildcards, case-insensitive. */
export const globMatch = (patterns: string | string[], name: string) =>
  ([] as string[]).concat(patterns).some((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(name));

/** Ease in/out (cubic). */
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ── exploded views ─────────────────────────────────────────────────────────

export type ExplodeConfig = {
  /**
   * radial: every part moves away from the assembly's center.
   * axis:   parts spread along one axis, in order (stacks, cylinders, towers).
   * planar: parts spread outward in the plane perpendicular to `axis` (arms, booms).
   */
  mode?: 'radial' | 'axis' | 'planar';
  axis?: string;
  /** Spread factor: 1 = each part moves as far again as it already is from the anchor. */
  distance?: number;
  /** Axis mode: which end stays put — the lowest part (min), the middle, or the top (max). */
  anchor?: 'min' | 'center' | 'max';
  /** 0–1: how much the parts' start times are spread out (outermost part moves first). */
  stagger?: number;
  /** Parts that stay where they are (* wildcards). */
  fixed?: string[];
  /** Per-part overrides: an explicit direction, and a distance as a fraction of the model size. */
  parts?: { match: string | string[]; direction?: string; distance?: number }[];
};

export type ExplodePart = { name: string; center: Vec3 };
export type ExplodeResult = { name: string; offset: Vec3; delay: number };

/**
 * Where each part goes when the assembly explodes. `modelSize` is the assembly's largest
 * dimension (for override distances). Delays are 0–1 fractions of the timeline.
 */
export function explodeOffsets(parts: ExplodePart[], cfg: ExplodeConfig, modelSize: number): ExplodeResult[] {
  const mode = cfg.mode ?? 'radial';
  const axis = parseAxis(cfg.axis);
  const k = cfg.distance ?? 0.6;
  // The assembly's center: the average of every part's center (fixed parts included).
  const center = scale(parts.reduce((s, p) => add(s, p.center), [0, 0, 0] as Vec3), 1 / Math.max(1, parts.length));
  const proj = parts.map((p) => dot(p.center, axis));
  const ref = cfg.anchor === 'max' ? Math.max(...proj) : cfg.anchor === 'center' ? dot(center, axis) : Math.min(...proj);

  const out = parts.map((p): ExplodeResult => {
    if (cfg.fixed?.some((f) => globMatch(f, p.name))) return { name: p.name, offset: [0, 0, 0], delay: 0 };
    const o = cfg.parts?.find((r) => globMatch(r.match, p.name));
    if (o?.direction) return { name: p.name, offset: scale(parseAxis(o.direction), (o.distance ?? k * 0.5) * modelSize), delay: 0 };
    const v = sub(p.center, center);
    let off: Vec3;
    if (mode === 'axis') off = scale(axis, (dot(p.center, axis) - ref) * k);
    else if (mode === 'planar') off = scale(sub(v, scale(axis, dot(v, axis))), k);
    else off = scale(v, k);
    if (o?.distance !== undefined) off = scale(norm(off), o.distance * modelSize);
    return { name: p.name, offset: off, delay: 0 };
  });

  // Outermost first: the part that travels farthest starts at 0, the closest at `stagger`.
  const stagger = Math.min(0.9, Math.max(0, cfg.stagger ?? 0.25));
  const order = [...out].filter((r) => len(r.offset) > 0).sort((a, b) => len(b.offset) - len(a.offset));
  order.forEach((r, i) => (r.delay = order.length > 1 ? (i / (order.length - 1)) * stagger : 0));
  return out;
}

/** Progress (0–1) of one part at timeline position u, given its delay and the overall stagger. */
export function explodeProgress(u: number, delay: number, stagger: number) {
  const span = Math.max(0.1, 1 - stagger);
  return ease((u - delay) / span);
}

// ── vehicle paths ──────────────────────────────────────────────────────────

export type PathConfig = {
  /** figure8 passes back through the start point; circle loops around a center beside it. */
  shape?: 'figure8' | 'circle';
  /** Path width as a multiple of the model's size. */
  size?: number;
  /** Laps per loop of the animation. */
  laps?: number;
  /** Lift above the start height while moving (× model size), e.g. a drone. */
  height?: number;
  /** Take off from / land at the start point at the ends of the loop (with `height`). */
  takeoff?: boolean;
  /** Gentle vertical bob amplitude (× model size). */
  bob?: number;
  /** Max lean into turns, degrees (drones / bikes). */
  bank?: number;
};

export type PathPose = {
  /** Offset from the rest position, in the up/forward/right frame given to pathPose. */
  position: Vec3;
  /** Heading change from rest, radians, about `up`. */
  yaw: number;
  /** Lean, radians, about the vehicle's forward axis (positive = right side down). */
  roll: number;
};

/** Planar path point (x = forward at the start, z = right), unit size, for t in [0, 2π). */
function shapePoint(shape: PathConfig['shape'], t: number): [number, number] {
  if (shape === 'circle') return [Math.sin(t), 1 - Math.cos(t)]; // starts at the origin heading +x
  return [Math.sin(t), Math.sin(t) * Math.cos(t)]; // lemniscate of Gerono
}

/**
 * Vehicle pose at loop position u (0–1). The path is rotated so the vehicle starts at
 * its rest position facing its own forward axis, and ends there too (seamless loop).
 * `forward`, `right` and `up` are unit axes in the model's frame; `size` is the model's size.
 */
export function pathPose(u: number, cfg: PathConfig, frame: { forward: Vec3; right: Vec3; up: Vec3 }, size: number): PathPose {
  const R = ((cfg.size ?? 2.5) * size) / 2;
  const laps = Math.max(1, Math.round(cfg.laps ?? 1));
  const t = u * laps * 2 * Math.PI;
  const h = 1e-3;
  const tangentAngle = (tt: number) => {
    const [x0, z0] = shapePoint(cfg.shape, tt - h);
    const [x1, z1] = shapePoint(cfg.shape, tt + h);
    return Math.atan2(z1 - z0, x1 - x0);
  };
  const a0 = tangentAngle(0); // rotate the path so the start tangent is +forward
  const [px, pz] = shapePoint(cfg.shape, t);
  const c = Math.cos(-a0), s = Math.sin(-a0);
  const fx = (px * c - pz * s) * R, fz = (px * s + pz * c) * R;

  // Heading: unwrap relative to the start; positive yaw turns toward -right (left, seen from above).
  let heading = tangentAngle(t) - a0;
  heading = Math.atan2(Math.sin(heading), Math.cos(heading));
  const yaw = -heading;

  // Lean into turns, proportional to how quickly the heading changes (normalized per shape).
  const rate = (tangentAngle(t + 0.05) - tangentAngle(t - 0.05)) / 0.1;
  const wrapped = Math.atan2(Math.sin(rate * 0.1), Math.cos(rate * 0.1)) / 0.1;
  const maxRate = cfg.shape === 'circle' ? 1 : 2.2;
  const roll = (((cfg.bank ?? 0) * Math.PI) / 180) * Math.max(-1, Math.min(1, wrapped / maxRate));

  let lift = (cfg.height ?? 0) * size;
  if (cfg.takeoff && lift) {
    const edge = 0.12;
    lift *= ease(Math.min(u / edge, (1 - u) / edge, 1));
  }
  const bob = (cfg.bob ?? 0) * size * Math.sin(t * 2);
  const up = lift + bob;
  const position = add(add(scale(frame.forward, fx), scale(frame.right, fz)), scale(frame.up, up));
  return { position, yaw, roll };
}

/** The point the camera should look at while a path plays (the path's middle). */
export function pathCenter(cfg: PathConfig, frame: { forward: Vec3; right: Vec3; up: Vec3 }, size: number): Vec3 {
  const pts = Array.from({ length: 64 }, (_, i) => pathPose(i / 64, cfg, frame, size).position);
  const lo = pts.reduce((m, p) => [Math.min(m[0], p[0]), Math.min(m[1], p[1]), Math.min(m[2], p[2])] as Vec3);
  const hi = pts.reduce((m, p) => [Math.max(m[0], p[0]), Math.max(m[1], p[1]), Math.max(m[2], p[2])] as Vec3);
  return scale(add(lo, hi), 0.5);
}

/** A part spinning about its own axis (props, wheels): whole turns per loop so it loops cleanly. */
export const spinAngle = (u: number, rpm: number, seconds: number) => {
  const turns = Math.max(1, Math.round((rpm / 60) * seconds));
  return u * turns * 2 * Math.PI * Math.sign(rpm || 1);
};

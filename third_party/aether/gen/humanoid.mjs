// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/humanoid.mjs, with one modification: limb() below calls the new
// g.cylSmooth(...) (see mesh.mjs's own header) instead of g.cyl(...), so every
// limb/torso/neck segment is smooth-shaded instead of flat-shaded. Everything else,
// including the skeleton, outfits and clips() below, is unmodified. See
// assets/CREDITS.md for provenance and tools/regenerate_npc_kit.mjs for the driver.
//
// humanoid.mjs — rigged, skinned, animated people.
// One 21-joint skeleton drives every character, so a single set of animation
// clips retargets across the whole population. Body proportions, outfit,
// skin/hair colour and accessories are parameters, which is what turns one
// generator into a crowd.

import { Geo, m4, quatFromEuler } from './mesh.mjs';
import { RNG } from './rng.mjs';
import { SKIN, HAIR, CLOTH } from './materials.mjs';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

// Rest pose is a relaxed A-pose at 1.75 m. Character faces +Z; left is -X.
const REST = [
  ['hips', null, [0, 0.98, 0]],
  ['spine', 'hips', [0, 1.14, 0]],
  ['chest', 'spine', [0, 1.32, 0]],
  ['neck', 'chest', [0, 1.50, 0]],
  ['head', 'neck', [0, 1.58, 0]],
  ['shoulder.L', 'chest', [-0.06, 1.45, 0]],
  ['upperArm.L', 'shoulder.L', [-0.18, 1.43, 0]],
  ['lowerArm.L', 'upperArm.L', [-0.30, 1.15, 0]],
  ['hand.L', 'lowerArm.L', [-0.40, 0.91, 0]],
  ['shoulder.R', 'chest', [0.06, 1.45, 0]],
  ['upperArm.R', 'shoulder.R', [0.18, 1.43, 0]],
  ['lowerArm.R', 'upperArm.R', [0.30, 1.15, 0]],
  ['hand.R', 'lowerArm.R', [0.40, 0.91, 0]],
  ['upperLeg.L', 'hips', [-0.10, 0.93, 0]],
  ['lowerLeg.L', 'upperLeg.L', [-0.10, 0.51, 0]],
  ['foot.L', 'lowerLeg.L', [-0.10, 0.09, 0]],
  ['toe.L', 'foot.L', [-0.10, 0.03, 0.13]],
  ['upperLeg.R', 'hips', [0.10, 0.93, 0]],
  ['lowerLeg.R', 'upperLeg.R', [0.10, 0.51, 0]],
  ['foot.R', 'lowerLeg.R', [0.10, 0.09, 0]],
  ['toe.R', 'foot.R', [0.10, 0.03, 0.13]],
];

export const JOINT_NAMES = REST.map((r) => r[0]);
const IDX = Object.fromEntries(JOINT_NAMES.map((n, i) => [n, i]));

/** Scale the rest pose into a specific body. */
function buildSkeleton(p) {
  const { height = 1.75, widthScale = 1, legScale = 1, armScale = 1 } = p;
  const s = height / 1.75;
  const world = REST.map(([, , v]) => {
    let [x, y, z] = v;
    x *= s * widthScale;
    y *= s;
    z *= s;
    return [x, y, z];
  });
  // limb length tweaks, applied down the chain
  const shift = (name, dy) => {
    const stack = [IDX[name]];
    const kids = (i) => REST.map((r, k) => (r[1] === JOINT_NAMES[i] ? k : -1)).filter((k) => k >= 0);
    while (stack.length) {
      const i = stack.pop();
      world[i][1] += dy;
      for (const k of kids(i)) stack.push(k);
    }
  };
  if (legScale !== 1) {
    for (const side of ['L', 'R']) {
      shift(`lowerLeg.${side}`, -0.42 * s * (legScale - 1) * 0.5);
      shift(`foot.${side}`, -0.42 * s * (legScale - 1) * 0.5);
    }
  }
  if (armScale !== 1) {
    for (const side of ['L', 'R']) {
      shift(`lowerArm.${side}`, -0.28 * s * (armScale - 1) * 0.4);
      shift(`hand.${side}`, -0.28 * s * (armScale - 1) * 0.4);
    }
  }
  const parent = REST.map(([, par]) => (par == null ? -1 : IDX[par]));
  const local = world.map((w, i) => (parent[i] < 0 ? w.slice() : [
    w[0] - world[parent[i]][0], w[1] - world[parent[i]][1], w[2] - world[parent[i]][2],
  ]));
  const children = world.map(() => []);
  parent.forEach((p2, i) => { if (p2 >= 0) children[p2].push(i); });
  return { world, local, parent, children, scale: s };
}

// ---------------------------------------------------------------------------
// Skinning helpers
// ---------------------------------------------------------------------------

function distToSeg(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  let t = len2 > 1e-9 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(
    p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t), p[2] - (a[2] + ab[2] * t),
  );
}

/**
 * Weight a vertex against a short candidate list of bones. Restricting the
 * candidates is what stops a hand grabbing the thigh it happens to be near.
 */
function skinner(sk, names) {
  const bones = names.map((n) => IDX[n]).filter((i) => i != null);
  return (p) => {
    const out = bones.map((b) => {
      const child = sk.children[b][0];
      const a = sk.world[b];
      const c = child == null ? [a[0], a[1] - 0.04, a[2]] : sk.world[child];
      const d = distToSeg(p, a, c);
      return [b, 1 / Math.pow(d + 0.03, 3)];
    });
    out.sort((x, y) => y[1] - x[1]);
    return out.slice(0, 4);
  };
}

/** A transform whose local +Y runs from `from` to `to`. */
function alignY(from, to) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const y = [d[0] / len, d[1] / len, d[2] / len];
  const up = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const x = [
    up[1] * y[2] - up[2] * y[1], up[2] * y[0] - up[0] * y[2], up[0] * y[1] - up[1] * y[0],
  ];
  const xl = Math.hypot(x[0], x[1], x[2]) || 1e-6;
  x[0] /= xl; x[1] /= xl; x[2] /= xl;
  const z = [
    x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0],
  ];
  return { m: [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, from[0], from[1], from[2], 1], len };
}

/**
 * A tapered limb between two joints. `over` extends the tube past both joints
 * so that when the skin rotates the segment the surfaces interpenetrate rather
 * than opening a seam — the cheap, reliable alternative to a proper elbow.
 */
function limb(g, mat, from, to, r0, r1, seg = 10, over = 0) {
  const { m, len } = alignY(from, to);
  g.push(m);
  g.cylSmooth(mat, r0, r1, len + over * 2, seg, false, false, -over);
  g.pop();
}

// ---------------------------------------------------------------------------
// Outfits
// ---------------------------------------------------------------------------

export const OUTFITS = {
  casual: { top: 'tee', bottom: 'jeans', shoes: 'sneaker' },
  office: { top: 'shirt', bottom: 'slacks', shoes: 'dress', jacket: true, tie: true },
  worker: { top: 'hivis', bottom: 'workpants', shoes: 'boot', helmet: true },
  uniform: { top: 'polo', bottom: 'slacks', shoes: 'dress', cap: true },
  sport: { top: 'tank', bottom: 'shorts', shoes: 'sneaker' },
  dress: { top: 'dress', bottom: 'dress', shoes: 'flat' },
  hoodie: { top: 'hoodie', bottom: 'jeans', shoes: 'sneaker', hood: true },
  vendor: { top: 'tee', bottom: 'shorts', shoes: 'sandal', apron: true, cap: true },
};

// ---------------------------------------------------------------------------
// Character mesh
// ---------------------------------------------------------------------------

/**
 * @param {object} mats materials map, must include __skin/__hair/__cloth arrays
 * @param {object} o {seed, height, build, outfit, skinTone, hairColour, hairStyle}
 */
export function humanoid(mats, o = {}) {
  const rng = new RNG(o.seed == null ? 'npc' : o.seed);
  const height = o.height == null ? rng.range(1.58, 1.92) : o.height;
  const build = o.build == null ? rng.range(0.85, 1.25) : o.build;      // girth
  const shoulders = o.shoulders == null ? rng.range(0.92, 1.12) : o.shoulders;
  const outfitName = o.outfit || rng.pick(Object.keys(OUTFITS));
  const fit = OUTFITS[outfitName] || OUTFITS.casual;

  const sk = buildSkeleton({ height, widthScale: (0.94 + build * 0.1) * shoulders });
  const S = sk.scale;
  const W = sk.world;

  const skin = o.skinMat != null ? o.skinMat : mats.__skin[rng.int(0, mats.__skin.length - 1)];
  const hair = o.hairMat != null ? o.hairMat : mats.__hair[rng.int(0, mats.__hair.length - 1)];
  const top = fit.top === 'hivis' ? mats.hiVis : mats.__cloth[rng.int(0, mats.__cloth.length - 1)];
  const bottom = fit.bottom === 'jeans' ? mats.denim : mats.__cloth[rng.int(0, mats.__cloth.length - 1)];
  const shoe = mats.leather;

  const g = new Geo();
  const r = (v) => v * S * build;
  const use = (names) => g.setSkin(skinner(sk, names));

  // ---- torso -------------------------------------------------------------
  const longSleeve = fit.top !== 'tank' && fit.top !== 'tee';
  use(['hips', 'spine', 'upperLeg.L', 'upperLeg.R']);
  limb(g, fit.top === 'dress' ? top : bottom, W[IDX.hips], W[IDX.spine], r(0.158), r(0.152), 12, 0.05 * S);
  use(['spine', 'chest', 'hips']);
  limb(g, top, W[IDX.spine], W[IDX.chest], r(0.152), r(0.168), 12, 0.04 * S);
  use(['chest', 'neck', 'spine']);
  limb(g, top, W[IDX.chest], W[IDX.neck], r(0.168), r(0.118), 12, 0.04 * S);
  // shoulder caps
  for (const side of ['L', 'R']) {
    use([`shoulder.${side}`, 'chest', `upperArm.${side}`]);
    g.push(m4.translate(...W[IDX[`upperArm.${side}`]]));
    g.sphere(top, r(0.090), 10, 8);
    g.pop();
  }

  // ---- arms ---------------------------------------------------------------
  for (const side of ['L', 'R']) {
    const ua = `upperArm.${side}`, la = `lowerArm.${side}`, hd = `hand.${side}`;
    use([ua, 'chest', la]);
    limb(g, longSleeve ? top : skin, W[IDX[ua]], W[IDX[la]], r(0.064), r(0.052), 10, 0.035 * S);
    use([la, ua, hd]);
    limb(g, fit.top === 'hoodie' || fit.jacket ? top : skin, W[IDX[la]], W[IDX[hd]], r(0.052), r(0.042), 10, 0.03 * S);
    use([hd, la]);
    g.push(m4.translate(...W[IDX[hd]]));
    g.sphere(skin, r(0.048), 10, 7, [1, 1.25, 0.7]);
    g.push(m4.translate(0, -r(0.075), 0));
    g.sphere(skin, r(0.036), 8, 6, [1, 1.1, 0.7]);
    g.pop();
    g.pop();
    // elbow
    use([la, ua]);
    g.push(m4.translate(...W[IDX[la]]));
    g.sphere(longSleeve ? top : skin, r(0.054), 9, 7);
    g.pop();
    use([hd, la]);
    g.push(m4.translate(...W[IDX[hd]]));
    g.sphere(skin, r(0.046), 8, 6);
    g.pop();
  }

  // ---- legs ---------------------------------------------------------------
  const shortLeg = fit.bottom === 'shorts';
  for (const side of ['L', 'R']) {
    const ul = `upperLeg.${side}`, ll = `lowerLeg.${side}`, ft = `foot.${side}`, to = `toe.${side}`;
    use([ul, 'hips', ll]);
    limb(g, fit.bottom === 'dress' ? top : bottom, W[IDX[ul]], W[IDX[ll]], r(0.100), r(0.076), 10, 0.04 * S);
    use([ll, ul, ft]);
    limb(g, shortLeg ? skin : bottom, W[IDX[ll]], W[IDX[ft]], r(0.076), r(0.050), 10, 0.035 * S);
    use([ul, 'hips']);
    g.push(m4.translate(...W[IDX[ul]]));
    g.sphere(fit.bottom === 'dress' ? top : bottom, r(0.098), 10, 8);
    g.pop();
    use([ll, ul]);
    g.push(m4.translate(...W[IDX[ll]]));
    g.sphere(shortLeg ? skin : bottom, r(0.074), 10, 8);
    g.pop();
    use([ft, ll]);
    g.push(m4.translate(...W[IDX[ft]]));
    g.sphere(shortLeg ? skin : bottom, r(0.050), 8, 6);
    g.pop();
    // shoe: sole + upper + toe box
    use([ft, to, ll]);
    const f = W[IDX[ft]], t = W[IDX[to]];
    g.push(m4.translate(f[0], 0.028 * S, (f[2] + t[2]) / 2 + 0.02 * S));
    g.box(shoe, [r(0.098), 0.056 * S, 0.27 * S]);
    g.pop();
    g.push(m4.translate(f[0], 0.105 * S, f[2] - 0.005 * S));
    g.box(shoe, [r(0.098), 0.15 * S, 0.14 * S]);
    g.pop();
    use([to, ft]);
    g.push(m4.translate(t[0], 0.055 * S, t[2] + 0.045 * S));
    g.box(shoe, [r(0.09), 0.055 * S, 0.09 * S]);
    g.pop();
  }

  // ---- head ---------------------------------------------------------------
  use(['neck', 'chest', 'head']);
  limb(g, skin, W[IDX.neck], W[IDX.head], r(0.055), r(0.058), 10, 0.045 * S);
  use(['head', 'neck']);
  const H = W[IDX.head];
  g.push(m4.translate(H[0], H[1] + 0.085 * S, H[2]));
  g.sphere(skin, 0.098 * S, 14, 10, [0.92, 1.12, 1.0]);
  // jaw / chin
  g.push(m4.translate(0, -0.055 * S, 0.012 * S));
  g.sphere(skin, 0.078 * S, 12, 8, [0.9, 0.85, 1.0]);
  g.pop();
  // nose
  g.push(m4.translate(0, -0.012 * S, 0.088 * S));
  g.sphere(skin, 0.021 * S, 8, 6, [0.8, 1.1, 1.2]);
  g.pop();
  // ears
  for (const s of [-1, 1]) {
    g.push(m4.translate(s * 0.092 * S, -0.005 * S, 0));
    g.sphere(skin, 0.026 * S, 8, 6, [0.4, 1.2, 0.8]);
    g.pop();
  }
  // eyes
  for (const s of [-1, 1]) {
    g.push(m4.translate(s * 0.035 * S, 0.012 * S, 0.078 * S));
    g.sphere(mats.eyeWhite, 0.016 * S, 8, 6);
    g.push(m4.translate(0, 0, 0.009 * S));
    g.sphere(mats.eyeIris, 0.009 * S, 8, 6, [1, 1, 0.5]);
    g.pop();
    g.pop();
  }
  // hair
  const hairStyle = o.hairStyle || rng.pick(['short', 'short', 'crop', 'bun', 'long', 'bald', 'afro', 'braids']);
  if (hairStyle !== 'bald') {
    if (hairStyle === 'afro') {
      g.push(m4.translate(0, 0.03 * S, -0.005 * S));
      g.sphere(hair, 0.128 * S, 14, 10, [1, 1, 1]);
      g.pop();
    } else {
      g.push(m4.translate(0, 0.012 * S, -0.006 * S));
      g.sphere(hair, 0.104 * S, 14, 10, [0.98, 1.1, 1.02]);
      g.pop();
      if (hairStyle === 'long' || hairStyle === 'braids') {
        g.push(m4.translate(0, -0.10 * S, -0.058 * S));
        g.box(hair, [0.16 * S, 0.26 * S, 0.07 * S]);
        g.pop();
      }
      if (hairStyle === 'bun') {
        g.push(m4.translate(0, 0.055 * S, -0.098 * S));
        g.sphere(hair, 0.048 * S, 10, 8);
        g.pop();
      }
    }
  }
  if (fit.helmet) {
    g.push(m4.translate(0, 0.05 * S, 0));
    g.sphere(mats.signYellow, 0.115 * S, 14, 8, [1, 0.9, 1]);
    g.push(m4.translate(0, -0.035 * S, 0.02 * S));
    g.cyl(mats.signYellow, 0.145 * S, 0.145 * S, 0.012 * S, 16);
    g.pop();
    g.pop();
  } else if (fit.cap) {
    const capMat = mats.__cloth[rng.int(0, mats.__cloth.length - 1)];
    g.push(m4.translate(0, 0.03 * S, 0));
    g.sphere(capMat, 0.104 * S, 12, 8, [1, 0.75, 1]);
    g.push(m4.translate(0, -0.03 * S, 0.115 * S));
    g.box(capMat, [0.17 * S, 0.014 * S, 0.11 * S]);
    g.pop();
    g.pop();
  }
  g.pop(); // head translate

  // ---- outfit extras -------------------------------------------------------
  use(['chest', 'spine']);
  if (fit.jacket) {
    const jm = mats.__cloth[rng.int(0, mats.__cloth.length - 1)];
    limb(g, jm, W[IDX.spine], W[IDX.chest], r(0.168), r(0.180), 12, 0.03 * S);
  }
  if (fit.tie) {
    g.push(m4.translate(0, W[IDX.chest][1] + 0.02 * S, r(0.16)));
    g.box(mats.signRed, [0.038 * S, 0.22 * S, 0.012 * S]);
    g.pop();
  }
  if (fit.apron) {
    g.push(m4.translate(0, (W[IDX.hips][1] + W[IDX.chest][1]) / 2 + 0.02 * S, r(0.125)));
    g.box(mats.cotton, [0.30 * S, 0.62 * S, 0.03 * S]);
    g.pop();
  }
  if (fit.top === 'hivis') {
    use(['chest', 'spine']);
    for (const z of [r(0.16), -r(0.16)]) {
      g.push(m4.translate(0, W[IDX.chest][1] - 0.03 * S, z));
      g.box(mats.signWhite, [0.22 * S, 0.035 * S, 0.008 * S]);
      g.pop();
    }
  }
  use(['hips', 'spine']);
  if (!shortLeg && fit.bottom !== 'dress') {
    g.push(m4.translate(0, W[IDX.hips][1] + 0.09 * S, 0));
    g.cyl(mats.leather, r(0.158), r(0.158), 0.032 * S, 12);
    g.pop();
  }
  if (o.backpack) {
    use(['chest', 'spine']);
    g.push(m4.translate(0, W[IDX.chest][1] - 0.02 * S, -r(0.20)));
    g.box(mats.__cloth[rng.int(0, mats.__cloth.length - 1)], [0.26 * S, 0.36 * S, 0.14 * S]);
    g.pop();
  }
  g.clearSkin();

  return {
    geo: g,
    skeleton: sk,
    meta: {
      height: Number(height.toFixed(3)),
      outfit: outfitName,
      hairStyle,
      build: Number(build.toFixed(2)),
      eyeHeight: Number((W[IDX.head][1] + 0.09 * S).toFixed(3)),
    },
  };
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Procedural clips on the shared skeleton. All are in-place loops: the engine
 * supplies root motion, which is what a locomotion state machine wants.
 */
export function clips(sk, o = {}) {
  const S = sk.scale;
  const hipsRest = sk.local[IDX.hips];
  const out = [];

  const make = (name, duration, frames, fn) => {
    const times = [];
    const tracks = new Map();
    const key = (j, path, v) => {
      const k = `${j}|${path}`;
      if (!tracks.has(k)) tracks.set(k, { node: j, path, values: [] });
      tracks.get(k).values.push(...v);
    };
    for (let f = 0; f <= frames; f++) {
      const t = f / frames;
      times.push(t * duration);
      fn(t, key);
    }
    out.push({
      name,
      duration,
      tracks: [...tracks.values()].map((tr) => ({
        node: tr.node,
        path: tr.path,
        times: new Float32Array(times),
        values: new Float32Array(tr.values),
      })),
    });
  };

  const rot = (key, joint, x, y, z) => key(IDX[joint], 'rotation', quatFromEuler(x, y, z));
  const hipsAt = (key, dy, rx, ry, rz) => {
    key(IDX.hips, 'translation', [hipsRest[0], hipsRest[1] + dy, hipsRest[2]]);
    key(IDX.hips, 'rotation', quatFromEuler(rx, ry, rz));
  };

  // --- idle ---------------------------------------------------------------
  make('idle', 4.0, 32, (t, key) => {
    const p = t * Math.PI * 2;
    const breathe = Math.sin(p) * 0.012;
    hipsAt(key, breathe * S, 0, Math.sin(p * 0.5) * 0.02, 0);
    rot(key, 'spine', 0.02 + breathe * 0.6, Math.sin(p * 0.5) * 0.03, 0);
    rot(key, 'chest', -0.01 - breathe * 0.5, 0, 0);
    rot(key, 'head', Math.sin(p * 0.37) * 0.05, Math.sin(p * 0.23) * 0.12, 0);
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      rot(key, `upperArm.${side}`, Math.sin(p * 0.5) * 0.03, 0, s * 0.06);
      rot(key, `lowerArm.${side}`, -0.18 + Math.sin(p * 0.5 + 1) * 0.03, 0, 0);
    }
  });

  // --- walk ---------------------------------------------------------------
  const gait = (name, duration, amp, armAmp, bob, lean, knee) => {
    make(name, duration, 24, (t, key) => {
      const p = t * Math.PI * 2;
      hipsAt(key, (bob * Math.abs(Math.sin(p)) - bob * 0.5) * S, lean * 0.35, Math.sin(p) * 0.09, Math.sin(p) * 0.04);
      rot(key, 'spine', lean, -Math.sin(p) * 0.06, 0);
      rot(key, 'chest', lean * 0.5, -Math.sin(p) * 0.05, 0);
      rot(key, 'head', -lean * 0.9, Math.sin(p) * 0.03, 0);
      for (const [side, ph, s] of [['L', 0, -1], ['R', Math.PI, 1]]) {
        const a = p + ph;
        rot(key, `upperLeg.${side}`, Math.sin(a) * amp, 0, 0);
        rot(key, `lowerLeg.${side}`, -knee * clamp01(-Math.sin(a - 0.7)) - 0.05, 0, 0);
        rot(key, `foot.${side}`, -Math.sin(a + 1.1) * 0.28 + 0.06, 0, 0);
        rot(key, `toe.${side}`, clamp01(Math.sin(a + 2.2)) * 0.35, 0, 0);
        rot(key, `upperArm.${side}`, -Math.sin(a) * armAmp, 0, s * 0.08);
        rot(key, `lowerArm.${side}`, -0.25 - clamp01(-Math.sin(a)) * 0.45, 0, 0);
      }
    });
  };
  gait('walk', 1.05, 0.52, 0.34, 0.035, 0.03, 0.95);
  gait('run', 0.62, 0.86, 0.68, 0.075, 0.20, 1.45);
  gait('sprint', 0.48, 1.02, 0.85, 0.09, 0.32, 1.7);

  // --- idle variants ------------------------------------------------------
  make('talk', 3.0, 24, (t, key) => {
    const p = t * Math.PI * 2;
    hipsAt(key, Math.sin(p) * 0.006 * S, 0, Math.sin(p * 0.4) * 0.05, 0);
    rot(key, 'spine', 0.02, Math.sin(p * 0.4) * 0.06, 0);
    rot(key, 'head', Math.sin(p * 1.7) * 0.09, Math.sin(p * 0.9) * 0.14, 0);
    for (const [side, s, ph] of [['L', -1, 0], ['R', 1, 1.3]]) {
      rot(key, `upperArm.${side}`, -0.35 - Math.sin(p * 1.3 + ph) * 0.22, 0, s * (0.22 + Math.sin(p + ph) * 0.1));
      rot(key, `lowerArm.${side}`, -1.05 - Math.sin(p * 1.7 + ph) * 0.3, 0, 0);
    }
  });

  make('sit', 2.5, 8, (t, key) => {
    const p = t * Math.PI * 2;
    hipsAt(key, -0.42 * S, 0, 0, 0);
    rot(key, 'spine', 0.06 + Math.sin(p) * 0.01, 0, 0);
    rot(key, 'head', -0.04, Math.sin(p * 0.5) * 0.08, 0);
    for (const side of ['L', 'R']) {
      rot(key, `upperLeg.${side}`, -1.42, 0, 0);
      rot(key, `lowerLeg.${side}`, -1.45, 0, 0);
      rot(key, `foot.${side}`, 0.18, 0, 0);
      rot(key, `upperArm.${side}`, -0.3, 0, 0);
      rot(key, `lowerArm.${side}`, -0.7, 0, 0);
    }
  });

  make('wave', 1.6, 16, (t, key) => {
    const p = t * Math.PI * 2;
    hipsAt(key, 0, 0, 0, 0);
    rot(key, 'spine', 0.02, 0, 0);
    rot(key, 'head', 0, -0.1, 0);
    rot(key, 'upperArm.R', -2.3, 0, 0.55);
    rot(key, 'lowerArm.R', -0.35, 0, Math.sin(p * 2) * 0.6);
    rot(key, 'upperArm.L', 0, 0, 0.08);
    rot(key, 'lowerArm.L', -0.2, 0, 0);
  });

  void o;
  return out;
}

/** Register the character palettes onto a materials map. */
export function withCharacterPalettes(glb, mats) {
  mats.__skin = SKIN.map((m) => glb.material(m));
  mats.__hair = HAIR.map((m) => glb.material(m));
  mats.__cloth = mats.__cloth || CLOTH.map((m) => glb.material(m));
  return mats;
}

export { IDX as JOINT_INDEX };

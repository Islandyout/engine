// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/vehicles.mjs, unmodified -- part of the procedural asset generator's dependency
// closure for tools/regenerate_npc_kit.mjs. See assets/CREDITS.md for provenance.

// vehicles.mjs — parametric road vehicles.
//
// A body is one continuous lofted shell described by a side profile: at each
// station along the length we give the half-width, the sill height and the
// roofline. Glazing is not a separate box stuck on top — the loft picks glass
// for any near-vertical quad that sits above the beltline inside the cabin,
// which is what gives a car its real silhouette. Wheels are separate nodes
// (one shared mesh, four instances) so the game can spin and steer them.

import { Geo, m4 } from './mesh.mjs';
import { RNG } from './rng.mjs';
import { CARPAINT } from './materials.mjs';

/** Rounded rectangle in the XY plane; fixed vertex count so rings loft cleanly. */
function ring(w, y0, y1, r, z, seg = 3) {
  const hw = Math.max(0.01, w / 2);
  const h = Math.max(0.01, y1 - y0);
  const rr = Math.max(0.001, Math.min(r, hw * 0.9, h * 0.45));
  const cy = (y0 + y1) / 2;
  const ax = hw - rr, ay = h / 2 - rr;
  const out = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rr, cy + cz + Math.sin(a) * rr, z]);
    }
  };
  corner(ax, ay, 0);
  corner(-ax, ay, Math.PI / 2);
  corner(-ax, -ay, Math.PI);
  corner(ax, -ay, Math.PI * 1.5);
  return out;
}

/**
 * Archetypes. `p` is the side profile from tail (-z) to nose (+z):
 * [z, halfWidth*2, sillY, roofY, cornerRadius]. `belt` is the beltline height
 * and `cabin` the z-range where glazing is allowed.
 */
export const ARCHETYPES = {
  sedan: {
    track: 1.56, wheelbase: 2.78, wheelRadius: 0.33, ground: 0.14, mass: 1400, topSpeed: 58, seats: 5,
    belt: 1.14, cabin: [-1.45, 0.95],
    p: [
      [-2.35, 1.50, 0.44, 0.94, 0.20],
      [-2.05, 1.74, 0.34, 1.12, 0.24],
      [-1.45, 1.82, 0.30, 1.20, 0.26],
      [-1.15, 1.76, 0.30, 1.44, 0.24],
      [-0.30, 1.74, 0.30, 1.48, 0.24],
      [0.42, 1.76, 0.30, 1.43, 0.24],
      [0.80, 1.82, 0.30, 1.16, 0.26],
      [1.70, 1.80, 0.32, 1.06, 0.26],
      [2.15, 1.70, 0.36, 0.98, 0.24],
      [2.35, 1.46, 0.44, 0.90, 0.20],
    ],
  },
  hatchback: {
    track: 1.50, wheelbase: 2.55, wheelRadius: 0.31, ground: 0.14, mass: 1150, topSpeed: 52, seats: 5,
    belt: 1.12, cabin: [-1.55, 0.80],
    p: [
      [-2.02, 1.56, 0.42, 1.42, 0.22],
      [-1.90, 1.72, 0.32, 1.50, 0.24],
      [-1.55, 1.76, 0.30, 1.52, 0.26],
      [-0.70, 1.76, 0.30, 1.52, 0.26],
      [0.30, 1.76, 0.30, 1.46, 0.26],
      [0.65, 1.76, 0.30, 1.14, 0.26],
      [1.45, 1.74, 0.32, 1.04, 0.26],
      [1.85, 1.64, 0.36, 0.96, 0.22],
      [2.02, 1.42, 0.42, 0.90, 0.20],
    ],
  },
  suv: {
    track: 1.66, wheelbase: 2.85, wheelRadius: 0.38, ground: 0.22, mass: 2000, topSpeed: 55, seats: 5,
    belt: 1.42, cabin: [-1.85, 0.95],
    p: [
      [-2.40, 1.72, 0.52, 1.76, 0.18],
      [-2.20, 1.92, 0.42, 1.82, 0.22],
      [-1.85, 1.95, 0.38, 1.84, 0.24],
      [-0.40, 1.95, 0.38, 1.86, 0.24],
      [0.55, 1.93, 0.38, 1.80, 0.24],
      [0.95, 1.94, 0.38, 1.44, 0.26],
      [1.85, 1.90, 0.40, 1.32, 0.26],
      [2.25, 1.78, 0.46, 1.22, 0.22],
      [2.40, 1.54, 0.54, 1.14, 0.20],
    ],
  },
  pickup: {
    track: 1.68, wheelbase: 3.35, wheelRadius: 0.40, ground: 0.26, mass: 2200, topSpeed: 50, seats: 5,
    belt: 1.48, cabin: [-0.15, 1.10], bed: [-2.70, -0.25],
    p: [
      [-2.70, 1.86, 0.62, 1.02, 0.10],
      [-0.30, 1.90, 0.58, 1.06, 0.12],
      [-0.15, 1.94, 0.52, 1.92, 0.18],
      [0.55, 1.96, 0.48, 1.96, 0.20],
      [1.10, 1.96, 0.46, 1.88, 0.22],
      [1.35, 1.96, 0.44, 1.48, 0.24],
      [2.30, 1.94, 0.44, 1.38, 0.24],
      [2.60, 1.80, 0.50, 1.28, 0.22],
      [2.70, 1.56, 0.58, 1.20, 0.18],
    ],
  },
  van: {
    track: 1.70, wheelbase: 3.30, wheelRadius: 0.36, ground: 0.20, mass: 2400, topSpeed: 45, seats: 3,
    belt: 1.42, cabin: [1.10, 2.60],
    p: [
      [-2.65, 1.90, 0.42, 2.42, 0.14],
      [-2.45, 2.02, 0.34, 2.50, 0.18],
      [1.10, 2.02, 0.34, 2.50, 0.20],
      [1.75, 2.00, 0.34, 2.34, 0.24],
      [2.25, 1.96, 0.36, 1.74, 0.26],
      [2.55, 1.84, 0.42, 1.36, 0.24],
      [2.65, 1.58, 0.50, 1.24, 0.18],
    ],
  },
  minibus: {
    track: 1.78, wheelbase: 4.00, wheelRadius: 0.38, ground: 0.24, mass: 3500, topSpeed: 40, seats: 16,
    belt: 1.45, cabin: [-2.90, 2.95],
    p: [
      [-3.20, 1.94, 0.52, 2.62, 0.14],
      [-3.00, 2.10, 0.44, 2.74, 0.18],
      [2.90, 2.10, 0.44, 2.74, 0.18],
      [3.10, 2.02, 0.48, 2.58, 0.22],
      [3.20, 1.80, 0.56, 2.30, 0.20],
    ],
  },
  bus: {
    track: 2.10, wheelbase: 5.80, wheelRadius: 0.50, ground: 0.32, mass: 12000, topSpeed: 33, seats: 44,
    belt: 1.70, cabin: [-5.40, 5.40], axles: 2, doors: true,
    p: [
      [-5.75, 2.30, 0.60, 3.10, 0.14],
      [-5.50, 2.50, 0.50, 3.24, 0.20],
      [5.40, 2.50, 0.50, 3.24, 0.20],
      [5.62, 2.40, 0.54, 3.08, 0.24],
      [5.75, 2.16, 0.62, 2.84, 0.22],
    ],
  },
  boxtruck: {
    track: 2.00, wheelbase: 4.40, wheelRadius: 0.46, ground: 0.34, mass: 7500, topSpeed: 36, seats: 3,
    belt: 1.68, cabin: [1.35, 2.85], box: [-3.80, 1.30],
    p: [
      [1.30, 2.28, 0.62, 2.48, 0.14],
      [1.55, 2.36, 0.58, 2.52, 0.18],
      [2.35, 2.36, 0.56, 2.46, 0.20],
      [2.75, 2.28, 0.58, 1.90, 0.24],
      [3.00, 2.10, 0.64, 1.66, 0.20],
    ],
  },
  semi: {
    track: 2.10, wheelbase: 3.80, wheelRadius: 0.52, ground: 0.40, mass: 8000, topSpeed: 33, seats: 2,
    belt: 1.90, cabin: [1.40, 3.10], tractor: true,
    p: [
      [-3.30, 2.20, 0.70, 1.30, 0.12],
      [-0.40, 2.30, 0.66, 1.34, 0.14],
      [-0.20, 2.42, 0.62, 3.34, 0.18],
      [1.35, 2.46, 0.60, 3.40, 0.20],
      [2.60, 2.46, 0.60, 3.26, 0.22],
      [3.05, 2.34, 0.64, 2.36, 0.24],
      [3.30, 2.06, 0.72, 1.96, 0.20],
    ],
  },
  sports: {
    track: 1.66, wheelbase: 2.60, wheelRadius: 0.34, ground: 0.09, mass: 1300, topSpeed: 78, seats: 2,
    belt: 0.94, cabin: [-1.10, 0.55], spoiler: true,
    p: [
      [-2.20, 1.60, 0.34, 0.86, 0.16],
      [-1.95, 1.82, 0.24, 0.98, 0.20],
      [-1.30, 1.92, 0.20, 1.06, 0.22],
      [-1.05, 1.86, 0.20, 1.24, 0.20],
      [-0.35, 1.82, 0.20, 1.26, 0.20],
      [0.35, 1.84, 0.20, 1.20, 0.20],
      [0.60, 1.90, 0.20, 0.94, 0.24],
      [1.45, 1.88, 0.20, 0.82, 0.24],
      [1.95, 1.76, 0.24, 0.72, 0.20],
      [2.20, 1.44, 0.30, 0.66, 0.16],
    ],
  },
};

/** A wheel: tyre, rim, spokes, brake disc. Rotation axis is X. */
export function wheel(mats, o = {}) {
  const r = o.radius == null ? 0.34 : o.radius;
  const w = o.width == null ? 0.24 : o.width;
  const seg = o.seg == null ? 20 : o.seg;
  const g = new Geo();
  g.push(m4.mul(m4.rotZ(Math.PI / 2), m4.translate(0, -w / 2, 0)));
  g.cyl(mats.tyre, r, r, w * 0.82, seg, false, false, w * 0.09);
  g.cyl(mats.tyre, r * 0.9, r, w * 0.09, seg, false, false, 0);
  g.cyl(mats.tyre, r, r * 0.9, w * 0.09, seg, false, false, w * 0.91);
  g.cyl(mats.plasticBlack, r * 0.9, r * 0.9, 0.004, seg, true, false, 0);
  g.cyl(mats.plasticBlack, r * 0.9, r * 0.9, 0.004, seg, false, true, w);
  g.cyl(mats.rim, r * 0.62, r * 0.62, w * 0.5, seg, true, true, w * 0.25);
  g.pop();
  const spokes = o.spokes == null ? 5 : o.spokes;
  for (let i = 0; i < spokes; i++) {
    g.push(m4.mul(m4.rotX((i / spokes) * Math.PI * 2), m4.translate(0, r * 0.38, 0)));
    g.box(mats.rim, [w * 0.46, r * 0.6, r * 0.13]);
    g.pop();
  }
  g.push(m4.mul(m4.rotZ(Math.PI / 2), m4.translate(0, -w * 0.08, 0)));
  g.cyl(mats.steelDark, r * 0.4, r * 0.4, w * 0.16, seg);
  g.pop();
  return g;
}

/** A wheel arch: a dark half-ring set just inside the flank. */
function arch(g, mat, x, y, z, r, seg = 14) {
  const sign = Math.sign(x) || 1;
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    const p = (a) => [x, y + Math.sin(a) * r, z + Math.cos(a) * r * sign];
    const q = (a) => [x - sign * 0.13, y + Math.sin(a) * r * 0.95, z + Math.cos(a) * r * 0.95 * sign];
    g.poly(mat, [p(a0), p(a1), q(a1), q(a0)]);
  }
}

/**
 * Build a vehicle.
 * @returns {{parts, wheelGeo, wheels, meta}} — parts and wheel instances
 *          become separate glTF nodes.
 */
export function vehicle(mats, o = {}) {
  const type = o.type || 'sedan';
  const A = ARCHETYPES[type];
  if (!A) throw new Error(`unknown vehicle type: ${type}`);
  const rng = new RNG(o.seed == null ? type : o.seed);
  const paint = o.paintMat != null ? o.paintMat : mats.__paint[rng.int(0, mats.__paint.length - 1)];
  const glass = mats.carGlass;
  const g = new Geo();

  const rings = A.p.map(([z, w, y0, y1, r]) => ring(w, y0, y1, r, z));
  const zMin = A.p[0][0], zMax = A.p[A.p.length - 1][0];
  const belt = A.belt;
  const cab = A.cabin || [0, 0];

  // Roofline as a function of z, so glazing can stop short of the roof edge
  // instead of climbing over the shoulder.
  const roofAt = (z) => {
    const P = A.p;
    if (z <= P[0][0]) return P[0][3];
    if (z >= P[P.length - 1][0]) return P[P.length - 1][3];
    for (let i = 0; i < P.length - 1; i++) {
      if (z >= P[i][0] && z <= P[i + 1][0]) {
        const t = (z - P[i][0]) / (P[i + 1][0] - P[i][0] || 1);
        return P[i][3] + (P[i + 1][3] - P[i][3]) * t;
      }
    }
    return P[P.length - 1][3];
  };
  const LIP = 0.11;   // painted roof edge above the glass

  g.loftShell(rings, (c, n) => {
    if (Math.abs(n[1]) > 0.9) return paint;               // roof, bonnet, sills
    if (c[2] <= cab[0] || c[2] >= cab[1]) return paint;
    if (c[1] <= belt) return paint;
    if (c[1] >= roofAt(c[2]) - LIP) return paint;
    return glass;
  }, paint);

  // dark interior volume, so glazing does not read as a hole
  const cabW = Math.max(...A.p.filter((s) => s[0] >= cab[0] && s[0] <= cab[1]).map((s) => s[1]), 1.2);
  const roofY = Math.max(...A.p.filter((s) => s[0] >= cab[0] && s[0] <= cab[1]).map((s) => s[3]), belt + 0.4);
  if (cab[1] > cab[0]) {
    g.box(mats.interior, [cabW * 0.86, Math.max(0.3, roofY - belt - 0.08), (cab[1] - cab[0]) * 0.92],
      [0, (belt + roofY) / 2 - 0.04, (cab[0] + cab[1]) / 2]);
  }

  const W = Math.max(...A.p.map((s) => s[1]));
  const L = zMax - zMin;
  const lightY = A.ground + A.wheelRadius * 1.35;

  // bumpers, lights, plates, mirrors
  g.box(mats.plasticBlack, [W * 0.88, 0.16, 0.14], [0, A.ground + 0.2, zMax - 0.12]);
  g.box(mats.plasticBlack, [W * 0.88, 0.16, 0.14], [0, A.ground + 0.2, zMin + 0.12]);
  for (const s of [-1, 1]) {
    g.box(mats.headlight, [W * 0.17, 0.11, 0.06], [s * W * 0.3, lightY + 0.24, zMax - 0.07]);
    g.box(mats.tailLight, [W * 0.16, 0.11, 0.05], [s * W * 0.3, lightY + 0.28, zMin + 0.07]);
    if (!A.box && cab[1] > cab[0]) {
      const mz = Math.min(cab[1] - 0.15, zMax - 0.9);
      g.box(mats.plasticBlack, [0.11, 0.05, 0.05], [s * (W / 2), belt + 0.12, mz]);
      g.box(paint, [0.15, 0.11, 0.08], [s * (W / 2 + 0.11), belt + 0.13, mz]);
    }
  }
  g.box(mats.plasticBlack, [W * 0.38, 0.13, 0.05], [0, lightY + 0.28, zMax - 0.05]);
  g.box(mats.signWhite, [0.4, 0.11, 0.02], [0, A.ground + 0.24, zMax - 0.04]);
  g.box(mats.signWhite, [0.4, 0.11, 0.02], [0, A.ground + 0.24, zMin + 0.04]);

  // ---- type-specific bodywork ---------------------------------------------
  if (A.bed) {
    const [bz0, bz1] = A.bed;
    const floorY = 0.98;
    g.box(mats.plasticGrey, [W * 0.86, 0.06, bz1 - bz0], [0, floorY, (bz0 + bz1) / 2]);
    for (const s of [-1, 1]) g.box(paint, [0.09, 0.5, bz1 - bz0], [(s * W * 0.9) / 2, floorY + 0.25, (bz0 + bz1) / 2]);
    g.box(paint, [W * 0.9, 0.5, 0.09], [0, floorY + 0.25, bz0]);
  }
  if (A.box) {
    const [bz0, bz1] = A.box;
    g.box(mats.signWhite, [W * 0.99, 2.55, bz1 - bz0], [0, 0.85 + 1.28, (bz0 + bz1) / 2]);
    g.box(mats.plasticGrey, [W * 1.0, 0.12, bz1 - bz0], [0, 0.85 + 2.6, (bz0 + bz1) / 2]);
    g.box(mats.steelDark, [W * 0.85, 0.26, bz1 - bz0], [0, 0.72, (bz0 + bz1) / 2]);
    g.box(mats.plasticGrey, [W * 0.92, 2.2, 0.08], [0, 0.95 + 1.1, bz0 - 0.01]);
  }
  if (A.tractor) {
    g.box(mats.steelDark, [W * 0.78, 0.26, 3.0], [0, 0.66, -1.6]);
    g.box(mats.steelDark, [W * 0.7, 0.1, 1.1], [0, 0.86, -1.9]);   // fifth wheel
    for (const s of [-1, 1]) {
      g.push(m4.translate(s * (W / 2 - 0.06), 1.3, -0.05));
      g.cyl(mats.chrome, 0.09, 0.09, 2.1, 10);
      g.pop();
      g.push(m4.mul(m4.translate(s * (W / 2 - 0.2), 0.95, -0.9), m4.rotZ(Math.PI / 2)));
      g.cyl(mats.steel, 0.28, 0.28, 0.5, 12);   // fuel tank
      g.pop();
    }
  }
  if (A.spoiler) {
    g.box(mats.plasticBlack, [W * 0.82, 0.05, 0.3], [0, 1.02, zMin + 0.3]);
    for (const s of [-1, 1]) g.box(mats.plasticBlack, [0.06, 0.18, 0.22], [s * W * 0.34, 0.92, zMin + 0.3]);
  }
  if (A.doors) {
    for (const z of [L * 0.26, -L * 0.1]) {
      for (const s of [-1, 1]) g.box(mats.plasticBlack, [0.05, 2.0, 1.15], [s * (W / 2 - 0.01), 1.45, z]);
    }
  }

  // liveries
  if (o.livery === 'police' || o.livery === 'ambulance' || o.livery === 'fire') {
    const y = roofY + 0.07;
    g.box(mats.plasticBlack, [W * 0.6, 0.06, 0.26], [0, y, (cab[0] + cab[1]) / 2]);
    g.box(mats.lightRed, [W * 0.26, 0.13, 0.22], [-W * 0.16, y + 0.09, (cab[0] + cab[1]) / 2]);
    g.box(mats.signBlue, [W * 0.26, 0.13, 0.22], [W * 0.16, y + 0.09, (cab[0] + cab[1]) / 2]);
  }
  if (o.livery === 'taxi') {
    g.box(mats.signYellow, [0.6, 0.17, 0.2], [0, roofY + 0.09, (cab[0] + cab[1]) / 2 + 0.2]);
  }

  // ---- wheels --------------------------------------------------------------
  const wg = wheel(mats, { radius: A.wheelRadius, width: A.wheelRadius * 0.6, spokes: rng.int(5, 7) });
  const axles = A.axles || 1;
  const wz = [A.wheelbase / 2];
  for (let i = 0; i < axles; i++) wz.push(-A.wheelbase / 2 + i * (A.wheelRadius * 2.4));
  const wheels = [];
  wz.forEach((z, i) => {
    for (const s of [-1, 1]) {
      wheels.push({
        name: `wheel_${i === 0 ? 'F' : `R${axles > 1 ? i : ''}`}${s < 0 ? 'L' : 'R'}`,
        translation: [(s * A.track) / 2, A.wheelRadius, z],
        mirror: s < 0,
        steer: i === 0,
      });
    }
  });
  for (const w of wheels) {
    const [x, y, z] = w.translation;
    arch(g, mats.plasticBlack, Math.sign(x) * (W / 2 - 0.01), y, z, A.wheelRadius * 1.2);
  }

  return {
    parts: [{ name: 'body', geo: g }],
    wheelGeo: wg,
    wheels,
    meta: {
      type, length: Number(L.toFixed(2)), width: Number(W.toFixed(2)),
      height: Number(Math.max(...A.p.map((s) => s[3])).toFixed(2)),
      wheelbase: A.wheelbase, track: A.track, wheelRadius: A.wheelRadius,
      groundClearance: A.ground, seats: A.seats, mass: A.mass, topSpeed: A.topSpeed,
    },
  };
}

/** Register the automotive paint palette. */
export function withPaints(glb, mats) {
  mats.__paint = CARPAINT.map((m) => glb.material(m));
  return mats;
}

/** A semi-trailer, separate so it can be hitched at runtime. */
export function trailer(mats, o = {}) {
  const g = new Geo();
  const L = o.length == null ? 13.6 : o.length;
  const W = o.width == null ? 2.5 : o.width;
  const H = o.height == null ? 2.9 : o.height;
  const deck = 1.25;
  const body = o.bodyMat != null ? o.bodyMat : mats.signWhite;
  g.box(body, [W, H, L], [0, deck + H / 2, 0]);
  g.box(mats.steelDark, [W * 0.9, 0.25, L], [0, deck - 0.12, 0]);
  g.box(mats.plasticGrey, [W * 1.01, 0.14, 0.12], [0, deck + H, -L / 2 + 0.07]);
  g.box(mats.plasticGrey, [W * 1.01, 0.14, 0.12], [0, deck + H, L / 2 - 0.07]);
  for (const s of [-1, 1]) g.box(mats.steelDark, [0.13, deck - 0.25, 0.13], [s * 0.7, (deck - 0.25) / 2, L * 0.28]);
  g.push(m4.translate(0, deck - 0.32, L * 0.4));
  g.cyl(mats.steelDark, 0.09, 0.09, 0.22, 10);
  g.pop();
  for (const s of [-1, 1]) g.box(mats.tailLight, [0.24, 0.14, 0.04], [s * W * 0.32, deck + 0.2, -L / 2 - 0.02]);
  const wg = wheel(mats, { radius: 0.5, width: 0.3, spokes: 6 });
  const wheels = [];
  [-L * 0.34, -L * 0.34 + 1.35].forEach((z, i) => {
    for (const s of [-1, 1]) {
      wheels.push({ name: `wheel_T${i}${s < 0 ? 'L' : 'R'}`, translation: [(s * 2.1) / 2, 0.5, z], mirror: s < 0, steer: false });
    }
  });
  return {
    parts: [{ name: 'body', geo: g }], wheelGeo: wg, wheels,
    meta: { type: 'trailer', length: L, width: W, height: deck + H, kingpin: [0, deck - 0.32, L * 0.4] },
  };
}

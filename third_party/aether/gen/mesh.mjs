// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/mesh.mjs, with one modification: Geo gains a new cylSmooth() method
// alongside the original cyl() (kept, still used by every non-people generator and by
// humanoid.mjs's own accessory trim) -- a smooth-shaded cylinder/cone with shared,
// per-vertex radial normals instead of cyl()'s one flat Newell normal per side quad.
// humanoid.mjs's limb() calls it for every limb/torso/neck segment; nothing else in this
// vendored slice calls it, so buildings/vehicles/signs/nature/animals keep their existing
// look unchanged. See assets/CREDITS.md for provenance and tools/regenerate_npc_kit.mjs.
//
// mesh.mjs — geometry construction: a transform stack, primitive builders and
// per-material accumulation that converts straight into glTF primitives.

// ---------- mat4 (column-major, glTF/OpenGL convention) ----------------------

export const m4 = {
  ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },
  translate: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scale: (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  point(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  },
  dir(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
    ];
  },
  invert(m) {
    const inv = new Array(16);
    inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
    let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
    if (det === 0) return m4.ident();
    det = 1 / det;
    return inv.map((v) => v * det);
  },
};

export function quatFromEuler(x, y, z) {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

// ---------- polygon winding --------------------------------------------------

/** Signed area of an XZ polygon (positive = counter-clockwise in x/z space). */
export function area2(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const b = p[(i + 1) % p.length];
    a += p[i][0] * b[1] - b[0] * p[i][1];
  }
  return a / 2;
}
/** Order so extruded side faces point outward and top caps face +Y. */
export function ensureCW(p) { return area2(p) > 0 ? p.slice().reverse() : p; }
export function ensureCCW(p) { return area2(p) < 0 ? p.slice().reverse() : p; }

// ---------- geometry accumulator --------------------------------------------

export class Geo {
  constructor() {
    this.groups = new Map(); // material index -> {pos, nrm, uv, idx, jnt, wgt}
    this.stack = [m4.ident()];
    this.skinFn = null;      // (worldPos) => [[jointIndex, weight], ...]
  }

  /**
   * Bind a skin-weight function. Every vertex emitted while it is set gets
   * JOINTS_0/WEIGHTS_0 computed from its final world position, so all the
   * primitive builders below become skinning-aware for free.
   */
  setSkin(fn) { this.skinFn = fn; return this; }
  clearSkin() { this.skinFn = null; return this; }

  _skin(g, p) {
    if (!this.skinFn) return;
    const w = this.skinFn(p) || [];
    const j = [0, 0, 0, 0], v = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < 4 && i < w.length; i++) { j[i] = w[i][0]; v[i] = w[i][1]; total += w[i][1]; }
    if (total <= 0) { j[0] = w.length ? w[0][0] : 0; v[0] = 1; total = 1; }
    for (let i = 0; i < 4; i++) v[i] /= total;
    g.jnt.push(j[0], j[1], j[2], j[3]);
    g.wgt.push(v[0], v[1], v[2], v[3]);
  }

  get xf() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(m4.mul(this.xf, m)); return this; }
  pop() { this.stack.pop(); return this; }
  with(m, fn) { this.push(m); fn(this); this.pop(); return this; }

  _g(mat) {
    let g = this.groups.get(mat);
    if (!g) { g = { pos: [], nrm: [], uv: [], idx: [], jnt: [], wgt: [] }; this.groups.set(mat, g); }
    return g;
  }

  /** Add a triangle fan/strip-free polygon (CCW) with a flat normal. */
  poly(mat, pts, uvs) {
    if (pts.length < 3) return this;
    const g = this._g(mat);
    const w = pts.map((p) => m4.point(this.xf, p));
    // Newell normal — robust for non-planar-ish quads.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = g.pos.length / 3;
    for (let i = 0; i < w.length; i++) {
      g.pos.push(w[i][0], w[i][1], w[i][2]);
      g.nrm.push(nx, ny, nz);
      const uv = uvs ? uvs[i] : [i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0];
      g.uv.push(uv[0], uv[1]);
      this._skin(g, w[i]);
    }
    for (let i = 2; i < w.length; i++) g.idx.push(base, base + i - 1, base + i);
    return this;
  }

  /** Smooth-shaded triangle soup with explicit normals. */
  raw(mat, pos, nrm, uv, idx) {
    const g = this._g(mat);
    const base = g.pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) {
      const p = m4.point(this.xf, [pos[i], pos[i + 1], pos[i + 2]]);
      g.pos.push(p[0], p[1], p[2]);
      const n = m4.dir(this.xf, [nrm[i], nrm[i + 1], nrm[i + 2]]);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      g.nrm.push(n[0] / l, n[1] / l, n[2] / l);
      this._skin(g, p);
    }
    for (let i = 0; i < uv.length; i++) g.uv.push(uv[i]);
    for (let i = 0; i < idx.length; i++) g.idx.push(base + idx[i]);
    return this;
  }

  /** Axis-aligned box in local space. size=[x,y,z], center=[x,y,z]. */
  box(mat, size, center = [0, 0, 0], uvScale = 1) {
    const [sx, sy, sz] = size.map((v) => v / 2);
    const [cx, cy, cz] = center;
    const x0 = cx - sx, x1 = cx + sx, y0 = cy - sy, y1 = cy + sy, z0 = cz - sz, z1 = cz + sz;
    const uv = (w, h) => [[0, 0], [w * uvScale, 0], [w * uvScale, h * uvScale], [0, h * uvScale]];
    const W = size[0], H = size[1], D = size[2];
    this.poly(mat, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], uv(W, H)); // +Z
    this.poly(mat, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], uv(W, H)); // -Z
    this.poly(mat, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], uv(D, H)); // +X
    this.poly(mat, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], uv(D, H)); // -X
    this.poly(mat, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uv(W, D)); // +Y
    this.poly(mat, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], uv(W, D)); // -Y
    return this;
  }

  /**
   * Extrude a simple 2-D polygon (XZ plane) between y0 and y1.
   * Winding is normalised internally, so callers may pass either order.
   */
  prism(mat, poly2In, y0, y1, cap = true) {
    const poly2 = ensureCW(poly2In);
    const n = poly2.length;
    for (let i = 0; i < n; i++) {
      const a = poly2[i], b = poly2[(i + 1) % n];
      this.poly(mat, [
        [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]],
      ]);
    }
    if (cap) {
      this.poly(mat, poly2.map((p) => [p[0], y1, p[1]]));
      this.poly(mat, poly2.slice().reverse().map((p) => [p[0], y0, p[1]]));
    }
    return this;
  }

  /** Y-axis cylinder / cone / tube. */
  cyl(mat, r0, r1, h, seg = 16, capTop = true, capBottom = true, y0 = 0) {
    const y1 = y0 + h;
    const ring = (r, y) => {
      const out = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      }
      return out;
    };
    const A = ring(r0, y0), B = ring(r1, y1);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.poly(mat, [A[i], A[j], B[j], B[i]], [
        [i / seg, 0], [(i + 1) / seg, 0], [(i + 1) / seg, 1], [i / seg, 1],
      ]);
    }
    if (capTop && r1 > 1e-6) this.poly(mat, B);
    if (capBottom && r0 > 1e-6) this.poly(mat, A.slice().reverse());
    return this;
  }

  /**
   * Smooth-shaded Y-axis cylinder / cone / tube: same shape as cyl(), but the
   * side wall shares vertices between adjacent segments and carries a per-vertex
   * normal (radial, tilted by the taper slope so a cone still shades correctly)
   * instead of cyl()'s one flat Newell normal per quad. That flat shading is what
   * reads as a faceted pipe rather than a rounded limb; sphere() already does the
   * smooth-vertex-normal thing below, this brings cyl()'s call sites the same
   * option without changing cyl() itself (buildings/vehicles/signs/nature/animals
   * all call cyl() too, and their current faceted look is untouched by this).
   * Caps stay flat via poly(), matching cyl() -- both ends are always covered by
   * a joint sphere in practice, so cap shading is never actually visible.
   */
  cylSmooth(mat, r0, r1, h, seg = 16, capTop = true, capBottom = true, y0 = 0) {
    const y1 = y0 + h;
    const ring = (r, y) => {
      const out = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      }
      return out;
    };
    const A = ring(r0, y0), B = ring(r1, y1);
    const slope = (r0 - r1) / h;
    const nlen = Math.hypot(1, slope) || 1;
    const pos = [], nrm = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      pos.push(cx * r0, y0, sz * r0, cx * r1, y1, sz * r1);
      nrm.push(cx / nlen, slope / nlen, sz / nlen, cx / nlen, slope / nlen, sz / nlen);
      uv.push(i / seg, 0, i / seg, 1);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 2, c = a + 1, d = a + 3;
      idx.push(a, d, b, a, c, d);
    }
    this.raw(mat, pos, nrm, uv, idx);
    if (capTop && r1 > 1e-6) this.poly(mat, B);
    if (capBottom && r0 > 1e-6) this.poly(mat, A.slice().reverse());
    return this;
  }

  /** Smooth UV sphere, optionally squashed into an ellipsoid. */
  sphere(mat, r, seg = 16, rings = 10, scale = [1, 1, 1]) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (let y = 0; y <= rings; y++) {
      const v = y / rings, phi = v * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const u = x / seg, theta = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        pos.push(nx * r * scale[0], ny * r * scale[1], nz * r * scale[2]);
        nrm.push(nx / scale[0], ny / scale[1], nz / scale[2]);
        uv.push(u, v);
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < seg; x++) {
        const a = y * (seg + 1) + x, b = a + seg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return this.raw(mat, pos, nrm, uv, idx);
  }

  /**
   * Loft a closed cross-section along a series of stations.
   * sections: [{ pts:[[x,y],...], z, scale?:[sx,sy], offset?:[ox,oy] }]
   * Cross-section is in XY, swept along Z. Used for car bodies and limbs.
   */
  loft(mat, sections, capEnds = true) {
    const rings = sections.map((s) => {
      const sc = s.scale || [1, 1];
      const of = s.offset || [0, 0];
      return s.pts.map(([x, y]) => [x * sc[0] + of[0], y * sc[1] + of[1], s.z]);
    });
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1];
      for (let k = 0; k < A.length; k++) {
        const l = (k + 1) % A.length;
        this.poly(mat, [A[k], A[l], B[l], B[k]]);
      }
    }
    if (capEnds) {
      this.poly(mat, rings[0].slice().reverse());
      this.poly(mat, rings[rings.length - 1]);
    }
    return this;
  }

  /**
   * Loft explicit 3-D rings, choosing the material per quad. Used for vehicle
   * bodies, where glazing is part of the same shell as the paintwork: the
   * callback sees each quad's centroid and normal and picks glass or paint.
   */
  loftShell(rings, matFn, capMat) {
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1];
      for (let k = 0; k < A.length; k++) {
        const l = (k + 1) % A.length;
        const quad = [A[k], A[l], B[l], B[k]];
        const c = [0, 0, 0];
        for (const q of quad) { c[0] += q[0] / 4; c[1] += q[1] / 4; c[2] += q[2] / 4; }
        const u = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1], quad[1][2] - quad[0][2]];
        const v = [quad[3][0] - quad[0][0], quad[3][1] - quad[0][1], quad[3][2] - quad[0][2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        this.poly(matFn(c, [n[0] / nl, n[1] / nl, n[2] / nl], i, k), quad);
      }
    }
    if (capMat != null) {
      this.poly(capMat, rings[0].slice().reverse());
      this.poly(capMat, rings[rings.length - 1]);
    }
    return this;
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const g of this.groups.values()) {
      for (let i = 0; i < g.pos.length; i += 3) {
        for (let c = 0; c < 3; c++) {
          const v = g.pos[i + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
    }
    return { min, max };
  }

  triCount() {
    let n = 0;
    for (const g of this.groups.values()) n += g.idx.length / 3;
    return n;
  }

  /**
   * Convert to glTF primitive descriptors, welding identical vertices.
   * Builders emit unshared corners so flat faces keep hard normals; welding
   * afterwards recovers the ~40% of vertices that really are duplicates
   * (smooth rings, shared strips) without softening any edge.
   */
  prims(weld = true) {
    const out = [];
    for (const [mat, g] of this.groups) {
      if (!g.idx.length) continue;
      const vCount = g.pos.length / 3;
      const skinned = g.jnt.length === vCount * 4;
      let pos = g.pos, nrm = g.nrm, uv = g.uv, jnt = g.jnt, wgt = g.wgt, idx = g.idx;

      if (weld) {
        const map = new Map();
        const remap = new Int32Array(vCount);
        const P = [], N = [], U = [], J = [], W = [];
        const q = (v, d) => Math.round(v * d) / d;
        for (let i = 0; i < vCount; i++) {
          let key = `${q(g.pos[i * 3], 1e4)},${q(g.pos[i * 3 + 1], 1e4)},${q(g.pos[i * 3 + 2], 1e4)}|`
            + `${q(g.nrm[i * 3], 1e3)},${q(g.nrm[i * 3 + 1], 1e3)},${q(g.nrm[i * 3 + 2], 1e3)}|`
            + `${q(g.uv[i * 2], 1e3)},${q(g.uv[i * 2 + 1], 1e3)}`;
          if (skinned) {
            key += `|${g.jnt[i * 4]},${g.jnt[i * 4 + 1]},${g.jnt[i * 4 + 2]},${g.jnt[i * 4 + 3]}`
              + `|${q(g.wgt[i * 4], 1e3)},${q(g.wgt[i * 4 + 1], 1e3)},${q(g.wgt[i * 4 + 2], 1e3)}`;
          }
          let at = map.get(key);
          if (at === undefined) {
            at = P.length / 3;
            map.set(key, at);
            P.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
            N.push(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2]);
            U.push(g.uv[i * 2], g.uv[i * 2 + 1]);
            if (skinned) {
              J.push(g.jnt[i * 4], g.jnt[i * 4 + 1], g.jnt[i * 4 + 2], g.jnt[i * 4 + 3]);
              W.push(g.wgt[i * 4], g.wgt[i * 4 + 1], g.wgt[i * 4 + 2], g.wgt[i * 4 + 3]);
            }
          }
          remap[i] = at;
        }
        pos = P; nrm = N; uv = U; jnt = J; wgt = W;
        idx = new Array(g.idx.length);
        for (let i = 0; i < g.idx.length; i++) idx[i] = remap[g.idx[i]];
      }

      const prim = {
        material: mat,
        positions: new Float32Array(pos),
        normals: new Float32Array(nrm),
        uvs: new Float32Array(uv),
        indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
      };
      if (skinned) {
        prim.joints = new Uint16Array(jnt);
        prim.weights = new Float32Array(wgt);
      }
      out.push(prim);
    }
    return out;
  }
}

/** Circle in XZ used as a polygon source. */
export function circle(r, seg = 16, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** Rounded rectangle in XZ. */
export function roundRect(w, d, r, seg = 4) {
  const hw = w / 2 - r, hd = d / 2 - r;
  const out = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  corner(hw, hd, 0);
  corner(-hw, hd, Math.PI / 2);
  corner(-hw, -hd, Math.PI);
  corner(hw, -hd, Math.PI * 1.5);
  return out;
}

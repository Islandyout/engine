#!/usr/bin/env node
// Generates the wuxia kit: original low-poly architecture and props for murim and wuxia scenes (pagodas with
// upswept tiled roofs, a paifang gate, a pavilion, lanterns, a moon gate, an arched bridge, a training dummy ...).
//
//   node tools/murim/assets/make_wuxia_kit.mjs [out_dir]        default: assets/source/kit/wuxia
//
// Every piece is built here from boxes, cylinders and a lofted roof surface, one flat-shaded material per colour,
// so there is no third-party art in it: it is original work, released CC0 with the rest of the repo's kit.
// Units are metres, the origin is the middle of the base, +y up. The files are then added to the catalog with
// tools/import_model.mjs (category "wuxia"); see docs/AZURE_CLOUD_SECT.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(here, "../../../assets/source/kit/wuxia");

// ---------------------------------------------------------------- materials --
const hex = (h) => [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2)); // sRGB to linear
const MATERIALS = {
  stone: "#b8b2a4",
  stone_dark: "#8d887d",
  plaster: "#ece3cf",
  red: "#9b2220",
  red_dark: "#6f1816",
  gold: "#d3a84a",
  wood: "#7b5535",
  wood_dark: "#523722",
  roof_a: "#34585e",
  roof_b: "#2a4a50",
  roof_edge: "#1d3438",
  paper: "#d8412e",
  paper_glow: "#f08a45",
  black: "#1c1c1f",
  jade: "#6fb59d",
  bark: "#5b4330",
  pine_a: "#24523a",
  pine_b: "#2e6542",
  leaf_a: "#4a8a3c",
  leaf_b: "#386f31",
  leaf_c: "#65a047",
  blossom_a: "#e7a0b6",
  blossom_b: "#f3c6d2",
  bamboo: "#86ad4f",
  bamboo_node: "#5d8036",
  canvas: "#cdbb92",
  canvas_dark: "#a8956b",
  thatch: "#b39a58",
  thatch_dark: "#8c7640",
  hide: "#6d4a33",
};

// ------------------------------------------------------------------- meshes --
class Model {
  constructor(name) {
    this.name = name;
    this.parts = new Map(); // material name -> { p: number[], n: number[], i: number[] }
  }
  part(m) {
    if (!this.parts.has(m)) this.parts.set(m, { p: [], n: [], i: [] });
    return this.parts.get(m);
  }
  // A flat-shaded triangle (counter-clockwise seen from outside).
  tri(m, a, b, c) {
    const part = this.part(m);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((x) => x / len);
    const base = part.p.length / 3;
    for (const q of [a, b, c]) {
      part.p.push(...q);
      part.n.push(...n);
    }
    part.i.push(base, base + 1, base + 2);
  }
  quad(m, a, b, c, d) {
    this.tri(m, a, b, c);
    this.tri(m, a, c, d);
  }
  // An axis-aligned box centred at (cx, cy, cz).
  box(m, cx, cy, cz, sx, sy, sz) {
    const [x0, x1, y0, y1, z0, z1] = [cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2];
    this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    this.quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    this.quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }
  // A cylinder (or cone, with rTop) standing on y0.
  cyl(m, cx, y0, cz, r, h, seg = 12, rTop = r) {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2;
      const a1 = ((s + 1) / seg) * Math.PI * 2;
      const p = (a, rr, y) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
      this.quad(m, p(a1, r, y0), p(a0, r, y0), p(a0, rTop, y0 + h), p(a1, rTop, y0 + h));
      this.tri(m, [cx, y0 + h, cz], p(a1, rTop, y0 + h), p(a0, rTop, y0 + h));
      this.tri(m, [cx, y0, cz], p(a0, r, y0), p(a1, r, y0));
    }
  }
  sphere(m, cx, cy, cz, r, seg = 12, rings = 8, sy = 1) {
    const p = (i, j) => {
      const th = (i / rings) * Math.PI;
      const ph = (j / seg) * Math.PI * 2;
      return [cx + Math.sin(th) * Math.cos(ph) * r, cy + Math.cos(th) * r * sy, cz + Math.sin(th) * Math.sin(ph) * r];
    };
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < seg; j++) this.quad(m, p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j));
  }
  // A hip roof over a w by d plan at height y0: a concave lofted surface whose corners sweep up, laid in tile
  // courses that alternate in colour, with a fascia round the eaves. `rise` is the height of the ridge above the eaves.
  roof(cx, y0, cz, w, d, rise, overhang = 1.1, uplift = 0.6, courses = 7) {
    const hw = w / 2 + overhang;
    const hd = d / 2 + overhang;
    const N = 10;
    const surf = (u, v) => {
      const m = Math.max(Math.abs(u), Math.abs(v));
      const corner = Math.pow(Math.abs(u) * Math.abs(v), 3);
      const y = y0 + rise * Math.pow(1 - m, 1.9) + uplift * corner * Math.pow(m, 2) - 0.0;
      return [cx + u * hw, y, cz + v * hd];
    };
    const ring = (i, j) => Math.floor((Math.max(Math.abs(-1 + (2 * i) / N), Math.abs(-1 + (2 * j) / N)) * courses) / 1);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const u0 = -1 + (2 * i) / N, u1 = -1 + (2 * (i + 1)) / N;
        const v0 = -1 + (2 * j) / N, v1 = -1 + (2 * (j + 1)) / N;
        const mat = (ring(i, j) + ring(i, j) % 2) % 2 === 0 ? "roof_a" : "roof_b";
        this.quad(mat, surf(u0, v1), surf(u1, v1), surf(u1, v0), surf(u0, v0)); // top, +y facing
        const down = (p) => [p[0], p[1] - 0.18, p[2]];
        this.quad("roof_edge", down(surf(u0, v0)), down(surf(u1, v0)), down(surf(u1, v1)), down(surf(u0, v1))); // underside
      }
    // The fascia: a thin band hanging from the eave.
    const edge = [];
    for (let i = 0; i <= N; i++) edge.push([-1 + (2 * i) / N, -1]);
    for (let j = 1; j <= N; j++) edge.push([1, -1 + (2 * j) / N]);
    for (let i = N - 1; i >= 0; i--) edge.push([-1 + (2 * i) / N, 1]);
    for (let j = N - 1; j > 0; j--) edge.push([-1, -1 + (2 * j) / N]);
    for (let k = 0; k < edge.length; k++) {
      const a = surf(...edge[k]);
      const b = surf(...edge[(k + 1) % edge.length]);
      const lo = (p) => [p[0], p[1] - 0.34, p[2]];
      this.quad("red_dark", lo(a), lo(b), b, a);
    }
    // A finial at the ridge.
    this.cyl("gold", cx, y0 + rise - 0.1, cz, Math.min(0.3, w * 0.08), 0.5, 6, 0.02);
  }
  // A gabled roof over a w (along the ridge, x) by d plan at height y0: two slopes in courses that alternate in
  // colour, a dark underside and closed ends. Overhang is how far it sticks out past the walls on every side.
  gable(cx, y0, cz, w, d, rise, overhang = 0.5, matA = "roof_a", matB = "roof_b", strips = 6) {
    const hw = w / 2 + overhang, hd = d / 2 + overhang, yr = y0 + rise * (hd / (d / 2));
    for (const side of [1, -1]) {
      for (let k = 0; k < strips; k++) {
        const t0 = k / strips, t1 = (k + 1) / strips; // 0 at the eave, 1 at the ridge
        const mat = k % 2 ? matB : matA;
        const P = (x, t) => [cx + x, y0 + (yr - y0) * t, cz + side * hd * (1 - t)];
        const a = P(-hw, t0), b = P(hw, t0), c = P(hw, t1), d2 = P(-hw, t1);
        if (side > 0) this.quad(mat, a, b, c, d2);
        else this.quad(mat, b, a, d2, c);
        const lo = (q) => [q[0], q[1] - 0.16, q[2]];
        if (side > 0) this.quad("roof_edge", lo(b), lo(a), lo(d2), lo(c));
        else this.quad("roof_edge", lo(a), lo(b), lo(c), lo(d2));
      }
    }
    for (const sx of [1, -1]) {
      const A = [cx + sx * hw, y0, cz + hd], B = [cx + sx * hw, y0, cz - hd], C = [cx + sx * hw, yr, cz];
      if (sx > 0) this.tri("roof_edge", A, B, C);
      else this.tri("roof_edge", B, A, C);
    }
    // A ridge cap.
    this.box("roof_edge", cx, yr + 0.05, cz, hw * 2 + 0.1, 0.16, 0.22);
  }
  // A solid disc with its axis along z (a plank wheel), centred at (cx, cy, cz).
  disc(m, cx, cy, cz, r, thick, seg = 14) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const p = (a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + z];
      this.tri(m, [cx, cy, cz + thick / 2], p(a0, thick / 2), p(a1, thick / 2));
      this.tri(m, [cx, cy, cz - thick / 2], p(a1, -thick / 2), p(a0, -thick / 2));
      this.quad(m, p(a0, thick / 2), p(a0, -thick / 2), p(a1, -thick / 2), p(a1, thick / 2));
    }
  }
  // A quad seen from both sides (thin shells such as a bridge deck).
  quad2(m, a, b, c, d) {
    this.quad(m, a, b, c, d);
    this.quad(m, d, c, b, a);
  }
  // A single GLB with ONE primitive: the colours are per-vertex, so the whole model is one draw call and every
  // model shares one white material, which lets the engine's static batcher merge them. Frame time on a scene of
  // many small props is draw calls, not triangles.
  glb() {
    const P = [], N = [], C = [], I = [];
    let emissive = false;
    for (const [name, part] of this.parts) {
      const base = P.length / 3;
      const col = hex(MATERIALS[name] ?? "#888888");
      if (name === "paper_glow" && this.name === "paper-lantern") emissive = true;
      for (let k = 0; k < part.p.length; k += 3) {
        P.push(part.p[k], part.p[k + 1], part.p[k + 2]);
        N.push(part.n[k], part.n[k + 1], part.n[k + 2]);
        C.push(...col, 1);
      }
      for (const i of part.i) I.push(base + i);
    }
    const chunks = [];
    const views = [];
    const accessors = [];
    let offset = 0;
    const add = (arr, Type, target, count, type, minmax) => {
      const buf = Buffer.from(new Type(arr).buffer);
      const pad = (4 - (buf.length % 4)) % 4;
      views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
      chunks.push(buf, Buffer.alloc(pad));
      offset += buf.length + pad;
      accessors.push({ bufferView: views.length - 1, componentType: Type === Uint32Array ? 5125 : 5126, count, type, ...(minmax ?? {}) });
      return accessors.length - 1;
    };
    const xs = P.filter((_, k) => k % 3 === 0), ys = P.filter((_, k) => k % 3 === 1), zs = P.filter((_, k) => k % 3 === 2);
    const pos = add(P, Float32Array, 34962, P.length / 3, "VEC3", { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] });
    const nor = add(N, Float32Array, 34962, N.length / 3, "VEC3");
    const col = add(C, Float32Array, 34962, C.length / 4, "VEC4");
    const idx = add(I, Uint32Array, 34963, I.length, "SCALAR");
    const bin = Buffer.concat(chunks);
    const json = {
      asset: { version: "2.0", generator: "tools/murim/assets/make_wuxia_kit.mjs" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: this.name }],
      meshes: [{ name: this.name, primitives: [{ attributes: { POSITION: pos, NORMAL: nor, COLOR_0: col }, indices: idx, material: 0 }] }],
      materials: [{ name: "vertex_colour", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 }, ...(emissive ? { emissiveFactor: [0.55, 0.28, 0.12] } : {}) }],
      accessors,
      bufferViews: views,
      buffers: [{ byteLength: bin.length }],
    };
    let j = Buffer.from(JSON.stringify(json));
    j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
    const head = Buffer.alloc(12);
    head.write("glTF", 0);
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
    const jh = Buffer.alloc(8);
    jh.writeUInt32LE(j.length, 0);
    jh.write("JSON", 4);
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(bin.length, 0);
    bh.write("BIN\0", 4);
    return Buffer.concat([head, jh, j, bh, bin]);
  }
}

// -------------------------------------------------------------------- pieces --
const pieces = {};

// A hall: stone terrace, plaster walls with a door bay, red pillars, bracket band and a hip roof.
function hall(name, w, h, rise, { terrace = 0.6, door = true } = {}) {
  const m = new Model(name);
  m.box("stone", 0, terrace / 2, 0, w + 2.4, terrace, w + 2.4);
  m.box("stone_dark", 0, terrace + 0.08, 0, w + 2.8, 0.16, w + 2.8);
  const y0 = terrace;
  m.box("plaster", 0, y0 + h / 2, 0, w - 0.9, h, w - 0.9);
  if (door) {
    m.box("wood_dark", 0, y0 + h * 0.4, w / 2 - 0.42, w * 0.3, h * 0.8, 0.14);
    m.box("red", -w * 0.075, y0 + h * 0.4, w / 2 - 0.34, w * 0.14, h * 0.74, 0.1);
    m.box("red", w * 0.075, y0 + h * 0.4, w / 2 - 0.34, w * 0.14, h * 0.74, 0.1);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl("red", sx * (w / 2 - 0.35), y0, sz * (w / 2 - 0.35), 0.28, h, 10);
  for (const s of [-1, 1]) {
    m.box("red", 0, y0 + h - 0.2, s * (w / 2 - 0.35), w - 0.2, 0.4, 0.4);
    m.box("red", s * (w / 2 - 0.35), y0 + h - 0.2, 0, 0.4, 0.4, w - 0.2);
  }
  m.box("gold", 0, y0 + h + 0.12, 0, w + 0.4, 0.18, w + 0.4); // the bracket band
  m.roof(0, y0 + h + 0.25, 0, w, w, rise, 1.3, 0.7, 7);
  return m;
}
pieces["pagoda-hall"] = hall("pagoda-hall", 9, 4, 3.4);

// A stackable pagoda tier: no terrace, a narrower roof.
function tier(name, w, h, rise) {
  const m = new Model(name);
  m.box("plaster", 0, h / 2, 0, w - 0.7, h, w - 0.7);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl("red", sx * (w / 2 - 0.3), 0, sz * (w / 2 - 0.3), 0.22, h, 8);
  m.box("red", 0, h - 0.15, w / 2 - 0.3, w - 0.3, 0.3, 0.3);
  m.box("red", 0, h - 0.15, -(w / 2 - 0.3), w - 0.3, 0.3, 0.3);
  m.box("red", w / 2 - 0.3, h - 0.15, 0, 0.3, 0.3, w - 0.3);
  m.box("red", -(w / 2 - 0.3), h - 0.15, 0, 0.3, 0.3, w - 0.3);
  m.box("wood_dark", 0, h * 0.45, w / 2 - 0.34, w * 0.22, h * 0.7, 0.1);
  m.box("gold", 0, h + 0.1, 0, w + 0.2, 0.16, w + 0.2);
  m.roof(0, h + 0.2, 0, w, w, rise, 1.1, 0.6, 6);
  return m;
}
pieces["pagoda-tier-large"] = tier("pagoda-tier-large", 8, 3.6, 2.6);
pieces["pagoda-tier-small"] = tier("pagoda-tier-small", 5.5, 3.2, 2.2);

// The spire: rings and a jewel, on a short mast.
{
  const m = new Model("pagoda-spire");
  m.cyl("stone", 0, 0, 0, 0.7, 0.4, 10, 0.5);
  m.cyl("wood_dark", 0, 0.4, 0, 0.12, 2.6, 8);
  for (let k = 0; k < 6; k++) m.cyl("gold", 0, 0.7 + k * 0.32, 0, 0.5 - k * 0.055, 0.1, 12);
  m.sphere("gold", 0, 2.85, 0, 0.26, 10, 8, 1.3);
  pieces["pagoda-spire"] = m;
}

// The paifang gate: four pillars on stone drums, a wide central bay and two small ones, each with its own roof.
{
  const m = new Model("paifang-gate");
  const xs = [-5.2, -1.9, 1.9, 5.2];
  for (const x of xs) {
    m.cyl("stone_dark", x, 0, 0, 0.62, 0.9, 10);
    m.cyl("red", x, 0.9, 0, 0.33, 6.2, 10);
  }
  m.box("red_dark", 0, 6.3, 0, 11.2, 0.5, 0.7); // the long lintel
  m.box("wood_dark", 0, 5.2, 0, 3.4, 0.5, 0.5);
  m.box("black", 0, 5.65, 0.02, 2.9, 0.75, 0.16); // plaque
  m.box("gold", 0, 5.65, 0.12, 3.05, 0.05, 0.05);
  for (const [cx, w, rise] of [[0, 4.4, 1.6], [-5.2, 2.6, 1.0], [5.2, 2.6, 1.0]]) m.roof(cx, 6.6, 0, w, 1.6, rise, 0.9, 0.55, 5);
  pieces["paifang-gate"] = m;
}

// A pavilion: stone floor, four pillars with railings, a roof and a stone table.
{
  const m = new Model("pavilion");
  m.box("stone", 0, 0.3, 0, 6.6, 0.6, 6.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl("red", sx * 2.7, 0.6, sz * 2.7, 0.22, 3.6, 8);
  for (const s of [-1, 1]) {
    m.box("red_dark", 0, 1.3, s * 2.7, 5.4, 0.18, 0.18);
    m.box("red_dark", s * 2.7, 1.3, 0, 0.18, 0.18, 5.4);
    m.box("red", 0, 4.05, s * 2.7, 5.8, 0.3, 0.3);
    m.box("red", s * 2.7, 4.05, 0, 0.3, 0.3, 5.8);
  }
  m.cyl("stone_dark", 0, 0.6, 0, 0.6, 0.7, 10);
  m.cyl("stone", 0, 1.3, 0, 0.9, 0.12, 12);
  m.roof(0, 4.2, 0, 6, 6, 2.4, 1.2, 0.65, 6);
  pieces["pavilion"] = m;
}

// A stone lantern.
{
  const m = new Model("stone-lantern");
  m.cyl("stone_dark", 0, 0, 0, 0.42, 0.25, 8);
  m.cyl("stone", 0, 0.25, 0, 0.16, 0.9, 8);
  m.box("stone", 0, 1.3, 0, 0.62, 0.12, 0.62);
  m.box("paper_glow", 0, 1.65, 0, 0.44, 0.58, 0.44);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m.box("stone", dx * 0.24, 1.65, dz * 0.24, dx ? 0.08 : 0.5, 0.6, dz ? 0.08 : 0.5);
  m.cyl("stone_dark", 0, 1.96, 0, 0.56, 0.22, 4, 0.1);
  m.sphere("stone", 0, 2.22, 0, 0.1, 8, 6);
  pieces["stone-lantern"] = m;
}

// A hanging paper lantern (red, with gold caps).
{
  const m = new Model("paper-lantern");
  m.sphere("paper_glow", 0, 0, 0, 0.32, 12, 8, 1.15);
  m.cyl("gold", 0, 0.35, 0, 0.17, 0.07, 10);
  m.cyl("gold", 0, -0.42, 0, 0.17, 0.07, 10);
  m.cyl("wood_dark", 0, 0.42, 0, 0.02, 0.5, 4);
  for (const a of [0, 1, 2, 3, 4, 5]) m.box("gold", Math.cos(a) * 0.05, -0.56 - a * 0.05, Math.sin(a) * 0.05, 0.02, 0.1, 0.02);
  pieces["paper-lantern"] = m;
}

// A garden wall section, 4 m long, with a tiled cap.
{
  const m = new Model("wall-section");
  m.box("stone", 0, 0.2, 0, 4, 0.4, 0.8);
  m.box("plaster", 0, 1.45, 0, 4, 2.1, 0.5);
  m.box("stone_dark", 0, 0.45, 0, 4.04, 0.1, 0.56);
  m.roof(0, 2.5, 0, 4, 0.5, 0.35, 0.12, 0.03, 2);
  m.box("red", -1.95, 1.4, 0, 0.14, 2.2, 0.58);
  m.box("red", 1.95, 1.4, 0, 0.14, 2.2, 0.58);
  pieces["wall-section"] = m;
}

// A moon gate: a circular opening framed in stone, in a short wall.
{
  const m = new Model("moon-gate");
  const R = 1.45, cy = 1.6, seg = 20;
  for (let k = 0; k < seg; k++) {
    const a = ((k + 0.5) / seg) * Math.PI * 2;
    m.box("stone", Math.cos(a) * (R + 0.14), cy + Math.sin(a) * (R + 0.14), 0, 0.42, 0.42, 0.62);
  }
  m.box("plaster", -3.1, 1.5, 0, 3.0, 3.0, 0.5);
  m.box("plaster", 3.1, 1.5, 0, 3.0, 3.0, 0.5);
  m.box("plaster", 0, 3.35, 0, 3.4, 0.7, 0.5);
  m.box("plaster", 0, 0.55, 0, 3.4, 1.1, 0.5);
  m.box("stone", 0, 0.08, 0, 7.6, 0.16, 0.8);
  m.roof(-3.1, 3.0, 0, 3.0, 0.5, 0.4, 0.14, 0.04, 2);
  m.roof(3.1, 3.0, 0, 3.0, 0.5, 0.4, 0.14, 0.04, 2);
  pieces["moon-gate"] = m;
}

// An arched stone bridge with low railings.
{
  const m = new Model("stone-bridge");
  const L = 9, W = 2.6, seg = 14, rise = 1.4;
  const yAt = (t) => rise * (1 - Math.pow(2 * t - 1, 2));
  for (let k = 0; k < seg; k++) {
    const t0 = k / seg, t1 = (k + 1) / seg;
    const x0 = -L / 2 + t0 * L, x1 = -L / 2 + t1 * L;
    const y0 = yAt(t0), y1 = yAt(t1);
    const [a, b] = [[x0, y0], [x1, y1]];
    m.quad2("stone", [a[0], a[1], W / 2], [b[0], b[1], W / 2], [b[0], b[1], -W / 2], [a[0], a[1], -W / 2]);
    m.quad2("stone_dark", [a[0], a[1] - 0.5, -W / 2], [b[0], b[1] - 0.5, -W / 2], [b[0], b[1], -W / 2], [a[0], a[1], -W / 2]);
    m.quad2("stone_dark", [a[0], a[1], W / 2], [b[0], b[1], W / 2], [b[0], b[1] - 0.5, W / 2], [a[0], a[1] - 0.5, W / 2]);
    m.quad2("stone_dark", [a[0], a[1] - 0.5, W / 2], [b[0], b[1] - 0.5, W / 2], [b[0], b[1] - 0.5, -W / 2], [a[0], a[1] - 0.5, -W / 2]);
    for (const s of [-1, 1]) m.box("stone_dark", (x0 + x1) / 2, (y0 + y1) / 2 + 0.3, s * (W / 2 - 0.1), L / seg + 0.02, 0.5, 0.2);
  }
  m.box("stone_dark", -L / 2 - 0.2, 0.2, 0, 0.5, 0.5, W);
  m.box("stone_dark", L / 2 + 0.2, 0.2, 0, 0.5, 0.5, W);
  pieces["stone-bridge"] = m;
}

// A wooden training dummy (mu ren zhuang): a post with three arms and a leg.
{
  const m = new Model("training-dummy");
  m.cyl("stone_dark", 0, 0, 0, 0.45, 0.25, 8);
  m.cyl("wood", 0, 0.25, 0, 0.17, 1.8, 8);
  m.box("wood", -0.5, 1.5, 0.05, 0.7, 0.1, 0.1);
  m.box("wood", 0.5, 1.2, 0.05, 0.7, 0.1, 0.1);
  m.box("wood", 0.35, 0.55, 0.1, 0.12, 0.7, 0.12);
  m.box("wood_dark", 0, 1.75, 0, 0.5, 0.26, 0.4);
  m.sphere("wood", 0, 2.12, 0, 0.18, 8, 6);
  m.box("red", 0, 1.1, 0.19, 0.36, 0.1, 0.02);
  pieces["training-dummy"] = m;
}

// A weapon rack with a sword, a spear and a staff.
{
  const m = new Model("weapon-rack");
  for (const s of [-1, 1]) m.box("wood_dark", s * 1.1, 0.8, 0, 0.14, 1.6, 0.5);
  m.box("wood_dark", 0, 1.5, 0, 2.3, 0.12, 0.14);
  m.box("wood_dark", 0, 0.8, 0, 2.3, 0.12, 0.14);
  m.box("black", -0.6, 1.1, 0.05, 0.08, 1.5, 0.04);
  m.box("gold", -0.6, 0.45, 0.05, 0.16, 0.06, 0.06);
  m.cyl("wood", 0, 0, 0.06, 0.04, 2.0, 6);
  m.box("stone_dark", 0, 2.1, 0.06, 0.08, 0.3, 0.04);
  m.cyl("wood", 0.55, 0, 0.1, 0.04, 1.8, 6);
  pieces["weapon-rack"] = m;
}

// An incense burner: a tripod cauldron on a stone step.
{
  const m = new Model("incense-burner");
  m.box("stone", 0, 0.1, 0, 1.6, 0.2, 1.6);
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) m.cyl("gold", dx * 0.32, 0.2, dz * 0.32, 0.07, 0.4, 6);
  m.cyl("gold", 0, 0.55, 0, 0.5, 0.55, 12, 0.62);
  m.cyl("black", 0, 1.08, 0, 0.5, 0.04, 12);
  for (const s of [-1, 1]) m.box("gold", s * 0.62, 1.0, 0, 0.08, 0.3, 0.16);
  pieces["incense-burner"] = m;
}

// A stele: a carved stone tablet on a turtle-shaped base (simplified).
{
  const m = new Model("stele");
  m.box("stone_dark", 0, 0.25, 0, 1.6, 0.5, 2.2);
  m.sphere("stone_dark", 0, 0.55, 0.9, 0.45, 8, 6, 0.7);
  m.box("stone", 0, 1.7, 0, 1.0, 2.4, 0.3);
  m.roof(0, 2.9, 0, 1.0, 0.3, 0.3, 0.2, 0.05, 2);
  m.box("black", 0, 1.7, 0.16, 0.7, 1.6, 0.02);
  pieces["stele"] = m;
}


// ---- Everyday buildings: the sect's pagodas are grand; these are what people actually live in. Each is one solid
// mass with a roof that sits ON its walls (nothing floats, nothing is a roof alone).

// A canvas tent: two slopes of cloth over a ridge pole, a dark doorway with tie-back flaps, pegs and guy ropes.
{
  const m = new Model("canvas-tent");
  const w = 4.6, d = 3.6, rise = 2.3;
  // The cloth: ridge along x. Slopes in two shades of stripe.
  for (const side of [1, -1])
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4;
      const P = (x, t) => [x, rise * t, side * (d / 2) * (1 - t)];
      const [a, b, c, e] = [P(-w / 2, t0), P(w / 2, t0), P(w / 2, t1), P(-w / 2, t1)];
      const mat = k % 2 ? "canvas_dark" : "canvas";
      if (side > 0) m.quad2(mat, a, b, c, e);
      else m.quad2(mat, b, a, e, c);
    }
  for (const sx of [1, -1]) {
    const A = [sx * w / 2, 0, d / 2], B = [sx * w / 2, 0, -d / 2], C = [sx * w / 2, rise, 0];
    if (sx > 0) m.tri("canvas", A, B, C); else m.tri("canvas", B, A, C);
    if (sx < 0) m.tri("canvas", A, B, C); else m.tri("canvas", B, A, C);
  }
  // The doorway on the front end (+x): a dark triangle just proud of the cloth, flaps pulled to either side.
  m.tri("black", [w / 2 + 0.03, 0, 0.8], [w / 2 + 0.03, 0, -0.8], [w / 2 + 0.03, 1.6, 0]);
  m.tri("canvas_dark", [w / 2 + 0.05, 0, 0.8], [w / 2 + 0.05, 0, 0.1], [w / 2 + 0.05, 1.55, 0.05]);
  m.tri("canvas_dark", [w / 2 + 0.05, 0, -0.1], [w / 2 + 0.05, 0, -0.8], [w / 2 + 0.05, 1.55, -0.05]);
  // Ridge pole, end posts, pegs and ropes.
  m.box("wood", 0, rise + 0.04, 0, w + 0.9, 0.1, 0.1);
  for (const sx of [1, -1]) m.cyl("wood", sx * (w / 2 + 0.35), 0, 0, 0.06, rise + 0.1, 5);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    m.cyl("wood_dark", sx * (w / 2 + 0.7), 0, sz * (d / 2 + 0.9), 0.05, 0.4, 4);
    m.box("hide", sx * (w / 2 + 0.35), rise * 0.45, sz * (d / 2 + 0.45), 0.04, 0.04, 1.3);
  }
  // A bedroll by the door.
  m.cyl("hide", w / 2 + 0.55, 0.12, -1.6, 0.14, 1.0, 6);
  pieces["canvas-tent"] = m;
}

// A farmhouse: plaster walls on a stone footing, timber frame, one gabled tile roof, a door, shutters, a chimney.
{
  const m = new Model("farmhouse");
  const w = 6.4, d = 4.6, h = 2.7;
  m.box("stone", 0, 0.2, 0, w + 0.3, 0.4, d + 0.3);
  m.box("plaster", 0, 0.4 + h / 2, 0, w, h, d);
  for (const sx of [-1, 0, 1]) m.box("wood_dark", sx * (w / 2), 0.4 + h / 2, 0, 0.18, h, d + 0.1);
  for (const sz of [1, -1]) {
    for (const sx of [-1, 0, 1]) m.box("wood_dark", sx * (w / 2 - 0.1), 0.4 + h / 2, sz * (d / 2), 0.18, h, 0.18);
    m.box("wood_dark", 0, 0.4 + h, sz * (d / 2), w + 0.2, 0.16, 0.2);
  }
  m.gable(0, 0.4 + h, 0, w, d, 1.9, 0.55);
  // The door and two shuttered windows on the +z face.
  m.box("wood", -0.9, 0.4 + 0.95, d / 2 + 0.04, 1.0, 1.9, 0.08);
  m.box("gold", -0.55, 0.4 + 0.95, d / 2 + 0.1, 0.07, 0.07, 0.05);
  for (const wx of [1.1, 2.3]) {
    m.box("wood_dark", wx, 0.4 + 1.5, d / 2 + 0.04, 0.8, 0.8, 0.07);
    m.box("black", wx, 0.4 + 1.5, d / 2 + 0.08, 0.6, 0.6, 0.03);
  }
  // A chimney through the roof's slope.
  m.box("stone_dark", -2.2, 0.4 + h + 1.2, -0.9, 0.6, 2.2, 0.6);
  m.box("stone", -2.2, 0.4 + h + 2.35, -0.9, 0.8, 0.12, 0.8);
  pieces["farmhouse"] = m;
}

// A watchtower: a stone shaft, a timber lookout with rails, a small hip roof on posts, a ladder up the face.
{
  const m = new Model("watchtower");
  const s = 3.4, h = 6.4;
  m.box("stone", 0, 0.25, 0, s + 0.8, 0.5, s + 0.8);
  m.box("stone_dark", 0, 0.5 + h / 2, 0, s, h, s);
  for (const k of [1, 2, 3]) m.box("stone", 0, 0.5 + (h * k) / 4, 0, s + 0.12, 0.12, s + 0.12);
  m.box("black", 0, 1.5, s / 2 + 0.02, 0.9, 1.8, 0.05);
  const top = 0.5 + h;
  m.box("wood", 0, top + 0.1, 0, s + 1.2, 0.2, s + 1.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl("wood_dark", sx * (s / 2 + 0.45), top + 0.2, sz * (s / 2 + 0.45), 0.09, 2.4, 6);
  for (const sz of [-1, 1]) m.box("wood", 0, top + 0.95, sz * (s / 2 + 0.45), s + 0.9, 0.1, 0.08);
  for (const sx of [-1, 1]) m.box("wood", sx * (s / 2 + 0.45), top + 0.95, 0, 0.08, 0.1, s + 0.9);
  m.roof(0, top + 2.5, 0, s + 0.9, s + 0.9, 1.1, 0.5, 0.3, 4);
  // The ladder.
  for (const lx of [-0.3, 0.3]) m.box("wood", lx, 0.5 + h / 2, s / 2 + 0.35, 0.07, h, 0.07);
  for (let r = 0; r < 12; r++) m.box("wood", 0, 0.9 + r * 0.5, s / 2 + 0.35, 0.6, 0.05, 0.05);
  pieces["watchtower"] = m;
}

// A hermit's hut: low walls of rough timber, a deep thatched hip roof, a doorway, a woodpile.
{
  const m = new Model("thatched-hut");
  const w = 4.2, h = 2.1;
  m.box("stone_dark", 0, 0.15, 0, w + 0.3, 0.3, w + 0.3);
  m.box("wood", 0, 0.3 + h / 2, 0, w, h, w);
  for (let k = 0; k < 5; k++) m.box("wood_dark", -w / 2 + 0.4 + k * (w - 0.8) / 4, 0.3 + h / 2, w / 2 + 0.02, 0.1, h, 0.06);
  m.box("black", 0.6, 0.3 + 0.85, w / 2 + 0.04, 0.9, 1.7, 0.06);
  // A hip roof from a four-sided cone, thatch in two tones.
  m.cyl("thatch", 0, 0.3 + h, 0, w * 0.98, 1.9, 4, 0.12);
  m.cyl("thatch_dark", 0, 0.3 + h - 0.12, 0, w * 1.0, 0.12, 4);
  m.cyl("wood_dark", 0, 0.3 + h + 1.8, 0, 0.1, 0.5, 5);
  // Woodpile.
  for (let k = 0; k < 4; k++) m.cyl("wood", -w / 2 - 0.5, 0.18 + (k % 2) * 0.3, -0.6 + k * 0.28, 0.12, 1.3, 6);
  pieces["thatched-hut"] = m;
}

// A roadside shrine: a stone plinth, a little red timber shrine with a gabled tile roof, an offering bowl.
{
  const m = new Model("roadside-shrine");
  m.box("stone", 0, 0.15, 0, 2.6, 0.3, 2.2);
  m.box("stone_dark", 0, 0.4, 1.2, 1.4, 0.2, 0.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box("red", sx * 0.85, 0.3 + 0.85, sz * 0.6, 0.18, 1.7, 0.18);
  m.box("red_dark", 0, 0.3 + 1.0, -0.6, 1.8, 1.4, 0.08);
  m.box("gold", 0, 0.3 + 0.85, -0.54, 0.4, 0.7, 0.04);
  m.gable(0, 2.0, 0, 1.8, 1.4, 0.85, 0.55);
  m.cyl("gold", 0, 0.4, 1.2, 0.22, 0.2, 8, 0.28);
  pieces["roadside-shrine"] = m;
}

// A market stall: a counter, a striped awning on two posts, jars and a crate.
{
  const m = new Model("market-stall");
  m.box("wood", 0, 0.5, 0, 2.6, 0.12, 1.1);
  for (const sx of [-1, 1]) m.box("wood_dark", sx * 1.2, 0.25, 0, 0.1, 0.5, 0.9);
  for (const sx of [-1, 1]) m.cyl("wood_dark", sx * 1.3, 0, -0.5, 0.07, 2.3, 6);
  for (let k = 0; k < 6; k++) {
    const x0 = -1.6 + k * 0.54;
    m.quad2(k % 2 ? "red" : "plaster", [x0, 2.3, -0.5], [x0 + 0.54, 2.3, -0.5], [x0 + 0.54, 1.95, 0.75], [x0, 1.95, 0.75]);
  }
  for (const [x, r] of [[-0.8, 0.2], [-0.35, 0.16], [0.3, 0.2]]) m.cyl("jade", x, 0.56, 0.1, r, 0.34, 8, r * 0.7);
  m.box("wood", 0.9, 0.8, 0.1, 0.5, 0.4, 0.4);
  pieces["market-stall"] = m;
}

// A hand cart with two spoked wheels, a bed and shafts; the cart in Wen's side quest.
{
  const m = new Model("hand-cart");
  m.box("wood", 0, 0.8, 0, 2.2, 0.15, 1.3);
  for (const sz of [-1, 1]) m.box("wood_dark", 0, 1.05, sz * 0.62, 2.2, 0.4, 0.08);
  m.box("wood_dark", -1.05, 1.05, 0, 0.08, 0.4, 1.3);
  for (const sz of [-1, 1]) m.box("wood", 1.9, 0.78, sz * 0.5, 1.7, 0.08, 0.08);
  for (const sz of [-1, 1]) {
    m.disc("wood_dark", 0, 0.62, sz * 0.78, 0.62, 0.1);
    m.disc("wood", 0, 0.62, sz * 0.78 + sz * 0.06, 0.12, 0.06, 8);
  }
  m.box("wood", 0, 0.62, 0, 0.1, 0.1, 1.7);
  pieces["hand-cart"] = m;
}

// ---- Trees: low-poly, a few hundred triangles each (the old kit trees are eight thousand), so a forest costs a
// fraction of what it did. Deterministic jitter keeps each from looking like a copy of a cone.
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function pine(name, seed, height) {
  const m = new Model(name);
  const r = rng(seed);
  m.cyl("bark", 0, 0, 0, 0.32, height * 0.34, 7, 0.2);
  const tiers = 5;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const y = height * (0.18 + t * 0.62);
    const rad = (1 - t) * height * 0.26 + 0.35;
    m.cyl(k % 2 ? "pine_b" : "pine_a", (r() - 0.5) * 0.15, y, (r() - 0.5) * 0.15, rad * (0.92 + r() * 0.16), height * 0.3, 7, 0.04);
  }
  return m;
}
function broadleaf(name, seed, height, colours = ["leaf_a", "leaf_b", "leaf_c"]) {
  const m = new Model(name);
  const r = rng(seed);
  m.cyl("bark", 0, 0, 0, 0.36, height * 0.5, 7, 0.22);
  const blobs = 6;
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * Math.PI * 2 + r();
    const d = k === 0 ? 0 : height * 0.2 + r() * height * 0.06;
    m.sphere(colours[k % colours.length], Math.cos(a) * d, height * (0.58 + (k === 0 ? 0.2 : r() * 0.14)), Math.sin(a) * d, height * (0.2 + r() * 0.05), 7, 5, 0.85);
  }
  return m;
}
function bamboo(name, seed, height) {
  const m = new Model(name);
  const r = rng(seed);
  for (let k = 0; k < 6; k++) {
    const a = r() * Math.PI * 2, d = r() * 1.4, h = height * (0.7 + r() * 0.3);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    m.cyl("bamboo", x, 0, z, 0.07, h, 5);
    for (let n = 1; n < 4; n++) m.cyl("bamboo_node", x, (h * n) / 4, z, 0.095, 0.06, 5);
    m.cyl("leaf_c", x, h * 0.78, z, 0.5, h * 0.24, 5, 0.04);
  }
  return m;
}
pieces["pine-a"] = pine("pine-a", 3, 9);
pieces["pine-b"] = pine("pine-b", 7, 11);
pieces["oak-a"] = broadleaf("oak-a", 5, 8);
pieces["oak-b"] = broadleaf("oak-b", 11, 9.5);
pieces["blossom-tree"] = broadleaf("blossom-tree", 9, 7, ["blossom_a", "blossom_b", "blossom_a"]);
pieces["bamboo-clump"] = bamboo("bamboo-clump", 13, 7);

mkdirSync(outDir, { recursive: true });
for (const [name, model] of Object.entries(pieces)) {
  const file = join(outDir, `${name}.glb`);
  writeFileSync(file, model.glb());
  const tris = [...model.parts.values()].reduce((n, p) => n + p.i.length / 3, 0);
  console.log(`${name}.glb  ${tris} triangles`);
}

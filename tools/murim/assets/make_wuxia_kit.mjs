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
    const N = 14;
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
  // A quad seen from both sides (thin shells such as a bridge deck).
  quad2(m, a, b, c, d) {
    this.quad(m, a, b, c, d);
    this.quad(m, d, c, b, a);
  }
  // A single GLB with one primitive per material.
  glb() {
    const prims = [];
    const chunks = [];
    let offset = 0;
    const accessors = [];
    const views = [];
    const add = (arr, Type, target, extra) => {
      const buf = Buffer.from(new Type(arr).buffer);
      const pad = (4 - (buf.length % 4)) % 4;
      views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
      chunks.push(buf, Buffer.alloc(pad));
      offset += buf.length + pad;
      accessors.push({ bufferView: views.length - 1, componentType: Type === Uint16Array ? 5123 : Type === Uint32Array ? 5125 : 5126, count: extra.count, type: extra.type, ...(extra.min ? { min: extra.min, max: extra.max } : {}) });
      return accessors.length - 1;
    };
    const materials = [];
    for (const [name, part] of this.parts) {
      if (!part.i.length) continue;
      const xs = part.p.filter((_, k) => k % 3 === 0), ys = part.p.filter((_, k) => k % 3 === 1), zs = part.p.filter((_, k) => k % 3 === 2);
      const pos = add(part.p, Float32Array, 34962, { count: part.p.length / 3, type: "VEC3", min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] });
      const nor = add(part.n, Float32Array, 34962, { count: part.n.length / 3, type: "VEC3" });
      const idx = add(part.i, Uint32Array, 34963, { count: part.i.length, type: "SCALAR" });
      materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...hex(MATERIALS[name] ?? "#888888"), 1], metallicFactor: name === "gold" ? 0.6 : 0, roughnessFactor: name === "gold" ? 0.35 : 0.85 }, ...(name === "paper_glow" ? { emissiveFactor: hex("#f08a45").map((v) => v * 0.9) } : {}) });
      prims.push({ attributes: { POSITION: pos, NORMAL: nor }, indices: idx, material: materials.length - 1 });
    }
    const bin = Buffer.concat(chunks);
    const json = {
      asset: { version: "2.0", generator: "tools/murim/assets/make_wuxia_kit.mjs" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: this.name }],
      meshes: [{ name: this.name, primitives: prims }],
      materials,
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

mkdirSync(outDir, { recursive: true });
for (const [name, model] of Object.entries(pieces)) {
  const file = join(outDir, `${name}.glb`);
  writeFileSync(file, model.glb());
  const tris = [...model.parts.values()].reduce((n, p) => n + p.i.length / 3, 0);
  console.log(`${name}.glb  ${tris} triangles`);
}

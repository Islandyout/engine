// Makes the catalog's bamboo stand (assets/source/kit/nature/bamboo-stand.glb): a clump of tall culms, each a tapering, slightly curving
// eight-sided pole with node rings every 48 cm, green with a yellowing toward the base, and sprays of narrow leaves along its upper third.
// Vertex colours only (no images); leaves are double-sided blades, so a stand reads as bamboo from a few metres and costs about 3,500 triangles.
//
// Usage: node tools/models/make_bamboo.mjs <out dir>
import path from "node:path";
import { GlbWriter } from "./gltf_io.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: make_bamboo.mjs <out dir>");

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
// Two versions with the same culms (the same seed): near (LOD0) and a far one (LOD1, three-sided culms, a node every 1.4 m, fewer and larger
// leaf blades) for the scatter's distance switch.
let r, SIDES, SEGMENT, LEAF_STEP, BLADE;
let culm, leaf;

function addCulm(bx, bz, height, radius, leanX, leanZ) {
  const segments = Math.round(height / SEGMENT);
  const first = culm.pos.length / 3;
  const along = (t) => [bx + leanX * t * t * height, t * height, bz + leanZ * t * t * height];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const [cx, cy, cz] = along(t);
    const node = s % 2 === 0 && s > 0 && s < segments ? 1.1 : 1; // a ring at every other ring of vertices: a node every 36 cm
    const rad = radius * (1 - 0.55 * t) * node;
    // Old culms yellow at the foot, green higher up; the nodes are paler.
    const base = [0.32 + 0.18 * (1 - t), 0.46 + 0.08 * t, 0.16];
    const shade = node > 1 ? 1.18 : 0.95 + r() * 0.1;
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      culm.pos.push(cx + Math.cos(a) * rad, cy, cz + Math.sin(a) * rad);
      culm.nrm.push(Math.cos(a), 0, Math.sin(a));
      culm.col.push(...base.map((c) => Math.min(1, c * shade)), 1);
    }
  }
  for (let s = 0; s < segments; s++)
    for (let k = 0; k < SIDES; k++) {
      const a = first + s * SIDES + k, b = first + s * SIDES + ((k + 1) % SIDES);
      culm.idx.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  // Leaf sprays on the upper part: each spray is a fan of narrow, drooping blades.
  for (let s = Math.floor(segments * 0.45); s < segments; s += LEAF_STEP) {
    const [cx, cy, cz] = along(s / segments);
    const sprays = 1 + Math.floor(r() * 2);
    for (let p = 0; p < sprays; p++) {
      const dir = r() * Math.PI * 2;
      const twig = 0.3 + r() * 0.5;
      const sx = cx + Math.cos(dir) * twig, sz = cz + Math.sin(dir) * twig, sy = cy + twig * 0.3;
      for (let b = 0; b < 5; b++) {
        const a = dir + (b - 2) * 0.35 + (r() - 0.5) * 0.3;
        const length = (0.22 + r() * 0.14) * BLADE, width = 0.035 * BLADE;
        const droop = 0.12 + r() * 0.1;
        const dx = Math.cos(a), dz = Math.sin(a);
        const px = -dz, pz = dx;
        const first = leaf.pos.length / 3;
        const tipX = sx + dx * length, tipZ = sz + dz * length, tipY = sy - droop;
        const midX = sx + dx * length * 0.45, midZ = sz + dz * length * 0.45, midY = sy - droop * 0.3;
        leaf.pos.push(sx, sy, sz, midX + px * width, midY, midZ + pz * width, midX - px * width, midY, midZ - pz * width, tipX, tipY, tipZ);
        for (let v = 0; v < 4; v++) leaf.nrm.push(0, 1, 0);
        const g = 0.85 + r() * 0.3;
        for (let v = 0; v < 4; v++) leaf.col.push(0.22 * g, 0.42 * g, 0.12 * g, 1);
        leaf.idx.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
      }
    }
  }
}

function stand(sides, segment, leafStep, blade) {
  [r, SIDES, SEGMENT, LEAF_STEP, BLADE] = [rng(7), sides, segment, leafStep, blade];
  culm = { pos: [], nrm: [], col: [], idx: [] };
  leaf = { pos: [], nrm: [], col: [], idx: [] };
  const place = rng(11);
  for (let i = 0; i < 7; i++) {
    const a = place() * Math.PI * 2, d = Math.sqrt(place()) * 0.55;
    const height = 6.5 + place() * 4;
    addCulm(Math.cos(a) * d, Math.sin(a) * d, height, 0.035 + place() * 0.02, Math.cos(a) * (0.04 + place() * 0.06), Math.sin(a) * (0.04 + place() * 0.06));
  }
  return { culm, leaf };
}

const w = new GlbWriter("tools/models/make_bamboo.mjs");
const prim = (g, material) => {
  const p = new Float32Array(g.pos), n = new Float32Array(g.nrm), c = new Float32Array(g.col), i = new Uint16Array(g.idx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.length; k += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[k + a]);
      max[a] = Math.max(max[a], p[k + a]);
    }
  return {
    attributes: {
      POSITION: w.accessor(p, { componentType: 5126, count: p.length / 3, type: "VEC3", min, max }, 34962),
      NORMAL: w.accessor(n, { componentType: 5126, count: n.length / 3, type: "VEC3" }, 34962),
      COLOR_0: w.accessor(c, { componentType: 5126, count: c.length / 4, type: "VEC4" }, 34962),
    },
    indices: w.accessor(i, { componentType: 5123, count: i.length, type: "SCALAR" }, 34963),
    material,
  };
};
w.json.materials = [
  { name: "culm", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.55 } },
  { name: "leaves", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.75 } },
];
const near = stand(6, 0.24, 5, 1), far = stand(3, 1.4, 10, 2.2);
w.json.meshes = [
  { name: "bamboo-stand", primitives: [prim(near.culm, 0), prim(near.leaf, 1)] },
  { name: "bamboo-stand-far", primitives: [prim(far.culm, 0), prim(far.leaf, 1)] },
];
w.json.nodes = [{ mesh: 0, name: "LOD0" }, { mesh: 1, name: "LOD1" }];
w.json.scenes = [{ nodes: [0, 1] }];
w.json.scene = 0;
w.write(path.join(out, "bamboo-stand.glb"));
const tris = (g) => (g.culm.idx.length + g.leaf.idx.length) / 3;
console.log(`bamboo-stand: ${tris(near)} triangles, far ${tris(far)}`);

// Makes the catalog's grass tufts (assets/source/kit/nature/grass-*.glb): real blades, not cards. Each tuft is a handful of curved,
// tapered ribbons in a ring, dark at the root and pale at the tip (vertex colours), so a field of them reads as grass from a few
// metres and costs about two hundred triangles a tuft. The scatter's wind sway moves the tips (the vertex shader moves what is high).
//
// Usage: node tools/models/make_grass.mjs <out dir>
import path from "node:path";
import { GlbWriter } from "./gltf_io.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: make_grass.mjs <out dir>");

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// name, blade count, tuft height range (m), radius of the clump (m), root colour, tip colour
const KINDS = [
  { name: "meadow", blades: 28, height: [0.28, 0.5], radius: 0.16, root: [0.07, 0.16, 0.04], tip: [0.42, 0.58, 0.2], seed: 11 },
  { name: "tall", blades: 22, height: [0.55, 0.9], radius: 0.2, root: [0.08, 0.15, 0.04], tip: [0.55, 0.62, 0.26], seed: 23 },
  { name: "dry", blades: 24, height: [0.3, 0.6], radius: 0.18, root: [0.14, 0.12, 0.05], tip: [0.62, 0.52, 0.28], seed: 37 },
];
const SEGMENTS = 4;

for (const kind of KINDS) {
  const r = rng(kind.seed);
  const pos = [], nrm = [], col = [], idx = [];
  for (let b = 0; b < kind.blades; b++) {
    const angle = r() * Math.PI * 2;
    const dist = Math.sqrt(r()) * kind.radius;
    const bx = Math.cos(angle) * dist, bz = Math.sin(angle) * dist;
    const height = kind.height[0] + r() * (kind.height[1] - kind.height[0]);
    const width = 0.012 + r() * 0.016;
    const face = r() * Math.PI * 2; // which way the ribbon faces
    const lean = (0.15 + r() * 0.5) * (dist / kind.radius + 0.4); // blades at the edge lean out
    const dx = Math.cos(angle) * 0.8 + (r() - 0.5) * 0.6, dz = Math.sin(angle) * 0.8 + (r() - 0.5) * 0.6;
    const len = Math.hypot(dx, dz) || 1;
    const sx = Math.cos(face), sz = Math.sin(face); // across the ribbon
    const tint = 0.85 + r() * 0.3;
    const first = pos.length / 3;
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      const bend = lean * t * t * height; // curves further as it rises
      const cx = bx + (dx / len) * bend, cz = bz + (dz / len) * bend;
      const cy = height * t * (1 - 0.12 * t);
      const half = (width * (1 - t * 0.92)) / 2;
      for (const side of [-1, 1]) {
        pos.push(cx + sx * half * side, cy, cz + sz * half * side);
        // Lit from both sides by the double-sided material; the normal leans up so a field shades as one surface.
        nrm.push(-sz * 0.6, 0.6, sx * 0.6);
        col.push(...[0, 1, 2].map((k) => Math.min(1, (kind.root[k] + (kind.tip[k] - kind.root[k]) * t) * tint)), 1);
      }
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const a = first + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const p = new Float32Array(pos), n = new Float32Array(nrm), c = new Float32Array(col), i = new Uint16Array(idx);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.length; k += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[k + a]);
      max[a] = Math.max(max[a], p[k + a]);
    }
  const w = new GlbWriter("tools/models/make_grass.mjs");
  const attributes = {
    POSITION: w.accessor(p, { componentType: 5126, count: p.length / 3, type: "VEC3", min, max }, 34962),
    NORMAL: w.accessor(n, { componentType: 5126, count: n.length / 3, type: "VEC3" }, 34962),
    COLOR_0: w.accessor(c, { componentType: 5126, count: c.length / 4, type: "VEC4" }, 34962),
  };
  const index = w.accessor(i, { componentType: 5123, count: i.length, type: "SCALAR" }, 34963);
  w.json.materials = [{ name: "grass", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 } }];
  w.json.meshes = [{ name: `grass-${kind.name}`, primitives: [{ attributes, indices: index, material: 0 }] }];
  w.json.nodes = [{ mesh: 0, name: `grass-${kind.name}` }];
  w.json.scenes = [{ nodes: [0] }];
  w.json.scene = 0;
  w.write(path.join(out, `grass-${kind.name}.glb`));
  console.log(`grass-${kind.name}: ${i.length / 3} triangles`);
}

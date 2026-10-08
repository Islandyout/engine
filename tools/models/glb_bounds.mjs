// Prints each GLB's world-space bounding box (node transforms applied to every
// mesh's POSITION accessor min/max corners) in metres:
//   node tools/models/glb_bounds.mjs a.glb b.glb ...
// Length is the z extent (models face +z), width x, height y.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export function readGlbJson(file) {
  const buf = readFileSync(file);
  if (buf.toString("utf8", 0, 4) !== "glTF") throw new Error(`${file}: not a GLB`);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + len));
}

const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
export function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

export function boundsOf(json) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visit = (i, parent) => {
    const n = json.nodes[i];
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        const a = json.accessors[p.attributes.POSITION];
        for (let c = 0; c < 8; c++) {
          const corner = [0, 1, 2].map((k) => ((c >> k) & 1 ? a.max[k] : a.min[k]));
          const w = apply(m, corner);
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const scene = json.scenes[json.scene ?? 0];
  for (const r of scene.nodes) visit(r, ident());
  return { min, max };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("file".padEnd(28), "L(z)".padStart(7), "W(x)".padStart(7), "H(y)".padStart(7), "  minY   cx     cz     KB");
  for (const f of process.argv.slice(2)) {
    const { min, max } = boundsOf(readGlbJson(f));
    const f2 = (v) => v.toFixed(2).padStart(7);
    console.log(path.basename(f).padEnd(28), f2(max[2] - min[2]), f2(max[0] - min[0]), f2(max[1] - min[1]),
      f2(min[1]), f2((min[0] + max[0]) / 2), f2((min[2] + max[2]) / 2), String(Math.round(statSync(f).size / 1024)).padStart(6));
  }
}

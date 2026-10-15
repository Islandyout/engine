// Reading a GLB into baked triangle groups (every node transform applied to
// its vertices, one group per material), shared by the model importers.
import { readFileSync } from "node:fs";
import { mul4 } from "./fbx_io.mjs";

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function loadGlb(file) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binAt = 20 + jsonLen;
  const bin = buf.subarray(binAt + 8, binAt + 8 + buf.readUInt32LE(binAt));
  const view = (i) => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
  const read = (i) => {
    const a = json.accessors[i];
    const v = json.bufferViews[a.bufferView];
    const n = SIZE[a.type];
    const dv = new DataView(bin.buffer, bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0));
    const bytes = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 }[a.componentType];
    const stride = v.byteStride ?? n * bytes;
    const out = new Array(a.count * n);
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) {
        const p = k * stride + c * bytes;
        let x = { 5126: () => dv.getFloat32(p, true), 5125: () => dv.getUint32(p, true), 5123: () => dv.getUint16(p, true), 5122: () => dv.getInt16(p, true), 5121: () => dv.getUint8(p), 5120: () => dv.getInt8(p) }[a.componentType]();
        if (a.normalized) x = { 5123: x / 65535, 5121: x / 255, 5122: Math.max(x / 32767, -1), 5120: Math.max(x / 127, -1) }[a.componentType] ?? x;
        out[k * n + c] = x;
      }
    return out;
  };
  const nodeMatrix = (n) => {
    if (n.matrix) return n.matrix.slice();
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const materials = (json.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const out = { name: m.name ?? "material", color: (pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3) };
    if (pbr.baseColorTexture) {
      const image = json.images[json.textures[pbr.baseColorTexture.index].source];
      out.image = { bytes: Buffer.from(view(image.bufferView)), mimeType: image.mimeType, name: image.name };
    }
    return out;
  });
  const groups = new Map();
  const group = (k) => groups.get(k) ?? groups.set(k, { positions: [], normals: [], uvs: [] }).get(k);
  let hasUv = false;
  const visit = (i, parent) => {
    const n = json.nodes[i];
    const m = mul4(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
      for (const prim of json.meshes[n.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) throw new Error(`${file}: only triangle lists`);
        const pos = read(prim.attributes.POSITION);
        const nor = prim.attributes.NORMAL !== undefined ? read(prim.attributes.NORMAL) : null;
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? read(prim.attributes.TEXCOORD_0) : null;
        if (uv) hasUv = true;
        const idx = prim.indices !== undefined ? read(prim.indices) : [...Array(pos.length / 3).keys()];
        const g = group(prim.material ?? -1);
        // normals: inverse-transpose; for the rotation+uniform-or-axis scale nodes here, scaling by 1/s per axis in local space is the same
        const P = (k) => { const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; };
        const N = (k) => {
          const inv = (c) => 1 / (Math.hypot(m[c * 4], m[c * 4 + 1], m[c * 4 + 2]) ** 2);
          const x = nor[k * 3] * inv(0), y = nor[k * 3 + 1] * inv(1), z = nor[k * 3 + 2] * inv(2);
          const r = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
          const l = Math.hypot(...r) || 1;
          return r.map((v) => v / l);
        };
        for (let t = 0; t < idx.length; t += 3) {
          const tri = det < 0 ? [idx[t], idx[t + 2], idx[t + 1]] : [idx[t], idx[t + 1], idx[t + 2]];
          let faceN = null;
          if (!nor) {
            const [a, b, c] = tri.map(P);
            const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const l = Math.hypot(...cr) || 1;
            faceN = cr.map((v) => v / l);
          }
          for (const k of tri) {
            g.positions.push(...P(k));
            g.normals.push(...(nor ? N(k) : faceN));
            g.uvs.push(...(uv ? [uv[k * 2], uv[k * 2 + 1]] : [0, 0]));
          }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  for (const r of json.scenes[json.scene ?? 0].nodes) visit(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  if (groups.has(-1)) { materials.push({ name: "default", color: [0.8, 0.8, 0.8] }); groups.set(materials.length - 1, groups.get(-1)); groups.delete(-1); }
  return { materials, groups, hasUv };
}

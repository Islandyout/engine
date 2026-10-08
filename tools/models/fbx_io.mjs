// A small reader for binary FBX (7.x) static meshes, for the model tools.
// It returns triangles in the file's world space (node transforms applied),
// grouped by material, with per-corner normals and UVs when the file has them.
// Enough for the Blender-exported low-poly packs the import tools use: no
// skins, no animation, no NURBS, no pivots other than the plain Lcl/Pre/Geometric ones.
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

function parseNodes(buf) {
  if (buf.toString("latin1", 0, 20) !== "Kaydara FBX Binary  ") throw new Error("not a binary FBX");
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;
  const u = (o) => (wide ? Number(buf.readBigUInt64LE(o)) : buf.readUInt32LE(o));
  const headerLen = wide ? 25 : 13;
  const readProp = (o) => {
    const t = String.fromCharCode(buf[o]);
    o += 1;
    switch (t) {
      case "Y": return [buf.readInt16LE(o), o + 2];
      case "C": return [buf[o] !== 0, o + 1];
      case "I": return [buf.readInt32LE(o), o + 4];
      case "F": return [buf.readFloatLE(o), o + 4];
      case "D": return [buf.readDoubleLE(o), o + 8];
      case "L": return [buf.readBigInt64LE(o), o + 8];
      case "S": case "R": {
        const n = buf.readUInt32LE(o);
        const s = buf.subarray(o + 4, o + 4 + n);
        return [t === "S" ? s.toString("utf8") : s, o + 4 + n];
      }
      case "f": case "d": case "l": case "i": case "b": {
        const count = buf.readUInt32LE(o), enc = buf.readUInt32LE(o + 4), clen = buf.readUInt32LE(o + 8);
        let data = buf.subarray(o + 12, o + 12 + clen);
        if (enc === 1) data = zlib.inflateSync(data);
        const size = { f: 4, d: 8, l: 8, i: 4, b: 1 }[t];
        const out = new Array(count);
        for (let k = 0; k < count; k++) {
          const p = k * size;
          out[k] = t === "f" ? data.readFloatLE(p) : t === "d" ? data.readDoubleLE(p) : t === "i" ? data.readInt32LE(p) : t === "l" ? Number(data.readBigInt64LE(p)) : data[p];
        }
        return [out, o + 12 + clen];
      }
      default: throw new Error(`FBX property type ${t} at ${o - 1}`);
    }
  };
  const readNode = (o) => {
    const end = u(o), nprops = u(o + (wide ? 8 : 4)), nameLen = buf[o + (wide ? 24 : 12)];
    if (end === 0) return [null, o + headerLen];
    const name = buf.toString("latin1", o + headerLen, o + headerLen + nameLen);
    let p = o + headerLen + nameLen;
    const props = [];
    for (let k = 0; k < nprops; k++) { const [v, q] = readProp(p); props.push(v); p = q; }
    const children = [];
    while (p < end) {
      const [child, q] = readNode(p);
      p = q;
      if (!child) break;
      children.push(child);
    }
    return [{ name, props, children }, end];
  };
  const top = [];
  let o = 27;
  while (o < buf.length - headerLen) {
    const [n, q] = readNode(o);
    if (!n) break;
    top.push(n);
    o = q;
  }
  return { version, top };
}

const child = (n, name) => n.children.find((c) => c.name === name);
const children = (n, name) => n.children.filter((c) => c.name === name);
function props70(n) {
  const out = {};
  const p = n && child(n, "Properties70");
  for (const c of p?.children ?? []) out[c.props[0]] = c.props.slice(4);
  return out;
}

// 4x4 column-major helpers.
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul4(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const T4 = ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const S4 = ([x, y, z]) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
// FBX Euler angles in degrees, default order XYZ: x is applied first (R = Rz * Ry * Rx).
function R4([x, y, z]) {
  const r = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x * r), Math.sin(x * r), Math.cos(y * r), Math.sin(y * r), Math.cos(z * r), Math.sin(z * r)];
  const Rx = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];
  const Ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
  const Rz = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return mul4(Rz, mul4(Ry, Rx));
}
export const apply4 = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

// Layer element values per polygon-vertex corner.
function layerValues(el, valuesName, indexName, width, polyIndexOfCorner, vertexOfCorner) {
  if (!el) return null;
  const mapping = child(el, "MappingInformationType")?.props[0];
  const ref = child(el, "ReferenceInformationType")?.props[0];
  const values = child(el, valuesName)?.props[0];
  const index = child(el, indexName)?.props[0];
  if (!values) return null;
  return (corner) => {
    let k;
    if (mapping === "ByPolygonVertex") k = corner;
    else if (mapping === "ByVertice" || mapping === "ByVertex") k = vertexOfCorner(corner);
    else if (mapping === "ByPolygon") k = polyIndexOfCorner(corner);
    else if (mapping === "AllSame") k = 0;
    else throw new Error(`FBX mapping ${mapping}`);
    if (ref === "IndexToDirect" || ref === "Index") k = index[k];
    return values.slice(k * width, k * width + width);
  };
}

// Returns { materials: [{ name, color: [r,g,b] }], groups: Map(materialIndex -> {positions, normals, uvs}) , up }
export function loadFbx(file) {
  const { top, version } = parseNodes(readFileSync(file));
  const objects = top.find((n) => n.name === "Objects");
  const connections = top.find((n) => n.name === "Connections");
  const byId = new Map();
  for (const o of objects.children) byId.set(Number(o.props[0]), o);
  const parentsOf = new Map(), childrenOf = new Map();
  for (const c of connections.children) {
    if (c.props[0] !== "OO") continue;
    const ch = Number(c.props[1]), pa = Number(c.props[2]);
    (parentsOf.get(ch) ?? parentsOf.set(ch, []).get(ch)).push(pa);
    (childrenOf.get(pa) ?? childrenOf.set(pa, []).get(pa)).push(ch);
  }
  const localOf = (model) => {
    const p = props70(model);
    const t = p["Lcl Translation"] ?? [0, 0, 0], r = p["Lcl Rotation"] ?? [0, 0, 0], s = p["Lcl Scaling"] ?? [1, 1, 1];
    const pre = p.PreRotation ?? [0, 0, 0], post = p.PostRotation ?? [0, 0, 0];
    if (p.RotationOrder && p.RotationOrder[0] !== 0) throw new Error(`${file}: rotation order ${p.RotationOrder[0]} not supported`);
    if (p.RotationPivot?.some((v) => v) || p.ScalingPivot?.some((v) => v)) throw new Error(`${file}: pivots not supported`);
    const postInv = [...R4(post)]; // inverse of a rotation is its transpose
    const pi = [postInv[0], postInv[4], postInv[8], 0, postInv[1], postInv[5], postInv[9], 0, postInv[2], postInv[6], postInv[10], 0, 0, 0, 0, 1];
    return mul4(T4(t), mul4(R4(pre), mul4(R4(r), mul4(pi, S4(s)))));
  };
  const worldOf = (id) => {
    const model = byId.get(id);
    if (!model || model.name !== "Model") return I4();
    const parent = (parentsOf.get(id) ?? []).find((p) => byId.get(p)?.name === "Model");
    return mul4(parent !== undefined ? worldOf(parent) : I4(), localOf(model));
  };
  const materials = [];
  const materialIndex = new Map();
  const matOf = (id) => {
    if (!materialIndex.has(id)) {
      const m = byId.get(id);
      const p = props70(m);
      const color = p.DiffuseColor ?? p.Diffuse ?? [0.8, 0.8, 0.8];
      const f = p.DiffuseFactor?.[0] ?? 1;
      materialIndex.set(id, materials.length);
      materials.push({ name: m.props[1].split("\u0000")[0], color: color.slice(0, 3).map((v) => v * f) });
    }
    return materialIndex.get(id);
  };
  const groups = new Map();
  const group = (k) => groups.get(k) ?? groups.set(k, { positions: [], normals: [], uvs: [] }).get(k);
  let hasUv = false;
  for (const [id, geom] of byId) {
    if (geom.name !== "Geometry" || geom.props[2] !== "Mesh") continue;
    for (const modelId of parentsOf.get(id) ?? []) {
      const model = byId.get(modelId);
      if (model?.name !== "Model") continue;
      const p = props70(model);
      const geo = mul4(T4(p.GeometricTranslation ?? [0, 0, 0]), mul4(R4(p.GeometricRotation ?? [0, 0, 0]), S4(p.GeometricScaling ?? [1, 1, 1])));
      const world = mul4(worldOf(modelId), geo);
      // normal matrix: inverse transpose of the upper 3x3
      const m = world;
      const a = [m[0], m[1], m[2]], b = [m[4], m[5], m[6]], c = [m[8], m[9], m[10]];
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const bc = cross(b, c), ca = cross(c, a), ab = cross(a, b);
      const det = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2];
      // (M^-1)^T n: the rows of M^-1 are bc, ca, ab (over det), so its transpose takes them as columns.
      const nrm = (n) => { const v = [0, 1, 2].map((i) => (bc[i] * n[0] + ca[i] * n[1] + ab[i] * n[2]) / det); const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
      const flip = det < 0;
      const mats = (childrenOf.get(modelId) ?? []).filter((cid) => byId.get(cid)?.name === "Material").map(matOf);
      const verts = child(geom, "Vertices").props[0];
      const pvi = child(geom, "PolygonVertexIndex").props[0];
      const vertexOfCorner = (k) => (pvi[k] < 0 ? ~pvi[k] : pvi[k]);
      const polyOfCorner = new Int32Array(pvi.length);
      let poly = 0;
      for (let k = 0; k < pvi.length; k++) { polyOfCorner[k] = poly; if (pvi[k] < 0) poly++; }
      const polyIdx = (k) => polyOfCorner[k];
      const normal = layerValues(child(geom, "LayerElementNormal"), "Normals", "NormalsIndex", 3, polyIdx, vertexOfCorner);
      const uv = layerValues(child(geom, "LayerElementUV"), "UV", "UVIndex", 2, polyIdx, vertexOfCorner);
      if (uv) hasUv = true;
      const matEl = child(geom, "LayerElementMaterial");
      const matMap = matEl && child(matEl, "MappingInformationType")?.props[0];
      const matArr = matEl && child(matEl, "Materials")?.props[0];
      let start = 0;
      for (let k = 0; k < pvi.length; k++) {
        if (pvi[k] >= 0) continue;
        const corners = [];
        for (let q = start; q <= k; q++) corners.push(q);
        const pIndex = polyOfCorner[k];
        const local = matArr ? (matMap === "AllSame" ? matArr[0] : matArr[pIndex]) : 0;
        const g = group(mats.length ? mats[local] ?? mats[0] : -1);
        const P = (q) => { const v = vertexOfCorner(q); return apply4(world, [verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]]); };
        let faceN = null;
        for (let t = 1; t + 1 < corners.length; t++) {
          let tri = [corners[0], corners[t], corners[t + 1]];
          if (flip) tri = [tri[0], tri[2], tri[1]];
          if (!normal && !faceN) {
            const [p0, p1, p2] = tri.map(P);
            const n = cross([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]);
            const l = Math.hypot(...n) || 1;
            faceN = n.map((x) => x / l);
          }
          for (const q of tri) {
            g.positions.push(...P(q));
            g.normals.push(...(normal ? nrm(normal(q)) : faceN));
            g.uvs.push(...(uv ? uv(q) : [0, 0]));
          }
        }
        start = k + 1;
      }
    }
  }
  if (groups.has(-1)) {
    materials.push({ name: "default", color: [0.8, 0.8, 0.8] });
    groups.set(materials.length - 1, groups.get(-1));
    groups.delete(-1);
  }
  const gs = top.find((n) => n.name === "GlobalSettings");
  const g = props70(gs);
  return { version, materials, groups, hasUv, axes: { up: g.UpAxis?.[0], upSign: g.UpAxisSign?.[0], front: g.FrontAxis?.[0], frontSign: g.FrontAxisSign?.[0], unit: g.UnitScaleFactor?.[0] } };
}

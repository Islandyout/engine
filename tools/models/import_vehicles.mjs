// Imports the CC0 vehicle models in VEHICLES below into assets/source/kit/vehicles/
// as single self-contained GLBs, baked to real-world metres for the editor:
//   - every node transform (and an FBX file's own axis/unit setup) is baked into
//     the vertices, so each file is one node, one mesh, one primitive per material;
//   - the model is turned so its front faces +z (three.js / glTF forward, like the
//     existing kit vehicles), uniformly scaled to the target length for its type,
//     and, where the source's toy-wide body would come out wider than a real
//     vehicle of that length, squeezed across x only (x never touches the wheels'
//     side profile, so wheels stay round);
//   - it is centred on x/z with its lowest point (the tyres) on y = 0.
// It checks each source file's SHA-256 against the one recorded here (the hashes
// in assets/CREDITS.md) before converting, and prints each output's bounding box.
//
// Usage (from the repository root), with the four source repositories cloned at the
// commits named in assets/CREDITS.md:
//   node tools/models/import_vehicles.mjs \
//     --src rgsdev=<coderKillo/jam-20sec-2025> \
//     --src quaternius=<beep2bleep/FreeAssetsByKenneyNLandQuaternius> \
//     --src carsbundle=<schulerj89/vanta-city> \
//     --src worldexplorer=<RRG314/WorldExplorer3D> \
//     [--out <dir>] [--only <name,...>]
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFbx, mul4 } from "./fbx_io.mjs";
import { GlbWriter } from "./gltf_io.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RGS = "assets/models/Free Low Poly Vehicles Pack by Rgsdev";
const QPT = "FreeModels by Quaternius[Patreon]/Vehicles/Public Transport Pack - Feb 2017/FBX";
const QCARS = "public/assets/vehicles/quaternius-cars";
const WEX = "app/assets/models/vehicles/traffic";

// length: target bumper-to-bumper length in metres; width: the most it may be across
// (mirrors included) before x is squeezed; yaw: degrees about +y to turn the front to +z;
// colors: fills for materials the source left untinted.
const VEHICLES = [
  // Quaternius, Cars Bundle (the Nov 2018 "Realistic Car Pack"), as downloaded from Poly Pizza.
  { name: "sedan-family", src: "carsbundle", file: `${QCARS}/family-sedan.glb`, sha256: "bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462", length: 4.7, width: 1.95 },
  { name: "compact-wagon", src: "carsbundle", file: `${QCARS}/compact-wagon.glb`, sha256: "e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39", length: 4.1, width: 1.85 },
  { name: "coupe", src: "carsbundle", file: `${QCARS}/sports-car.glb`, sha256: "2878182e9a17b809d45b0a184f51560eab755b2d7e3058bf02acbd5fcd0ca78b", length: 4.5, width: 1.95 },
  { name: "sports-gt", src: "carsbundle", file: `${QCARS}/sport-coupe.glb`, sha256: "bbb1c718d2aaf5f4344e9fb2cd66d8332a998a515b09ddd4dfa14698d787124e", length: 4.6, width: 1.95 },
  { name: "suv-crossover", src: "carsbundle", file: `${QCARS}/suv.glb`, sha256: "1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6", length: 4.7, width: 1.95 },
  { name: "taxi-sedan", src: "carsbundle", file: `${QCARS}/taxi-sedan.glb`, sha256: "14b2f982f8a501565702ecb56f917c82e9abae914fa3f76d2f622a8670598af1", length: 4.7, width: 1.95 },
  // Quaternius, Truck (from the Zombie Apocalypse Kit), as downloaded from Poly Pizza.
  { name: "step-van", src: "worldexplorer", file: `${WEX}/service-truck-v1.glb`, sha256: "a5d107b5b06f8ca2d8d7e66ae6309f2e1a25cac577c5db8ebb661b3f0ca5ed8f", length: 6.0, width: 2.3 },
  // Quaternius, Public Transport Pack (Feb 2017): the two bicycles. The pack's FBX left
  // every material at Blender's default grey, so they get fills here; they face -z.
  { name: "bicycle", src: "quaternius", file: `${QPT}/Bicycle.fbx`, sha256: "bffdb5f8155338ed898d38bf1e40b1ed383a0f49f420994d588f0d56ee1d113c", length: 1.75, width: 0.65, yaw: 180, colors: { Bike: [0.6, 0.05, 0.04], Handle: [0.03, 0.03, 0.03], Wheel: [0.02, 0.02, 0.02], "Material.003": [0.3, 0.3, 0.32] } },
  { name: "bicycle-city", src: "quaternius", file: `${QPT}/SquareFrameBicycle.fbx`, sha256: "6cc459d81128671c11e3196fd0a412497d477456deea494e3f6a29fc70cd0a3d", length: 1.75, width: 0.65, yaw: 180, colors: { "Material.001": [0.08, 0.2, 0.42], "Material.005": [0.03, 0.03, 0.03], "Material.002": [0.02, 0.02, 0.02], "Material.003": [0.25, 0.14, 0.07] } },
  // Rgsdev, Free Low Poly Vehicles Pack.
  { name: "firetruck", src: "rgsdev", file: `${RGS}/Firetruck/Firetruck.fbx`, sha256: "dd1ba5cacee2277b6ccbdb51cd146d6fa5378a421f7320348ee87e6ef26115d6", length: 8.5, width: 2.5 },
  { name: "coach-bus", src: "rgsdev", file: `${RGS}/Bus/Bus.fbx`, sha256: "16264ba9cdc251b2603dbe6b0cec125cec6a329d6845914d545327eda0ed8462", length: 12.0, width: 2.5 },
  { name: "ambulance-van", src: "rgsdev", file: `${RGS}/Ambulance/Ambulance.fbx`, sha256: "c5a6716d93df86f39ce7a1f6f344a67848f62ab556119ccf02c44f3785ff0ced", length: 5.9, width: 2.1 },
  { name: "panel-van", src: "rgsdev", file: `${RGS}/Van/Van.fbx`, sha256: "2e05fe145a8d525e9105816ee953f39c9cd66a914eecbbe2a4a8182673a31479", length: 5.0, width: 2.0 },
  { name: "roadster", src: "rgsdev", file: `${RGS}/Roadster/Roadster.fbx`, sha256: "93174d07fb41526fdf16c38c6e06219d4e8d97c7841fcc62fd11c460aa987233", length: 4.0, width: 1.8 },
  { name: "limousine", src: "rgsdev", file: `${RGS}/Limousine/Limousine.fbx`, sha256: "3ed083da97f91aa09ee526aac70192ddeadfede93769e9c3e59d19e3e70bd533", length: 6.4, width: 1.95 },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ---- GLB source -------------------------------------------------------------
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function loadGlb(file) {
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

// ---- normalise and write ------------------------------------------------------
function convert(spec, source, outFile) {
  const model = source.endsWith(".fbx") ? loadFbx(source) : loadGlb(source);
  const groups = [...model.groups.entries()].filter(([, g]) => g.positions.length);
  // yaw about +y
  const yaw = ((spec.yaw ?? 0) * Math.PI) / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const orient = ([x, y, z]) => [cy * x + sy * z, y, -sy * x + cy * z];
  for (const [, g] of groups)
    for (const key of ["positions", "normals"])
      for (let i = 0; i < g[key].length; i += 3) g[key].splice(i, 3, ...orient(g[key].slice(i, i + 3)));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const [, g] of groups)
    for (let i = 0; i < g.positions.length; i += 3)
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], g.positions[i + k]); max[k] = Math.max(max[k], g.positions[i + k]); }
  const s = spec.length / (max[2] - min[2]);
  const sx = Math.min(s, spec.width / (max[0] - min[0]));
  const scale = [sx, s, s];
  const centre = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];

  const w = new GlbWriter("GATEBREAKER tools/models/import_vehicles.mjs");
  const json = w.json;
  json.materials = [];
  json.meshes = [{ name: spec.name, primitives: [] }];
  json.nodes = [{ name: spec.name, mesh: 0 }];
  json.scenes = [{ nodes: [0] }];
  json.scene = 0;
  const imageIndex = new Map();
  for (const [mi, g] of groups) {
    const mat = model.materials[mi];
    const color = spec.colors?.[mat.name] ?? mat.color;
    const material = { name: mat.name, pbrMetallicRoughness: { baseColorFactor: [...color.map((c) => Math.min(1, Math.max(0, c))), 1], metallicFactor: 0, roughnessFactor: 0.8 } };
    const textured = Boolean(mat.image) && model.hasUv;
    if (textured) {
      if (!imageIndex.has(mat.image.bytes)) {
        json.images ??= [];
        json.textures ??= [];
        json.samplers ??= [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
        json.images.push({ name: mat.image.name, bufferView: w.view(mat.image.bytes), mimeType: mat.image.mimeType });
        json.textures.push({ sampler: 0, source: json.images.length - 1 });
        imageIndex.set(mat.image.bytes, json.textures.length - 1);
      }
      material.pbrMetallicRoughness.baseColorTexture = { index: imageIndex.get(mat.image.bytes) };
    }
    json.materials.push(material);
    // weld identical corners
    const keyOf = new Map();
    const P = [], N = [], T = [], idx = [];
    for (let c = 0; c < g.positions.length / 3; c++) {
      const p = [0, 1, 2].map((k) => (g.positions[c * 3 + k] - centre[k]) * scale[k]);
      let n = [0, 1, 2].map((k) => g.normals[c * 3 + k] / scale[k]);
      const l = Math.hypot(...n) || 1;
      n = n.map((v) => v / l);
      const t = textured ? [g.uvs[c * 2], g.uvs[c * 2 + 1]] : [];
      const key = [...p.map((v) => v.toFixed(5)), ...n.map((v) => v.toFixed(4)), ...t.map((v) => v.toFixed(5))].join(",");
      if (!keyOf.has(key)) { keyOf.set(key, P.length / 3); P.push(...p); N.push(...n); T.push(...t); }
      idx.push(keyOf.get(key));
    }
    const pos = new Float32Array(P), nor = new Float32Array(N);
    const pmin = [0, 1, 2].map((k) => Math.min(...P.filter((_, i) => i % 3 === k)));
    const pmax = [0, 1, 2].map((k) => Math.max(...P.filter((_, i) => i % 3 === k)));
    const count = P.length / 3;
    const attributes = {
      POSITION: w.accessor(pos, { componentType: 5126, count, type: "VEC3", min: pmin, max: pmax }, 34962),
      NORMAL: w.accessor(nor, { componentType: 5126, count, type: "VEC3" }, 34962),
    };
    if (textured) attributes.TEXCOORD_0 = w.accessor(new Float32Array(T), { componentType: 5126, count, type: "VEC2" }, 34962);
    const indexArray = count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    const indices = w.accessor(indexArray, { componentType: count > 65535 ? 5125 : 5123, count: idx.length, type: "SCALAR" }, 34963);
    json.meshes[0].primitives.push({ attributes, indices, material: json.materials.length - 1 });
  }
  w.write(outFile);
  const out = readFileSync(outFile);
  const bmin = [0, 1, 2].map((k) => (min[k] - centre[k]) * scale[k]), bmax = [0, 1, 2].map((k) => (max[k] - centre[k]) * scale[k]);
  return { size: out.length, sha256: sha256(out), L: bmax[2] - bmin[2], W: bmax[0] - bmin[0], H: bmax[1] - bmin[1], squeezed: sx < s };
}

// ---- main -----------------------------------------------------------------------
const args = process.argv.slice(2);
const srcs = {};
let outDir = path.join(ROOT, "assets/source/kit/vehicles");
let only = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--src") { const [k, v] = args[++i].split("="); srcs[k] = v; }
  else if (args[i] === "--out") outDir = args[++i];
  else if (args[i] === "--only") only = new Set(args[++i].split(","));
  else throw new Error(`unknown argument ${args[i]}`);
}
mkdirSync(outDir, { recursive: true });
console.log("name".padEnd(20), "L m".padStart(6), "W m".padStart(6), "H m".padStart(6), "   KB  sha256 (source -> result)");
for (const spec of VEHICLES) {
  if (only && !only.has(spec.name)) continue;
  if (!srcs[spec.src]) throw new Error(`--src ${spec.src}=<dir> is needed for ${spec.name}`);
  const source = path.join(srcs[spec.src], spec.file);
  const srcHash = sha256(readFileSync(source));
  if (srcHash !== spec.sha256) throw new Error(`${spec.name}: ${spec.file} has SHA-256 ${srcHash}, expected ${spec.sha256}`);
  const r = convert(spec, source, path.join(outDir, `${spec.name}.glb`));
  console.log(spec.name.padEnd(20), r.L.toFixed(2).padStart(6), r.W.toFixed(2).padStart(6), r.H.toFixed(2).padStart(6), String(Math.round(r.size / 1024)).padStart(5), ` ${srcHash} -> ${r.sha256}${r.squeezed ? "  (x squeezed)" : ""}`);
}

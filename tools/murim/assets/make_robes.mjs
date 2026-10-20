// Robed-body gear for Azure Cloud Sect: a long skirt-robe, an outer robe and three hairstyles/hats, all skinned to the
// people rig (the same 65 bones as gear-body.glb) so world.wear can put them on any character.
//   node tools/murim/assets/make_robes.mjs
// The robes are the kit's trousers and body pieces, flared outward and lengthened (they keep the leg and spine
// weights, so the cloth follows the stride); the hair and hat are small domes weighted to the Head bone.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlbWriter } from "../../models/gltf_io.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const KIT = path.join(ROOT, "assets/source/kit/people");
const TYPED = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function loadGlb(file) {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.toString("utf8", 20, 20 + jl));
  const bl = b.readUInt32LE(20 + jl);
  const bin = b.subarray(28 + jl, 28 + jl + bl);
  const read = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = TYPED[a.componentType];
    const o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const s = bin.subarray(o, o + a.count * SIZE[a.type] * T.BYTES_PER_ELEMENT);
    return { array: new T(s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength)), accessor: a };
  };
  return { json, read };
}

// A mesh as plain arrays: [{ pos, nor, joints, weights, index }] merged into one primitive.
function readPieces(file) {
  const g = loadGlb(file);
  const merged = { pos: [], nor: [], joints: [], weights: [], index: [] };
  for (const mesh of g.json.meshes)
    for (const p of mesh.primitives) {
      const base = merged.pos.length / 3;
      merged.pos.push(...g.read(p.attributes.POSITION).array);
      merged.nor.push(...g.read(p.attributes.NORMAL).array);
      merged.joints.push(...g.read(p.attributes.JOINTS_0).array);
      merged.weights.push(...g.read(p.attributes.WEIGHTS_0).array);
      for (const i of g.read(p.indices).array) merged.index.push(i + base);
    }
  return { g, merged };
}

function write(name, g, mesh) {
  const out = new GlbWriter("tools/murim/assets/make_robes.mjs");
  const json = out.json;
  json.nodes = g.json.nodes.map(({ ...n }) => n);
  json.scenes = g.json.scenes;
  json.scene = g.json.scene ?? 0;
  json.materials = [{ name: "Gear", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } }];
  const count = mesh.pos.length / 3;
  const f = (arr, type) => out.accessor(new Float32Array(arr), { componentType: 5126, count, type }, 34962);
  const colours = new Float32Array(count * 4).fill(1);
  json.meshes = [{
    name,
    primitives: [{
      attributes: {
        POSITION: out.accessor(new Float32Array(mesh.pos), { componentType: 5126, count, type: "VEC3", min: [0, 0, 0].map((_, k) => Math.min(...mesh.pos.filter((__, i) => i % 3 === k))), max: [0, 0, 0].map((_, k) => Math.max(...mesh.pos.filter((__, i) => i % 3 === k))) }, 34962),
        NORMAL: f(mesh.nor, "VEC3"),
        JOINTS_0: out.accessor(new Uint16Array(mesh.joints), { componentType: 5123, count, type: "VEC4" }, 34962),
        WEIGHTS_0: f(mesh.weights, "VEC4"),
        COLOR_0: out.accessor(colours, { componentType: 5126, count, type: "VEC4" }, 34962),
      },
      indices: out.accessor(new Uint32Array(mesh.index), { componentType: 5125, count: mesh.index.length, type: "SCALAR" }, 34963),
      material: 0,
    }],
  }];
  // The skin node (the first node that referenced one) points at the new mesh.
  const holder = json.nodes.find((n) => n.skin !== undefined);
  for (const n of json.nodes) delete n.mesh;
  holder.mesh = 0;
  json.skins = g.json.skins.map((skin) => {
    const r = g.read(skin.inverseBindMatrices);
    return { ...skin, inverseBindMatrices: out.accessor(r.array, r.accessor) };
  });
  const file = path.join(KIT, name);
  out.write(file);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

const legs = readPieces(path.join(KIT, "gear-legs.glb"));
const body = readPieces(path.join(KIT, "gear-body.glb"));
const jointIndex = (g, name) => g.json.nodes.length && g.json.skins[0].joints.findIndex((j) => g.json.nodes[j].name === name);

// Radial flare about the body axis, with the hem carried lower.
function flare(m, { yTop, yHem, widen, drop, axisZ = -0.04 }) {
  const out = { ...m, pos: m.pos.slice(), nor: m.nor.slice() };
  for (let i = 0; i < out.pos.length; i += 3) {
    const y = out.pos[i + 1];
    const t = Math.max(0, Math.min(1, (yTop - y) / (yTop - yHem)));
    const s = 1.1 + widen * t * t;
    out.pos[i] *= s;
    out.pos[i + 2] = axisZ + (out.pos[i + 2] - axisZ) * s;
    out.pos[i + 1] = y - (y < yTop ? drop * t : 0);
  }
  return out;
}

// A skirt hangs from the hips: most of each vertex's weight moves to the pelvis, so it sways less than the legs do.
function hang(m, share) {
  const pelvis = jointIndex(legs.g, "pelvis");
  const out = { ...m, joints: m.joints.slice(), weights: m.weights.slice() };
  for (let v = 0; v < out.joints.length / 4; v++) {
    const at = v * 4;
    for (let k = 0; k < 4; k++) out.weights[at + k] *= 1 - share;
    let slot = -1;
    for (let k = 0; k < 4; k++) if (out.joints[at + k] === pelvis && out.weights[at + k] > 0) slot = k;
    if (slot < 0) { slot = 0; for (let k = 1; k < 4; k++) if (out.weights[at + k] < out.weights[at + slot]) slot = k; out.weights[at + slot] = 0; out.joints[at + slot] = pelvis; }
    out.weights[at + slot] += share;
  }
  return out;
}
write("gear-skirt.glb", legs.g, hang(flare(legs.merged, { yTop: 1.0, yHem: 0.45, widen: 0.7, drop: 0.3 }), 0.65));
write("gear-robe.glb", body.g, flare(body.merged, { yTop: 1.5, yHem: 0.92, widen: 0.28, drop: 0.12 }));

// Head: bind-pose position of the Head joint, from its inverse bind matrix.
const ibm = legs.g.read(legs.g.json.skins[0].inverseBindMatrices).array;
const hi = jointIndex(legs.g, "Head");
const m = ibm.slice(hi * 16, hi * 16 + 16);
const head = [0, 1, 2].map((r) => -(m[r * 4 + 0] * m[12] + m[r * 4 + 1] * m[13] + m[r * 4 + 2] * m[14]));
console.log("head joint at", head.map((v) => +v.toFixed(3)));

// A dome/ellipsoid weighted fully to the Head joint.
function blob(cx, cy, cz, rx, ry, rz, { keep = () => true, lat = 10, lon = 16 } = {}) {
  const pos = [], nor = [], index = [];
  for (let a = 0; a <= lat; a++) {
    const th = (a / lat) * Math.PI;
    for (let b = 0; b <= lon; b++) {
      const ph = (b / lon) * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      pos.push(cx + nx * rx, cy + ny * ry, cz + nz * rz);
      nor.push(nx, ny, nz);
    }
  }
  const kept = [];
  for (let a = 0; a < lat; a++)
    for (let b = 0; b < lon; b++) {
      const i0 = a * (lon + 1) + b, i1 = i0 + 1, i2 = i0 + lon + 1, i3 = i2 + 1;
      const [x, y, z] = [0, 1, 2].map((k) => (nor[i0 * 3 + k] + nor[i3 * 3 + k]) / 2);
      if (keep(x, y, z)) kept.push(i0, i2, i1, i1, i2, i3);
    }
  return { pos, nor, index: kept };
}
function mergeBlobs(parts, joint) {
  const out = { pos: [], nor: [], joints: [], weights: [], index: [] };
  for (const p of parts) {
    const base = out.pos.length / 3;
    out.pos.push(...p.pos); out.nor.push(...p.nor);
    for (let i = 0; i < p.pos.length / 3; i++) { out.joints.push(joint, 0, 0, 0); out.weights.push(1, 0, 0, 0); }
    for (const i of p.index) out.index.push(i + base);
  }
  return out;
}
const [hx, hy, hz] = head;
// The skull sits above the Head joint; +z is the front, so the hair cap covers the top and back only.
const skull = [hx, hy + 0.1, hz + 0.01];
const cap = () => blob(skull[0], skull[1] + 0.005, skull[2] - 0.005, 0.118, 0.115, 0.125, { keep: (x, y, z) => y > -0.1 && z < 0.55 });
const J = jointIndex(legs.g, "Head");
write("hair-knot.glb", legs.g, mergeBlobs([cap(), blob(skull[0], skull[1] + 0.13, skull[2] - 0.03, 0.045, 0.05, 0.045)], J));
write("hair-long.glb", legs.g, mergeBlobs([cap(), blob(skull[0], skull[1] - 0.12, skull[2] - 0.1, 0.1, 0.26, 0.05, { keep: (x, y, z) => z < 0.2 })], J));
write("hat-scholar.glb", legs.g, mergeBlobs([blob(skull[0], skull[1] + 0.07, skull[2], 0.13, 0.07, 0.13, { keep: (x, y) => y > -0.05 }), blob(skull[0], skull[1] + 0.06, skull[2], 0.2, 0.012, 0.2)], J));

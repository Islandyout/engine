// Clothes that fit the Universal Base Characters exactly: each piece is cut from the body mesh itself (by which bone
// moves a vertex most), pushed out along the normals, and skinned with the body's own weights, so it follows every clip
// and cannot clip through the body the way gear modelled on another body does. The skirt is the leg region flared out
// and carried down to the ankle, with most of its weight moved to the pelvis so it hangs.
//   node tools/murim/assets/make_ubc_clothes.mjs
// Needs assets/source/kit/people/ubc-male.glb and ubc-female.glb (tools/models/import_ubc.mjs).
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
    let array = new T(s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength));
    if (a.normalized) { const max = T === Uint8Array ? 255 : 65535; array = Float32Array.from(array, (x) => x / max); }
    return { array, accessor: a };
  };
  return { json, read };
}

function write(name, g, mesh) {
  const out = new GlbWriter("tools/murim/assets/make_ubc_clothes.mjs");
  const json = out.json;
  json.nodes = g.json.nodes.map(({ ...n }) => n);
  json.scenes = g.json.scenes;
  json.scene = g.json.scene ?? 0;
  json.materials = [{ name: "Cloth", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.85 } }];
  const count = mesh.pos.length / 3;
  const f = (arr, type) => out.accessor(new Float32Array(arr), { componentType: 5126, count, type }, 34962);
  const bounds = (k, fn) => fn(...mesh.pos.filter((_, i) => i % 3 === k));
  json.meshes = [{
    name,
    primitives: [{
      attributes: {
        POSITION: out.accessor(new Float32Array(mesh.pos), { componentType: 5126, count, type: "VEC3", min: [0, 1, 2].map((k) => bounds(k, Math.min)), max: [0, 1, 2].map((k) => bounds(k, Math.max)) }, 34962),
        NORMAL: f(mesh.nor, "VEC3"),
        JOINTS_0: out.accessor(new Uint16Array(mesh.joints), { componentType: 5123, count, type: "VEC4" }, 34962),
        WEIGHTS_0: f(mesh.weights, "VEC4"),
      },
      indices: out.accessor(new Uint32Array(mesh.index), { componentType: 5125, count: mesh.index.length, type: "SCALAR" }, 34963),
      material: 0,
    }],
  }];
  for (const n of json.nodes) delete n.mesh;
  json.nodes.find((n) => n.skin !== undefined).mesh = 0;
  json.skins = g.json.skins.map((skin) => {
    const r = g.read(skin.inverseBindMatrices);
    return { ...skin, inverseBindMatrices: out.accessor(r.array, r.accessor) };
  });
  out.write(path.join(KIT, name));
  console.log(`wrote assets/source/kit/people/${name} (${count} vertices)`);
}

function region(name) {
  if (/^(spine_|clavicle_)/.test(name)) return "torso";
  if (/^(upperarm_|lowerarm_)/.test(name)) return "arm";
  if (name === "pelvis") return "hip";
  if (/^(thigh_|calf_)/.test(name)) return "leg";
  if (/^(foot_|ball_)/.test(name)) return "foot";
  return "other"; // neck, head, hands, fingers, root
}

function build(sex) {
  const g = loadGlb(path.join(KIT, `ubc-${sex}.glb`));
  const skinNode = g.json.nodes.find((n) => n.skin !== undefined && n.mesh !== undefined && /Super/i.test(n.name));
  const prim = g.json.meshes[skinNode.mesh].primitives[0];
  const pos = g.read(prim.attributes.POSITION).array;
  const nor = g.read(prim.attributes.NORMAL).array;
  const joints = g.read(prim.attributes.JOINTS_0).array;
  const weights = g.read(prim.attributes.WEIGHTS_0).array;
  const index = g.read(prim.indices).array;
  const names = g.json.skins[0].joints.map((j) => g.json.nodes[j].name);
  const count = pos.length / 3;
  const dominant = new Array(count);
  for (let v = 0; v < count; v++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (weights[v * 4 + k] > weights[v * 4 + best]) best = k;
    dominant[v] = names[joints[v * 4 + best]];
  }
  const pelvis = names.indexOf("pelvis");

  // A piece: the triangles whose three vertices pass `keep`, pushed out by `push`, optionally reshaped by `shape`.
  function piece({ keep, push, shape, hang = 0 }) {
    const remap = new Map();
    const out = { pos: [], nor: [], joints: [], weights: [], index: [] };
    const take = (v) => {
      if (remap.has(v)) return remap.get(v);
      const at = out.pos.length / 3;
      remap.set(v, at);
      let p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      const n = [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]];
      const d = typeof push === "function" ? push(v) : push;
      p = p.map((c, k) => c + n[k] * d);
      if (shape) p = shape(p, n);
      out.pos.push(...p);
      out.nor.push(...n);
      const w = [0, 1, 2, 3].map((k) => weights[v * 4 + k] * (1 - hang));
      const j = [0, 1, 2, 3].map((k) => joints[v * 4 + k]);
      if (hang) {
        let slot = j.findIndex((x, k) => x === pelvis && w[k] > 0);
        if (slot < 0) { slot = w.indexOf(Math.min(...w)); w[slot] = 0; j[slot] = pelvis; }
        w[slot] += hang;
      }
      out.joints.push(...j);
      out.weights.push(...w);
      return at;
    };
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
      if (keep(a) && keep(b) && keep(c)) out.index.push(take(a), take(b), take(c));
    }
    return out;
  }
  const r = (v) => region(dominant[v]);
  const y = (v) => pos[v * 3 + 1];
  const ax = (v) => Math.abs(pos[v * 3]);
  const top = piece({ keep: (v) => r(v) === "torso" || (r(v) === "arm" && ax(v) < 0.62), push: 0.011 });
  const legs = piece({ keep: (v) => r(v) === "hip" || r(v) === "leg", push: 0.011 });
  const boots = piece({ keep: (v) => r(v) === "foot" || (r(v) === "leg" && y(v) < 0.36), push: 0.016 });
  const sash = piece({ keep: (v) => (r(v) === "torso" || r(v) === "hip") && y(v) > 0.94 && y(v) < 1.07, push: 0.026 });
  const yTop = 1.0, yHem = 0.14, axisZ = -0.02;
  const skirt = piece({
    keep: (v) => r(v) === "hip" || r(v) === "leg",
    push: 0.012,
    hang: 0.7,
    shape: ([x, py, z]) => {
      const t = Math.max(0, Math.min(1, (yTop - py) / (yTop - yHem)));
      const s = 1.06 + 0.9 * t * t;
      return [x * s, py - 0.07 * t, axisZ + (z - axisZ) * s];
    },
  });
  for (const [name, mesh] of [["top", top], ["legs", legs], ["boots", boots], ["sash", sash], ["skirt", skirt]]) write(`ubc-${sex}-${name}.glb`, g, mesh);
}

build("male");
build("female");

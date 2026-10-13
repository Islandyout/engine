// Imports the CC0 animals and pedestrians in CREATURES below into
// assets/source/kit/{animals,people}/ as single self-contained GLBs:
//   - only the clips the editor plays are kept (the rest, and every accessor
//     only they used, are dropped), renamed to this project's names (idle,
//     walk, run, graze, talk, sit; see animationClips.ts and
//     routineActivity.ts);
//   - a new root node scales the rig uniformly to a real size for the species
//     (body length for animals, height for people) and stands it on y = 0,
//     centred on x/z, facing +z like the rest of the catalog.
// It checks each source file's SHA-256 against the one recorded here (the
// hashes in assets/CREDITS.md) before converting, and prints each result's
// size, triangles, clips and SHA-256.
//
// Usage (from the repository root), with the source repositories cloned at the
// commits named in assets/CREDITS.md:
//   node tools/models/import_creatures.mjs \
//     --src animals=<Fialuxe/MouthOfGod_System @ refs/pull/169/head> \
//     --src vanta=<schulerj89/vanta-city> \
//     [--out <dir>] [--only <name,...>]
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GlbWriter } from "./gltf_io.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const UAA = "Assets/ArtisticResources/ThirdParty/Quaternius/Ultimate Animated Animals - July 2021/glTF";
const CAST = "public/assets/characters/cc0-animated-cast";
const UMM = "public/assets/characters/ultimate-modular-men";
const WOMEN = "public/assets/characters/animated-women";

// Clip renames, by the source's own clip name (after any "Armature|" prefix).
// Clips not named here are dropped; idle, walk and run must be there, the
// rest are kept where the source has them.
const ANIMAL_CLIPS = { Idle: "idle", Walk: "walk", Gallop: "run", Eating: "graze", Idle_Headlow: "Idle_Headlow", Death: "Death" };
const MAN_CLIPS = { Idle: "idle", Walk: "walk", Run: "run", Interact: "talk", Wave: "Wave", Death: "Death", HitRecieve: "HitRecieve" };
const WOMAN_CLIPS = { Female_Idle: "idle", Female_Walk: "walk", Female_Run: "run", Female_Sitting: "sit", Female_Clapping: "Clapping", Female_Death: "Death" };

// length (animals: nose to tail, metres) or height (people); dir: output folder.
const CREATURES = [
  { name: "cow", src: "animals", file: `${UAA}/Cow.gltf`, sha256: "b04af067688d9fadf1395b4456dbf3117c2f760fb49e704ee5c8b6391fc8adb5", clips: ANIMAL_CLIPS, length: 2.5, dir: "animals" },
  { name: "bull", src: "animals", file: `${UAA}/Bull.gltf`, sha256: "535da2992eb125d517725159a2eddeb520b72595bcb3021985fc43d2c84bff76", clips: ANIMAL_CLIPS, length: 2.7, dir: "animals" },
  { name: "deer", src: "animals", file: `${UAA}/Deer.gltf`, sha256: "b8afd0647e7a74332ce802c8326dfefe1a2b76da67ab925a631aaddb5ae9bdd4", clips: ANIMAL_CLIPS, length: 1.8, dir: "animals" },
  { name: "donkey", src: "animals", file: `${UAA}/Donkey.gltf`, sha256: "4cbb2eb7d057789c945b6445d99d0c73b76c0caf7ac9b37ce88a04ca718be2ff", clips: ANIMAL_CLIPS, length: 2.0, dir: "animals" },
  { name: "fox", src: "animals", file: `${UAA}/Fox.gltf`, sha256: "2f36e3c9c75ecddda85c5f9944e98ee1e88e7c679a546534aff1cea8ecde64c7", clips: ANIMAL_CLIPS, length: 1.1, dir: "animals" },
  { name: "horse", src: "animals", file: `${UAA}/Horse.gltf`, sha256: "3deb61550dff1d2786d04b6e8559d63ad3907d6ab606ba28ce0af074ed96341b", clips: ANIMAL_CLIPS, length: 2.5, dir: "animals" },
  { name: "horse-white", src: "animals", file: `${UAA}/Horse_White.gltf`, sha256: "f137ee67bd565244f7441f35b5594a597588cda8b60ab109e2041cf13c58e1dd", clips: ANIMAL_CLIPS, length: 2.5, dir: "animals" },
  { name: "shiba-inu", src: "animals", file: `${UAA}/ShibaInu.gltf`, sha256: "3236979b94a840eb72d9ce091b1361da327a96f5ce068e666680297480f30f6b", clips: ANIMAL_CLIPS, length: 0.8, dir: "animals" },
  { name: "man-business", src: "vanta", file: `${CAST}/business-man.glb`, sha256: "82b81257c1e94cd9ee48cb1dcbe5ff506e81c9ce67cd0c5af542d8712dca546e", clips: MAN_CLIPS, height: 1.8, dir: "people" },
  { name: "man-beach", src: "vanta", file: `${CAST}/beach-character.glb`, sha256: "67c366f8c1e9ba3d3767213bc8660579a4f8028ed647a33c53d05596e8dd888c", clips: MAN_CLIPS, height: 1.76, dir: "people" },
  { name: "man-farmer", src: "vanta", file: `${CAST}/farmer.glb`, sha256: "f7ae6e2596c6521d296fa5948783f1dac717807456ce5355e48719e81d15e9a6", clips: MAN_CLIPS, height: 1.78, dir: "people" },
  { name: "man-hoodie", src: "vanta", file: `${CAST}/hoodie-character.glb`, sha256: "0de1bcd789d409214cf82f66f61daeb53d2f7de6d914b23e7b3660bfb3dee61e", clips: MAN_CLIPS, height: 1.75, dir: "people" },
  { name: "man-worker", src: "vanta", file: `${CAST}/worker.glb`, sha256: "9c28614f465b7dc105f908c20c22fc045f4b07caf8c5ef0e9f8049eceb6dd38d", clips: MAN_CLIPS, height: 1.82, dir: "people" },
  { name: "man-casual", src: "vanta", file: `${UMM}/casual-character.glb`, sha256: "fea7e71271203e7073f1a073fa1208de7402df276f87f80e149bf7589b5d46b4", clips: MAN_CLIPS, height: 1.78, dir: "people" },
  { name: "man-punk", src: "vanta", file: `${UMM}/punk-character.glb`, sha256: "94afa8718093cc7f9e51cdc0b35f4432c1c2f1901177f98fbbbcb4c6fd79b163", clips: MAN_CLIPS, height: 1.77, dir: "people" },
  { name: "woman-casual", src: "vanta", file: `${WOMEN}/casual.glb`, sha256: "99c4df0aaabd19022809facc68f5fb5f564d35df3a9893c273a31fdaacf68e96", clips: WOMAN_CLIPS, height: 1.66, dir: "people" },
  { name: "woman-dress", src: "vanta", file: `${WOMEN}/dress.glb`, sha256: "53db49ba84193beb60173e94396764c86f7805752582a81dfdfd7f0889a10783", clips: WOMAN_CLIPS, height: 1.64, dir: "people" },
  { name: "woman-street", src: "vanta", file: `${WOMEN}/street.glb`, sha256: "bae371b11e0dcd5dbd26442025567ca9f7041781f3410259d6ec379bffcbac27", clips: WOMAN_CLIPS, height: 1.68, dir: "people" },
  { name: "woman-tank-top", src: "vanta", file: `${WOMEN}/tank-top.glb`, sha256: "9809532f4562ebfd3976bd96eeebd1efc1008d781aa71a15048db5bf5ae7344c", clips: WOMAN_CLIPS, height: 1.65, dir: "people" },
];

const args = process.argv.slice(2);
const sources = {};
let outRoot = path.join(ROOT, "assets/source/kit");
let only;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === "--src") {
    const [key, dir] = args[i + 1].split("=");
    sources[key] = dir;
  } else if (args[i] === "--out") outRoot = args[i + 1];
  else if (args[i] === "--only") only = args[i + 1].split(",");
  else throw new Error(`unknown argument ${args[i]}`);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array, 5122: Int16Array, 5120: Int8Array };

// The source's JSON and its one binary buffer, from a .gltf (embedded base64
// buffer) or a .glb.
function readSource(bytes, file) {
  if (file.endsWith(".glb")) {
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const binStart = 20 + jsonLength;
    return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart)) };
  }
  const json = JSON.parse(bytes.toString("utf8"));
  if (json.buffers.length !== 1) throw new Error(`${file}: expected one buffer`);
  const uri = json.buffers[0].uri;
  const prefix = "data:application/octet-stream;base64,";
  if (!uri?.startsWith(prefix)) throw new Error(`${file}: expected an embedded base64 buffer`);
  return { json, bin: Buffer.from(uri.slice(prefix.length), "base64") };
}

function readAccessor(json, bin, index) {
  const a = json.accessors[index];
  if (a.sparse) throw new Error("sparse accessors are not handled");
  const view = json.bufferViews[a.bufferView];
  const Type = TYPED[a.componentType];
  const size = SIZE[a.type];
  const stride = view.byteStride ?? size * Type.BYTES_PER_ELEMENT;
  const out = new Type(a.count * size);
  const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < a.count; i++) {
    const at = base + i * stride;
    const slice = bin.subarray(at, at + size * Type.BYTES_PER_ELEMENT);
    out.set(new Type(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)), i * size);
  }
  return out;
}

// Column-major 4x4 matrices (glTF's layout).
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const trs = (n) => {
  if (n.matrix) return [...n.matrix];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
};
function invert(m) {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-12) throw new Error("singular matrix");
  return inv.map((v) => v / det);
}

// The rest pose: each node's world matrix from the authored transforms.
function worlds(json) {
  const parent = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const memo = new Map();
  const world = (i) => {
    if (!memo.has(i)) memo.set(i, parent.has(i) ? mul(world(parent.get(i)), trs(json.nodes[i])) : trs(json.nodes[i]));
    return memo.get(i);
  };
  return { world, parent };
}

// Every skinned primitive's vertices in the rest pose, in the rig's world
// space: what glTF skinning draws with no clip playing.
function restPose(json, bin) {
  const { world } = worlds(json);
  const meshNodes = json.nodes.map((n, i) => [n, i]).filter(([n]) => n.mesh !== undefined);
  for (const [n] of meshNodes) if (n.skin === undefined) throw new Error(`mesh node ${n.name}: not skinned (rigid attachments are not handled)`);
  const prims = [];
  for (const [n] of meshNodes) {
    const skin = json.skins[n.skin];
    const ibm = readAccessor(json, bin, skin.inverseBindMatrices);
    const joint = skin.joints.map((j, k) => mul(world(j), Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    for (const [pi, p] of json.meshes[n.mesh].primitives.entries()) {
      const pos = readAccessor(json, bin, p.attributes.POSITION);
      const nrm = p.attributes.NORMAL !== undefined ? readAccessor(json, bin, p.attributes.NORMAL) : undefined;
      const joints = readAccessor(json, bin, p.attributes.JOINTS_0);
      const weightAccessor = json.accessors[p.attributes.WEIGHTS_0];
      const rawWeights = readAccessor(json, bin, p.attributes.WEIGHTS_0);
      const norm = weightAccessor.componentType === 5121 ? 255 : weightAccessor.componentType === 5123 ? 65535 : 1;
      const outPos = new Float32Array(pos.length);
      const outNrm = nrm ? new Float32Array(nrm.length) : undefined;
      for (let v = 0; v < pos.length / 3; v++) {
        const m = new Array(16).fill(0);
        for (let k = 0; k < 4; k++) {
          const wgt = rawWeights[v * 4 + k] / norm;
          if (!wgt) continue;
          const jm = joint[joints[v * 4 + k]];
          for (let e = 0; e < 16; e++) m[e] += wgt * jm[e];
        }
        const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
        outPos[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
        outPos[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        outPos[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (nrm && outNrm) {
          const [a, b, c] = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
          const nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
          const l = Math.hypot(nx, ny, nz) || 1;
          outNrm.set([nx / l, ny / l, nz / l], v * 3);
        }
      }
      prims.push({ mesh: n.mesh, prim: pi, pos: outPos, nrm: outNrm });
    }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { pos } of prims)
    for (let i = 0; i < pos.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pos[i]);
      max[i % 3] = Math.max(max[i % 3], pos[i]);
    }
  return { prims, min, max, world };
}

// A fresh GLB of the source with only the kept clips and every accessor
// re-packed, baked to `root` (a uniform scale and a translation): the rig's
// joints hang under a new root node holding it, and each skinned mesh's
// vertices are stored already in that final rest pose (its node at the scene
// root, unmoved, with inverse bind matrices to match), so the vertex bounds
// a tool reads are the model's real size.
function rebuild(json, bin, clips, root) {
  if (json.images?.length) throw new Error("textured sources are not handled");
  const { prims, world } = restPose(json, bin);
  const R = trs(root);
  const w = new GlbWriter("tools/models/import_creatures.mjs");
  const out = w.json;
  const remap = new Map();
  const acc = (index, target) => {
    if (!remap.has(index)) remap.set(index, w.accessor(readAccessor(json, bin, index), json.accessors[index], target));
    return remap.get(index);
  };
  const baked = (array, source) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < array.length; i++) {
      min[i % 3] = Math.min(min[i % 3], array[i]);
      max[i % 3] = Math.max(max[i % 3], array[i]);
    }
    return w.accessor(array, { ...source, componentType: 5126, min, max }, 34962);
  };
  const s = root.scale[0];
  out.materials = json.materials;
  out.meshes = json.meshes.map((m, mi) => ({
    ...m,
    primitives: m.primitives.map((p, pi) => {
      const rest = prims.find((r) => r.mesh === mi && r.prim === pi);
      const attributes = Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, acc(v, 34962)]));
      const pos = Float32Array.from(rest.pos, (v, i) => v * s + root.translation[i % 3]);
      attributes.POSITION = baked(pos, json.accessors[p.attributes.POSITION]);
      if (rest.nrm) {
        const { min: _min, max: _max, ...normal } = json.accessors[p.attributes.NORMAL];
        attributes.NORMAL = w.accessor(rest.nrm, normal, 34962);
      }
      return { ...p, attributes, ...(p.indices !== undefined ? { indices: acc(p.indices, 34963) } : {}) };
    }),
  }));
  // Joint world = root * old world; inverse bind = its inverse, so the rest
  // pose draws the baked vertices where they are.
  out.skins = json.skins.map((skin) => {
    const ibm = new Float32Array(skin.joints.length * 16);
    skin.joints.forEach((j, k) => ibm.set(invert(mul(R, world(j))), k * 16));
    return { ...skin, inverseBindMatrices: w.accessor(ibm, { componentType: 5126, count: skin.joints.length, type: "MAT4" }) };
  });
  out.animations = [];
  const found = new Set();
  for (const anim of json.animations ?? []) {
    const short = anim.name.split("|").pop();
    const name = clips[short];
    if (!name) continue;
    found.add(short);
    out.animations.push({ name, channels: anim.channels, samplers: anim.samplers.map((sm) => ({ ...sm, input: acc(sm.input), output: acc(sm.output) })) });
  }
  const missing = Object.keys(clips).filter((c) => ["idle", "walk", "run"].includes(clips[c]) && !found.has(c));
  if (missing.length) throw new Error(`clips not in the source: ${missing.join(", ")}`);
  // Mesh nodes move to the scene root, untransformed (glTF ignores a skinned
  // mesh node's transform; three.js doesn't, so it must be the identity).
  const meshNodes = new Set(json.nodes.flatMap((n, i) => (n.mesh !== undefined ? [i] : [])));
  out.nodes = json.nodes.map((n, i) => {
    const children = (n.children ?? []).filter((c) => !meshNodes.has(c));
    const { children: _c, ...rest } = n;
    if (meshNodes.has(i)) {
      if (children.length) throw new Error(`mesh node ${n.name} has children`);
      const { translation: _t, rotation: _r, scale: _s, matrix: _m, ...plain } = rest;
      return plain;
    }
    return children.length ? { ...rest, children } : rest;
  });
  const scene = json.scenes[json.scene ?? 0];
  out.nodes.push({ name: "Root", ...root, children: scene.nodes.filter((c) => !meshNodes.has(c)) });
  out.scenes = [{ nodes: [out.nodes.length - 1, ...meshNodes] }];
  out.scene = 0;
  for (const key of Object.keys(out)) if (Array.isArray(out[key]) && out[key].length === 0 && key !== "buffers") delete out[key];
  return w;
}

const THREE = await import(pathToFileURL(path.join(ROOT, "apps/editor/node_modules/three/build/three.module.js")).href);
const { GLTFLoader } = await import(pathToFileURL(path.join(ROOT, "apps/editor/node_modules/three/examples/jsm/loaders/GLTFLoader.js")).href);

// The rig's drawn (skinned) bounds in its rest pose, and its triangles.
async function measure(file) {
  const bytes = readFileSync(file);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene, true);
  let triangles = 0;
  gltf.scene.traverse((o) => {
    if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return { box, triangles, clips: gltf.animations.map((a) => a.name) };
}

for (const spec of CREATURES) {
  if (only && !only.includes(spec.name)) continue;
  const dir = sources[spec.src];
  if (!dir) throw new Error(`${spec.name}: --src ${spec.src}=<dir> is required`);
  const bytes = readFileSync(path.join(dir, spec.file));
  if (spec.sha256 && sha256(bytes) !== spec.sha256) throw new Error(`${spec.file}: SHA-256 ${sha256(bytes)}, expected ${spec.sha256}`);
  if (!spec.sha256) console.log(`${spec.file}: SHA-256 ${sha256(bytes)} (not yet recorded)`);
  const { json, bin } = readSource(bytes, spec.file);
  const outDir = path.join(outRoot, spec.dir);
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${spec.name}.glb`);
  // Scale and place from the rest pose's own bounds.
  const { min, max } = restPose(json, bin);
  const scale = spec.length ? spec.length / (max[2] - min[2]) : spec.height / (max[1] - min[1]);
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  rebuild(json, bin, spec.clips, { scale: [scale, scale, scale], translation: [-cx * scale, -min[1] * scale, -cz * scale] }).write(out);
  const after = await measure(out);
  const s = after.box.getSize(new THREE.Vector3());
  const result = readFileSync(out);
  console.log(`${spec.dir}/${spec.name}.glb (${s.z.toFixed(2)} x ${s.x.toFixed(2)} x ${s.y.toFixed(2)}, ${after.triangles} triangles, ${(result.length / 1024).toFixed(0)} KB, clips ${after.clips.join(" ")}): ${sha256(result)}`);
}

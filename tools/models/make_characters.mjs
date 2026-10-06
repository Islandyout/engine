// Builds the GATEBREAKER characters (M0) from Quaternius's CC0 Universal Base
// Characters male body, on the 65-bone skeleton every combat clip uses, so
// all of them share the clip library and the hit reactions:
//
// - hunter.glb: the hero, Han Seo-jin. Buzzed hair, a black jacket from the
//   collar to the wrists, charcoal trousers and black boots.
// - goblin.glb: grey-green skin, a brown loincloth, glowing yellow eyes and
//   pointed ears built here, bound to the head. The game scales it down.
//
// Each vertex gets a flat colour (COLOR_0) by the bone that moves it most, and
// the body's skin texture is dropped: a manhwa panel is clean silhouettes and
// flat fills, and the toon shading inks them. The colour's alpha says whether
// a texture shows through (hair, eyes) or the fill is flat (the toon shader
// reads it; plain materials multiply the texture by the colour). Normal and
// roughness maps are dropped too.
//
// Usage (from the repository root):
//   node tools/models/make_characters.mjs --pack <quaternius dir with characters/ and hair/> \
//     [--preset hunter|goblin|all] [--out <file, for one preset>]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!args.pack) throw new Error("missing --pack (see the usage at the top of this file)");
  args.preset ??= "all";
  if (args.preset !== "all" && !PRESETS[args.preset]) throw new Error(`unknown --preset ${args.preset}`);
  if (args.out && args.preset === "all") throw new Error("--out needs one --preset");
  return args;
}

// Linear RGB fills (glTF vertex colours are linear). Alpha 1 lets the
// texture show (hair strands, the iris); alpha 0 is a flat fill.
const PRESETS = {
  hunter: {
    file: "hunter.glb",
    hair: true,
    fill: {
      skin: [0.88, 0.57, 0.39, 0],
      jacket: [0.075, 0.075, 0.1, 0],
      trousers: [0.15, 0.15, 0.18, 0],
      boots: [0.035, 0.03, 0.03, 0],
      hair: [0.045, 0.045, 0.055, 1],
      eyes: [1, 1, 1, 1],
    },
    // The part of the outfit each bone's vertices belong to.
    region(bone) {
      if (/^(Head|neck_01)$/.test(bone)) return "skin";
      if (/^(hand_|index_|middle_|ring_|pinky_|thumb_)/.test(bone)) return "skin";
      if (/^(pelvis|thigh_|calf_)/.test(bone)) return "trousers";
      if (/^(foot_|ball_)/.test(bone)) return "boots";
      return "jacket";
    },
  },
  goblin: {
    file: "goblin.glb",
    hair: false,
    ears: true,
    fill: {
      skin: [0.2, 0.27, 0.12, 0],
      loincloth: [0.12, 0.06, 0.025, 0],
      nails: [0.04, 0.035, 0.03, 0],
      hair: [0.03, 0.035, 0.02, 0],
      eyes: [1, 0.75, 0.08, 0],
    },
    eyeGlow: [1, 0.72, 0.05],
    // The loincloth ends mid-thigh, in a ragged hem.
    region(bone, [x, y, z]) {
      if (bone === "pelvis") return "loincloth";
      if (/^thigh_/.test(bone) && y > 0.68 + 0.05 * Math.sin(x * 70 + z * 40)) return "loincloth";
      if (/^ball_/.test(bone)) return "nails";
      return "skin";
    },
  },
};

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array };

// A glTF (.gltf + .bin) on disk.
function loadGltf(file) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  const dir = path.dirname(file);
  const bins = json.buffers.map((b) => readFileSync(path.join(dir, b.uri)));
  const read = (index) => {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const Type = TYPED[accessor.componentType];
    const size = SIZE[accessor.type];
    const bin = bins[view.buffer];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 0;
    const out = new Type(accessor.count * size);
    if (!stride || stride === size * Type.BYTES_PER_ELEMENT) {
      const slice = bin.subarray(offset, offset + out.byteLength);
      out.set(new Type(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)));
    } else {
      const element = new Type(size);
      for (let i = 0; i < accessor.count; i++) {
        const start = offset + i * stride;
        const slice = bin.subarray(start, start + size * Type.BYTES_PER_ELEMENT);
        element.set(new Type(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)));
        out.set(element, i * size);
      }
    }
    return { array: out, accessor };
  };
  return { json, dir, read };
}

// Writes a fresh GLB: every accessor re-packed tightly into one buffer.
class GlbWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
    this.json = { asset: { version: "2.0", generator: "tools/models/make_characters.mjs" }, accessors: [], bufferViews: [], buffers: [] };
  }
  view(bytes, target) {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.length += pad;
    }
    this.json.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    this.chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.length += bytes.byteLength;
    return this.json.bufferViews.length - 1;
  }
  accessor(array, source, target) {
    const out = { bufferView: this.view(array, target), componentType: source.componentType, count: source.count, type: source.type };
    if (source.normalized) out.normalized = true;
    if (source.min) out.min = source.min;
    if (source.max) out.max = source.max;
    this.json.accessors.push(out);
    return this.json.accessors.length - 1;
  }
  image(file, mimeType) {
    return { bufferView: this.view(readFileSync(file)), mimeType };
  }
  write(file) {
    const bin = Buffer.concat(this.chunks);
    this.json.buffers = [{ byteLength: bin.length }];
    let text = Buffer.from(JSON.stringify(this.json));
    text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
    const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    const header = Buffer.alloc(12);
    header.write("glTF", 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + text.length + 8 + binPadded.length, 8);
    const chunk = (size, type) => {
      const b = Buffer.alloc(8);
      b.writeUInt32LE(size, 0);
      b.writeUInt32LE(type, 4);
      return b;
    };
    writeFileSync(file, Buffer.concat([header, chunk(text.length, 0x4e4f534a), text, chunk(binPadded.length, 0x004e4942), binPadded]));
  }
}

// A pointed ear: a flat blade from the side of the head, out, up and back,
// flat-shaded. Returns positions and normals (triangles, unindexed).
function earBlade(base, side, forward) {
  const norm = (v) => {
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const axis = norm([side, 0.32, -0.3 * forward]);
  const flat = norm(cross(axis, [0, 0, 1])); // across the blade (mostly vertical)
  const thin = norm(cross(axis, flat)); // through the blade
  const length = 0.15;
  const ring = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 0.034 * Math.cos(a);
    const t = 0.008 * Math.sin(a);
    ring.push(base.map((b, k) => b + flat[k] * w + thin[k] * t));
  }
  // A kink halfway, so the blade droops slightly, like a goblin's.
  const mid = base.map((b, k) => b + axis[k] * length * 0.5);
  const tip = base.map((b, k) => b + axis[k] * length - flat[k] * 0.025 * Math.sign(flat[1] || 1));
  const midRing = ring.map((p) => p.map((x, k) => mid[k] + (x - base[k]) * 0.6));
  const positions = [];
  const normals = [];
  const tri = (a, b, c) => {
    let nrm = norm(cross(b.map((x, k) => x - a[k]), c.map((x, k) => x - a[k])));
    // Face away from the blade's axis.
    const centre = a.map((x, k) => (x + b[k] + c[k]) / 3 - base[k]);
    const along = centre.reduce((s, x, k) => s + x * axis[k], 0);
    const outward = centre.map((x, k) => x - axis[k] * along);
    if (nrm.reduce((s, x, k) => s + x * outward[k], 0) < 0) {
      [b, c] = [c, b];
      nrm = nrm.map((x) => -x);
    }
    positions.push(...a, ...b, ...c);
    normals.push(...nrm, ...nrm, ...nrm);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(ring[i], ring[j], midRing[j]);
    tri(ring[i], midRing[j], midRing[i]);
    tri(midRing[i], midRing[j], tip);
  }
  return { positions, normals };
}

function build(name, args) {
  const preset = PRESETS[name];
  const fill = preset.fill;
  const body = loadGltf(path.join(args.pack, "characters/Superhero_Male_FullBody.gltf"));
  const hair = preset.hair ? loadGltf(path.join(args.pack, "hair/Hair_Buzzed.gltf")) : undefined;
  const out = new GlbWriter();
  const json = out.json;

  // Nodes: the body's hierarchy as is (the skeleton and its three meshes).
  json.nodes = body.json.nodes.map((n) => ({ ...n }));
  json.scenes = body.json.scenes;
  json.scene = body.json.scene ?? 0;
  const jointNames = body.json.skins[0].joints.map((i) => body.json.nodes[i].name);

  // Textures: the hair strands and the iris, embedded; the skin is a flat fill.
  json.images = [];
  json.textures = [];
  json.samplers = [{ magFilter: 9729, minFilter: 9987 }];
  const textureFor = (gltf, materialIndex) => {
    const index = gltf.json.materials[materialIndex].pbrMetallicRoughness?.baseColorTexture?.index;
    if (index === undefined) return undefined;
    const image = gltf.json.images[gltf.json.textures[index].source];
    json.images.push(out.image(path.join(gltf.dir, image.uri), "image/png"));
    json.textures.push({ source: json.images.length - 1, sampler: 0 });
    return json.textures.length - 1;
  };
  const material = (materialName, texture, extra = {}) => ({
    name: materialName,
    pbrMetallicRoughness: { ...(texture !== undefined ? { baseColorTexture: { index: texture } } : {}), metallicFactor: 0, roughnessFactor: 0.8 },
    ...extra,
  });
  const hairTexture = preset.hair ? textureFor(body, 0) : undefined;
  const eyes = preset.eyeGlow ? material("Eyes", undefined, { emissiveFactor: preset.eyeGlow }) : material("Eyes", textureFor(body, 1));
  json.materials = [material("Brows", hairTexture), eyes, material("Skin"), material("Hair", hairTexture)];

  // Meshes: position, normal, first UV, skin, and a COLOR_0 of fills.
  const colourAccessor = (count, colourOf) => {
    const colours = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) colours.set(colourOf(v), v * 4);
    return out.accessor(colours, { componentType: 5126, count, type: "VEC4" }, 34962);
  };
  const copyPrimitive = (gltf, primitive, colour) => {
    const a = primitive.attributes;
    const get = (i) => gltf.read(i);
    const position = get(a.POSITION);
    const attributes = {
      POSITION: out.accessor(position.array, position.accessor, 34962),
      NORMAL: out.accessor(get(a.NORMAL).array, get(a.NORMAL).accessor, 34962),
      TEXCOORD_0: out.accessor(get(a.TEXCOORD_0).array, get(a.TEXCOORD_0).accessor, 34962),
      JOINTS_0: out.accessor(get(a.JOINTS_0).array, get(a.JOINTS_0).accessor, 34962),
      WEIGHTS_0: out.accessor(get(a.WEIGHTS_0).array, get(a.WEIGHTS_0).accessor, 34962),
    };
    const joints = get(a.JOINTS_0).array;
    const weights = get(a.WEIGHTS_0).array;
    attributes.COLOR_0 = colourAccessor(position.accessor.count, (v) => {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weights[v * 4 + k] > weights[v * 4 + best]) best = k;
      return colour(jointNames[joints[v * 4 + best]] ?? "", position.array.subarray(v * 3, v * 3 + 3));
    });
    const indices = get(primitive.indices);
    return { attributes, indices: out.accessor(indices.array, indices.accessor, 34963) };
  };
  json.meshes = body.json.meshes.map((mesh, m) => ({
    name: mesh.name,
    primitives: mesh.primitives.map((p) => ({
      ...copyPrimitive(body, p, (bone, at) => (m === 0 ? fill.hair : m === 1 ? fill.eyes : fill[preset.region(bone, at)])),
      material: m,
    })),
  }));
  // Skins: the body's, re-packed.
  const bind = body.read(body.json.skins[0].inverseBindMatrices);
  json.skins = [{ ...body.json.skins[0], inverseBindMatrices: out.accessor(bind.array, bind.accessor) }];
  // Extra skinned meshes go next to the body's (under the armature root).
  const parent = json.nodes.findIndex((n) => n.children?.includes(body.json.nodes.findIndex((x) => x.name === "SuperHero_Male")));
  if (parent < 0) throw new Error("no parent for the body mesh");
  const addSkinned = (meshName, primitives) => {
    json.meshes.push({ name: meshName, primitives });
    json.nodes.push({ name: meshName, mesh: json.meshes.length - 1, skin: 0 });
    json.nodes[parent].children.push(json.nodes.length - 1);
  };

  if (hair) {
    // The hair, bound to the body's joints by name.
    const hairJoints = hair.json.skins[0].joints.map((i) => hair.json.nodes[i].name);
    if (hairJoints.join() !== jointNames.join()) throw new Error("the hair's skeleton doesn't match the body's");
    addSkinned("Hair", hair.json.meshes[0].primitives.map((p) => ({ ...copyPrimitive(hair, p, () => fill.hair), material: 3 })));
  }

  if (preset.ears) {
    // Find the head (the body vertices the Head bone moves most) and which way the face points.
    const p = body.json.meshes[2].primitives[0].attributes;
    const pos = body.read(p.POSITION).array;
    const joints = body.read(p.JOINTS_0).array;
    const weights = body.read(p.WEIGHTS_0).array;
    const head = jointNames.indexOf("Head");
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < pos.length / 3; v++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weights[v * 4 + k] > weights[v * 4 + best]) best = k;
      if (joints[v * 4 + best] !== head) continue;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[v * 3 + k]);
        max[k] = Math.max(max[k], pos[v * 3 + k]);
      }
    }
    const eyePos = body.read(body.json.meshes[1].primitives[0].attributes.POSITION).array;
    let eyeZ = 0;
    for (let v = 0; v < eyePos.length / 3; v++) eyeZ += eyePos[v * 3 + 2] / (eyePos.length / 3);
    const centre = min.map((x, k) => (x + max[k]) / 2);
    const forward = Math.sign(eyeZ - centre[2]);
    const positions = [];
    const normals = [];
    for (const side of [-1, 1]) {
      // Where a human ear sits: the widest point, at eye height, a little behind the middle.
      const base = [centre[0] + side * (max[0] - centre[0]) * 0.92, min[1] + (max[1] - min[1]) * 0.5, centre[2] - forward * (max[2] - min[2]) * 0.08];
      const blade = earBlade(base, side, forward);
      positions.push(...blade.positions);
      normals.push(...blade.normals);
    }
    const count = positions.length / 3;
    const box = { min: [0, 1, 2].map((k) => Math.min(...positions.filter((_, i) => i % 3 === k))), max: [0, 1, 2].map((k) => Math.max(...positions.filter((_, i) => i % 3 === k))) };
    const jointArray = new Uint16Array(count * 4);
    const weightArray = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
      jointArray[v * 4] = head;
      weightArray[v * 4] = 1;
    }
    addSkinned("Ears", [
      {
        attributes: {
          POSITION: out.accessor(new Float32Array(positions), { componentType: 5126, count, type: "VEC3", ...box }, 34962),
          NORMAL: out.accessor(new Float32Array(normals), { componentType: 5126, count, type: "VEC3" }, 34962),
          TEXCOORD_0: out.accessor(new Float32Array(count * 2), { componentType: 5126, count, type: "VEC2" }, 34962),
          JOINTS_0: out.accessor(jointArray, { componentType: 5123, count, type: "VEC4" }, 34962),
          WEIGHTS_0: out.accessor(weightArray, { componentType: 5126, count, type: "VEC4" }, 34962),
          COLOR_0: colourAccessor(count, () => fill.skin),
        },
        material: 2,
      },
    ]);
    console.log(`  head ${min.map((x) => x.toFixed(3))} .. ${max.map((x) => x.toFixed(3))}, face toward ${forward > 0 ? "+" : "-"}z`);
  }

  const file = args.out ?? path.join(ROOT, "assets/source/kit/people", preset.file);
  out.write(file);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

const args = parseArgs(process.argv.slice(2));
for (const name of args.preset === "all" ? Object.keys(PRESETS) : [args.preset]) build(name, args);

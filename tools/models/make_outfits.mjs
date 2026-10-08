// Builds the GATEBREAKER gear pieces (M3.5) from Quaternius's CC0 Modular
// Character Outfits - Fantasy (the male Ranger set). Each piece keeps its
// skin on the same 65-bone skeleton as the hunter, so the game binds it to
// his bones by name and it moves with every clip (world.wear).
//
// Like the characters (make_characters.mjs), the pieces are flat fills: each
// vertex takes the colour the pack's texture atlas has under its UV (leather,
// cloth, metal and straps stay apart), and the texture itself is dropped.
// Those colours are then snapped to a piece's few main fills (k-means, 4), so
// the atlas's painted noise doesn't blotch under the toon shading: flat fills
// like the hunter's own. Skin showing at the wrists (the arms piece) takes
// the hunter's skin fill.
//
// Usage (from the repository root):
//   node tools/models/make_outfits.mjs --pack <quaternius dir with outfits/>
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { GlbWriter, loadGltf } from "./gltf_io.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PIECES = [
  ["Male_Ranger_Body.gltf", "gear-body.glb"],
  ["Male_Ranger_Arms.gltf", "gear-hands.glb"],
  ["Male_Ranger_Legs.gltf", "gear-legs.glb"],
  ["Male_Ranger_Feet_Boots.gltf", "gear-feet.glb"],
  ["Male_Ranger_Acc_Pauldron.gltf", "gear-shoulders.glb"],
];
const SKIN = [0.88, 0.57, 0.39, 0];

// An 8-bit, non-interlaced RGB or RGBA PNG, as RGBA rows.
function readPng(file) {
  const data = readFileSync(file);
  let at = 8;
  let width = 0, height = 0, channels = 0;
  const idat = [];
  while (at < data.length) {
    const length = data.readUInt32BE(at);
    const type = data.toString("latin1", at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) throw new Error(`${file}: only 8-bit RGB(A) PNGs`);
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) pixels[(y * width + x) * 4 + k] = row[x * channels + k];
      pixels[(y * width + x) * 4 + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
    prev.set(row);
  }
  return { width, height, pixels };
}

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// The atlas colour around a UV (a 5x5 average: the paint's grain smoothed), linear RGB.
function sample(image, u, v) {
  const x0 = Math.floor((u - Math.floor(u)) * image.width);
  const y0 = Math.floor((v - Math.floor(v)) * image.height);
  const sum = [0, 0, 0];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.min(image.width - 1, Math.max(0, x0 + dx));
      const y = Math.min(image.height - 1, Math.max(0, y0 + dy));
      for (let k = 0; k < 3; k++) sum[k] += image.pixels[(y * image.width + x) * 4 + k];
    }
  return sum.map((s) => linear(s / 25 / 255));
}

const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function nearest(centres, c) {
  let best = 0;
  for (let i = 1; i < centres.length; i++) if (distance(centres[i], c) < distance(centres[best], c)) best = i;
  return best;
}
// k colours that best stand for the samples (Lloyd's algorithm, seeded
// deterministically by brightness quantiles so the output never changes).
function kMeans(samples, k) {
  const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sorted = [...samples].sort((a, b) => luma(a) - luma(b));
  let centres = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)].slice());
  for (let round = 0; round < 20; round++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const c of samples) {
      const s = sums[nearest(centres, c)];
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      s[3]++;
    }
    centres = sums.map((s, i) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[i]));
  }
  return centres;
}

function build(pack, source, target) {
  const gltf = loadGltf(path.join(pack, "outfits", source));
  const atlas = readPng(path.join(pack, "outfits", "T_Ranger_3_BaseColor.png"));
  const out = new GlbWriter("tools/models/make_outfits.mjs");
  const json = out.json;
  json.nodes = gltf.json.nodes.map(({ ...n }) => n);
  json.scenes = gltf.json.scenes;
  json.scene = gltf.json.scene ?? 0;
  json.materials = [{ name: "Gear", pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.75 } }];
  const skinMaterials = new Set(gltf.json.materials.map((m, i) => (/Regular/.test(m.name) ? i : -1)).filter((i) => i >= 0));
  json.meshes = gltf.json.meshes.map((mesh) => ({
    name: mesh.name,
    primitives: mesh.primitives.map((p) => {
      const a = p.attributes;
      const position = gltf.read(a.POSITION);
      const uv = gltf.read(a.TEXCOORD_0).array;
      const count = position.accessor.count;
      const colours = new Float32Array(count * 4);
      const skin = skinMaterials.has(p.material);
      // Each vertex's atlas colour, snapped to the piece's main fills.
      const samples = [];
      for (let v = 0; v < count; v++) samples.push(skin ? SKIN.slice(0, 3) : sample(atlas, uv[v * 2], uv[v * 2 + 1]));
      const fills = skin ? [SKIN.slice(0, 3)] : kMeans(samples, 4);
      for (let v = 0; v < count; v++) colours.set([...fills[nearest(fills, samples[v])], 0], v * 4);
      const copy = (index, target) => {
        const r = gltf.read(index);
        return out.accessor(r.array, r.accessor, target);
      };
      return {
        attributes: {
          POSITION: copy(a.POSITION, 34962),
          NORMAL: copy(a.NORMAL, 34962),
          JOINTS_0: copy(a.JOINTS_0, 34962),
          WEIGHTS_0: copy(a.WEIGHTS_0, 34962),
          COLOR_0: out.accessor(colours, { componentType: 5126, count, type: "VEC4" }, 34962),
        },
        indices: copy(p.indices, 34963),
        material: 0,
      };
    }),
  }));
  json.skins = gltf.json.skins.map((skin) => ({ ...skin, inverseBindMatrices: (() => {
    const r = gltf.read(skin.inverseBindMatrices);
    return out.accessor(r.array, r.accessor);
  })() }));
  const file = path.join(ROOT, "assets/source/kit/people", target);
  out.write(file);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

const at = process.argv.indexOf("--pack");
if (at < 0) throw new Error("usage: make_outfits.mjs --pack <quaternius dir>");
for (const [source, target] of PIECES) build(process.argv[at + 1], source, target);

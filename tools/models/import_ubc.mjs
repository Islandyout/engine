// Packs Quaternius's Universal Base Characters (CC0, the free Standard kit) into single-file GLBs the editor loads:
// the two bodies (face, eyes, skin textures) and the hairstyles rigged to the head bone. The skeleton is the same
// 65-bone one as the people kit (pelvis, spine_01 ... Head), so every clip in the library plays on them.
//
// Textures are embedded as they come (PNG). The skin keeps its colour and normal maps; hair and eyes keep colour only
// (their normal maps are the largest files in the pack and barely show at game distance).
//
// Usage (from the repository root):
//   node tools/models/import_ubc.mjs --pack "<unzipped Universal Base Characters[Standard] dir>"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "assets/source/kit/people");

function pack(gltfPath, outName, { keepNormal }) {
  const dir = path.dirname(gltfPath);
  const json = JSON.parse(readFileSync(gltfPath, "utf8"));
  const chunks = [];
  let length = 0;
  const push = (buf) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    const at = length;
    chunks.push(buf);
    length += buf.length;
    return at;
  };
  // The original buffer, as buffer 0 (views keep their offsets).
  const base = push(Buffer.concat(json.buffers.map((b) => readFileSync(path.join(dir, b.uri)))));
  if (json.buffers.length !== 1) throw new Error(`${gltfPath}: expected one buffer`);
  for (const view of json.bufferViews) view.byteOffset = (view.byteOffset ?? 0) + base;
  // Drop the maps that are not kept; textures nothing refers to any more are not written.
  for (const material of json.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {};
    delete pbr.metallicRoughnessTexture;
    if (!(keepNormal && /Superhero/.test(material.name))) delete material.normalTexture;
    delete material.occlusionTexture;
  }
  const used = new Set();
  for (const material of json.materials ?? []) {
    for (const t of [material.pbrMetallicRoughness?.baseColorTexture, material.normalTexture]) if (t) used.add(json.textures[t.index].source);
  }
  for (const [i, image] of json.images.entries()) {
    if (used.has(i)) {
      const view = json.bufferViews.length;
      const at = push(readFileSync(path.join(dir, image.uri)));
      json.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: readFileSync(path.join(dir, image.uri)).length });
      image.bufferView = view;
      delete image.uri;
    } else {
      image.bufferView = undefined;
    }
  }
  // Rewrite the image/texture tables to the used ones only.
  const remap = new Map();
  json.images = json.images.filter((image, i) => (used.has(i) ? (remap.set(i, remap.size), true) : false));
  const textureRemap = new Map();
  json.textures = json.textures.filter((texture, i) => {
    if (!remap.has(texture.source)) return false;
    texture.source = remap.get(texture.source);
    textureRemap.set(i, textureRemap.size);
    return true;
  });
  for (const material of json.materials ?? []) {
    for (const t of [material.pbrMetallicRoughness?.baseColorTexture, material.normalTexture]) if (t) t.index = textureRemap.get(t.index);
  }
  const bin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: bin.length }];
  json.asset = { ...json.asset, generator: "tools/models/import_ubc.mjs (Quaternius Universal Base Characters, CC0)" };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binPadded.length, 8);
  const head = (size, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(size, 0); b.write(type, 4, "latin1"); return b; };
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, outName);
  writeFileSync(file, Buffer.concat([header, head(text.length, "JSON"), text, head(binPadded.length, "BIN\0"), binPadded]));
  console.log(`wrote ${path.relative(ROOT, file)} (${(binPadded.length / 1048576).toFixed(1)} MB)`);
}

const at = process.argv.indexOf("--pack");
if (at < 0) throw new Error('usage: import_ubc.mjs --pack "<Universal Base Characters[Standard] dir>"');
const pack_dir = process.argv[at + 1];
const bodies = path.join(pack_dir, "Base Characters/Godot - UE");
pack(path.join(bodies, "Superhero_Male_FullBody.gltf"), "ubc-male.glb", { keepNormal: true });
pack(path.join(bodies, "Superhero_Female_FullBody.gltf"), "ubc-female.glb", { keepNormal: true });
const hairs = path.join(pack_dir, "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)");
for (const name of ["Hair_Long", "Hair_Buns", "Hair_SimpleParted", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Beard", "Eyebrows_Regular", "Eyebrows_Female"])
  pack(path.join(hairs, `${name}.gltf`), `ubc-${name.toLowerCase().replace(/_/g, "-")}.glb`, { keepNormal: false });

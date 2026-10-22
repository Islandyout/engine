// Packs Quaternius's Modular Character Outfits - Fantasy (CC0, the free Standard kit) into single-file GLBs for the
// Universal Base Characters: Peasant and Ranger, body / arms / legs / feet (and the Ranger's hood and pauldrons) per sex.
// Every part carries the same 65-bone skeleton as the base bodies, so a worn part follows every clip.
//
// The pack's 4096 px textures are downscaled to 1024 px JPEGs first (tools/models/downscale_textures.cjs), named
// peasant-color, peasant-normal, ranger-color, ranger-normal, skin-male and skin-female (the hands in the Arms parts).
//
//   node tools/models/import_outfits.mjs --pack "<unzipped Modular Character Outfits[Standard] dir>" --tex <dir of jpgs>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "assets/source/kit/people");
const arg = (name) => { const at = process.argv.indexOf(name); if (at < 0) throw new Error(`missing ${name}`); return process.argv[at + 1]; };

const TEXTURES = {
  "T_Peasant_BaseColor.png": "peasant-color.jpg", "T_Peasant_Normal.png": "peasant-normal.jpg",
  "T_Ranger_BaseColor.png": "ranger-color.jpg", "T_Ranger_Normal.png": "ranger-normal.jpg",
  "T_Regular_Male_Dark_BaseColor.png": "skin-male.jpg", "T_Regular_Male_Normal.png": null,
  "T_Regular_Female_Dark_BaseColor.png": "skin-female.jpg", "T_Regular_Female_Normal.png": null,
};

function pack(gltfPath, outName, texDir) {
  const dir = path.dirname(gltfPath);
  const json = JSON.parse(readFileSync(gltfPath, "utf8"));
  if (json.buffers.length !== 1) throw new Error(`${gltfPath}: expected one buffer`);
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
  const base = push(readFileSync(path.join(dir, json.buffers[0].uri)));
  for (const view of json.bufferViews) view.byteOffset = (view.byteOffset ?? 0) + base;
  // Keep colour and normal maps (the ones with a downscaled file); drop the packed ORM and occlusion maps.
  const wanted = (t) => t && TEXTURES[path.basename(json.images[json.textures[t.index].source].uri)];
  for (const material of json.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {};
    delete pbr.metallicRoughnessTexture;
    delete material.occlusionTexture;
    if (!wanted(pbr.baseColorTexture)) delete pbr.baseColorTexture;
    if (!wanted(material.normalTexture)) delete material.normalTexture;
    pbr.metallicFactor = 0;
    pbr.roughnessFactor = 0.9;
  }
  const images = [], textures = [], samplerOf = (i) => json.textures[i].sampler;
  const imageIndex = new Map(), textureIndex = new Map();
  const use = (t) => {
    if (!t) return;
    if (!textureIndex.has(t.index)) {
      const file = TEXTURES[path.basename(json.images[json.textures[t.index].source].uri)];
      if (!imageIndex.has(file)) {
        const data = readFileSync(path.join(texDir, file));
        const view = json.bufferViews.length;
        json.bufferViews.push({ buffer: 0, byteOffset: push(data), byteLength: data.length });
        imageIndex.set(file, images.length);
        images.push({ bufferView: view, mimeType: "image/jpeg", name: file });
      }
      textureIndex.set(t.index, textures.length);
      textures.push({ source: imageIndex.get(file), sampler: samplerOf(t.index) });
    }
    t.index = textureIndex.get(t.index);
  };
  for (const material of json.materials ?? []) { use(material.pbrMetallicRoughness?.baseColorTexture); use(material.normalTexture); }
  json.images = images;
  json.textures = textures;
  const bin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: bin.length }];
  json.asset = { ...json.asset, generator: "tools/models/import_outfits.mjs (Quaternius Modular Character Outfits - Fantasy, CC0)" };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binPadded.length, 8);
  const head = (size, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(size, 0); b.write(type, 4, "latin1"); return b; };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, outName), Buffer.concat([header, head(text.length, "JSON"), text, head(binPadded.length, "BIN\0"), binPadded]));
  console.log(`wrote ${outName} (${(binPadded.length / 1024).toFixed(0)} KB)`);
}

const parts = path.join(arg("--pack"), "Exports/glTF (Godot-Unreal)/Modular Parts");
const tex = arg("--tex");
const PARTS = {
  Male: { Peasant: ["Body", "Arms", "Legs", "Feet"], Ranger: ["Body", "Arms", "Legs", "Feet_Boots", "Head_Hood", "Acc_Pauldron"] },
  Female: { Peasant: ["Body", "Arms", "Legs", "Feet"], Ranger: ["Body", "Arms", "Legs", "Feet", "Head_Hood", "Acc_Pauldrons"] },
};
for (const [sex, sets] of Object.entries(PARTS))
  for (const [set, names] of Object.entries(sets))
    for (const part of names) pack(path.join(parts, `${sex}_${set}_${part}.gltf`), `ubc-${sex}-${set}-${part}.glb`.toLowerCase().replace(/_/g, "-"), tex);

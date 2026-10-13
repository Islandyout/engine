// Makes the catalog's trees and bushes (assets/source/kit/nature/eztree-*.glb)
// with ez-tree, Daniel Greenheck's procedural tree generator (MIT; the
// @dgreenheck/ez-tree 1.1.0 npm package, whose bark and leaf images it embeds:
// see assets/CREDITS.md and third_party/ez-tree/LICENSE).
//
// Each tree starts from one of ez-tree's presets, with fewer sections, sides
// and leaf cards than the preset (bigger cards keep the canopy's cover), so a
// street of them stays cheap; it is then scaled uniformly to a real height for
// its species, with the trunk's foot at the origin. One mesh, two primitives:
// bark (its colour image, the preset's texture repeat baked into the UVs) and
// leaves (alpha-masked, double-sided cards). The cards' normals point out from
// the crown's centre (and a little up), the usual trick that shades a canopy
// as one lit volume instead of a scatter of flat, half-dark cards.
//
// Usage (from the repository root), with the npm package unpacked
// (`npm pack @dgreenheck/ez-tree@1.1.0 && tar xzf dgreenheck-ez-tree-1.1.0.tgz`):
//   node tools/models/make_trees.mjs --src <dir>/package [--out <dir>] [--only <name,...>]
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GlbWriter } from "./gltf_io.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const THREE_URL = pathToFileURL(path.join(ROOT, "apps/editor/node_modules/three/build/three.module.js")).href;
register("./eztree_hooks.mjs", import.meta.url, { data: { three: THREE_URL } });

// The package's own SHA-256 for each image this embeds (the tool refuses others).
const IMAGES = {
  "bark/oak_color_1k.jpg": "053794dc9d3d5c39fc00f2d0f0fc5f6f5c9b81b58c016af26c4aba0335d01722",
  "bark/pine_color_1k.jpg": "01389d2297e901a583d3d3f824c829689fce8afcffcb0eaabcb666688a781e70",
  "bark/birch_color_1k.jpg": "aba7bb86f3d85abffe564c04990c8cfe3d341eea51739e7d48210cc3f550dc2a",
  "bark/willow_color_1k.jpg": "25d93112579146c55fa51cbf9749ef1de36a97f7620b9f5dc4ce5f5a9ab0f04e",
  "leaves/oak_color.png": "24451223cf396d22910a4932b8bb996a7274e63d81e24128c96a430ab67822b1",
  "leaves/ash_color.png": "5ec987db3829a839856c32c79b18a33a78f209e911cad55c65abfb77f30e2d29",
  "leaves/aspen_color.png": "6c8cbfa3eda0f070df6ebb3c8ec6899400f3c966d1658fcfd9ae518347c2dcb9",
  "leaves/pine_color.png": "88be36a2387554ac4b7c7d1549eae454a37ad896e8e33a7d6ae5956bd169ab08",
};

// height: metres, ground to crown top. lod: per-level sections/segments, and the
// share of the preset's leaf cards kept. far: the distant model's branch levels
// dropped and leaf share (it has the fewest sides; see FAR below).
const TREES = [
  { name: "oak", preset: "Oak Medium", height: 13, lod: { sections: [6, 4, 3, 1], segments: [6, 4, 3, 3], leaves: 0.45 }, far: { levels: 1, leaves: 0.12 } },
  { name: "ash", preset: "Ash Medium", height: 15, lod: { sections: [6, 4, 3, 1], segments: [6, 4, 3, 3], leaves: 0.35 }, far: { levels: 1, leaves: 0.12 } },
  { name: "aspen", preset: "Aspen Medium", height: 14, lod: { sections: [6, 4, 3, 1], segments: [6, 4, 3, 3], leaves: 1 }, far: { levels: 1, leaves: 0.3 } },
  { name: "street-young", preset: "Oak Small", height: 7, lod: { sections: [5, 4, 2, 1], segments: [5, 4, 3, 3], leaves: 0.8 }, far: { levels: 1, leaves: 0.2 } },
  { name: "pine", preset: "Pine Medium", height: 16, lod: { sections: [6, 3, 2, 1], segments: [6, 3, 3, 3], leaves: 0.6 }, far: { levels: 0, leaves: 0.04, sections: [3, 1, 1, 1], segments: [3, 3, 2, 2] } },
  { name: "pine-small", preset: "Pine Small", height: 7, lod: { sections: [5, 3, 2, 1], segments: [5, 3, 3, 3], leaves: 0.6 }, far: { levels: 0, leaves: 0.04, sections: [3, 1, 1, 1], segments: [3, 3, 2, 2] } },
  { name: "bush", preset: "Bush 2", height: 1.6, lod: { sections: [3, 3, 2, 1], segments: [4, 3, 3, 3], leaves: 1 }, far: { levels: 1, leaves: 0.3 } },
];

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const src = arg("--src");
if (!src) throw new Error("--src <unpacked @dgreenheck/ez-tree package> is required");
const outDir = arg("--out") ?? path.join(ROOT, "assets/source/kit/nature");
const only = arg("--only")?.split(",");
mkdirSync(outDir, { recursive: true });

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const asset = (rel) => {
  const file = path.join(src, "src/lib/assets", rel);
  const bytes = readFileSync(file);
  const want = IMAGES[rel];
  if (want === undefined) throw new Error(`${rel}: not a recorded image`);
  if (want && sha256(bytes) !== want) throw new Error(`${rel}: SHA-256 ${sha256(bytes)}, expected ${want}`);
  return file;
};

const THREE = await import(THREE_URL);
const { Tree } = await import(pathToFileURL(path.join(src, "src/lib/tree.js")).href);
const { loadPreset } = await import(pathToFileURL(path.join(src, "src/lib/presets/index.js")).href);

const linear = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b, 1];
};
// A leaf tint's hue at full strength: the preset's tints are tuned for its own
// lighting and darken the leaf images too far under the editor's.
const hue = (hex) => {
  const [r, g, b] = linear(hex);
  const top = Math.max(r, g, b);
  return [r / top, g / top, b / top, 1];
};

// The tree for `lod` (sections, segments, leaves as above), with `levels`
// fewer branch levels than the preset and its leaf cards `grow` times bigger.
function grow(spec, lod, levels = 0, grow = 1) {
  const options = loadPreset(spec.preset);
  options.branch.levels -= levels;
  const { sections, segments, leaves } = lod;
  for (let level = 0; level <= options.branch.levels; level++) {
    if (sections[level] !== undefined) options.branch.sections[level] = Math.min(options.branch.sections[level], sections[level]);
    if (segments[level] !== undefined) options.branch.segments[level] = Math.min(options.branch.segments[level], segments[level]);
  }
  options.leaves.count = Math.max(1, Math.round(options.leaves.count * leaves));
  // Fewer cards, each bigger by the square root of the cut, keep the cover.
  options.leaves.size *= Math.sqrt(1 / leaves) * grow;
  const tree = new Tree();
  tree.loadFromJson(options);
  return { options, bark: tree.branchesMesh.geometry, foliage: tree.leavesMesh.geometry };
}

// The far model (LOD1): fewer branch levels, the fewest sides, and cards grown
// to cover what the near model's leaves cover (a little less: big cards read
// as blobs). Both go in one GLB, as root nodes "LOD0" and "LOD1" sharing the
// images; the editor draws LOD1 for instances far from the camera.
const FAR = { sections: [3, 1, 1, 1], segments: [4, 3, 2, 2] };

for (const spec of TREES) {
  if (only && !only.includes(spec.name)) continue;
  const near = grow(spec, spec.lod);
  const box = new THREE.Box3().union(new THREE.Box3().setFromBufferAttribute(near.bark.attributes.position)).union(new THREE.Box3().setFromBufferAttribute(near.foliage.attributes.position));
  const scale = spec.height / (box.max.y - Math.min(0, box.min.y));
  const farLod = { ...FAR, ...spec.far };
  const first = grow(spec, farLod, spec.far.levels);
  const far = grow(spec, farLod, spec.far.levels, 0.85 * Math.sqrt(near.foliage.index.count / first.foliage.index.count));
  write(spec, [near, far], scale, `eztree-${spec.name}.glb`, box);
}

function write(spec, lods, scale, file, box) {
  const { options } = lods[0];

  const w = new GlbWriter("tools/models/make_trees.mjs (ez-tree 1.1.0)");
  const json = w.json;
  json.images = [];
  json.textures = [];
  json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  json.materials = [];
  const texture = (rel, mimeType) => {
    json.images.push(w.image(asset(rel), mimeType));
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    return json.textures.length - 1;
  };
  const crown = new THREE.Box3().setFromBufferAttribute(lods[0].foliage.attributes.position);
  const centre = crown.getCenter(new THREE.Vector3());
  const half = crown.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const outward = (geometry) => {
    const p = geometry.attributes.position.array;
    const out = new Float32Array(p.length);
    const n = new THREE.Vector3();
    for (let i = 0; i < p.length; i += 3) {
      n.set((p[i] - centre.x) / half.x, (p[i + 1] - centre.y) / half.y + 0.5, (p[i + 2] - centre.z) / half.z).normalize();
      out.set([n.x, n.y, n.z], i);
    }
    return out;
  };
  const primitive = (geometry, uvScale, material, normals) => {
    const pos = Float32Array.from(geometry.attributes.position.array, (v) => v * scale);
    const nrm = normals ?? Float32Array.from(geometry.attributes.normal.array);
    const uv = Float32Array.from(geometry.attributes.uv.array, (v, i) => v * (i % 2 ? uvScale[1] : uvScale[0]));
    const count = pos.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pos[i]);
      max[i % 3] = Math.max(max[i % 3], pos[i]);
    }
    const index = count > 65535 ? Uint32Array.from(geometry.index.array) : Uint16Array.from(geometry.index.array);
    return {
      attributes: {
        POSITION: w.accessor(pos, { componentType: 5126, count, type: "VEC3", min, max }, 34962),
        NORMAL: w.accessor(nrm, { componentType: 5126, count, type: "VEC3" }, 34962),
        TEXCOORD_0: w.accessor(uv, { componentType: 5126, count, type: "VEC2" }, 34962),
      },
      indices: w.accessor(index, { componentType: index instanceof Uint32Array ? 5125 : 5123, count: index.length, type: "SCALAR" }, 34963),
      material,
    };
  };

  json.materials.push({
    name: "bark",
    pbrMetallicRoughness: { baseColorTexture: { index: texture(`bark/${options.bark.type}_color_1k.jpg`, "image/jpeg") }, baseColorFactor: linear(options.bark.tint), metallicFactor: 0, roughnessFactor: 0.95 },
  });
  json.materials.push({
    name: "leaves",
    pbrMetallicRoughness: { baseColorTexture: { index: texture(`leaves/${options.leaves.type}_color.png`, "image/png") }, baseColorFactor: hue(options.leaves.tint), metallicFactor: 0, roughnessFactor: 0.8 },
    alphaMode: "MASK",
    alphaCutoff: options.leaves.alphaTest,
    doubleSided: true,
  });
  const ts = options.bark.textureScale;
  json.meshes = lods.map(({ bark, foliage }, i) => ({ name: `${spec.name} LOD${i}`, primitives: [primitive(bark, [ts.x, 1 / ts.y], 0), primitive(foliage, [1, 1], 1, outward(foliage))] }));
  json.nodes = lods.map((_, i) => ({ name: `LOD${i}`, mesh: i }));
  json.scenes = [{ nodes: lods.map((_, i) => i) }];
  json.scene = 0;
  const out = path.join(outDir, file);
  w.write(out);
  const tris = lods.map(({ bark, foliage }) => (bark.index.count + foliage.index.count) / 3).join(" / ");
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
  console.log(`${path.basename(out)}: ${spec.preset}, ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} m, ${tris} triangles, ${(readFileSync(out).length / 1024).toFixed(0)} KB, sha256 ${sha256(readFileSync(out))}`);
}

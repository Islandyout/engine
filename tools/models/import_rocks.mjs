// Imports Poly Haven photoscanned rocks (CC0, https://polyhaven.com) as catalog models (assets/source/kit/nature/rock-*.glb).
// The scans are simplified with meshoptimizer to a few thousand triangles (the colour and normal maps carry the detail, so the
// original UVs are kept) and packed as one mesh with a colour and a normal image.
//
// Usage: node tools/models/import_rocks.mjs <downloads dir> <textures dir> <out dir> <name:target triangles> ...
//   <downloads dir>/<name>/<name>.gltf is a Poly Haven glTF download (1k); <textures dir>/<name>_diff.jpg and _nor.jpg are its
//   images resized with tools/models/downscale_textures.cjs.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlbWriter, loadGltf } from "./gltf_io.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(ROOT, "apps/editor/package.json"));
const { MeshoptSimplifier } = require("meshoptimizer");

const [downloads, textures, out, ...rocks] = process.argv.slice(2);
if (!out || !rocks.length) throw new Error("usage: import_rocks.mjs <downloads> <textures> <out> <name:triangles> ...");
await MeshoptSimplifier.ready;

for (const spec of rocks) {
  const [name, target] = spec.split(":");
  const gltf = loadGltf(path.join(downloads, name, `${name}.gltf`));
  const primitive = gltf.json.meshes[0].primitives[0];
  const positions = gltf.read(primitive.attributes.POSITION).array;
  const normals = gltf.read(primitive.attributes.NORMAL).array;
  const uvs = gltf.read(primitive.attributes.TEXCOORD_0).array;
  const indices = Uint32Array.from(gltf.read(primitive.indices).array);
  const wanted = Math.min(indices.length, Number(target) * 3);
  // Keep texture seams where they are: the simplifier is told the UVs matter.
  const [simple, error] = MeshoptSimplifier.simplifyWithAttributes
    ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, uvs, 2, [1, 1], null, wanted, 0.05, ["LockBorder"])
    : MeshoptSimplifier.simplify(indices, positions, 3, wanted, 0.05, ["LockBorder"]);
  // Compact the vertices the simplified triangles still use.
  const remap = new Map();
  const keep = [];
  const newIndices = new Uint16Array(simple.length);
  simple.forEach((old, i) => {
    let n = remap.get(old);
    if (n === undefined) {
      n = keep.length;
      remap.set(old, n);
      keep.push(old);
    }
    newIndices[i] = n;
  });
  if (keep.length > 65535) throw new Error(`${name}: too many vertices`);
  const p = new Float32Array(keep.length * 3), n3 = new Float32Array(keep.length * 3), uv = new Float32Array(keep.length * 2);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  keep.forEach((old, i) => {
    for (let k = 0; k < 3; k++) {
      p[i * 3 + k] = positions[old * 3 + k];
      n3[i * 3 + k] = normals[old * 3 + k];
      min[k] = Math.min(min[k], p[i * 3 + k]);
      max[k] = Math.max(max[k], p[i * 3 + k]);
    }
    uv[i * 2] = uvs[old * 2];
    uv[i * 2 + 1] = uvs[old * 2 + 1];
  });
  // Stand it on the ground at the origin.
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  for (let i = 0; i < keep.length; i++) {
    p[i * 3] -= cx;
    p[i * 3 + 1] -= min[1];
    p[i * 3 + 2] -= cz;
  }
  const w = new GlbWriter("tools/models/import_rocks.mjs (Poly Haven, CC0)");
  const a = {
    POSITION: w.accessor(p, { componentType: 5126, count: keep.length, type: "VEC3", min: [min[0] - cx, 0, min[2] - cz], max: [max[0] - cx, max[1] - min[1], max[2] - cz] }, 34962),
    NORMAL: w.accessor(n3, { componentType: 5126, count: keep.length, type: "VEC3" }, 34962),
    TEXCOORD_0: w.accessor(uv, { componentType: 5126, count: keep.length, type: "VEC2" }, 34962),
  };
  const index = w.accessor(newIndices, { componentType: 5123, count: newIndices.length, type: "SCALAR" }, 34963);
  w.json.images = [w.image(path.join(textures, `${name}_diff.jpg`), "image/jpeg"), w.image(path.join(textures, `${name}_nor.jpg`), "image/jpeg")];
  w.json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  w.json.textures = [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }];
  w.json.materials = [{ name, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.92 }, normalTexture: { index: 1 } }];
  w.json.meshes = [{ name, primitives: [{ attributes: a, indices: index, material: 0 }] }];
  w.json.nodes = [{ mesh: 0, name }];
  w.json.scenes = [{ nodes: [0] }];
  w.json.scene = 0;
  w.write(path.join(out, `rock-${name.replace(/_/g, "-")}.glb`));
  console.log(`${name}: ${indices.length / 3} -> ${newIndices.length / 3} triangles, ${keep.length} vertices, ${((max[0] - min[0]) * 100).toFixed(0)} x ${((max[1] - min[1]) * 100).toFixed(0)} x ${((max[2] - min[2]) * 100).toFixed(0)} cm, error ${error.toFixed(4)}`);
}

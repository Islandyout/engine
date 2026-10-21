// Pulls the animation clips out of a rigged GLB into a clip-only GLB (the skeleton's nodes and the clips, no mesh or
// textures), with clip names turned into lower snake case. The editor merges these into its clip library by name.
//   node tools/models/extract_clips.mjs <in.glb> <out.glb> [--only Name,Name] [--prefix text]
import { readFileSync } from "node:fs";
import { GlbWriter } from "./gltf_io.mjs";

const TYPED = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const [input, output] = process.argv.slice(2, 4);
if (!input || !output) throw new Error("usage: extract_clips.mjs <in.glb> <out.glb> [--only A,B] [--prefix text]");
const flag = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const only = flag("--only")?.split(",");
const prefix = flag("--prefix") ?? "";

const b = readFileSync(input);
const jl = b.readUInt32LE(12);
const json = JSON.parse(b.toString("utf8", 20, 20 + jl));
const bin = b.subarray(28 + jl, 28 + jl + b.readUInt32LE(20 + jl));
const read = (i) => {
  const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = TYPED[a.componentType];
  const o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const s = bin.subarray(o, o + a.count * SIZE[a.type] * T.BYTES_PER_ELEMENT);
  return { array: new T(s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength)), accessor: a };
};
const snake = (name) => prefix + name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();

const out = new GlbWriter("tools/models/extract_clips.mjs");
out.json.nodes = json.nodes.map(({ mesh, skin, ...n }) => n);
out.json.scenes = json.scenes;
out.json.scene = json.scene ?? 0;
const written = new Map();
const copy = (i) => {
  if (!written.has(i)) {
    const r = read(i);
    written.set(i, out.accessor(r.array, r.accessor));
  }
  return written.get(i);
};
// Bones keep their lengths, so only the root and pelvis need translation keys; scale is constant. Dropping them shrinks a clip to
// its rotation keys.
const keep = (channel) => {
  const path = channel.target.path;
  if (path === "scale") return false;
  if (path === "translation") return /^(root|pelvis)$/.test(json.nodes[channel.target.node].name);
  return true;
};
const names = [];
out.json.animations = json.animations
  .filter((a) => !only || only.includes(a.name))
  .filter((a) => a.name !== "A_TPose")
  .map((a) => {
    const channels = a.channels.filter(keep);
    const used = [...new Set(channels.map((c) => c.sampler))];
    const remap = new Map(used.map((s, i) => [s, i]));
    const samplers = used.map((s) => ({ ...a.samplers[s], input: copy(a.samplers[s].input), output: copy(a.samplers[s].output) }));
    names.push(snake(a.name));
    return { name: snake(a.name), channels: channels.map((c) => ({ ...c, sampler: remap.get(c.sampler) })), samplers };
  });
out.write(output);
console.log(`wrote ${output}: ${names.length} clips: ${names.join(", ")}`);

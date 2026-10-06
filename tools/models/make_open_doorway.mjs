// The dungeon kit's doorway without its door (GATEBREAKER M1): writes
// assets/source/kit/dungeon/wall-doorway-open.glb from wall-doorway.glb,
// unhooking the wall_doorway_door node. Run: node tools/models/make_open_doorway.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../assets/source/kit/dungeon/", import.meta.url);
const bytes = readFileSync(new URL("wall-doorway.glb", dir));
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
const door = json.nodes.findIndex((n) => n.name === "wall_doorway_door");
if (door < 0) throw new Error("no wall_doorway_door node");
for (const node of json.nodes) if (node.children) node.children = node.children.filter((c) => c !== door);
for (const scene of json.scenes) scene.nodes = scene.nodes.filter((n) => n !== door);
let text = JSON.stringify(json);
while (Buffer.byteLength(text) % 4) text += " ";
const jsonChunk = Buffer.from(text);
const rest = bytes.subarray(20 + jsonLength);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + jsonChunk.length + rest.length, 8);
header.writeUInt32LE(jsonChunk.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
writeFileSync(new URL("wall-doorway-open.glb", dir), Buffer.concat([header, jsonChunk, rest]));
console.log("wrote assets/source/kit/dungeon/wall-doorway-open.glb");

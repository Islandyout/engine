// Turns a saved Eden world (the page's "eden-world-v1" text) into one with many people, for measuring the page with a crowd.
//   cd apps/editor && npx tsx ../../tools/eden/crowd.ts <save.json> <people> > crowd.json
// The Creator's form stops at the garden's own limit of people, so the crowd is made here with the same makePerson the Creator uses.
import { readFileSync } from "node:fs";
import { worldFromJson, worldToJson } from "../../apps/editor/src/eden/persist";
import { makePerson } from "../../apps/editor/src/eden/mind";
import { EDEN_PLACES } from "../../apps/editor/src/eden/places";

const world = worldFromJson(readFileSync(process.argv[2]!, "utf8"));
const total = Number(process.argv[3] ?? 60);
world.maxPeople = Math.max(world.maxPeople ?? 0, total + 20);
let s = 1234567;
const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const c = EDEN_PLACES.center!;
for (let i = world.people.length; i < total; i++) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const name = `${letters[Math.floor(i / 26) % 26]!.toUpperCase()}${letters[i % 26]}x`;
  const p = makePerson(`crowd-${i}`, c.x + (r() - 0.5) * 24, c.z + (r() - 0.5) * 24, Math.floor(r() * 1e9), { boldness: r(), sociability: r(), curiosity: r(), appetite: 0.3 + 0.5 * r(), patience: r() }, { name, sex: i % 2 ? "m" : "f", age: 6 + Math.floor(r() * 12) });
  world.people.push(p);
}
process.stdout.write(worldToJson(world));

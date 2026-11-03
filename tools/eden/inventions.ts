// How many inventions an unscripted village reaches (J3). People start with nothing taught; nothing is forced. Same garden as bigworld.ts.
//   cd apps/editor && npx tsx ../../tools/eden/inventions.ts [people=40] [years=1] [seed=1]
// Prints, each quarter, how many of the inventions (INVENTIONS + CRAFTS) the world knows, and at the end which, with cpu time.
import { DAY, YEAR } from "../../apps/editor/src/eden/earth";
import { make, makePerson, step, type Person, type Thing, type World } from "../../apps/editor/src/eden/mind";
import { CRAFTS, inventionCount, inventionsFound } from "../../apps/editor/src/eden/tech";
import { INVENTIONS } from "../../apps/editor/src/eden/culture";
import { enableWorld2 } from "../../apps/editor/src/eden/world2";

const people = Number(process.argv[2] ?? 40);
const years = Number(process.argv[3] ?? 1);
let s = Number(process.argv[4] ?? 1) >>> 0;
const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const things: Thing[] = [{ id: "river", kind: "river", x: 12, z: 0, radius: 4 }, { id: "lake", kind: "lake", x: 90, z: 60, radius: 14 }];
const ring = (id: string, kind: string, n: number, rad: number, stock?: number) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = rad * (0.5 + r());
    things.push({ id: `${id}${i}`, kind, x: Math.cos(a) * d, z: Math.sin(a) * d, radius: 3, ...(stock ? { stock, maxStock: stock } : {}) });
  }
};
ring("grove", "grove", 8, 60, 8);
ring("woods", "woodland", 4, 110, 10);
ring("orch", "orchard", 3, 80, 8);
ring("hollow", "hollow", 4, 40);
for (let i = 0; i < Math.ceil(people / 5); i++) things.push({ id: `shelter-${i}`, kind: "shelter", x: -10 + (i % 6) * 6, z: -12 + Math.floor(i / 6) * 6, radius: 3, stock: 4 });
const world: World = { things, people: [], radius: 190, clock: DAY / 3, maxPeople: 200, climate: { meanC: 14, seasonalAmpC: 7, dailyAmpC: 4, rainy: 0.25, seed: 7 }, fish: 40 };
if (process.env.WORLD2 !== "0") enableWorld2(world, 1);
for (let i = 0; i < people; i++) {
  const p: Person = makePerson(`P${i}`, (r() - 0.5) * 20, (r() - 0.5) * 20, i + 1000, {}, { name: `P${i}`, sex: i % 2 ? "m" : "f", age: 16 + Math.floor(r() * 30) });
  world.people.push(p);
  for (const t of things) if (Math.hypot(t.x, t.z) < 120) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
}
for (let i = 0; i < Math.ceil(people / 2); i++) make(world, i % 5 ? "deer" : "stag", (r() - 0.5) * 300, (r() - 0.5) * 300, {});
const DT = 4;
const cpu0 = process.cpuUsage();
for (let t = 0; t < years * YEAR; t += DT) {
  step(world, DT);
  if (t % (YEAR / 4) < DT) console.log(`year ${(t / YEAR).toFixed(2)}: ${world.people.length} people, ${inventionsFound(world)} of ${inventionCount()} inventions`);
}
const known = [...INVENTIONS, ...CRAFTS].filter((c) => world.knowledge?.[c.id]).map((c) => c.id);
console.log(JSON.stringify({ people, years, seed: process.argv[4] ?? 1, alive: world.people.length, found: inventionsFound(world), of: inventionCount(), ids: known, cpuSeconds: +((process.cpuUsage(cpu0).user + process.cpuUsage(cpu0).system) / 1e6).toFixed(0) }));

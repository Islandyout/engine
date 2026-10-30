// A long run with a large population, to see whether a change to the minds hurts survival or the population at scale.
//   cd apps/editor && npx tsx ../../tools/eden/bigworld.ts [people=60] [years=3] [seed=1]
// Prints the population each half year, deaths by cause (from the chronicle), and the share of person-time spent desperate or starving.
import { DAY, YEAR } from "../../apps/editor/src/eden/earth";
import { make, makePerson, step, type Person, type Thing, type World } from "../../apps/editor/src/eden/mind";

const people = Number(process.argv[2] ?? 60);
const years = Number(process.argv[3] ?? 3);
let s = Number(process.argv[4] ?? 1) >>> 0;
const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

const things: Thing[] = [{ id: "river", kind: "river", x: 12, z: 0, radius: 4 }, { id: "lake", kind: "lake", x: 90, z: 60, radius: 14 }];
const ring = (id: string, kind: string, n: number, rad: number, stock?: number, wood?: boolean) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = rad * (0.5 + r());
    things.push({ id: `${id}${i}`, kind, x: Math.cos(a) * d, z: Math.sin(a) * d, radius: 3, ...(stock ? { stock, maxStock: stock } : {}) });
    void wood;
  }
};
ring("grove", "grove", 8, 60, 8);
ring("woods", "woodland", 4, 110, 10);
ring("orch", "orchard", 3, 80, 8);
ring("hollow", "hollow", 4, 40);
for (let i = 0; i < Math.ceil(people / 5); i++) things.push({ id: `shelter-${i}`, kind: "shelter", x: -10 + (i % 6) * 6, z: -12 + Math.floor(i / 6) * 6, radius: 3, stock: 4 });
const world: World = { things, people: [], radius: 190, clock: DAY / 3, maxPeople: 200, climate: { meanC: 14, seasonalAmpC: 7, dailyAmpC: 4, rainy: 0.25, seed: 7 }, fish: 40 };
for (let i = 0; i < people; i++) {
  const p: Person = makePerson(`P${i}`, (r() - 0.5) * 20, (r() - 0.5) * 20, i + 1000, {}, { name: `P${i}`, sex: i % 2 ? "m" : "f", age: 16 + Math.floor(r() * 30) });
  world.people.push(p);
  for (const t of things) if (Math.hypot(t.x, t.z) < 120) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
}
for (let i = 0; i < Math.ceil(people / 2); i++) make(world, i % 5 ? "deer" : "stag", (r() - 0.5) * 300, (r() - 0.5) * 300, {});
const start = world.people.length;
let desperate = 0;
let samples = 0;
const DT = 4;
const t0 = Date.now();
for (let t = 0; t < years * YEAR; t += DT) {
  step(world, DT);
  if (Math.floor(t / DT) % 15 === 0) {
    for (const p of world.people) {
      samples++;
      if (p.needs.hunger > 0.85 || p.needs.thirst > 0.85) desperate++;
    }
  }
  if (t % (YEAR / 2) < DT) console.log(`year ${(t / YEAR).toFixed(1)}: ${world.people.length} people, ${world.things.filter((q) => q.kind === "deer" || q.kind === "stag").length} deer`);
}
const causes: Record<string, number> = {};
for (const c of world.chronicle ?? []) {
  const m = c.text.match(/died of ([a-z ]+),/);
  if (m) causes[m[1]!] = (causes[m[1]!] ?? 0) + 1;
}
console.log(JSON.stringify({ start, end: world.people.length, births: world.tally?.births ?? 0, desperateShare: +(desperate / Math.max(1, samples)).toFixed(4), causes, ms: Date.now() - t0 }));

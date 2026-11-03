// A year of a default camp, with the tally of everything that happened: what emerged on its own (no test setup).
//   cd apps/editor && npx tsx ../../tools/eden/tally.ts [people=40] [years=1] [seed=2]
import { DAY, YEAR } from "../../apps/editor/src/eden/earth";
import { make, makePerson, step, type Person, type Thing, type World } from "../../apps/editor/src/eden/mind";
import { wealthGini, econOf } from "../../apps/editor/src/eden/economy";

const people = Number(process.argv[2] ?? 40);
const years = Number(process.argv[3] ?? 1);
let s = Number(process.argv[4] ?? 2) >>> 0;
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
ring("rock", "rock", 6, 70);
for (let i = 0; i < Math.ceil(people / 5); i++) things.push({ id: `shelter-${i}`, kind: "shelter", x: -10 + (i % 6) * 6, z: -12 + Math.floor(i / 6) * 6, radius: 3, stock: 4 });
const world: World = { things, people: [], radius: 190, noGo: [{ x: 90, z: 60, r: 14 }], clock: DAY / 3, maxPeople: 200, climate: { meanC: 14, seasonalAmpC: 7, dailyAmpC: 4, rainy: 0.25, seed: 7 }, fish: 40 };
for (let i = 0; i < people; i++) {
  const p: Person = makePerson(`P${i}`, (r() - 0.5) * 20, (r() - 0.5) * 20, i + 1000, {}, { name: `P${i}`, sex: i % 2 ? "m" : "f", age: 16 + Math.floor(r() * 30) });
  world.people.push(p);
  for (const t of things) if (Math.hypot(t.x, t.z) < 120) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
}
for (let i = 0; i < Number(process.env.WOLVES ?? 0); i++) make(world, "wolf", (r() - 0.5) * 120, (r() - 0.5) * 120, {});
for (let i = 0; i < Math.ceil(people / 2); i++) make(world, i % 5 ? "deer" : "stag", (r() - 0.5) * 300, (r() - 0.5) * 300, {});
const start = world.people.length;
let desperate = 0;
let samples = 0;
const DT = 4;
const byKind: Record<string, number> = {};
const kinds: Record<string, number> = {};
let carryWood = 0, carryFood = 0, nsamp = 0;
for (let t = 0; t < years * YEAR; t += DT) {
  step(world, DT);
  if (Math.floor(t / DT) % 20 === 0) { for (const p of world.people) { nsamp++; carryWood += p.carry.wood; carryFood += p.carry.food; const i = p.intent; if ((i?.kind === 'eat' || i?.kind === 'forage') && i.targetId) { const th = world.things.find((x) => x.id === i.targetId); if (th?.owner && th.owner !== p.id) byKind[th.kind] = (byKind[th.kind] ?? 0) + 1; } } }
  if (Math.floor(t / DT) % 15 === 0) for (const p of world.people) { samples++; if (p.needs.hunger > 0.85 || p.needs.thirst > 0.85) desperate++; }
}
const keys = ["births", "loans", "loansRepaid", "defaults", "bondage", "bondageEnded", "hired", "wagesPaid", "labourDays", "quitUnpaid", "venturesBuilt", "crashes", "brokered", "marketTrades", "caravanTrades", "restitutionDebts", "propertyTheft", "bound", "freed", "betrayals", "bandsSplit", "act_fight", "act_kill", "act_murder", "raids", "wars", "warsEnded", "coercions", "seedEaten", "startedVentures", "invested", "stored", "lentToPoor", "strangersCame"];
const out: Record<string, number> = {};
for (const k of Object.keys(world.tally ?? {}).sort()) if (process.env.ALL || keys.includes(k) || k.startsWith("act_") || k.startsWith("cause_")) out[k] = +(world.tally![k] ?? 0).toFixed(1);
const ad = world.people.filter((p) => p.age >= 16);
for (const t of world.things) if (t.owner) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
const known: Record<string, number> = {};
for (const p of world.people) for (const i of p.ideas ?? []) known[i] = (known[i] ?? 0) + 1;
if (process.env.IDEAS) console.log("IDEAS", JSON.stringify(known));
console.log(JSON.stringify({ avgWood: +(carryWood / nsamp).toFixed(2), avgFood: +(carryFood / nsamp).toFixed(2), eatOwned: byKind, ownedKinds: kinds, start, end: world.people.length, desperateShare: +(desperate / Math.max(1, samples)).toFixed(4), gini: +wealthGini(world).toFixed(3), classes: ad.reduce((m, p) => ((m[econOf(p).class ?? "?"] = (m[econOf(p).class ?? "?"] ?? 0) + 1), m), {} as Record<string, number>), tally: out }));

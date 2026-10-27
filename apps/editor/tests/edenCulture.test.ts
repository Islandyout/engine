import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";
import { daylight, YEAR } from "../src/eden/earth";
import { isCustom } from "../src/eden/norms";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0, age = 25) => makePerson(id, x, z, seed, { sociability: 1 }, { name: id, sex, age });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }],
  people,
  radius: 36,
});

test("people together at a fire at dusk are gathered, and it is counted", () => {
  const a = adult("A", "m", 1);
  const b = adult("B", "f", 2, 2, 0);
  const w = world([a, b]);
  w.things.push({ id: "fire", kind: "campfire", x: 1, z: 1, radius: 2, fuel: 1e9 });
  for (const p of [a, b]) p.memory.set("fire", { x: 1, z: 1, feeling: 0.5, visits: 3, lastSeen: 0 });
  w.clock = YEAR * 0.375 + (daylight(YEAR * 0.375).set - 1) * (DAY / 24);
  for (let t = 0; t < 4 * DAY && !isCustom(w, "gather"); t += 2) {
    step(w, 2);
    // keep them at the fire for the test, as a custom needs them to be there to start
    const hr = ((w.clock! / DAY) * 24) % 24;
    if (hr > daylight(w.clock!).set - 1.5 && hr < daylight(w.clock!).set + 1.5) {
      for (const [p, x] of [[a, 0], [b, 2]] as const) {
        p.x = x;
        p.z = 0.5;
        if (p.intent?.kind !== "warm") p.intent = { kind: "warm", targetId: "fire", x: 1, z: 1, speed: 1.6, remaining: 20, arrived: true };
      }
    }
  }
  assert.ok((w.tally?.duskGatherings ?? 0) >= 1, "nobody gathered at the fire");
});

test("someone the others have lost faith in is shunned, and taken back when faith returns", () => {
  const a = adult("A", "m", 3);
  const b = adult("B", "f", 4, 2, 0);
  const c = adult("C", "m", 5, 3, 0);
  const w = world([a, b, c]);
  for (const q of [b, c]) q.relations.set("A", { affinity: -0.5, trust: 0.05, familiarity: 0.5, lastTogether: 0 });
  a.felt = { hungry: 0, cold: 0, scares: 0, reflected: -DAY };
  step(w, 1);
  assert.equal(a.shunned, true);
  assert.ok(w.chronicle?.some((e) => /shunned/.test(e.text)));
  for (const q of [b, c]) q.relations.get("A")!.trust = 0.8;
  a.felt = { hungry: 0, cold: 0, scares: 0, reflected: -DAY };
  w.clock = (w.clock ?? 0) + DAY;
  step(w, 1);
  assert.equal(a.shunned, false);
});

test("an elder tells a story of something that mattered long ago, once, to someone who has not heard it", () => {
  const elder = adult("Old", "m", 6, 0, 0, 60);
  const young = adult("Young", "f", 7, 2, 0, 12);
  const w = world([elder, young]);
  w.clock = 5 * DAY;
  elder.journal.push({ t: 100, text: "Killed a deer. Meat for days.", w: 0.6 });
  elder.needs.social = 0.95;
  young.needs.social = 0.95;
  for (let t = 0; t < DAY && !(young.heard ?? []).length; t += 2) {
    step(w, 2);
    elder.needs.social = Math.max(elder.needs.social, 0.9);
    young.needs.social = Math.max(young.needs.social, 0.9);
    elder.x = Math.min(elder.x, 3);
    young.x = Math.min(young.x, 3);
  }
  assert.ok((young.heard ?? []).includes("Killed a deer. Meat for days."), "the story was not told");
  assert.ok(young.journal.some((j) => /told me: Killed a deer/.test(j.text)));
});

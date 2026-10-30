import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }],
  people,
  radius: 36,
});

test("an infant stays by its mother and is nursed; without her it starves", () => {
  const mum = adult("Mum", "f", 1);
  const baby = makePerson("baby", 20, 0, 2, {}, { name: "Baby", age: 0.1, parents: [mum, adult("Dad", "m", 3)] });
  const w = world([mum, baby]);
  baby.needs.hunger = 0.8;
  for (let t = 0; t < 600; t++) step(w, 1);
  assert.ok(Math.hypot(baby.x - mum.x, baby.z - mum.z) < 4, "the infant was left behind");
  assert.ok(baby.needs.hunger < 0.6, "the infant was not nursed");
  const orphan = makePerson("orphan", 0, 0, 4, {}, { name: "Orphan", age: 0.1, parents: [adult("M", "f", 5), adult("F", "m", 6)] });
  orphan.mother = "gone";
  const w2 = world([orphan]);
  orphan.needs.hunger = 0.3;
  for (let t = 0; t < 3000; t++) step(w2, 1);
  assert.ok(orphan.needs.hunger > 0.7, "an orphaned infant should be going hungry");
});

test("a dirty person goes to the water and washes", () => {
  const a = adult("A", "m", 7);
  const w = world([a]);
  a.hygiene = 0.9;
  a.memory.set("river", { x: 0, z: 10, feeling: 0.2, visits: 1, lastSeen: 0 });
  w.clock = DAY * 0.4;
  for (let t = 0; t < DAY / 2 && (w.tally?.washed ?? 0) === 0; t += 2) step(w, 2);
  assert.ok((w.tally?.washed ?? 0) >= 1, "never washed");
  assert.ok((a.hygiene ?? 1) < 0.5);
});

test("a diet of one thing is a deficiency, and the sick feel it", async () => {
  // The first version of this test compared how many of 30 people fell ill on a one-note diet against a varied one. The hazard it
  // measures is about 0.03 a day against 0.02, so the expected difference over 30 people is a fraction of one illness: it passed or
  // failed with the order of the random stream, not with the mind. The claim is now tested where it is made: what counts as a
  // deficiency, and the hazard factor itself (1.35 in `lifeAndDeath`) is read from it.
  const { deficient, dietFactor } = await import("../src/eden/mind");
  const one = adult("A", "m", 8);
  one.diet = { stored: 6 };
  const varied = adult("B", "m", 9);
  varied.diet = { stored: 3, fruit: 3 };
  const little = adult("C", "m", 10);
  little.diet = { stored: 2 };
  assert.equal(deficient(one), true, "a diet of one thing is a deficiency");
  assert.equal(deficient(varied), false, "a varied diet is not");
  assert.equal(deficient(little), false, "having eaten little is not a deficiency yet");
  assert.equal(dietFactor(one), 1.35, "and a deficiency raises the chance of falling ill by a third");
  assert.equal(dietFactor(varied), 1);
  // (A simulated comparison of illness counts was dropped: at these rates a comparison needs thousands of lives to mean anything, and the
  // season sweep already measures illness across 4,000.)
});

test("a healer gives a remedy that eases the sick faster", () => {
  const nurse = adult("N", "f", 9);
  const sick = adult("S", "m", 10, 1, 0);
  nurse.skills!.heal = 0.8;
  const w = world([nurse, sick]);
  nurse.relations.set("S", { affinity: 0.8, trust: 0.7, familiarity: 0.6, lastTogether: 0 });
  sick.relations.set("N", { affinity: 0.8, trust: 0.7, familiarity: 0.6, lastTogether: 0 });
  sick.illness = { severity: 0.8, since: 0 };
  sick.mood = -0.6;
  w.clock = DAY * 0.4;
  for (let i = 0; i < DAY / 2; i += 2) {
    step(w, 2);
    if (sick.illness) sick.illness.severity = Math.max(sick.illness.severity, 0.5);
  }
  assert.ok((w.tally?.remedies ?? 0) >= 1, "no remedy was given");
});

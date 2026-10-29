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
  const { weatherAt } = await import("../src/eden/earth");
  void weatherAt;
  const a = adult("A", "m", 8);
  const w = world([a]);
  a.diet = { stored: 6 };
  let sick = 0;
  for (let k = 0; k < 30; k++) {
    const p = adult("P", "m", 100 + k);
    p.diet = { stored: 6 };
    const ww = world([p]);
    for (let t = 0; t < DAY; t += 4) {
      p.diet.stored = 6;
      step(ww, 4);
    }
    if ((ww.tally?.illnesses ?? 0) > 0) sick++;
  }
  const control = Array.from({ length: 30 }, (_, k) => {
    const p = adult("Q", "m", 100 + k);
    p.diet = { stored: 3, fruit: 3 };
    const ww = world([p]);
    for (let t = 0; t < DAY; t += 4) {
      p.diet.stored = 3;
      p.diet.fruit = 3;
      step(ww, 4);
    }
    return (ww.tally?.illnesses ?? 0) > 0 ? 1 : 0;
  }).reduce((x: number, y: number) => x + y, 0);
  assert.ok(sick >= control, `a one-note diet should not be healthier (${sick} vs ${control})`);
  void w;
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

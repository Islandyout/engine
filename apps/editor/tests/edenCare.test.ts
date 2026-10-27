import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }],
  people,
  radius: 36,
});

test("a bite leaves a wound that mends with time, and a neglected one can turn bad", () => {
  const a = adult("A", "m", 1);
  const w = world([a]);
  a.wound = 0.6;
  for (let i = 0; i < 12 * DAY; i += 2) step(w, 2);
  assert.ok((a.wound ?? 0) < 0.3, "the wound did not mend");
  const infected = Array.from({ length: 40 }, (_, k) => {
    const p = adult("P", "m", 100 + k);
    p.wound = 0.9;
    p.needs.hunger = 0.8;
    const ww = world([p]);
    for (let i = 0; i < 4 * DAY; i += 4) {
      p.needs.hunger = Math.max(p.needs.hunger, 0.75);
      step(ww, 4);
    }
    return (ww.tally?.infections ?? 0) > 0;
  }).filter(Boolean).length;
  assert.ok(infected > 3, `only ${infected} of 40 hungry wounded people got an infection`);
});

test("someone who sits with the sick helps them, and learns to heal", () => {
  const nurse = adult("N", "f", 2);
  const sick = adult("S", "m", 3, 1, 0);
  const w = world([nurse, sick]);
  nurse.relations.set("S", { affinity: 0.8, trust: 0.7, familiarity: 0.6, lastTogether: 0 });
  sick.relations.set("N", { affinity: 0.8, trust: 0.7, familiarity: 0.6, lastTogether: 0 });
  sick.illness = { severity: 0.7, since: 0 };
  sick.mood = -0.6;
  w.clock = DAY * 0.4;
  for (let i = 0; i < DAY / 2; i += 2) {
    step(w, 2);
    if (sick.illness) sick.illness.severity = Math.max(sick.illness.severity, 0.5);
  }
  assert.ok((w.tally?.nursed ?? 0) >= 1, "nobody nursed");
  assert.ok((nurse.skills?.heal ?? 0) > 0, "the nurse learned nothing");
});

test("a hunter keeps the hide, sews a cloak from it", () => {
  const a = adult("A", "m", 5);
  const w = world([a]);
  w.clock = 16 * DAY * 0.8; // late autumn into winter
  a.carry.hide = 2;
  for (let t = 0; t < DAY; t += 2) step(w, 2);
  assert.ok((w.tally?.sewn ?? 0) >= 1, "nothing sewn");
  assert.ok((a.clothing ?? 0) > 0.2);
  assert.ok(a.journal.some((j) => /Sewed a cloak/.test(j.text)));
});

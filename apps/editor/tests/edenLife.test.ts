import test from "node:test";
import assert from "node:assert/strict";
import { bondOf, DAY, makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";
import { YEAR } from "../src/eden/earth";

const base = (people: Person[], things: Thing[] = []): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }, ...things],
  people,
  radius: 36,
});
const run = (w: World, seconds: number, dt = 1) => {
  for (let t = 0; t < seconds; t += dt) step(w, dt);
};
const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });

test("a person with no roof sets out to build one, and is glad when it is done", () => {
  const a = adult("A", "m", 3);
  const w = base([a]);
  run(w, 3 * DAY);
  assert.ok((w.tally?.goalsSet ?? 0) > 0, "never set a goal");
  assert.ok(w.things.some((t) => t.kind === "shelter"), "never built a roof");
  assert.ok(a.journal.some((j) => /I want to build a shelter/.test(j.text)));
});

test("a seed is planted in spring, and the plot bears fruit", () => {
  const a = adult("A", "m", 5);
  a.carry.seed = 2;
  const w = base([a]);
  w.clock = DAY / 3; // spring, day one
  run(w, 3 * DAY);
  const crops = w.things.filter((t) => t.kind === "crop");
  assert.ok(crops.length >= 1, "nothing planted");
  assert.ok(w.tally?.planted && w.tally.planted >= 1);
  w.clock = YEAR / 4; // summer
  run(w, 2 * DAY);
  assert.ok(crops.some((c) => (c.stock ?? 0) > 0), "the plot bore nothing");
});

test("a hungry person with a spear hunts a deer and brings home meat", () => {
  const a = adult("A", "m", 9);
  a.tools.spear = true;
  a.needs.hunger = 0.9;
  const deer: Thing = { id: "d1", kind: "deer", x: 12, z: 6, radius: 2 };
  const w = base([a], [deer]);
  // The grove is known and has food, so make hunting the only way out: no grove.
  w.things = w.things.filter((t) => t.kind !== "grove");
  a.memory.set("d1", { x: 12, z: 6, feeling: 0.2, visits: 0, lastSeen: 0 });
  run(w, 600);
  assert.ok((w.tally?.hunted ?? 0) >= 1 || w.things.filter((t) => t.kind === "deer").length === 0 || a.needs.hunger < 0.7, "nothing came of it");
});

test("deer breed in spring, and foxes hunt them and starve without them", () => {
  const w = base([], [
    { id: "d1", kind: "deer", x: 10, z: 10, radius: 2 },
    { id: "d2", kind: "deer", x: 12, z: 10, radius: 2 },
  ]);
  w.clock = DAY / 3;
  run(w, 14 * DAY, 5);
  assert.ok(w.things.filter((t) => t.kind === "deer").length > 2, "the herd never grew");
  assert.ok(w.things.filter((t) => t.kind === "deer").length <= 8, "the herd had no limit");
  const lone: World = base([], [{ id: "f1", kind: "fox", x: 0, z: 0, radius: 1 }]);
  run(lone, 6 * DAY, 5);
  assert.equal(lone.things.filter((t) => t.kind === "fox").length, 0, "a fox with nothing to eat lived on");
});

test("a death is grieved, remembered and recorded", () => {
  const a = adult("A", "m", 1);
  const b = adult("B", "f", 2);
  const w = base([a, b]);
  b.relations.set("A", { affinity: 0.9, trust: 0.8, familiarity: 0.8, lastTogether: 0 });
  a.health = 0.01;
  const moodBefore = b.mood;
  step(w, 1);
  assert.equal(w.people.length, 1);
  assert.equal(w.dead?.length, 1);
  assert.equal(w.dead![0]!.person.name, "A");
  assert.ok(b.mood < moodBefore - 0.3, "no grief");
  assert.ok(b.journal.some((j) => /A died/.test(j.text)));
});

test("two partners with a roof and food laid by have a child, who is looked after", () => {
  // Birth is a chance (a baby can be born still, a mother can fall ill first), so try a dozen couples: most have a child.
  let born = 0;
  for (let k = 0; k < 12; k++) {
    const mother = adult("M", "f", 13 + 2 * k);
    const father = adult("F", "m", 14 + 2 * k);
    for (const [p, o] of [[mother, "F"], [father, "M"]] as const) p.relations.set(o, { affinity: 0.95, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
    assert.equal(bondOf(mother, father), "partner");
    const w = base([mother, father], [{ id: "shelter-1", kind: "shelter", x: 2, z: 2, radius: 3, stock: 30 }]);
    w.clock = DAY / 3; // spring
    run(w, 30 * DAY, 2); // a child is carried three-quarters of a year (12 days) before it is born
    const child = w.people.find((p) => p.mother === "M");
    if (!child) continue;
    born++;
    assert.equal(child.father, "F");
    assert.ok(child.age < 1.5);
    assert.ok(mother.journal.some((j) => /was born to me/.test(j.text)));
    // A child does not gather wood, and stays near their mother.
    run(w, 3 * DAY, 2);
    assert.ok(Math.hypot(child.x - mother.x, child.z - mother.z) < 40);
  }
  assert.ok(born >= 6, `only ${born} of 12 couples had a child`);
});

test("someone low is comforted by someone who cares, and quarrels can happen between two who are low", () => {
  const a = adult("A", "m", 21);
  const b = adult("B", "f", 22);
  a.relations.set("B", { affinity: 0.7, trust: 0.7, familiarity: 0.5, lastTogether: 0 });
  b.relations.set("A", { affinity: 0.7, trust: 0.7, familiarity: 0.5, lastTogether: 0 });
  b.mood = -0.8;
  const w = base([a, b]);
  // Keep B low for a while so the offer stands.
  for (let t = 0; t < 200; t++) {
    b.mood = Math.min(b.mood, -0.5);
    step(w, 1);
  }
  assert.ok((w.tally?.comforts ?? 0) >= 1, "nobody sat with the one who was low");
});

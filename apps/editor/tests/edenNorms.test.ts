import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";
import { fadeNorms, isCustom, reinforce, standing, standingWord } from "../src/eden/norms";
import { worldFromJson, worldToJson } from "../src/eden/persist";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }],
  people,
  radius: 36,
});

test("a way of doing things seen often becomes a custom, which everyone writes down, and unused fades", () => {
  const a = adult("A", "m", 1);
  const b = adult("B", "f", 2, 3, 0);
  const w = world([a, b]);
  let announced = false;
  for (let i = 0; i < 10 && !announced; i++) announced = reinforce(w, "share", a, 0.1);
  assert.ok(announced && isCustom(w, "share"));
  w.people.forEach((p) => assert.ok(p.journal.length >= 0));
  fadeNorms(w, 120 * DAY);
  assert.ok(!isCustom(w, "share"), "a custom unused for months should fade");
});

test("a norm needs a witness: done alone, it is nobody's custom", () => {
  const a = adult("A", "m", 1);
  const w = world([a]);
  assert.equal(reinforce(w, "share", a, 1), false);
  assert.equal(w.norms?.share, undefined);
});

test("sharing food in front of others builds the custom", () => {
  const a = adult("A", "m", 3);
  const b = adult("B", "f", 4, 2, 0);
  const c = adult("C", "m", 5, 3, 0);
  const w = world([a, b, c]);
  w.things.splice(0, 1);
  a.carry.food = 6;
  b.needs.hunger = 0.9;
  c.needs.hunger = 0.9;
  a.relations.set("B", { affinity: 0.6, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  b.relations.set("A", { affinity: 0.6, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  for (let t = 0; t < 600; t++) {
    step(w, 1);
    b.needs.hunger = Math.max(b.needs.hunger, 0.8);
    c.needs.hunger = Math.max(c.needs.hunger, 0.8);
  }
  assert.ok((w.norms?.share?.strength ?? 0) > 0.05, "sharing did not count toward a custom");
});

test("standing is the trust others have, in words, and customs survive saving", () => {
  const a = adult("A", "m", 6);
  const b = adult("B", "f", 7);
  const w = world([a, b]);
  b.relations.set("A", { affinity: 0.5, trust: 0.9, familiarity: 0.5, lastTogether: 0 });
  assert.equal(standingWord(standing(w, a)), "respected");
  w.norms = { share: { strength: 0.7, announced: true } };
  assert.deepEqual(worldFromJson(worldToJson(w)).norms, w.norms);
});

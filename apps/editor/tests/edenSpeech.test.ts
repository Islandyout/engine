import test from "node:test";
import assert from "node:assert/strict";
import { converse } from "../src/eden/speech";
import { makePerson, step, type World } from "../src/eden/mind";

const pair = () => {
  const a = makePerson("a", 0, 0, 1, { sociability: 0.8 }, { name: "Adam", sex: "m" });
  const b = makePerson("b", 1, 0, 2, {}, { name: "Eve", sex: "f" });
  const w: World = { things: [{ id: "river", kind: "river", x: 0, z: 10, radius: 3 }], people: [a, b], radius: 36 };
  return { a, b, w };
};
const seeded = (n: number) => {
  let s = n;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

test("what a person says follows what weighs on them", () => {
  const { a, b, w } = pair();
  a.needs.hunger = 0.95;
  a.needs.thirst = 0;
  const lines = new Set<string>();
  for (let i = 1; i < 40; i++) lines.add(converse(w, a, b, seeded(i)).said);
  assert.ok([...lines].some((l) => /hungry|eaten|eat|stomach/i.test(l)), [...lines].join(" | "));
  const cold = pair();
  cold.a.cold = 0.9;
  cold.a.needs.hunger = 0;
  const cl = new Set<string>();
  for (let i = 1; i < 40; i++) cl.add(converse(cold.w, cold.a, cold.b, seeded(i)).said);
  assert.ok([...cl].some((l) => /freezing|cold|fire/i.test(l)), [...cl].join(" | "));
});

test("they tell what has happened, and answer", () => {
  const { a, b, w } = pair();
  a.journal.push({ t: 0, text: "Built a shelter." });
  w.clock = 100;
  const seen = new Set<string>();
  for (let i = 1; i < 60; i++) seen.add(converse(w, a, b, seeded(i)).said);
  assert.ok([...seen].some((l) => /roof|shelter/i.test(l)), [...seen].join(" | "));
  const x = converse(w, a, b, seeded(3));
  assert.ok(x.said.length > 3 && x.reply.length > 3);
});

test("the same two people in the same moment say the same thing", () => {
  const { a, b, w } = pair();
  assert.deepEqual(converse(w, a, b, seeded(9)), converse(w, a, b, seeded(9)));
});

test("a long life gives them plenty to say, and they say different things", () => {
  const { a, b, w } = pair();
  w.things.push({ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 });
  a.needs.social = 0.9;
  b.needs.social = 0.9;
  const said = new Set<string>();
  for (let t = 0; t < 8 * 1440; t += 1) {
    step(w, 1);
    if (a.say) said.add(a.say);
    if (b.say) said.add(b.say);
  }
  assert.ok(said.size >= 12, `only ${said.size} different things said: ${[...said].join(" | ")}`);
});

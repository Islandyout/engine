import test from "node:test";
import assert from "node:assert/strict";
import { hearWalker, nearbyPeople } from "../src/eden/chat";
import { makePerson, type World } from "../src/eden/mind";

const world = (): World => {
  const a = makePerson("A", 0, 0, 3, { sociability: 0.8 }, { name: "Awan", sex: "f", age: 25 });
  const b = makePerson("B", 2, 1, 4, {}, { name: "Seth", sex: "m", age: 30 });
  const w: World = { things: [{ id: "river", kind: "river", x: 40, z: -5, radius: 3 }, { id: "grove", kind: "grove", x: -20, z: 30, radius: 3, stock: 5, maxStock: 5 }], people: [a, b], radius: 100 };
  a.memory.set("river", { x: 40, z: -5, feeling: 0.5, visits: 3, last: 0 } as never);
  return w;
};
const rnd = () => 0.3;

test("the people near you are listed nearest first, and those far off are not", () => {
  const w = world();
  w.people.push(makePerson("C", 50, 50, 5, {}, { name: "Cain", sex: "m", age: 20 }));
  assert.deepEqual(nearbyPeople(w, 0, 0).map((p) => p.name), ["Awan", "Seth"]);
});

test("they greet, say how they are, and say where the water is that they have seen", () => {
  const w = world();
  const a = w.people[0]!;
  assert.match(hearWalker(w, a, "Hello!", rnd).reply, /stranger|Hello|Good/i);
  a.needs.thirst = 0.9;
  assert.match(hearWalker(w, a, "how are you?", rnd).reply, /thirsty/);
  const where = hearWalker(w, a, "where can I find water?", rnd).reply;
  assert.match(where, /river/i);
  assert.match(where, /east/);
});

test("they do not know what they have not seen", () => {
  const w = world();
  assert.match(hearWalker(w, w.people[0]!, "where is there shelter?", rnd).reply, /do not know/);
});

test("a warm person with food spares some; talking is remembered and they stay to listen", () => {
  const w = world();
  const a = w.people[0]!;
  a.carry.food = 3;
  const r = hearWalker(w, a, "do you have any food to spare?", rnd);
  assert.equal(r.gaveFood, true);
  assert.equal(a.carry.food, 2);
  assert.equal(a.intent?.kind, "linger");
  assert.ok(a.journal.some((j) => /The Walker and I spoke/.test(j.text)));
  assert.ok((a.walkerTrust ?? 0) > 0);
});

test("they say what they think of another person, and anything else draws what is on their mind", () => {
  const w = world();
  const a = w.people[0]!;
  assert.match(hearWalker(w, a, "what do you think of Seth?", rnd).reply, /Seth/);
  assert.ok(hearWalker(w, a, "blah blah", rnd).reply.length > 3);
});

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

test("they come along when asked if they trust you or are warm, keep near, and stop when a need calls them", async () => {
  const { step } = await import("../src/eden/mind");
  const w = world();
  const a = w.people[0]!;
  assert.match(hearWalker(w, a, "follow me", rnd).reply, /come|Lead|walk/i);
  assert.ok((a.followUntil ?? 0) > 0);
  w.visitor = { x: 30, z: 0 };
  for (let i = 0; i < 40; i++) step(w, 2);
  assert.ok(Math.hypot(a.x - 30, a.z) < 12, "they did not come toward the Walker");
  a.needs.hunger = 0.95;
  step(w, 2);
  assert.equal(a.followUntil, undefined);
  const b = w.people[1]!;
  b.followUntil = 99999;
  hearWalker(w, b, "stay here", rnd);
  assert.equal(b.followUntil, undefined);
});

test("'bring me water': they go to the river they know, come back and put it in your hands", async () => {
  const { step } = await import("../src/eden/mind");
  const w = world();
  const a = w.people[0]!;
  a.needs.thirst = 0.1;
  w.visitor = { x: 0, z: 0 };
  const r = hearWalker(w, a, "Could you bring me some water?", rnd);
  assert.equal(r.errand, "water");
  assert.equal(a.errand?.stage, "go");
  let delivered = false;
  for (let i = 0; i < 120 && !delivered; i++) {
    step(w, 2);
    delivered = !!w.walkerEvents?.some((e) => e.kind === "delivered" && e.item === "water");
  }
  assert.ok(delivered, "the water never came");
  assert.equal(a.errand, undefined);
  assert.ok(a.journal.some((j) => /brought the Walker water/.test(j.text)));
});

test("they will not fetch what they have never seen, or run errands for a stranger who is shy, or when starving", () => {
  const w = world();
  const a = w.people[0]!;
  assert.match(hearWalker(w, a, "bring me some wood", rnd).reply, /do not know where/);
  const b = makePerson("S", 1, 1, 9, { sociability: 0.1 }, { name: "Shy", sex: "m", age: 30 });
  b.memory.set("river", { x: 40, z: -5, feeling: 0.5, visits: 1, last: 0 } as never);
  w.people.push(b);
  assert.match(hearWalker(w, b, "fetch me water", rnd).reply, /know you well enough/);
  a.needs.hunger = 0.95;
  assert.match(hearWalker(w, a, "bring me water", rnd).reply, /hunger|eat/);
});

test("a thirsty person near you asks for water, and what you give eases it and is remembered", async () => {
  const { step, giveToPerson } = await import("../src/eden/mind");
  const w = world();
  const a = w.people[0]!;
  a.walkerTrust = 0.3;
  a.needs.thirst = 0.8;
  w.visitor = { x: 3, z: 0 };
  step(w, 2);
  assert.equal(a.asks?.item, "water");
  assert.ok(w.walkerEvents?.some((e) => e.kind === "asked"));
  assert.equal(giveToPerson(w, a, "water"), true);
  assert.ok(a.needs.thirst < 0.5);
  assert.equal(a.asks, undefined);
  w.people[1]!.needs.thirst = 0.05;
  assert.equal(giveToPerson(w, w.people[1]!, "water"), false);
});

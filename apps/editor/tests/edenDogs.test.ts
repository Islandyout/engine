import test from "node:test";
import assert from "node:assert/strict";
import { DAY, make, makePerson, step, type Person, type World } from "../src/eden/mind";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, { sociability: 1 }, { name: id, sex, age: 25 });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }],
  people,
  radius: 36,
});

test("someone with food wins a stray dog over in a few feedings, and it stays by them", () => {
  const a = adult("A", "m", 1);
  const w = world([a]);
  const dog = make(w, "dog", 6, 2, { radius: 2 });
  a.carry.food = 6;
  a.memory.set(dog.id, { x: 6, z: 2, feeling: 0.2, visits: 1, lastSeen: 0 });
  w.clock = DAY * 0.4;
  for (let t = 0; t < DAY && !dog.of; t++) {
    step(w, 1);
    a.carry.food = Math.max(a.carry.food, 3);
  }
  assert.equal(dog.of, "A", "the dog was not won");
  assert.ok(a.journal.some((j) => /A dog has chosen me/.test(j.text)));
  a.x = -20;
  a.z = 5;
  for (let t = 0; t < 40; t++) step(w, 1);
  assert.ok(Math.hypot(dog.x - a.x, dog.z - a.z) < 12, "the dog did not follow");
});

test("a fox keeps away from a dog that has someone", () => {
  const a = adult("A", "m", 2);
  const w = world([a]);
  const dog = make(w, "dog", 3, 0, { radius: 2, of: "A" });
  const fox = make(w, "fox", 8, 0, { radius: 1 });
  w.clock = DAY * 0.4;
  for (let t = 0; t < 120; t++) {
    step(w, 1);
  }
  assert.ok(Math.hypot(fox.x - dog.x, fox.z - dog.z) > 12, "the fox stayed by the dog");
});

test("nobody walks into the lake: they go round it, and are pushed to its bank if they are put in it", async () => {
  const { keepOut, routeAround } = await import("../src/eden/mind");
  const w = world([adult("A", "m", 5)]);
  w.noGo = [{ x: 50, z: 0, r: 20 }];
  const p = { x: 55, z: 2 };
  keepOut(w, p);
  assert.ok(Math.hypot(p.x - 50, p.z) >= 19.99, "still in the water");
  const via = routeAround(w, 0, 0, 100, 0);
  assert.ok(via && Math.hypot(via.x - 50, via.z) > 20, "no way round was found");
  assert.equal(routeAround(w, 0, 0, 0, 100), undefined, "a clear way should need no detour");
  // Someone sent straight across on the mind's own motion ends up on the far bank, not in the water.
  const walker = adult("W", "m", 6, 0, 0);
  const w2 = world([walker]);
  w2.noGo = [{ x: 50, z: 0, r: 20 }];
  walker.intent = { kind: "wander", x: 100, z: 0, speed: 1.6, remaining: 5, arrived: false };
  for (let t = 0; t < 60 && !walker.intent?.arrived; t++) {
    step(w2, 1);
    assert.ok(Math.hypot(walker.x - 50, walker.z) >= 19.9, "walked into the lake");
  }
});

test("the people notice the Walker, and are fed when game is brought down near them", async () => {
  const { shareKill, make } = await import("../src/eden/mind");
  const a = adult("A", "m", 31);
  const w = world([a]);
  w.visitor = { x: 4, z: 0 };
  step(w, 1);
  assert.ok(a.journal.some((j) => /stranger in a green hood/.test(j.text)));
  assert.ok(w.chronicle?.some((e) => /the Walker/.test(e.text)));
  a.needs.hunger = 0.8;
  const deer = make(w, "stag", 5, 0, { radius: 2 });
  const before = a.carry.food;
  shareKill(w, deer);
  assert.equal(a.carry.food, before + 2);
  assert.ok(a.journal.some((j) => /left me the meat/.test(j.text)));
});

test("a cow gives a little to eat each day without being killed", async () => {
  const { make } = await import("../src/eden/mind");
  const a = adult("A", "m", 32);
  const w = world([a]);
  w.things.splice(0, 1);
  const cow = make(w, "cow", 6, 0, { radius: 2, stock: 3, maxStock: 3 });
  a.memory.set(cow.id, { x: 6, z: 0, feeling: 0.3, visits: 1, lastSeen: 0 });
  a.needs.hunger = 0.8;
  for (let t = 0; t < 600; t++) step(w, 1);
  assert.ok(w.things.includes(cow), "the cow was killed");
  assert.ok((cow.stock ?? 3) < 3 || a.needs.hunger < 0.8, "nobody ate from the cow");
});

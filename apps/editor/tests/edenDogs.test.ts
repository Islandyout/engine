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

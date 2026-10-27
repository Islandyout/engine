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

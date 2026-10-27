import test from "node:test";
import assert from "node:assert/strict";
import { makePerson, step, actionOf, SIGHT, type Thing, type World } from "../src/eden/mind";

const garden = (): Thing[] => [
  { id: "grove", kind: "grove", x: 12, z: 0, radius: 6 },
  { id: "river", kind: "river", x: 0, z: 10, radius: 3 },
  { id: "hollow", kind: "hollow", x: -12, z: 0, radius: 4 },
  { id: "overlook", kind: "overlook", x: 0, z: -14, radius: 4 },
];
const run = (world: World, seconds: number, dt = 0.5) => {
  for (let t = 0; t < seconds; t += dt) step(world, dt);
};

test("the same seed lives the same life", () => {
  const a: World = { things: garden(), people: [makePerson("a", 0, 0, 7)] };
  const b: World = { things: garden(), people: [makePerson("a", 0, 0, 7)] };
  run(a, 300);
  run(b, 300);
  assert.equal(a.people[0]!.x, b.people[0]!.x);
  assert.equal(a.people[0]!.z, b.people[0]!.z);
});

test("a hungry person who knows a grove goes and eats", () => {
  const p = makePerson("a", 0, 0, 3);
  p.needs.hunger = 0.95;
  p.needs.thirst = 0;
  p.needs.social = 0;
  const world: World = { things: garden(), people: [p] };
  run(world, 120);
  assert.ok(p.needs.hunger < 0.6, `hunger ${p.needs.hunger}`);
});

test("they only know what they have seen", () => {
  const p = makePerson("a", 0, 0, 3);
  p.needs.hunger = 1;
  const far: Thing = { id: "grove", kind: "grove", x: SIGHT + 40, z: 0, radius: 6 };
  const world: World = { things: [far], people: [p] };
  run(world, 5);
  assert.equal(p.memory.has("grove"), false);
  assert.notEqual(p.intent?.kind, "eat");
});

test("a person runs from danger and is hurt if caught in it", () => {
  const p = makePerson("a", 0, 0, 5, { boldness: 0.2 });
  const fox: Thing = { id: "fox", kind: "fox", x: 3, z: 0, radius: 1 };
  const world: World = { things: [fox], people: [p] };
  step(world, 0.5);
  assert.equal(p.intent?.kind, "flee");
  const before = Math.hypot(p.x - fox.x, p.z - fox.z);
  run(world, 10);
  assert.ok(Math.hypot(p.x - fox.x, p.z - fox.z) > before + 5);
  assert.ok(p.memory.get("fox")!.feeling < 0);
});

test("a meal runs out, and a person finding it empty thinks less of the place", () => {
  const p = makePerson("a", 0, 0, 9);
  p.needs.hunger = 1;
  p.needs.thirst = 0;
  p.needs.social = 0;
  const bush: Thing = { id: "bush", kind: "bush", x: 4, z: 0, radius: 2, stock: 1 };
  const world: World = { things: [bush], people: [p] };
  run(world, 60);
  assert.equal(bush.stock, 0);
  const feelingNow = p.memory.get("bush")!.feeling;
  p.needs.hunger = 1;
  p.intent = { kind: "eat", targetId: "bush", x: 4, z: 0, speed: 1.6, remaining: 0, arrived: true };
  step(world, 0.5);
  assert.ok(p.memory.get("bush")!.feeling < feelingNow);
});

test("two people who want company find each other and feel better for it", () => {
  const a = makePerson("a", 0, 0, 1, { sociability: 1 });
  const b = makePerson("b", 10, 0, 2, { sociability: 1 });
  for (const q of [a, b]) {
    q.needs.social = 1;
    q.needs.hunger = 0;
    q.needs.thirst = 0;
  }
  const world: World = { things: [], people: [a, b] };
  run(world, 90);
  assert.ok(a.needs.social < 0.7 && b.needs.social < 0.7, `${a.needs.social} ${b.needs.social}`);
  assert.ok(a.memory.has("b"));
});

test("a long life: needs stay met, health holds, and they do more than one thing", () => {
  const a = makePerson("a", 0, 0, 11, { curiosity: 0.8 });
  const b = makePerson("b", 5, 5, 12, { sociability: 0.7 });
  const world: World = { things: garden(), people: [a, b] };
  const seen = new Set<string>();
  for (let t = 0; t < 3600; t += 0.5) {
    step(world, 0.5);
    for (const q of world.people) seen.add(`${q.id}:${actionOf(q)}`);
  }
  for (const q of world.people) {
    assert.ok(q.health > 0.8, `${q.id} health ${q.health}`);
    assert.ok(Math.max(q.needs.hunger, q.needs.thirst) < 0.95, `${q.id} ${JSON.stringify(q.needs)}`);
  }
  assert.ok(seen.size >= 8, [...seen].join(" "));
});

test("different personalities live differently", () => {
  const bold = makePerson("a", 0, 0, 4, { boldness: 1 });
  const timid = makePerson("b", 0, 0, 4, { boldness: 0 });
  const fox: Thing = { id: "fox", kind: "fox", x: 9, z: 0, radius: 1 };
  const world: World = { things: [fox], people: [bold, timid] };
  step(world, 0.5);
  assert.notEqual(bold.intent?.kind, "flee");
  assert.equal(timid.intent?.kind, "flee");
});

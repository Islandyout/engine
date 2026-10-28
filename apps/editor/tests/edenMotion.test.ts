import test from "node:test";
import assert from "node:assert/strict";
import { creatureMotion, expressionOf, newMemory, personMotion, speciesOf } from "../src/eden/motion";
import { AFFORDANCES, makePerson, step, type Thing, type World } from "../src/eden/mind";
import { DAY } from "../src/eden/earth";

const adult = (id: string, x = 0, z = 0) => makePerson(id, x, z, id.length * 13, { sociability: 0.8 }, { name: id, sex: "f", age: 25 });
const world = (people = [adult("A")]): World => ({ things: [{ id: "river", kind: "river", x: 30, z: 0, radius: 3 }], people, radius: 60, clock: DAY / 3 });

test("every creature the world can hold has a species with the clips it names", () => {
  for (const [kind, a] of Object.entries(AFFORDANCES)) {
    if (!a.creature || !a.mobile) continue;
    const sp = speciesOf(kind);
    assert.ok(sp, `no species motion for ${kind}`);
    for (const clip of [sp.graze, sp.vigil, sp.low, sp.eat, "idle", "walk", "run"]) assert.ok(sp.clips.includes(clip), `${kind} has no clip ${clip}`);
  }
});

test("a creature's clip follows what it is doing, with a pace that matches its feet", () => {
  const deer: Thing = { id: "d", kind: "deer", x: 0, z: 0, radius: 2, mob: { tx: 0, tz: 0, wait: 0, fed: 0, age: 3, fleeUntil: 0, state: "graze", speed: 0 } };
  assert.equal(creatureMotion(deer, 0)!.clip, "graze");
  deer.mob!.state = "walk";
  deer.mob!.speed = 0.9;
  const walk = creatureMotion(deer, 0)!;
  assert.equal(walk.clip, "walk");
  assert.ok(walk.scale > 0.6 && walk.scale < 1.2);
  deer.mob!.state = "flee";
  deer.mob!.speed = 2.3;
  assert.equal(creatureMotion(deer, 0)!.clip, "run");
  deer.mob!.state = "rest";
  deer.mob!.speed = 0;
  assert.equal(creatureMotion(deer, 0)!.clip, "Idle_Headlow");
  const wolf: Thing = { id: "w", kind: "wolf", x: 0, z: 0, radius: 1, mob: { tx: 0, tz: 0, wait: 0, fed: 0, age: 3, fleeUntil: 0, state: "eat", speed: 0 } };
  assert.equal(creatureMotion(wolf, 0)!.clip, "Eating");
});

test("feelings show in the body: low, angry, afraid, cold, and laughing", () => {
  const p = adult("A");
  const w = world([p]);
  assert.equal(expressionOf(p, w), undefined);
  p.grief = 0.5;
  assert.equal(expressionOf(p, w)!.pose, "slump");
  p.grief = 0;
  p.emotions = { anger: 0.6 };
  assert.equal(expressionOf(p, w)!.pose, "tense");
  p.emotions = { fear: 0.6 };
  assert.equal(expressionOf(p, w)!.pose, "alert");
  p.emotions = {};
  p.cold = 0.7;
  assert.equal(expressionOf(p, w)!.pose, "hug");
  p.cold = 0;
  p.laughUntil = (w.clock ?? 0) + 3;
  assert.equal(personMotion(p, w, newMemory()).pose, "laugh");
});

test("waking up is a stretch, and being spoken to is listening", () => {
  const a = adult("A");
  const b = adult("B", 1, 0);
  const w = world([a, b]);
  const mem = newMemory();
  a.intent = { kind: "sleep", x: 0, z: 0, speed: 0, remaining: 100, arrived: true };
  assert.equal(personMotion(a, w, mem).pose, "sleep");
  a.intent = { kind: "gather", x: 0, z: 0, speed: 0, remaining: 100, arrived: true };
  assert.equal(personMotion(a, w, mem).pose, "stretch");
  w.clock = (w.clock ?? 0) + 10;
  assert.notEqual(personMotion(a, w, mem).pose, "stretch");
  b.intent = { kind: "talk", targetId: "A", x: 0, z: 0, speed: 0, remaining: 20, arrived: true };
  assert.equal(personMotion(a, w, mem).pose, "talk");
});

test("someone who is walked up to stops to listen and then goes on", () => {
  const a = adult("A");
  const b = adult("B", 3, 0);
  const w = world([a, b]);
  a.intent = { kind: "wander", x: 40, z: 0, speed: 1.6, remaining: 5, arrived: false };
  b.intent = { kind: "talk", targetId: "A", x: 0, z: 0, speed: 1.6, remaining: 20, arrived: true };
  step(w, 1);
  assert.equal(a.intent?.kind, "linger");
  assert.equal(a.intent?.resume?.kind, "wander");
});

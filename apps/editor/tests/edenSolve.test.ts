import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { belief, learnFromWorld, solveProblem, scoutPlan } from "../src/eden/solve";
import { foresee } from "../src/eden/reason";
import { make, makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";

const adult = (id: string, seed: number, over: Partial<Person["personality"]> = {}) => {
  const p = makePerson(id, 2, 1, seed, { curiosity: 0.8, sociability: 0.7, boldness: 0.8, ...over }, { name: id, sex: id < "M" ? "f" : "m", age: 28 });
  p.tools.spear = true;
  return p;
};
const know = (ps: Person[], w: World) => {
  for (const p of ps) for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.1, visits: 1, lastSeen: 0 });
};
const world = (people: Person[], things: Thing[]): World => ({
  things: [{ id: "river", kind: "river", x: 12, z: 0, radius: 3 }, { id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 4 }, ...things],
  people,
  radius: 200,
  clock: DAY / 3,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
  fish: 30,
});

test("a beast near the camp: with spears and company and no wood, they choose to drive it off together, and do", () => {
  const people = [adult("Ada", 3), adult("Bea", 4), adult("Cy", 5)];
  const w = world(people, []);
  const wolf = make(w, "wolf", 30, 0, {});
  wolf.mob = wolf.mob ?? { tx: wolf.x, tz: wolf.z, wait: 0, fed: w.clock!, age: 3, fleeUntil: 0 };
  wolf.mob.fed = w.clock!;
  know(people, w);
  for (const p of people) {
    p.needs.hunger = 0.1;
    p.needs.thirst = 0.1;
  }
  const plan = solveProblem(w, people[0]!)!;
  assert.ok(plan, "they see a problem");
  assert.equal(plan.steps[0]!.act, "recruit");
  let killed = false;
  for (let i = 0; i < 300 && !killed; i++) {
    for (const p of people) {
      p.needs.hunger = Math.min(p.needs.hunger, 0.3);
      p.needs.thirst = Math.min(p.needs.thirst, 0.3);
      p.health = Math.max(p.health, 0.8);
      p.cold = 0;
    }
    wolf.mob!.fed = w.clock!;
    step(w, 2);
    killed = !w.things.includes(wolf);
  }
  assert.ok((w.tally?.teams ?? 0) >= 1, "a party was gathered");
  assert.ok(killed, "the wolf was driven off for good");
  assert.ok(w.chronicle?.some((c) => c.text.includes("brought down the wolf")));
});

test("beasts turn from a fire; seeing it twice, a person works out why and believes it", () => {
  const a = adult("Ada", 3);
  const b = adult("Bea", 4);
  const w = world([a, b], [{ id: "fire1", kind: "campfire", x: 0, z: 0, radius: 2, fuel: 5000 }]);
  const wolf = make(w, "wolf", 9, 0, {});
  wolf.mob = { tx: wolf.x, tz: wolf.z, wait: 0, fed: w.clock!, age: 3, fleeUntil: 0 };
  know([a, b], w);
  for (let i = 0; i < 60; i++) {
    for (const p of [a, b]) (p.needs.hunger = 0.1), (p.needs.thirst = 0.1), (p.health = 1);
    wolf.mob!.fed = w.clock!;
    const f = w.things.find((t) => t.id === "fire1");
    if (f) f.fuel = 5000;
    step(w, 1);
    if (wolf.x > 30) { wolf.x = 9; wolf.z = 0; if (wolf.mob) { wolf.mob.tx = 9; wolf.mob.tz = 0; } }
  }
  assert.ok((a.rules?.fireRepels?.hits ?? 0) >= 2, `hits ${a.rules?.fireRepels?.hits}`);
  assert.ok(a.ideas?.includes("fire-repels"));
  assert.ok(belief(a, "fireRepels") > 0.6);
  assert.ok(w.chronicle?.some((c) => c.text.includes("fire keeps the wolves away")));
});

test("with no wood known within reach, a person plans a trip into ground nobody has seen, there and back before dark", () => {
  const a = adult("Ada", 3);
  const w = world([a], [{ id: "grove", kind: "grove", x: 5, z: 3, radius: 3, stock: 6, maxStock: 6 }]);
  w.things.find((t) => t.id === "grove")!.stock = 6;
  // the only wood is far away (so none is known near)
  w.things = w.things.filter((t) => t.id !== "grove");
  w.things.push({ id: "fruit", kind: "bush", x: 20, z: 10, radius: 3, stock: 6, maxStock: 6 });
  know([a], w);
  a.needs.hunger = 0.1;
  a.needs.thirst = 0.1;
  w.clock = 9 * 60 + 5 * DAY;
  const plan = scoutPlan(w, a)!;
  assert.ok(plan, "a scouting plan");
  assert.match(plan.goal, /^scout the/);
  assert.equal(plan.steps.length, 2);
  assert.match(plan.why, /Nobody has been/);
  const there = plan.steps[0]!;
  assert.ok(!a.explored.has(`${Math.floor(there.x / 20)},${Math.floor(there.z / 20)}`));
  assert.ok(foresee(w, a), "foresight finds it too");
});

test("a person whose companions will not come does not go alone against a beast", () => {
  const a = adult("Ada", 3);
  const w = world([a], []);
  const wolf = make(w, "wolf", 30, 0, {});
  wolf.mob = { tx: wolf.x, tz: wolf.z, wait: 0, fed: w.clock!, age: 3, fleeUntil: 0 };
  know([a], w);
  a.needs.hunger = 0.1;
  const plan = solveProblem(w, a);
  assert.ok(!plan || plan.steps[0]!.act !== "recruit", "one spear is not a party");
  assert.ok(learnFromWorld);
});

test("a model's proposed plan is checked against the map and the clock: sound ones are adopted, impossible ones thrown away with a reason", async () => {
  const { parsePlan, situationOf } = await import("../src/eden/llmPlan");
  const a = adult("Ada", 3);
  const w = world([a], [{ id: "grove", kind: "grove", x: 20, z: 4, radius: 3, stock: 6, maxStock: 6 }]);
  know([a], w);
  w.clock = 10 * 60;
  assert.match(situationOf(w, a), /grove \(grove, has wood, has food/);
  const good = parsePlan(w, a, '```json\n{"goal":"wood and a fire","why":"It will be cold.","steps":[{"do":"gather","at":"grove"},{"do":"fire"}]}\n```');
  assert.ok(good.plan, good.error);
  assert.equal(good.plan!.steps.length, 2);
  assert.match(good.plan!.why, /Checked on the map/);
  assert.match(parsePlan(w, a, '{"steps":[{"do":"fire"}]}').error!, /needs 2 wood/);
  assert.match(parsePlan(w, a, '{"steps":[{"do":"gather","at":"nowhere"}]}').error!, /not a place you know/);
  assert.match(parsePlan(w, a, '{"steps":[{"do":"fly"}]}').error!, /not something you can do/);
  assert.match(parsePlan(w, a, "I think you should go north").error!, /no JSON/);
  assert.match(parsePlan(w, a, '{"steps":[{"do":"goto","dir":"north","metres":9000}]}').error!, /goto needs/);
  assert.match(parsePlan(w, a, '{"steps":[{"do":"make","recipe":"weir"}]}').error!, /do not know how/);
  w.clock = 17.8 * 60;
  const late = parsePlan(w, a, '{"steps":[{"do":"goto","dir":"east","metres":140}]}');
  assert.match(late.error ?? "", /light is left|off the edge/);
});

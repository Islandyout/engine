import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { makePerson, step, walkerSlew, type Person, type Thing, type World } from "../src/eden/mind";

const adult = (id: string, seed: number, x = 0, z = 0, over: Partial<Person["personality"]> = {}) => makePerson(id, x, z, seed, { sociability: 0.8, boldness: 0.7, ...over }, { name: id, sex: id < "M" ? "f" : "m", age: 28 });
const base = (people: Person[], things: Thing[] = []): World => ({
  things: [{ id: "river", kind: "river", x: 12, z: 0, radius: 3 }, { id: "grove", kind: "grove", x: -12, z: 0, radius: 3, stock: 6, maxStock: 6 }, { id: "hollow", kind: "hollow", x: 0, z: 14, radius: 3 }, ...things],
  people,
  radius: 80,
  clock: DAY / 3,
  climate: { meanC: 16, seasonalAmpC: 5, dailyAmpC: 4, rainy: 0.2, seed: 3 },
});
const know = (p: Person, w: World) => {
  for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.3, visits: 1, lastSeen: 0 });
};
const run = (w: World, seconds: number, dt = 2) => {
  for (let i = 0; i < seconds / dt; i++) step(w, dt);
};

test("a household with wood makes things for its home and raises its roof into a hut", () => {
  const a = adult("A", 3);
  const w = base([a], [{ id: "shelter-1", kind: "shelter", x: 4, z: 4, radius: 3, stock: 3 }]);
  know(a, w);
  let hut = false;
  let furniture = 0;
  for (let i = 0; i < 6000 && !(hut && furniture >= 2); i++) {
    a.carry.wood = Math.max(a.carry.wood, 8);
    a.needs.hunger = Math.min(a.needs.hunger, 0.4);
    a.needs.thirst = Math.min(a.needs.thirst, 0.4);
    step(w, 2);
    hut = w.things.some((t) => t.kind === "shelter" && t.level === 2 && t.prefab === "Hut");
    furniture = w.things.filter((t) => ["barrel", "table", "lantern", "chest", "shelf", "shrine"].includes(t.kind)).length;
  }
  assert.ok(hut, "no hut was raised");
  assert.ok(furniture >= 2, `only ${furniture} things were made`);
});

test("someone carves a keepsake for a friend and gives it, and both remember it", () => {
  const a = adult("A", 3);
  const b = adult("B", 4, 3, 0);
  const w = base([a, b]);
  know(a, w);
  for (const [x, y] of [[a, b], [b, a]] as const) x.relations.set(y.id, { affinity: 0.9, trust: 0.8, familiarity: 0.8 } as never);
  let given = false;
  for (let i = 0; i < 4000 && !given; i++) {
    a.carry.wood = Math.max(a.carry.wood, 3);
    a.needs.hunger = Math.min(a.needs.hunger, 0.3);
    a.needs.thirst = Math.min(a.needs.thirst, 0.3);
    b.needs.hunger = Math.min(b.needs.hunger, 0.3);
    step(w, 2);
    given = (b.keepsakes?.length ?? 0) > 0;
  }
  assert.ok(given, "the keepsake was never given");
  assert.ok(b.journal.some((j) => /carved by their own hands/.test(j.text)));
});

test("a person with spare food swaps it for wood with someone who has wood to spare", () => {
  const a = adult("A", 3);
  const b = adult("B", 4, 3, 0);
  a.carry.food = 5;
  a.cold = 0.5;
  b.carry.wood = 7;
  const w = base([a, b]);
  know(a, w);
  a.relations.set("B", { affinity: 0.5, trust: 0.6, familiarity: 0.5 } as never);
  let traded = false;
  for (let i = 0; i < 3000 && !traded; i++) {
    a.cold = Math.max(a.cold, 0.5);
    a.needs.hunger = Math.min(a.needs.hunger, 0.3);
    b.needs.hunger = Math.min(b.needs.hunger, 0.3);
    step(w, 2);
    traded = (w.tally?.trades ?? 0) > 0;
  }
  assert.ok(traded, "no trade happened");
});

test("an adult teaches a child what they are good at", () => {
  const a = adult("A", 3);
  a.skills = { forage: 0.8, fish: 0.7, hunt: 0.1, farm: 0.1, build: 0.1, heal: 0.1 } as never;
  const child = makePerson("C", 2, 0, 9, {}, { name: "C", sex: "m", age: 6 });
  child.mother = "A";
  const w = base([a, child]);
  know(a, w);
  let taught = false;
  for (let i = 0; i < 4000 && !taught; i++) {
    a.needs.hunger = Math.min(a.needs.hunger, 0.3);
    child.needs.hunger = Math.min(child.needs.hunger, 0.3);
    step(w, 2);
    taught = (w.tally?.lessons ?? 0) > 0;
  }
  assert.ok(taught, "no lesson was given");
});

test("a starving bold person with nothing to eat takes food, and the others think less of them", () => {
  const a = adult("A", 3, 0, 0, { boldness: 0.9 });
  const b = adult("B", 4, 2, 0);
  const c = adult("C", 5, 3, 3);
  b.carry.food = 4;
  a.needs.hunger = 0.95;
  const w = base([a, b, c]);
  w.things = w.things.filter((t) => t.id !== "grove"); // nothing known to eat
  know(a, w);
  let stole = false;
  for (let i = 0; i < 600 && !stole; i++) {
    w.fish = 0;
    step(w, 2);
    stole = (w.tally?.thefts ?? 0) > 0;
  }
  assert.ok(stole, "nobody took anything");
  assert.ok(c.journal.some((j) => /took food from/.test(j.text)));
});

test("strangers come to the edge, and are taken in or turned away; a welcome adds to the family", () => {
  const people = [adult("A", 3), adult("B", 4, 3, 0), adult("D", 6, -3, 2)];
  const w = base(people);
  w.strangers = true;
  w.rng = 12345;
  for (const p of people) {
    know(p, w);
    p.carry.food = 4;
  }
  let arrived = 0;
  for (let i = 0; i < 40 * DAY && !((w.tally?.strangersJoined ?? 0) + (w.tally?.strangersTurnedAway ?? 0) > 0); i += 2) {
    for (const p of w.people) {
      p.needs.hunger = Math.min(p.needs.hunger, 0.3);
      p.needs.thirst = Math.min(p.needs.thirst, 0.3);
      p.carry.food = Math.max(p.carry.food, 3);
    }
    step(w, 2);
    arrived = w.tally?.strangersArrived ?? 0;
  }
  assert.ok(arrived >= 1, "no stranger ever came");
  assert.ok((w.tally?.strangersJoined ?? 0) + (w.tally?.strangersTurnedAway ?? 0) >= 1, "nobody decided about them");
});

test("an afraid person asks the Walker for protection from a wolf, and is relieved when it is killed", () => {
  const a = adult("A", 3, 0, 0, { boldness: 0.2 });
  const wolf: Thing = { id: "wolf-1", kind: "wolf", x: 20, z: 0, radius: 1, mob: { tx: 20, tz: 0, wait: 0, fed: 0, age: 4, fleeUntil: 0 } };
  const w = base([a], [wolf]);
  know(a, w);
  a.walkerTrust = 0.3;
  a.emotions = { fear: 0.6 };
  w.visitor = { x: 4, z: 0 };
  step(w, 2);
  assert.equal(a.asks?.item, "protect");
  walkerSlew(w, wolf);
  assert.equal(a.asks, undefined);
  assert.ok((a.walkerTrust ?? 0) > 0.5);
  assert.ok(w.chronicle?.some((c) => /killed/.test(c.text)));
});

test("what someone leaves goes to their grown child, else a partner, and is written down", () => {
  const parent = adult("Mara", 5);
  const child = makePerson("Kit", 1, 1, 9, {}, { name: "Kit", sex: "m", age: 25, parents: [parent, adult("Joe", 6)] });
  const other = adult("Zed", 7);
  parent.carry.wood = 5;
  parent.carry.food = 2;
  const w = base([parent, child, other]);
  parent.health = 0;
  step(w, 2);
  assert.ok(!w.people.includes(parent), "the parent died");
  assert.equal(child.carry.wood, 5);
  assert.equal(child.carry.food, 2);
  assert.equal(other.carry.wood, 0, "not given to a stranger");
  assert.ok(w.chronicle?.some((c) => c.text.includes("belongings passed to Kit")));
});

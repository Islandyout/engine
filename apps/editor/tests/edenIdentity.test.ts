import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";
import { practise, roleOf, skillOf, teach, newIdentity } from "../src/eden/identity";
import { runCreatorCommand } from "../src/eden/creator";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }],
  people,
  radius: 36,
});

test("the same seed makes the same person, different seeds different people, each with a story", () => {
  const a = newIdentity(5);
  assert.deepEqual(a, newIdentity(5));
  assert.notDeepEqual(a.values, newIdentity(6).values);
  assert.match(adult("Ada", "f", 1).story ?? "", /Ada woke in the garden/);
});

test("children take after their parents, and are born to them in the story", () => {
  const m = adult("Mia", "f", 1);
  const f = adult("Fen", "m", 2);
  m.values!.kin = 1;
  f.values!.kin = 1;
  const kids = Array.from({ length: 30 }, (_, i) => makePerson(`k${i}`, 0, 0, 100 + i, {}, { name: `K${i}`, age: 0, parents: [m, f] }));
  const mean = kids.reduce((a, k) => a + k.values!.kin, 0) / kids.length;
  assert.ok(mean > 0.75, `children's kin value ${mean} should follow their parents'`);
  assert.match(kids[0]!.story!, /born to Mia and Fen/);
});

test("skills grow with use, gifted people learn faster, and the best becomes a role", () => {
  const a = adult("A", "m", 3);
  const b = adult("B", "f", 4);
  a.talents!.fish = 1.4;
  b.talents!.fish = 0.6;
  for (let i = 0; i < 20; i++) {
    practise(a, "fish", 0.04);
    practise(b, "fish", 0.04);
  }
  assert.ok(skillOf(a, "fish") > skillOf(b, "fish"));
  assert.equal(roleOf(a)?.role, "fisher");
});

test("someone who is good at a thing shows another, and a parent's child learns faster", () => {
  const p = adult("P", "m", 5);
  const q = adult("Q", "f", 6);
  const kid = makePerson("kid", 0, 0, 7, {}, { name: "Kid", age: 6, parents: [p, q] });
  const stranger = adult("S", "m", 8);
  p.skills!.hunt = 0.8;
  assert.equal(teach(p, kid)?.skill, "hunt");
  assert.equal(teach(p, stranger)?.skill, "hunt");
  assert.ok(skillOf(kid, "hunt") > skillOf(stranger, "hunt"));
});

test("a person who fishes gets better at it, and is known for it", () => {
  const a = adult("A", "m", 9);
  const w = world([a]);
  w.clock = DAY * 16 * 0.375;
  w.things.splice(0, 1);
  a.memory.set("river", { x: 0, z: 10, feeling: 0.2, visits: 1, lastSeen: 0 });
  a.needs.hunger = 0.7;
  for (let i = 0; i < 6 * DAY; i++) {
    step(w, 1);
    if (a.needs.hunger < 0.5 && i % 600 === 0) a.needs.hunger = 0.75;
  }
  assert.ok(skillOf(a, "fish") > 0.2, `fishing skill only ${skillOf(a, "fish")}`);
});

test("the Creator can write a person's story", () => {
  const a = adult("Adam", "m", 10);
  const w = world([a]);
  const r = runCreatorCommand(w, "Adam's story is he lost a brother to the river and never swims");
  assert.equal(r.ok, true);
  assert.match(a.story!, /lost a brother/);
});

test("a child who watches a parent fish picks up some of it", () => {
  const mum = adult("Mum", "f", 21);
  const kid = makePerson("kid", 1, 8, 22, {}, { name: "Kid", age: 6, parents: [mum, adult("Dad", "m", 23)] });
  mum.x = 0;
  mum.z = 8;
  mum.skills!.fish = 0.5;
  const w = world([mum, kid]);
  w.clock = DAY * 16 * 0.375;
  w.things.splice(0, 1);
  mum.memory.set("river", { x: 0, z: 10, feeling: 0.2, visits: 1, lastSeen: 0 });
  mum.needs.hunger = 0.8;
  for (let t = 0; t < 2 * DAY; t++) {
    step(w, 1);
    kid.x = mum.x + 1;
    kid.z = mum.z;
    if (t % 400 === 0) mum.needs.hunger = Math.max(mum.needs.hunger, 0.75);
  }
  assert.ok(skillOf(kid, "fish") > 0, "the child learned nothing from watching");
});

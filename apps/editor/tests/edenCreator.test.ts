import test from "node:test";
import assert from "node:assert/strict";
import { makePerson, step, type World } from "../src/eden/mind";
import { worldFromJson, worldToJson } from "../src/eden/persist";
import { runCreatorCommand } from "../src/eden/creator";
import { SEASON_NAMES, seasonAt } from "../src/eden/earth";

const garden = (): World => ({
  things: [
    { id: "grove", kind: "grove", x: 12, z: 0, radius: 3, stock: 6, maxStock: 6 },
    { id: "river", kind: "river", x: 0, z: 10, radius: 3 },
    { id: "hollow", kind: "hollow", x: -12, z: 0, radius: 3 },
  ],
  people: [makePerson("adam", 0, 0, 7, {}, { name: "Adam" }), makePerson("eve", 2, 1, 8, { sociability: 0.8 }, { name: "Eve", sex: "f" })],
  radius: 36,
});
const run = (w: World, seconds: number) => {
  for (let t = 0; t < seconds; t += 1) step(w, 1);
};

test("a saved world carries on exactly as the original would have", () => {
  const original = garden();
  run(original, 900);
  const loaded = worldFromJson(worldToJson(original));
  run(original, 900);
  run(loaded, 900);
  for (let i = 0; i < original.people.length; i++) {
    const a = original.people[i]!;
    const b = loaded.people[i]!;
    assert.equal(b.x, a.x);
    assert.equal(b.z, a.z);
    assert.deepEqual(b.needs, a.needs);
    assert.equal(b.journal.length, a.journal.length);
    assert.equal(b.memory.size, a.memory.size);
  }
  assert.equal(loaded.things.length, original.things.length);
});

test("a damaged save is refused with the reason", () => {
  assert.throws(() => worldFromJson("{"), /not valid/);
  assert.throws(() => worldFromJson(JSON.stringify({ format: 9 })), /format 9/);
  assert.throws(() => worldFromJson(JSON.stringify({ format: 1, things: [{ id: "a", kind: "river", x: "no" }], people: [] })), /thing 0 x/);
});

test("the Creator's words change the weather and the season", () => {
  const w = garden();
  assert.equal(runCreatorCommand(w, "rain").ok, true);
  step(w, 1);
  assert.equal(w.weather?.raining, true);
  runCreatorCommand(w, "clear");
  step(w, 1);
  assert.equal(w.weather?.raining, false);
  runCreatorCommand(w, "make it winter");
  assert.equal(SEASON_NAMES[seasonAt(w.clock!).season], "winter");
  const before = w.weather?.tempC ?? 0;
  runCreatorCommand(w, "cold snap");
  step(w, 1);
  assert.ok(w.weather!.tempC < before);
});

test("the Creator makes things where asked, and says why when it cannot", () => {
  const w = garden();
  const made = runCreatorCommand(w, "let there be a deer by the river", () => 0.5);
  assert.equal(made.ok, true);
  assert.equal(made.made![0]!.kind, "deer");
  assert.ok(Math.hypot(made.made![0]!.x - -2.2, made.made![0]!.z - -1.7) < 8);
  const tree = runCreatorCommand(w, "a fruit tree", () => 0.5);
  assert.equal(tree.made![0]!.kind, "fruit tree");
  assert.equal(tree.made![0]!.stock, 6);
  const no = runCreatorCommand(w, "a dragon");
  assert.equal(no.ok, false);
  assert.match(no.message, /Nothing like "a dragon"/);
  assert.equal(runCreatorCommand(w, "a deer by the moon").ok, false);
});

test("the Creator heals, feeds, moves and reshapes people, and the people notice", () => {
  const w = garden();
  const adam = w.people[0]!;
  adam.health = 0.2;
  adam.needs.hunger = 0.9;
  assert.equal(runCreatorCommand(w, "heal Adam").ok, true);
  assert.equal(adam.health, 1);
  runCreatorCommand(w, "feed Adam");
  assert.equal(adam.needs.hunger, 0);
  const moved = runCreatorCommand(w, "move Adam to the overlook", () => 0.5);
  assert.equal(moved.ok, true);
  assert.equal(moved.moved![0]!.id, "adam");
  assert.ok(Math.abs(adam.z - -30) < 3);
  const bold = adam.personality.boldness;
  runCreatorCommand(w, "make Adam bolder");
  assert.ok(adam.personality.boldness > bold);
  runCreatorCommand(w, "tell Eve well done");
  assert.ok(w.people[1]!.journal.some((j) => j.text.includes("well done")));
  assert.equal(runCreatorCommand(w, "heal Seth").ok, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { applySpokenIntent, DAY, makePerson, step, type Person, type World } from "../src/eden/mind";
import { contextOf, memoriesOf, parseIntent } from "../src/eden/voiceContext";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });
const world = (people: Person[]): World => ({
  things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "fox", kind: "fox", x: 20, z: 0, radius: 1 }],
  people,
  radius: 36,
});

test("the voice is told who they are, how they are, what mattered, and what they think of the listener", () => {
  const a = adult("Ada", "f", 1);
  const b = adult("Ben", "m", 2);
  const w = world([a, b]);
  w.clock = 5000;
  a.needs.hunger = 0.8;
  a.journal.push({ t: 4000, text: "Cora died of illness.", w: 1 }, { t: 4900, text: "Ate at the grove.", w: 0.12 });
  a.beliefs = { Ben: ["generous"] };
  a.relations.set("Ben", { affinity: 0.7, trust: 0.8, familiarity: 0.7, lastTogether: 0 });
  a.spoken = ["I am so hungry."];
  const text = contextOf(a, b, w);
  assert.match(text, /Ada is a woman/);
  assert.match(text, /woke in the garden/);
  assert.match(text, /hungry/);
  assert.match(text, /Cora died of illness/);
  assert.match(text, /speaking to Ben/);
  assert.match(text, /generous/);
  assert.match(text, /Do not repeat/);
});

test("what mattered most comes before what happened last", () => {
  const a = adult("Ada", "f", 3);
  a.journal.push({ t: 100, text: "Cora died.", w: 1 }, { t: 2000, text: "Slept.", w: 0.12 }, { t: 2100, text: "Ate at the grove.", w: 0.12 });
  assert.equal(memoriesOf(a, 2200, 1)[0], "Cora died.");
});

test("an intent tag is read from the end of the line and nothing else", () => {
  assert.deepEqual(parseIntent("Here, eat this. [offer]"), { text: "Here, eat this.", intent: "offer" });
  assert.deepEqual(parseIntent("I will [offer] nothing."), { text: "I will [offer] nothing." });
});

test("an offer needs food and someone hungry; a warning a known danger; a promise someone to make it to", () => {
  const a = adult("A", "m", 4);
  const b = adult("B", "f", 5, 2, 0);
  const w = world([a, b]);
  assert.equal(applySpokenIntent(w, a, b, "offer"), false, "no food in hand");
  a.carry.food = 2;
  b.needs.hunger = 0.7;
  assert.equal(applySpokenIntent(w, a, b, "offer"), true);
  assert.equal(a.intent?.kind, "share");
  assert.equal(applySpokenIntent(w, a, b, "warn"), false, "knows no danger");
  a.memory.set("fox", { x: 20, z: 0, feeling: -0.5, visits: 1, lastSeen: 0 });
  assert.equal(applySpokenIntent(w, a, b, "warn"), true);
  assert.equal(applySpokenIntent(w, a, undefined, "promise"), false);
});

test("a promise kept raises trust, and one let lapse costs it", () => {
  const a = adult("A", "m", 6);
  const b = adult("B", "f", 7, 1, 0);
  const w = world([a, b]);
  b.needs.hunger = 0.8;
  b.relations.set("A", { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  assert.equal(applySpokenIntent(w, a, b, "promise"), true);
  a.carry.food = 0;
  for (let t = 0; t < DAY / 4 + 60; t += 2) step(w, 2);
  assert.ok(b.relations.get("A")!.trust < 0.5, "a broken promise should cost trust");
  assert.ok(a.journal.some((j) => /did not keep my word/.test(j.text)));
});

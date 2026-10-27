import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";
import { feel, fade, importance, moodPush, opinionTags } from "../src/eden/inner";
import { converse } from "../src/eden/speech";

const base = (people: Person[]): World => ({
  things: [
    { id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 },
    { id: "river", kind: "river", x: 0, z: 10, radius: 3 },
    { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 },
  ],
  people,
  radius: 36,
});
const adult = (id: string, sex: "m" | "f", seed: number, traits = {}, x = 0, z = 0) => makePerson(id, x, z, seed, traits, { name: id, sex, age: 25 });

test("emotions rise with what happens, fade at their own speeds, and fear fades fastest", () => {
  const a = adult("A", "m", 1, { boldness: 0.5 });
  feel(a, "fear", 0.5);
  feel(a, "gratitude", 0.5);
  assert.ok(moodPush(a) < 0.1, "fear should outweigh gratitude");
  fade(a, 300);
  assert.ok((a.emotions?.fear ?? 0) < 0.1, "fear lingers");
  assert.ok((a.emotions?.gratitude ?? 0) > 0.3, "gratitude is gone");
});

test("a bold person is frightened less than a timid one", () => {
  const bold = adult("B", "m", 2, { boldness: 0.95 });
  const timid = adult("T", "m", 3, { boldness: 0.05 });
  feel(bold, "fear", 0.5);
  feel(timid, "fear", 0.5);
  assert.ok(timid.emotions!.fear! > bold.emotions!.fear!);
});

test("mood follows anger down and the settled needs back up", () => {
  const a = adult("A", "m", 4);
  const w = base([a]);
  a.mood = 0.5;
  feel(a, "anger", 1);
  const before = a.mood;
  for (let i = 0; i < 30; i++) step(w, 1);
  const fall = before - a.mood;
  a.emotions = {};
  a.mood = -0.2;
  a.needs = { hunger: 0.1, thirst: 0.1, energy: 0.1, social: 0.1, joy: 0.1 };
  const low = a.mood;
  for (let i = 0; i < 30; i++) step(w, 1);
  assert.ok(fall > 0 && a.mood - low > 0, "mood did not move");
});

test("held very low for long enough, a bold impatient person loses their temper with someone near", () => {
  const a = adult("A", "m", 5, { boldness: 1, patience: 0 });
  const b = adult("B", "f", 6, {}, 2, 0);
  const w = base([a, b]);
  a.relations.set("B", { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  b.relations.set("A", { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  for (let i = 0; i < 400 && !(w.tally?.breaks); i++) {
    a.mood = -0.9;
    a.stress = (a.stress ?? 0) + 1;
    step(w, 1);
  }
  assert.ok((w.tally?.breaks ?? 0) >= 1, "never broke");
  assert.ok(a.journal.some((j) => /Lost my temper|Needed to be alone/.test(j.text)));
});

test("kindness shown twice becomes what one thinks of someone, and is passed on", () => {
  const a = adult("A", "m", 7);
  const b = adult("B", "f", 8);
  const c = adult("C", "f", 9);
  const w = base([a, b, c]);
  assert.deepEqual(opinionTags({ gifts: 2 }), ["generous"]);
  a.felt = { hungry: 0, cold: 0, scares: 0, reflected: -DAY };
  a.relations.set("B", { affinity: 0.6, trust: 0.5, familiarity: 0.5, lastTogether: 0, gifts: 2 });
  step(w, 1);
  assert.deepEqual(a.beliefs?.B, ["generous"]);
  assert.ok(a.journal.some((j) => /I have come to think B is generous/.test(j.text)));
  a.relations.set("C", { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  let said = false;
  for (let i = 0; i < 40 && !said; i++) {
    const x = converse(w, a, c, (() => { let n = i + 1; return () => ((n = (n * 16807) % 2147483647) / 2147483647); })());
    if (x.about === "B") said = true;
  }
  assert.ok(said, "never spoke of B");
});

test("a quarrel is made right by an apology", () => {
  const a = adult("A", "m", 10);
  const b = adult("B", "f", 11);
  const w = base([a, b]);
  w.clock = 100;
  a.relations.set("B", { affinity: 0.4, trust: 0.4, familiarity: 0.5, lastTogether: 0, lastQuarrel: 50 });
  let sorry = false;
  for (let i = 0; i < 30 && !sorry; i++) sorry = converse(w, a, b, (() => { let n = i + 3; return () => ((n = (n * 16807) % 2147483647) / 2147483647); })()).topic === "sorry";
  assert.ok(sorry, "no apology offered");
});

test("a death is remembered above a meal", () => {
  assert.ok(importance("Eve died of old age.") > importance("Ate at the fruit grove."));
});

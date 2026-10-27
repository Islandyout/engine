import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type Person, type World } from "../src/eden/mind";
import { daylight, isDark, moonLight, moonPhase, YEAR } from "../src/eden/earth";
import { worldFromJson, worldToJson } from "../src/eden/persist";

const base = (people: Person[]): World => ({
  things: [
    { id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 },
    { id: "river", kind: "river", x: 0, z: 10, radius: 3 },
    { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 },
  ],
  people,
  radius: 36,
});
const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, {}, { name: id, sex, age: 25 });
const run = (w: World, seconds: number, dt = 1) => {
  for (let t = 0; t < seconds; t += dt) step(w, dt);
};

test("days are long in summer and short in winter, and the moon goes round", () => {
  const summer = daylight(YEAR * 0.375);
  const winter = daylight(YEAR * 0.875);
  assert.ok(summer.hours > 14.5 && winter.hours < 9.5);
  assert.ok(isDark(YEAR * 0.875 + DAY * 18 / 24) && !isDark(YEAR * 0.375 + DAY * 18 / 24), "6 pm is dark in winter and light in summer");
  assert.ok(moonPhase(0) === 0 && moonPhase(4 * DAY) === 0.5);
  assert.ok(moonLight(4 * DAY + DAY * 0.02) > 0.99); // full moon, just after midnight
  assert.equal(moonLight(DAY * 0.5), 0); // midday
});

test("a hungry person with no other food catches fish, and the river runs lower for it", () => {
  const a = adult("A", "m", 11);
  const w = base([a]);
  w.clock = YEAR * 0.375; // summer
  w.things.splice(0, 1); // no grove: the river is the only food
  a.memory.set("river", { x: 0, z: 10, feeling: 0.2, visits: 1, lastSeen: 0 });
  a.needs.hunger = 0.6;
  run(w, DAY);
  assert.ok((w.tally?.fished ?? 0) >= 1, "never fished");
  assert.ok(a.journal.some((j) => /Caught a fish/.test(j.text)));
  assert.ok((w.fish ?? 40) < 40, "the river did not notice");
});

test("a death leaves a grave, grief sinks the mood, and the one who grieves goes to sit by it", () => {
  const a = adult("A", "m", 21);
  const b = adult("B", "f", 22, 3, 0);
  const w = base([a, b]);
  b.relations.set("A", { affinity: 0.9, trust: 0.8, familiarity: 0.9, lastTogether: 0 });
  run(w, 5);
  a.health = 0.01;
  run(w, 3);
  assert.equal(w.people.length, 1);
  const grave = w.things.find((t) => t.kind === "grave");
  assert.ok(grave && grave.of === "A", "no grave");
  assert.ok((b.grief ?? 0) > 0.4, "no grief");
  assert.ok(b.mood < -0.3, "mood did not sink");
  b.memory.set(grave!.id, { x: grave!.x, z: grave!.z, feeling: 0, visits: 1, lastSeen: 0 });
  run(w, DAY);
  assert.ok((w.tally?.mourned ?? 0) >= 1, "never sat by the grave");
  assert.ok(b.journal.some((j) => /grave/.test(j.text)));
  assert.ok((b.grief ?? 0) < 0.5, "grief did not ease");
});

test("a hard winter teaches a person to prepare earlier", () => {
  const a = adult("A", "m", 31);
  const w = base([a]);
  w.clock = YEAR * 0.75; // winter
  a.felt = { hungry: 0, cold: 500, scares: 0, reflected: -DAY };
  run(w, 2);
  assert.ok((a.lessons?.prepare ?? 0) >= 0.4, "nothing learned");
  assert.ok(a.journal.some((j) => /I have learned/.test(j.text)));
});

test("fish, grief, lessons and graves survive saving", () => {
  const a = adult("A", "m", 41);
  const w = base([a]);
  w.fish = 17;
  a.grief = 0.5;
  a.lessons = { prepare: 0.4, careful: 0 };
  w.things.push({ id: "grave-1", kind: "grave", x: 1, z: 1, radius: 2, of: "Z" });
  const back = worldFromJson(worldToJson(w));
  assert.equal(back.fish, 17);
  assert.equal(back.people[0]!.grief, 0.5);
  assert.deepEqual(back.people[0]!.lessons, { prepare: 0.4, careful: 0 });
  assert.equal(back.things.find((t) => t.kind === "grave")?.of, "Z");
});

test("wind, mist and rain amount vary with the season and the hour", async () => {
  const { weatherAt, EDEN_CLIMATE } = await import("../src/eden/earth");
  let winterWind = 0;
  let summerWind = 0;
  let maxFog = 0;
  let drizzle = 0;
  let downpour = 0;
  for (let i = 0; i < 400; i++) {
    const w = weatherAt(YEAR * 0.875 + i * 300, EDEN_CLIMATE);
    const s = weatherAt(YEAR * 0.375 + i * 300, EDEN_CLIMATE);
    winterWind += w.windMs;
    summerWind += s.windMs;
    maxFog = Math.max(maxFog, w.fog, s.fog);
    if (w.raining && w.rainAmount < 0.4) drizzle++;
    if (w.raining && w.rainAmount > 0.7) downpour++;
    assert.ok(w.windMs >= 0 && w.windMs < 20 && w.fog >= 0 && w.fog <= 1);
  }
  assert.ok(winterWind > summerWind, "winter should be windier");
  assert.ok(maxFog > 0.3, "there should be mist at times");
  assert.ok(drizzle > 0 && downpour > 0, "rain should come in different strengths");
});

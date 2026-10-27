import test from "node:test";
import assert from "node:assert/strict";
import { countJoys, joysFor } from "../src/eden/joys";
import { DAY, makePerson, step, type World } from "../src/eden/mind";

test("the catalogue of small moments is over a million, and every trigger can happen somewhere", () => {
  assert.ok(countJoys() > 1_000_000);
  const seen = new Set<string>();
  for (const season of [0, 1, 2, 3] as const) for (const band of ["dawn", "morning", "noon", "afternoon", "dusk", "night"] as const) for (const sky of ["clear", "rain", "snow", "fog", "wind"] as const)
    for (const company of ["alone", "one", "group"] as const) for (const doing of ["eat", "drink", "rest", "sleep", "walk", "work", "talk", "idle"] as const) for (const warm of [false, true])
      for (const t of joysFor({ season, band, sky, company, doing, warm })) seen.add(t.id);
  assert.ok(seen.size >= 25, `only ${seen.size} triggers can ever happen`);
});

test("people notice small pleasures through a day, and the moments differ", () => {
  const w: World = { things: [{ id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }], people: [makePerson("A", 0, 0, 3, {}, { name: "A", sex: "f", age: 25 }), makePerson("B", 2, 0, 4, {}, { name: "B", sex: "m", age: 30 })], radius: 36 };
  for (let i = 0; i < 4 * DAY; i += 2) step(w, 2);
  assert.ok((w.tally?.smallJoys ?? 0) >= 8, `only ${w.tally?.smallJoys ?? 0} small joys in four days`);
  const lines = new Set(w.people.flatMap((p) => p.journal.map((j) => j.text)));
  assert.ok(lines.size > 20);
});

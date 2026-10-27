import test from "node:test";
import assert from "node:assert/strict";
import { DAY, makePerson, step, type World } from "../src/eden/mind";
import { worldFromJson, worldToJson } from "../src/eden/persist";

test("someone who reaches a place first may name it, and the name passes on when they talk", () => {
  const a = makePerson("A", 0, 8, 1, { curiosity: 1 }, { name: "A", sex: "m", age: 25 });
  const b = makePerson("B", 2, 8, 2, { sociability: 1 }, { name: "B", sex: "f", age: 25 });
  const w: World = { things: [{ id: "river", kind: "river", x: 0, z: 10, radius: 3 }, { id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "hollow", kind: "hollow", x: -10, z: 0, radius: 3 }], people: [a, b], radius: 36 };
  a.needs.thirst = 0.9;
  for (let t = 0; t < 3 * DAY; t++) {
    step(w, 1);
    if (t % 300 === 0) a.needs.thirst = Math.max(a.needs.thirst, 0.7);
    if (w.names && Object.values(w.names).some((n) => n.known.length === 2)) break;
  }
  assert.ok(w.names && Object.keys(w.names).length >= 1, "nothing was named");
  assert.ok(a.journal.some((j) => /I named the/.test(j.text)) || b.journal.some((j) => /I named the/.test(j.text)));
  assert.ok(Object.values(w.names!).some((n) => n.known.length === 2), "the name did not pass on");
  assert.deepEqual(worldFromJson(worldToJson(w)).names, w.names);
});

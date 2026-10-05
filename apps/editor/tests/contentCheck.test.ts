import assert from "node:assert/strict";
import { test } from "node:test";
import { checkContent } from "../src/editor/contentCheck";
import { parseRoutineStops, serializeRoutineStops } from "../src/editor/routineStops";

test("routine stops round-trip through rows and report bad ones", () => {
  const { stops, errors } = parseRoutineStops("0 1 2; 6.5 120 40 sit;12 -3 5 talk");
  assert.deepEqual(errors, []);
  assert.equal(stops.length, 3);
  assert.deepEqual(stops[1], { hour: 6.5, x: 120, z: 40, activity: "sit" });
  assert.equal(serializeRoutineStops(stops), "0 1 2; 6.5 120 40 sit; 12 -3 5 talk");
  const bad = parseRoutineStops("25 1 2; seven 1 2; 3 4");
  assert.equal(bad.errors.length, 3);
});

test("content checks name the entity and what's wrong", () => {
  const issues = checkContent(
    [
      { index: 0, name: "Walker", components: { Routine: { stops: "30 0 0", speed: 1 } } },
      { index: 1, name: "Trees", components: { ModelInstances: { instances: "999 0 0\n42 5 5" } } },
      { index: 2, name: "Cam", components: { CameraFollow: { target: "Nobody" } } },
      { index: 3, name: "Fine", components: { Renderable: { mesh: 42 }, CameraFollow: { target: "Walker" } } },
      { index: 4, name: "Box", components: { Renderable: { mesh: 777 } } },
    ],
    { modelExists: (id) => id === 42 },
  );
  const by = (name: string) => issues.filter((i) => i.entity === name).map((i) => i.message);
  assert.ok(by("Walker").some((m) => m.includes("hour 30")));
  assert.ok(by("Trees").some((m) => m.includes("999")));
  assert.ok(by("Cam").some((m) => m.includes("Nobody")));
  assert.deepEqual(by("Fine"), []);
  assert.ok(by("Box").some((m) => m.includes("777")));
});

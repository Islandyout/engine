import assert from "node:assert/strict";
import { test } from "node:test";
import { instanceBox, parseModelInstances } from "../src/editor/modelInstances";

test("ModelInstances lines parse with optional yaw, scale and solid", () => {
  const { instances, errors } = parseModelInstances(
    ["64 0 0", "8 40 -20 90 0.5 solid", "# a comment", "", "57 16 0 180", "bad line", "3 1 2 3 4 5 6"].join("\n"),
  );
  assert.equal(instances.length, 3);
  assert.deepEqual(errors, ['line 6: expected "model x z [yaw] [scale] [solid|trunk]"', 'line 7: expected "model x z [yaw] [scale] [solid|trunk]"']);
  assert.deepEqual([instances[0]!.model, instances[0]!.x, instances[0]!.z, instances[0]!.scale, instances[0]!.solid], [64, 0, 0, 1, false]);
  const building = instances[1]!;
  assert.equal(building.solid, true);
  assert.ok(Math.abs(building.yaw - Math.PI / 2) < 1e-9 && building.scale === 0.5);
  // A quarter turn swaps the footprint; scale applies; it stands on the ground.
  const box = instanceBox(building, { x: 20, y: 30, z: 10 });
  assert.ok(Math.abs(box.sx - 5) < 1e-9 && Math.abs(box.sz - 10) < 1e-9 && box.sy === 15 && box.y === 7.5);
});

test("a trunk instance is solid, but only a trunk-sized post at its centre", () => {
  const [tree, small] = parseModelInstances(["255 4 6 30 0.5 trunk", "258 0 0 0 0.2 trunk"].join("\n")).instances;
  assert.ok(tree!.solid && tree!.trunk);
  // A 13 m tree at half size: 6.5 m tall, a twentieth of that across.
  const box = instanceBox(tree!, { x: 12, y: 13, z: 12 });
  assert.ok(Math.abs(box.sx - 0.325) < 1e-9 && box.sx === box.sz && box.sy === 6.5 && box.x === 4 && box.z === 6);
  // Never thinner than 0.3 m.
  assert.equal(instanceBox(small!, { x: 5, y: 7, z: 5 }).sx, 0.3);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeComponent } from "../src/scene/SceneSerializer";

test("Collider: pre-0.48 scenes get solid/layer 0/all-layers/no-bounce defaults", () => {
  const collider = normalizeComponent("Collider", { type: "AABB" });
  assert.deepEqual(
    { ...collider, halfExtents: undefined },
    {
      type: "AABB",
      halfExtents: undefined,
      radius: 0.5,
      isTrigger: false,
      layer: 0,
      mask: 4294967295,
      bounciness: 0,
    },
  );
});

test("Collider: trigger/layer/mask/bounciness round-trip and are range-checked", () => {
  const collider = normalizeComponent("Collider", {
    type: "Sphere",
    radius: 2,
    isTrigger: true,
    layer: 5,
    mask: 1,
    bounciness: 0.25,
  });
  assert.equal(collider.isTrigger, true);
  assert.equal(collider.layer, 5);
  assert.equal(collider.mask, 1);
  assert.equal(collider.bounciness, 0.25);
  assert.throws(() => normalizeComponent("Collider", { type: "AABB", layer: 32 }));
  assert.throws(() => normalizeComponent("Collider", { type: "AABB", layer: 1.5 }));
  assert.throws(() => normalizeComponent("Collider", { type: "AABB", mask: -1 }));
  assert.throws(() => normalizeComponent("Collider", { type: "AABB", bounciness: 2 }));
  assert.throws(() => normalizeComponent("Collider", { type: "AABB", isTrigger: "yes" }));
});

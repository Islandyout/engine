import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeComponent } from "../src/scene/SceneSerializer";
import { defaultComponent, defaultEnvironment } from "../src/authoring/CommandInterpreter";

test("Environment/Camera/Material defaults round-trip through normalization", () => {
  for (const type of ["Environment", "Camera", "Material"] as const)
    assert.deepEqual(normalizeComponent(type, defaultComponent(type)), defaultComponent(type));
  assert.deepEqual(defaultComponent("Environment"), defaultEnvironment());
});

test("Environment/Camera/Material reject out-of-range values", () => {
  const env = defaultEnvironment();
  assert.throws(() => normalizeComponent("Environment", { ...env, sky: "Stars" }));
  assert.throws(() => normalizeComponent("Environment", { ...env, fogNear: 50, fogFar: 10 }));
  assert.throws(() => normalizeComponent("Environment", { ...env, sunElevation: 120 }));
  assert.throws(() => normalizeComponent("Environment", { ...env, exposure: 0 }));
  const camera = defaultComponent("Camera");
  assert.throws(() => normalizeComponent("Camera", { ...camera, fov: 180 }));
  assert.throws(() => normalizeComponent("Camera", { ...camera, near: 5, far: 1 }));
  const material = defaultComponent("Material");
  assert.throws(() => normalizeComponent("Material", { ...material, roughness: 1.5 }));
  assert.throws(() => normalizeComponent("Material", { ...material, opacity: -0.1 }));
});

test("Light.castShadows defaults to false for pre-0.50 scenes", () => {
  const light = normalizeComponent("Light", {
    type: "Point",
    color: { x: 1, y: 1, z: 1 },
    intensity: 1,
  });
  assert.equal(light.castShadows, false);
});

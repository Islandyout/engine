import assert from "node:assert/strict";
import { test } from "node:test";
import { isNonPhysical, isSettingsOnly } from "../src/editor/settingsEntity";

const getter = (components: Record<string, unknown>) => ((type: string) => components[type]) as never;

test("settings entities and invisible helpers have no body unless they author one", () => {
  assert.equal(isNonPhysical(getter({ Transform: {}, UI: {} })), true);
  assert.equal(isNonPhysical(getter({ Environment: {} })), true);
  assert.equal(isNonPhysical(getter({ PostProcessing: {} })), true);
  // Helpers without a visible model: a light, particles, a camera, a director script.
  assert.equal(isNonPhysical(getter({ Transform: {}, Light: {} })), true);
  assert.equal(isNonPhysical(getter({ Particles: {}, Renderable: { visible: false } })), true);
  assert.equal(isNonPhysical(getter({ Camera: {}, CameraFollow: {} })), true);
  assert.equal(isNonPhysical(getter({ Script: {} })), true);
  // A model, or anything physical, keeps the entity in the simulation.
  assert.equal(isSettingsOnly(getter({ UI: {}, Renderable: {} })), false);
  assert.equal(isNonPhysical(getter({ Renderable: { visible: true } })), false);
  assert.equal(isNonPhysical(getter({ UI: {}, Collider: {} })), false);
  assert.equal(isNonPhysical(getter({ Light: {}, RigidBody: {} })), false);
  assert.equal(isNonPhysical(getter({ UI: {}, Health: {} })), false);
  assert.equal(isNonPhysical(getter({ Script: {}, Velocity: {} })), false);
});

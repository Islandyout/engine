import assert from "node:assert/strict";
import { test } from "node:test";
import { isNonPhysical, isSettingsOnly } from "../src/editor/settingsEntity";

const getter = (components: Record<string, unknown>) => ((type: string) => components[type]) as never;

test("settings-only entities have no body unless they author one", () => {
  assert.equal(isNonPhysical(getter({ Transform: {}, UI: {} })), true);
  assert.equal(isNonPhysical(getter({ Environment: {} })), true);
  assert.equal(isNonPhysical(getter({ PostProcessing: {} })), true);
  // A model, or anything physical, keeps the entity in the simulation.
  assert.equal(isSettingsOnly(getter({ UI: {}, Renderable: {} })), false);
  assert.equal(isNonPhysical(getter({ UI: {}, Collider: {} })), false);
  assert.equal(isNonPhysical(getter({ UI: {}, RigidBody: {} })), false);
  assert.equal(isNonPhysical(getter({ UI: {}, Health: {} })), false);
  // Ordinary entities aren't settings entities at all.
  assert.equal(isNonPhysical(getter({ Transform: {}, Light: {} })), false);
});

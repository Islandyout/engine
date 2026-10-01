import assert from "node:assert/strict";
import { test } from "node:test";
import { FootstepTracker } from "../src/editor/audioMixer";

test("footsteps follow stride length and stop when still or airborne", () => {
  const steps = new FootstepTracker();
  let count = 0;
  for (let i = 0; i < 120; i++) if (steps.step(1 / 60, 4.5, true)) count++;
  // 9 m walked at 4.5 m/s in 2 s, stride 1.64 m -> 5 steps.
  assert.equal(count, 5);
  count = 0;
  for (let i = 0; i < 120; i++) if (steps.step(1 / 60, 7.5, true)) count++;
  assert.ok(count >= 7 && count <= 8, "sprinting steps more often");
  for (let i = 0; i < 60; i++) assert.equal(steps.step(1 / 60, 4.5, false), false, "no steps in the air");
  for (let i = 0; i < 60; i++) assert.equal(steps.step(1 / 60, 0.2, true), false, "no steps standing still");
});

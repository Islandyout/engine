import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMouseLook, applyStickLook, maxPitch, ViewEffects } from "../src/editor/fpsView";

test("mouse look turns left for leftward movement and clamps pitch", () => {
  const look = { yaw: 0, pitch: 0 };
  applyMouseLook(look, -100, 0, 1, false);
  assert.ok(look.yaw > 0.2);
  applyMouseLook(look, 0, -100000, 1, false);
  assert.equal(look.pitch, maxPitch);
  applyMouseLook(look, 0, 100000, 1, true);
  assert.equal(look.pitch, maxPitch, "inverted Y pushes up for downward movement");
  applyMouseLook(look, 0, -100000, 1, true);
  assert.equal(look.pitch, -maxPitch);
});

test("stick look has a dead zone and scales with time", () => {
  const look = { yaw: 0, pitch: 0 };
  applyStickLook(look, 0.1, 0.1, 1, 1, false);
  assert.deepEqual(look, { yaw: 0, pitch: 0 });
  applyStickLook(look, 1, 0, 0.5, 1, false);
  assert.ok(Math.abs(look.yaw + 1.3) < 1e-9);
});

test("view effects: bob only while moving on the ground, landing dips and recovers, crouch eases", () => {
  const view = new ViewEffects();
  const still = { speed: 0, grounded: true, landingSpeed: 0, eyeHeight: 1.65, sprinting: false, headBob: 1 };
  let out = view.step(1 / 60, still);
  assert.equal(out.eyeHeight, 1.65);
  assert.equal(out.y, 0);
  let maxBob = 0;
  for (let i = 0; i < 120; i++) maxBob = Math.max(maxBob, Math.abs(view.step(1 / 60, { ...still, speed: 4.5 }).y));
  assert.ok(maxBob > 0.02, "walking bobs");
  const off = new ViewEffects();
  for (let i = 0; i < 120; i++) assert.equal(off.step(1 / 60, { ...still, speed: 4.5, headBob: 0 }).y, 0);

  const land = new ViewEffects();
  land.step(1 / 60, still);
  let lowest = 0;
  out = land.step(1 / 60, { ...still, landingSpeed: 9 });
  for (let i = 0; i < 30; i++) lowest = Math.min(lowest, land.step(1 / 60, still).y);
  assert.ok(lowest < -0.03, "landing dips the camera");
  for (let i = 0; i < 120; i++) out = land.step(1 / 60, still);
  assert.ok(Math.abs(out.y) < 0.002, "and it recovers");

  const crouch = new ViewEffects();
  crouch.step(1 / 60, still);
  out = crouch.step(1 / 60, { ...still, eyeHeight: 1.0 });
  assert.ok(out.eyeHeight > 1.3, "crouch eases rather than snapping");
  for (let i = 0; i < 60; i++) out = crouch.step(1 / 60, { ...still, eyeHeight: 1.0 });
  assert.ok(Math.abs(out.eyeHeight - 1.0) < 0.01);

  const sprint = new ViewEffects();
  for (let i = 0; i < 60; i++) out = sprint.step(1 / 60, { ...still, sprinting: true, speed: 7.5 });
  assert.ok(out.fovAdd > 5, "sprinting widens the field of view");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickClipName, groundSpeed } from "../src/editor/animationClips";

test("picks idle for near-zero speed", () => {
  assert.equal(pickClipName(["idle", "walk", "run"], 0), "idle");
  assert.equal(pickClipName(["idle", "walk", "run"], 0.1), "idle");
});

test("picks walk, then trot/run, then sprint as speed rises", () => {
  const names = ["idle", "walk", "trot", "run", "sprint"];
  assert.equal(pickClipName(names, 1), "walk");
  assert.equal(pickClipName(names, 3), "trot");
  assert.equal(pickClipName(names, 6), "sprint");
});

test("falls back down the tier when a clip is missing", () => {
  // Birds: no "trot", "run" or "sprint" — mid/high speed should still land on "walk".
  assert.equal(pickClipName(["idle", "walk"], 3), "walk");
  assert.equal(pickClipName(["idle", "walk"], 8), "walk");
  // A rig with none of the tiered names at all falls back to its first clip.
  assert.equal(pickClipName(["peck", "fly"], 8), "peck");
});

test("returns undefined for a model with no clips at all", () => {
  assert.equal(pickClipName([], 1), undefined);
});

test("groundSpeed ignores vertical motion", () => {
  // A body falling straight down (x/z unchanged) has zero ground speed, even
  // though its 3D distance traveled is large — this is exactly the case a
  // falling or landing RigidBody must not read as "walking".
  const speed = groundSpeed({ x: 1, z: 2 }, { x: 1, z: 2 }, 1 / 60);
  assert.equal(speed, 0);
});

test("groundSpeed measures horizontal distance over the given time", () => {
  // 3-4-5 triangle in X/Z over one 60 Hz tick: 5 units in 1/60s = 300 units/s.
  const speed = groundSpeed({ x: 3, z: 4 }, { x: 0, z: 0 }, 1 / 60);
  assert.ok(Math.abs(speed - 300) < 1e-9);
});

test("groundSpeed is stable across a variable number of ticks per frame", () => {
  // The same total displacement over 1 tick vs. 3 ticks (steps/60 each) must
  // give the same speed — this is the fixed-step-cadence guarantee that
  // decouples clip selection from the render's actual refresh rate.
  const oneTick = groundSpeed({ x: 2, z: 0 }, { x: 0, z: 0 }, 1 / 60);
  const threeTicks = groundSpeed({ x: 6, z: 0 }, { x: 0, z: 0 }, 3 / 60);
  assert.ok(Math.abs(oneTick - threeTicks) < 1e-9);
});

test("groundSpeed returns 0 for a non-positive time delta", () => {
  assert.equal(groundSpeed({ x: 5, z: 5 }, { x: 0, z: 0 }, 0), 0);
});

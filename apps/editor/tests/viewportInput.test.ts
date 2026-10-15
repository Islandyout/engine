import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyWheel, looksLikeTrackpad, pressKind } from "../src/editor/viewportInput";
import { lookDeflection, stickVector } from "../src/editor/touchControls";

const wheel = (deltaX: number, deltaY: number, extra: Partial<{ deltaMode: number; ctrlKey: boolean; shiftKey: boolean }> = {}) => ({
  deltaX,
  deltaY,
  deltaMode: 0,
  ctrlKey: false,
  shiftKey: false,
  ...extra,
});

test("a trackpad scroll is told from a mouse wheel notch", () => {
  assert.equal(looksLikeTrackpad(wheel(0, 100)), false); // Chromium wheel notch
  assert.equal(looksLikeTrackpad(wheel(0, -120)), false);
  assert.equal(looksLikeTrackpad(wheel(0, 3, { deltaMode: 1 })), false); // Firefox lines
  assert.equal(looksLikeTrackpad(wheel(0, 4.5)), true);
  assert.equal(looksLikeTrackpad(wheel(6, 0)), true);
  assert.equal(looksLikeTrackpad(wheel(0, 12)), true);
});

test("trackpad scroll orbits, Shift pans, a pinch zooms; a mouse wheel always zooms", () => {
  assert.deepEqual(classifyWheel(wheel(0, 100), "auto"), { kind: "zoom" });
  assert.deepEqual(classifyWheel(wheel(3, 4.5), "auto"), { kind: "orbit", dx: 3, dy: 4.5 });
  assert.deepEqual(classifyWheel(wheel(3, 4.5, { shiftKey: true }), "auto"), { kind: "pan", dx: 3, dy: 4.5 });
  assert.deepEqual(classifyWheel(wheel(0, 2.5, { ctrlKey: true }), "auto"), { kind: "zoom" });
  // Forced either way.
  assert.deepEqual(classifyWheel(wheel(3, 4.5), "mouse"), { kind: "zoom" });
  assert.deepEqual(classifyWheel(wheel(0, 100), "trackpad"), { kind: "orbit", dx: 0, dy: 100 });
  assert.deepEqual(classifyWheel(wheel(0, 2, { deltaMode: 1 }), "trackpad"), { kind: "orbit", dx: 0, dy: 32 });
});

test("a press is a tap, a long press or a drag", () => {
  assert.equal(pressKind(2, 3, 120), "tap");
  assert.equal(pressKind(2, 3, 520), "pending");
  assert.equal(pressKind(2, 3, 600), "hold");
  assert.equal(pressKind(20, 0, 50), "drag");
  assert.equal(pressKind(20, 0, 900), "drag");
});

test("the touch stick and look drag become gamepad deflections", () => {
  assert.deepEqual(stickVector(100, 100, 102, 101, 56), { x: 0, y: 0 }); // dead zone
  const half = stickVector(100, 100, 128, 100, 56);
  assert.ok(Math.abs(half.x - 0.5) < 1e-9 && half.y === 0);
  const far = stickVector(100, 100, 400, 500, 56);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
  assert.deepEqual(lookDeflection(7, -7), { x: 0.5, y: -0.5 });
  assert.deepEqual(lookDeflection(100, -100), { x: 1, y: -1 });
});

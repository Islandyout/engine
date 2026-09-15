import { test } from "node:test";
import assert from "node:assert/strict";
import { pickClipName } from "../src/editor/animationClips";

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

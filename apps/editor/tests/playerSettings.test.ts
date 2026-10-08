import assert from "node:assert/strict";
import { test } from "node:test";
import { bindingRows, codeForBinding, defaultSettings, keyForCode, parseSettings, physicalFor, rebind } from "../src/editor/playerSettings";

test("player settings: defaults, clamping and the M4 comfort settings", () => {
  assert.deepEqual(parseSettings(null), defaultSettings);
  assert.deepEqual(parseSettings("not json"), defaultSettings);
  const s = parseSettings(JSON.stringify({ sensitivity: 9, brightness: 0.1, ink: 0, flash: 0.5, shake: false, blockToggle: true, minimapSize: "large", master: 0.3, sfx: 2 }));
  assert.equal(s.sensitivity, 1.5, "sensitivity stays within 50% of the default");
  assert.equal(s.brightness, 0.6);
  assert.equal(s.ink, 0);
  assert.equal(s.flash, 0.5);
  assert.equal(s.shake, false);
  assert.equal(s.blockToggle, true);
  assert.equal(s.minimapSize, "large");
  assert.equal(s.master, 0.3);
  assert.equal(s.sfx, 1);
  assert.equal(parseSettings(JSON.stringify({ minimapSize: "huge" })).minimapSize, "medium");
});

test("key list: an InputActions text as rows with their rebindable keys", () => {
  const rows = bindingRows("move_x: d, -a, right, -left, pad_lx\nlook_x: mouse_dx*0.05, pad_rx\nlook_y: mouse_dy*0.05\nlight: mouse_left, pad_x\ndodge: space, pad_a\nblock: shift, pad_lb\nlock: tab, mouse_middle\n# a comment\n");
  const by = Object.fromEntries(rows.map((r) => [r.action, r]));
  assert.equal(by.move_x!.code, undefined);
  assert.equal(by.move_x!.other, "D, A, Right arrow, Left arrow");
  assert.equal(by.look_x!.other, "Mouse");
  assert.equal(by.look_y, undefined, "look_y folds into Look");
  assert.equal(by.light!.code, undefined);
  assert.equal(by.light!.other, "Left click");
  assert.equal(by.dodge!.code, "Space");
  assert.equal(by.block!.code, "ShiftLeft");
  assert.equal(by.lock!.code, "Tab");
  assert.equal(by.lock!.other, "Middle click");
  assert.equal(codeForBinding("q"), "KeyQ");
  assert.equal(codeForBinding("7"), "Digit7");
  assert.equal(keyForCode("KeyV"), "v");
  assert.equal(keyForCode("Space"), " ");
});

test("rebinding swaps physical keys, so no key is lost", () => {
  let remap = rebind({}, "Space", "KeyV");
  assert.deepEqual(remap, { KeyV: "Space", Space: "KeyV" });
  assert.equal(physicalFor(remap, "Space"), "KeyV");
  // Onto a key another action uses: the two swap.
  remap = rebind(remap, "KeyQ", "KeyV");
  assert.equal(physicalFor(remap, "KeyQ"), "KeyV");
  assert.equal(physicalFor(remap, "Space"), "KeyQ");
  const logical = Object.values(remap).sort();
  assert.deepEqual(Object.keys(remap).sort(), logical, "a permutation");
  // Back to its own key: the remap empties again.
  remap = rebind(remap, "Space", "Space");
  remap = rebind(remap, "KeyQ", "KeyQ");
  assert.deepEqual(remap, {});
});

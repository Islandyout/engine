import { test } from "node:test";
import assert from "node:assert/strict";
import { autoSize, contains, layoutRect, sliderValue } from "../src/editor/uiLayout";

test("anchors keep boxes on screen, inset by 16 px, and offsets move them", () => {
  assert.deepEqual(layoutRect("top-left", 800, 600, 100, 20, 0, 0), { left: 16, top: 16, width: 100, height: 20 });
  assert.deepEqual(layoutRect("bottom-right", 800, 600, 100, 20, 0, 0), { left: 684, top: 564, width: 100, height: 20 });
  assert.deepEqual(layoutRect("center", 800, 600, 100, 20, 10, -30), { left: 360, top: 260, width: 100, height: 20 });
  assert.deepEqual(layoutRect("top-center", 800, 600, 100, 20, 0, 40), { left: 350, top: 56, width: 100, height: 20 });
});

test("auto sizes match the original Text/Button boxes", () => {
  assert.deepEqual(autoSize("Button", 60, 16), { width: 88, height: 34 });
  assert.deepEqual(autoSize("Text", 60, 16), { width: 60, height: 16 });
  assert.deepEqual(autoSize("Bar", 0, 16), { width: 200, height: 16 });
});

test("hit testing and slider values", () => {
  const rect = { left: 100, top: 50, width: 200, height: 20 };
  assert.equal(contains(rect, 150, 60), true);
  assert.equal(contains(rect, 99, 60), false);
  assert.equal(sliderValue(rect, 150), 0.25);
  assert.equal(sliderValue(rect, 50), 0);
  assert.equal(sliderValue(rect, 400), 1);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBrush,
  decodeSculpt,
  encodeHeights,
  encodeSculpt,
  fbm,
  generateHeights,
  normalY,
  parseScatter,
  sampleHeight,
  scatterInstances,
  type TerrainParams,
} from "../src/editor/terrain";

const base: TerrainParams = { size: 100, resolution: 33, height: 8, seed: 3, frequency: 2, octaves: 4, sculpt: "" };

test("noise is deterministic, seeded and bounded", () => {
  assert.equal(fbm(1.3, 2.7, 5, 4), fbm(1.3, 2.7, 5, 4));
  assert.notEqual(fbm(1.3, 2.7, 5, 4), fbm(1.3, 2.7, 6, 4));
  for (let i = 0; i < 500; i++) {
    const v = fbm(i * 0.37, i * 0.11, 9, 5);
    assert.ok(v >= -1 && v <= 1);
  }
  const heights = generateHeights(base);
  assert.equal(heights.length, 33 * 33);
  assert.ok(Math.max(...heights) <= 8 && Math.min(...heights) >= -8);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 1, "the terrain isn't flat");
  assert.deepEqual(generateHeights({ ...base, height: 0 }), new Float32Array(33 * 33), "zero height is flat");
});

test("sampling interpolates between vertices and clamps at the edges", () => {
  const flat = new Float32Array(9);
  flat[4] = 2; // center of a 3x3 grid over a 10-unit square
  assert.equal(sampleHeight(flat, 3, 10, 0, 0), 2);
  assert.ok(Math.abs(sampleHeight(flat, 3, 10, 2.5, 0) - 1) < 1e-6);
  assert.equal(sampleHeight(flat, 3, 10, -50, -50), 0);
  assert.ok(normalY(flat, 3, 10, 2.5, 0) < 1 && normalY(new Float32Array(9), 3, 10, 0, 0) === 1);
});

test("sculpt offsets round-trip and brushes raise, lower, flatten and smooth", () => {
  const offsets = new Int16Array(33 * 33);
  assert.equal(encodeSculpt(offsets), "", "untouched terrain stores nothing");
  const flatParams = { ...base, height: 0 };
  applyBrush(flatParams, offsets, "raise", 0, 0, 10, 2);
  let heights = generateHeights(flatParams, offsets);
  assert.ok(Math.abs(sampleHeight(heights, 33, 100, 0, 0) - 2) < 0.01, "raised by the strength at the center");
  assert.equal(sampleHeight(heights, 33, 100, 20, 0), 0, "nothing outside the radius");
  const restored = decodeSculpt(encodeSculpt(offsets), 33 * 33);
  assert.deepEqual(restored, offsets);
  applyBrush(flatParams, offsets, "lower", 0, 0, 10, 2);
  heights = generateHeights(flatParams, offsets);
  assert.ok(Math.abs(sampleHeight(heights, 33, 100, 0, 0)) < 0.02, "lower undoes raise");
  const hill = new Int16Array(33 * 33);
  applyBrush(flatParams, hill, "raise", 0, 0, 20, 5);
  const before = generateHeights(flatParams, hill);
  for (let i = 0; i < 10; i++) applyBrush(flatParams, hill, "flatten", 0, 0, 40, 1);
  const flattened = generateHeights(flatParams, hill);
  assert.ok(Math.abs(sampleHeight(flattened, 33, 100, 9, 0) - 5) < Math.abs(sampleHeight(before, 33, 100, 9, 0) - 5), "flatten pulls toward the center height");
  const spike = new Int16Array(33 * 33);
  spike[16 * 33 + 16] = 1000;
  applyBrush(flatParams, spike, "smooth", 0, 0, 5, 1);
  assert.ok(spike[16 * 33 + 16]! < 1000 && spike[16 * 33 + 17]! > 0, "smooth spreads a spike out");
  assert.equal(decodeSculpt("not base64!!", 4).length, 4, "bad sculpt data reads as flat");
});

test("scatter rules parse, place deterministically on gentle slopes, and heights encode", () => {
  const { rules, errors } = parseScatter("# trees\n46 0.002 0.8 1.4 0.9 collide\n42 0.001\nbad line here\n");
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], { model: 46, density: 0.002, minScale: 0.8, maxScale: 1.4, maxSlope: 0.9, collide: true });
  assert.deepEqual(rules[1], { model: 42, density: 0.001, minScale: 1, maxScale: 1, maxSlope: 0.8, collide: false });
  assert.equal(errors.length, 1);
  const heights = generateHeights(base);
  const a = scatterInstances(base, heights, rules);
  assert.deepEqual(a, scatterInstances(base, heights, rules), "deterministic");
  assert.ok(a.length > 0 && a.length <= 30);
  for (const instance of a) {
    assert.ok(Math.abs(instance.x) <= 50 && Math.abs(instance.z) <= 50);
    assert.ok(Math.abs(instance.y - sampleHeight(heights, 33, 100, instance.x, instance.z)) < 1e-6);
  }
  const encoded = encodeHeights(new Float32Array([1.5, -2]));
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  assert.deepEqual(Array.from(new Float32Array(bytes.buffer)), [1.5, -2]);
});

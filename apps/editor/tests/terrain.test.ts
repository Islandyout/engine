import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBrush,
  decodeSculpt,
  encodeSculpt,
  fbm,
  generateHeights,
  normalY,
  parseScatter,
  sampleHeight,
  scatterInstances,
  type TerrainParams,
} from "../src/editor/terrain";
import { placeFoliage } from "../src/editor/foliage";

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
  const { rules, errors } = parseScatter("# trees\n46 0.002 0.8 1.4 0.9 collide\n42 0.001\nbad line here\n255 0.001 0.5 trunk\n");
  assert.equal(rules.length, 3);
  assert.deepEqual(rules[0], { model: 46, density: 0.002, minScale: 0.8, maxScale: 1.4, maxSlope: 0.9, collide: true, trunk: false });
  assert.deepEqual(rules[1], { model: 42, density: 0.001, minScale: 1, maxScale: 1, maxSlope: 0.8, collide: false, trunk: false });
  // "trunk" collides too, as a trunk rather than a quarter of the footprint.
  assert.deepEqual(rules[2], { model: 255, density: 0.001, minScale: 0.5, maxScale: 0.5, maxSlope: 0.8, collide: true, trunk: true });
  rules.pop();
  assert.equal(errors.length, 1);
  const heights = generateHeights(base);
  const a = scatterInstances(base, heights, rules);
  assert.deepEqual(a, scatterInstances(base, heights, rules), "deterministic");
  assert.ok(a.length > 0 && a.length <= 30);
  for (const instance of a) {
    assert.ok(Math.abs(instance.x) <= 50 && Math.abs(instance.z) <= 50);
    assert.ok(Math.abs(instance.y - sampleHeight(heights, 33, 100, instance.x, instance.z)) < 1e-6);
  }
  const fenced = parseScatter("46 0.01\nexclude -50 -50 0 50\nexclude 1 2\nexclude 25 0 12\n");
  assert.deepEqual(fenced.exclusions, [
    { x0: -50, z0: -50, x1: 0, z1: 50 },
    { x0: 25, z0: 0, x1: 25, z1: 0, radius: 12 },
  ]);
  assert.equal(fenced.errors.length, 1, "a malformed exclude is reported");
  const kept = scatterInstances(base, heights, fenced.rules, fenced.exclusions);
  assert.ok(kept.length > 0 && kept.every((i) => i.x > 0), "nothing is placed in the excluded half");
  assert.ok(kept.every((i) => Math.hypot(i.x - 25, i.z) >= 12), "nor in the excluded circle");
});

test("foliage options: spacing, groves, height bands, layers, tilt and tint", () => {
  const flat = { height: () => 0, normal: (): [number, number, number] => [0, 1, 0] };
  const area = { x0: -100, z0: -100, x1: 100, z1: 100 };
  const rule = (extra: string) => {
    const { rules, errors } = parseScatter(`255 0.01 0.8 1.2 ${extra}`);
    assert.deepEqual(errors, []);
    return rules;
  };
  // Spacing: no two instances closer than their scaled spacing.
  const spaced = placeFoliage(rule("spacing=6"), flat, area, 3);
  for (const a of spaced) for (const b of spaced) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 6 * Math.min(a.scale, b.scale) - 1e-9);
  // Clustering gathers the same count into groves: the mean distance to the
  // nearest neighbour drops against an even scatter.
  const even = placeFoliage(rule(""), flat, area, 3);
  const groves = placeFoliage(rule("cluster=1 clusterSize=50"), flat, area, 3);
  assert.equal(groves.length, even.length);
  const nearest = (list: { x: number; z: number }[]) =>
    list.reduce((sum, a) => sum + Math.min(...list.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z))), 0) / list.length;
  assert.ok(nearest(groves) < nearest(even) * 0.85, "groves are tighter than an even scatter");
  // Height bands and layers.
  const hill = { height: (x: number) => x, normal: (): [number, number, number] => [0, 1, 0], layer: (_x: number, _z: number, h: number) => (h > 50 ? "snow" : "grass") };
  assert.ok(placeFoliage(rule("height=-20..20"), hill, area, 3).every((i) => i.y >= -20 && i.y <= 20));
  assert.ok(placeFoliage(rule("on=grass"), hill, area, 3).every((i) => i.y <= 50));
  assert.match(parseScatter("255 0.01 on=lava").errors[0]!, /on must list/);
  assert.match(parseScatter("255 0.01 wind=3").errors[0]!, /unknown option "wind"/);
  // Tilt leans with the ground by its fraction; tint varies brightness.
  const slope = { height: () => 0, normal: (): [number, number, number] => [0.6, 0.8, 0] };
  const leaning = placeFoliage(rule("0.5 tilt=1 tint=0.2"), slope, area, 3);
  assert.ok(leaning.length > 0 && leaning.every((i) => Math.abs(i.up![0] - 0.6) < 1e-9 && i.tint! >= 0.8 && i.tint! <= 1.2));
  // Without options, placement is the plain scatter's (no up, no tint).
  assert.ok(even.every((i) => i.up === undefined && i.tint === undefined));
});

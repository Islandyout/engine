import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FrameGovernor,
  governorTiers,
  presetFloor,
} from "../src/editor/frameGovernor";

const run = (g: FrameGovernor, ms: number, seconds: number) => {
  let changed = 0;
  for (let t = 0; t < seconds * 1000; t += ms) if (g.sample(ms)) changed++;
  return changed;
};

test("frame governor: holds the best tier while frames are fast", () => {
  const g = new FrameGovernor();
  run(g, 16.7, 10);
  assert.equal(g.tier, 0);
});
test("frame governor: drops tiers while frames are slow and stops at the last", () => {
  const g = new FrameGovernor();
  run(g, 30, 60);
  assert.equal(g.tier, governorTiers.length - 1);
  assert.ok(g.fps < 40);
});
test("frame governor: climbs back after a steady fast stretch", () => {
  const g = new FrameGovernor();
  run(g, 30, 2.5);
  const low = g.tier;
  assert.ok(low > 0);
  run(g, 12, 60);
  assert.ok(g.tier < low);
});
test("frame governor: holds off a tier that just failed instead of oscillating", () => {
  const g = new FrameGovernor();
  run(g, 25, 1.6);
  assert.equal(g.tier, 1);
  // Fast for 4 s: tier 0 failed moments ago, so it isn't tried yet.
  run(g, 12, 4);
  assert.equal(g.tier, 1);
});
test("frame governor: ignores pauses and respects the preset floor", () => {
  const g = new FrameGovernor({ floor: presetFloor("medium") });
  assert.equal(g.sample(5000), false);
  run(g, 10, 30);
  assert.equal(g.tier, 2);
  g.reset(presetFloor("low"));
  assert.equal(g.tier, 4);
});
test("frame governor: tiers only ever get cheaper", () => {
  for (let i = 1; i < governorTiers.length; i++) {
    const [a, b] = [governorTiers[i - 1]!, governorTiers[i]!];
    assert.ok(b.scale <= a.scale);
    assert.ok(b.shadows <= a.shadows);
    assert.ok(b.scatter <= a.scatter);
    assert.ok(b.crowdStride >= a.crowdStride);
  }
});

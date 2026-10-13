import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createSkyState, keys, skyAt } from "../src/editor/timeOfDay";

// What the hemisphere light gives a surface: its sky colour's luminance,
// its intensity and the exposure it's seen through.
function fill(hours: number) {
  const s = skyAt(hours, createSkyState());
  const c = s.sky;
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * s.ambient * s.exposure;
}

test("time of day: night stays bright enough to see (ambient at least 60% of the day's)", () => {
  const noon = fill(13);
  for (const h of [22, 23.5, 0, 2, 4.5]) assert.ok(fill(h) >= 0.6 * noon, `${h}:00 fill ${fill(h).toFixed(3)} vs noon ${noon.toFixed(3)}`);
  // The moon still lights from above, with a cool blue-violet colour.
  const night = skyAt(1, createSkyState());
  assert.ok(night.direction.y > 0.5, "a high moon");
  assert.ok(night.sun.b > night.sun.r && night.sunIntensity >= 1.4, "a strong cool moon");
  assert.ok(night.background.b > 0.03, "the night sky is blue, not black");
});

test("time of day: blends smoothly round the clock and wraps at midnight", () => {
  const a = createSkyState(),
    b = createSkyState();
  for (let m = 0; m < 24 * 60; m++) {
    skyAt(m / 60, a);
    skyAt((m + 1) / 60, b);
    assert.ok(Math.abs(a.sunIntensity - b.sunIntensity) < 0.02, `sun jumps at ${m} min`);
    assert.ok(Math.abs(a.ambient - b.ambient) < 0.02, `ambient jumps at ${m} min`);
    assert.ok(a.direction.angleTo(b.direction) < THREE.MathUtils.degToRad(3), `light swings at ${m} min`);
    assert.ok(a.direction.y > 0, `light below the horizon at ${m} min`);
  }
  assert.deepEqual(skyAt(24, a).background.toArray(), skyAt(0, b).background.toArray());
  assert.deepEqual(skyAt(-1, a).background.toArray(), skyAt(23, b).background.toArray());
  assert.equal(keys[0]!.h, 0);
  assert.equal(keys[keys.length - 1]!.h, 24);
});

test("time of day: noon is a bright high sun, dusk a low orange one", () => {
  const noon = skyAt(13, createSkyState());
  assert.ok(noon.direction.y > 0.85 && noon.sunIntensity > 2);
  const dusk = skyAt(20.75, createSkyState());
  assert.ok(dusk.direction.y < 0.15 && dusk.sun.r > dusk.sun.b * 2, "a low orange sun at dusk");
});

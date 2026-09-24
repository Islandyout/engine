import { test } from "node:test";
import assert from "node:assert/strict";
import { aliveCount, burst, createEmitter, stepEmitter, type EmitterSettings } from "../src/editor/particles";
import { buildRibbon, updateTrail, type TrailPoint } from "../src/editor/trail";

const base: EmitterSettings = {
  rate: 10, lifetime: 1, speed: 2, size: 0.1, endSize: 3,
  color: [1, 0, 0], endColor: [0, 0, 1], direction: [0, 1, 0], spread: 0,
  gravity: 0, shape: "Point", shapeSize: 0.5, coneAngle: 25,
};
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("rate, lifetime, color and size over lifetime", () => {
  const e = createEmitter(base);
  for (let i = 0; i < 5; i++) stepEmitter(e, 0.1, random);
  assert.equal(aliveCount(e), 5);
  const slot = 0; // oldest: spawned at the end of step 1, aged 0.4 s since
  assert.ok(Math.abs(e.positions[slot * 3 + 1]! - 0.8) < 1e-5, "moves straight up at speed 2");
  // t = 0.4: color lerps red->blue then fades by 0.6; size 0.1 * (1 + 2*0.4)
  assert.ok(Math.abs(e.colors[0]! - 0.6 * 0.6) < 1e-5 && Math.abs(e.colors[2]! - 0.4 * 0.6) < 1e-5);
  assert.ok(Math.abs(e.sizes[0]! - 0.18) < 1e-5);
  for (let i = 0; i < 20; i++) stepEmitter(e, 0.1, random);
  assert.ok(aliveCount(e) <= 11, "steady state is about rate * lifetime");
});

test("gravity, bursts, emitting toggle and shapes", () => {
  const e = createEmitter({ ...base, rate: 0, gravity: 10 }, 50);
  assert.equal(burst(e, 50, random), 50);
  stepEmitter(e, 0.1, random);
  assert.ok(Math.abs(e.velocities[1]! - 1) < 1e-5, "gravity 10 slows the rise by 1 in 0.1 s");
  const off = createEmitter(base);
  off.emitting = false;
  stepEmitter(off, 1, random);
  assert.equal(aliveCount(off), 0);
  for (const shape of ["Sphere", "Box", "Cone"] as const) {
    const s = createEmitter({ ...base, rate: 0, shape, shapeSize: 2, coneAngle: 10 }, 200);
    burst(s, 200, random);
    for (let i = 0; i < 200; i++) {
      const [x, y, z] = [s.positions[i * 3]!, s.positions[i * 3 + 1]!, s.positions[i * 3 + 2]!];
      if (shape === "Sphere") assert.ok(Math.hypot(x, y, z) <= 2 + 1e-5);
      if (shape === "Box") assert.ok(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 2 + 1e-5);
      if (shape === "Cone") {
        assert.ok(y === 0 && Math.hypot(x, z) <= 2 + 1e-5);
        const vy = s.velocities[i * 3 + 1]! / 2;
        assert.ok(vy >= Math.cos((10 * Math.PI) / 180) - 1e-5, "within the cone angle");
      }
    }
  }
});

test("trail records by distance, expires by age, and builds a ribbon", () => {
  const points: TrailPoint[] = [];
  updateTrail(points, { x: 0, y: 0, z: 0 }, 0, 1, 0.1);
  updateTrail(points, { x: 0.05, y: 0, z: 0 }, 0.1, 1, 0.1);
  assert.equal(points.length, 1, "too close to record");
  updateTrail(points, { x: 1, y: 0, z: 0 }, 0.1, 1, 0.1);
  assert.equal(points.length, 2);
  updateTrail(points, { x: 2, y: 0, z: 0 }, 0.9, 1, 0.1);
  assert.equal(points.length, 2, "the first point expired");
  const ribbon = buildRibbon(points, { x: 1.5, y: 0, z: 10 }, 0.4, 1);
  assert.equal(ribbon.indices.length, 6);
  // Path along x viewed from +z: the ribbon spreads along y; the older head
  // point (age 0.9) is narrower than the new one.
  assert.ok(Math.abs(ribbon.positions[1]! - ribbon.positions[4]!) < 0.05);
  assert.ok(Math.abs(ribbon.positions[7]! - ribbon.positions[10]!) - 0.4 > -1e-5);
});

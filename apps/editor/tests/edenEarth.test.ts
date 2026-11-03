import test from "node:test";
import assert from "node:assert/strict";
import { hypot2 } from "../src/eden/earth";

test("hypot2 gives exactly the bits Math.hypot gives, so swapping it in changes no seeded life", () => {
  let s = 99;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 300000; i++) {
    const scale = 10 ** (r() * 10 - 4);
    const a = (r() - 0.5) * scale;
    const b = (r() - 0.5) * scale * r();
    assert.equal(hypot2(a, b), Math.hypot(a, b), `${a}, ${b}`);
  }
  for (const [a, b] of [[0, 0], [3, 0], [0, -4], [NaN, 1], [1, NaN], [Infinity, NaN], [-Infinity, 2], [1e308, 1e308], [5e-324, 0], [3, 4]] as const) {
    assert.ok(Object.is(hypot2(a, b), Math.hypot(a, b)), `${a}, ${b}`);
  }
});

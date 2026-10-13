import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSignalHeads, setSignalHeads } from "../src/editor/signalHeads";

test("signal heads: four corners, each lit for the road it faces", () => {
  const signal = buildSignalHeads(9);
  assert.equal(signal.heads.length, 4);
  assert.deepEqual(signal.heads.map((h) => h.axis).sort(), [0, 0, 1, 1]);
  const lit = (axis: number) => signal.heads.find((h) => h.axis === axis)!.lamps.map((m) => m.emissiveIntensity > 1);
  // Axis 0 green (0), axis 1 red (2): state 0 + 3 * 2.
  setSignalHeads(signal, 6);
  assert.deepEqual(lit(0), [false, false, true]); // red, yellow, green lamps: green on
  assert.deepEqual(lit(1), [true, false, false]); // red on
  setSignalHeads(signal, 2 + 3 * 1); // axis 0 red, axis 1 yellow
  assert.deepEqual(lit(0), [true, false, false]);
  assert.deepEqual(lit(1), [false, true, false]);
  setSignalHeads(signal, -1); // no signal: left as it was
  assert.deepEqual(lit(1), [false, true, false]);
});

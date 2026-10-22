import assert from "node:assert/strict";
import { test } from "node:test";
import { grassCell, cellTufts } from "../src/editor/grassField";
import { parseScatter } from "../src/editor/terrain";
import type { FoliageGround } from "../src/editor/foliage";

const flat = (layer: string): FoliageGround => ({ height: () => 2, normal: () => [0, 1, 0], layer: () => layer });

test("a near= rule parses and is kept out of the placed scatter", () => {
  const { rules, errors } = parseScatter("404 0.75 0.8 1.4 0.9 on=grass near=30");
  assert.deepEqual(errors, []);
  assert.equal(rules[0]!.near, 30);
  assert.ok(/near/.test(parseScatter("404 1 1 1 0.9 near=-2").errors.join()), "a negative reach is an error");
});

test("a cell grows the same tufts every time, about density x area of them", () => {
  const { rules } = parseScatter("404 0.75 0.8 1.4 0.9 on=grass near=30");
  const a = cellTufts(rules[0]!, 0, 3, -2, flat("grass"), 41);
  const b = cellTufts(rules[0]!, 0, 3, -2, flat("grass"), 41);
  assert.deepEqual(a, b);
  assert.equal(a.length, 12, "0.75 a square metre over a 4 m cell");
  for (const t of a) {
    assert.ok(t.x >= 3 * grassCell && t.x < 4 * grassCell && t.z >= -2 * grassCell && t.z < -1 * grassCell, "inside its cell");
    assert.equal(t.y, 2);
    assert.ok(t.scale >= 0.8 && t.scale <= 1.4);
  }
  assert.notDeepEqual(a, cellTufts(rules[0]!, 0, 4, -2, flat("grass"), 41), "the next cell differs");
});

test("grass keeps to its layer, its slope and clearings", () => {
  const { rules } = parseScatter("404 1 1 1 0.9 on=grass near=30");
  assert.equal(cellTufts(rules[0]!, 0, 0, 0, flat("sand"), 1).length, 0, "no grass on sand");
  assert.equal(cellTufts(rules[0]!, 0, 0, 0, { ...flat("grass"), normal: () => [0.8, 0.6, 0] }, 1).length, 0, "none on a steep slope");
  assert.equal(cellTufts(rules[0]!, 0, 0, 0, { ...flat("grass"), blocked: () => true }, 1).length, 0, "none in an exclusion");
});

test("in=x,z,r keeps a rule to its circle", () => {
  const { rules, errors } = parseScatter("404 0.01 1 1 0.5 in=100,-50,30");
  assert.deepEqual(errors, []);
  assert.deepEqual(rules[0]!.within, [100, -50, 30]);
  assert.match(parseScatter("404 0.01 1 1 0.5 in=1,2").errors.join(), /in must be/);
});

test("a rule kept to a circle places its density over the circle and nowhere else", async () => {
  const { placeFoliage } = await import("../src/editor/foliage");
  const { rules } = parseScatter("1 0.01 1 1 0.5 in=100,-50,30");
  const out = placeFoliage(rules, { height: () => 0, normal: () => [0, 1, 0] }, { x0: -500, z0: -500, x1: 500, z1: 500 }, 3);
  assert.ok(out.length > 15 && out.length <= 29, `about pi * 30^2 * 0.01 = 28 (${out.length})`);
  for (const i of out) assert.ok(Math.hypot(i.x - 100, i.z + 50) <= 30);
});

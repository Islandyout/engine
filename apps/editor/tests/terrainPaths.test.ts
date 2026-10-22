import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePaths, pathStrength } from "../src/editor/terrainPaths";

test("paths parse one per line and report bad ones", () => {
  const { paths, errors } = parsePaths("dirt 5 0 0 10 0 20 5\n# a comment\nstone 8 -5 0 5 0\nmud 3 0 0 1 1\ndirt 0 0 0 1 1\ndirt 3 0 0 1");
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0]!.points, [[0, 0], [10, 0], [20, 5]]);
  assert.equal(errors.length, 3);
  assert.match(errors.join(" "), /kind must be dirt or stone/);
});

test("a path is full strength along its middle and fades out beyond half its width", () => {
  const { paths } = parsePaths("dirt 6 0 0 100 0");
  assert.equal(pathStrength(paths, "dirt", 50, 0, 2), 1);
  assert.equal(pathStrength(paths, "dirt", 50, 3, 2), 1, "the edge of the width");
  const mid = pathStrength(paths, "dirt", 50, 4, 2);
  assert.ok(mid > 0 && mid < 1, `fading (${mid})`);
  assert.equal(pathStrength(paths, "dirt", 50, 6, 2), 0);
  assert.equal(pathStrength(paths, "stone", 50, 0, 2), 0, "another kind is not here");
  assert.equal(pathStrength(paths, "dirt", 150, 0, 2), 0, "past the end");
});

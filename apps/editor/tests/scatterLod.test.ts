import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { DynamicLod, cullDistance, nearDistance, setScatterDensity, type LodPart } from "../src/editor/scatterLod";

const part = (): LodPart => ({ geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshBasicMaterial(), local: new THREE.Matrix4() });
const make = (xs: number[]) => {
  const placements = new Float32Array(xs.length * 16);
  xs.forEach((x, i) => new THREE.Matrix4().makeTranslation(x, 0, 0).toArray(placements, i * 16));
  return new DynamicLod(placements, Float32Array.from(xs), new Float32Array(xs.length), undefined, [part()], [part()], true);
};
const counts = (lod: DynamicLod) => {
  const meshes = lod.group.children as THREE.InstancedMesh[];
  return { near: meshes[0]!.count, far: meshes[1]!.count };
};

test("each instance draws near or far by its own distance from the camera, and none beyond the cull distance", () => {
  const lod = make([10, nearDistance + 30, cullDistance + 50]);
  lod.update(0, 0, true);
  assert.deepEqual(counts(lod), { near: 1, far: 1 });
  // Walk toward the middle one: it comes into detail, the first goes to its far version, and the distant one is now within the cull distance.
  lod.update(nearDistance + 30, 0, true);
  assert.deepEqual(counts(lod), { near: 1, far: 2 });
  assert.equal((lod.group.children[0] as THREE.InstancedMesh).castShadow, true, "only the detailed version casts shadows");
  assert.equal((lod.group.children[1] as THREE.InstancedMesh).castShadow, false);
});

test("a far camera move re-sorts, a small one does not, and the governor's fraction thins the draw", () => {
  const lod = make([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  lod.update(0, 0);
  assert.equal(counts(lod).near, 10);
  lod.update(2, 0); // under the re-sort distance: left alone
  setScatterDensity(0.5);
  lod.update(2, 0); // the fraction changed: re-sorted
  assert.equal(counts(lod).near, 5);
  setScatterDensity(1);
  lod.update(2, 0);
  assert.equal(counts(lod).near, 10);
});

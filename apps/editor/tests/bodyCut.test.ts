import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { cutBody, regionOf, regionsCoveredBy } from "../src/editor/bodyCut";

test("bones belong to the part of the body their clothes cover", () => {
  assert.equal(regionOf("Head"), "head");
  assert.equal(regionOf("neck_01"), "head");
  assert.equal(regionOf("spine_02"), "torso");
  assert.equal(regionOf("clavicle_l"), "torso");
  assert.equal(regionOf("lowerarm_r"), "arms");
  assert.equal(regionOf("index_01_l"), "arms");
  assert.equal(regionOf("thigh_l"), "legs");
  assert.equal(regionOf("foot_r"), "feet");
  assert.equal(regionOf("weapon_socket"), "other");
});

test("each outfit piece covers its own region, for both sexes and both sets", () => {
  assert.deepEqual([...regionsCoveredBy([379, 380, 381, 382])].sort(), ["arms", "feet", "legs", "torso"]);
  assert.deepEqual([...regionsCoveredBy([393, 395])].sort(), ["legs", "torso"]);
  assert.deepEqual([...regionsCoveredBy([363, 214])], [], "hair and the old gear ids cover nothing");
});

// A body of two triangles: one skinned to the spine, one to the thigh.
function body(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(18), 3));
  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  const spine = new THREE.Bone();
  spine.name = "spine_01";
  const thigh = new THREE.Bone();
  thigh.name = "thigh_l";
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([spine, thigh]));
  return mesh;
}

test("cutting leaves out the triangles under the clothes and restoring puts them back", () => {
  const mesh = body();
  cutBody(mesh, new Set(["torso"]));
  assert.equal(mesh.geometry.index!.count, 3, "the torso triangle is gone");
  assert.equal(mesh.geometry.getAttribute("position"), body().geometry.getAttribute("position") && mesh.geometry.getAttribute("position"), "the vertex buffers are shared, not copied");
  cutBody(mesh, new Set(["torso", "legs"]));
  assert.equal(mesh.geometry.index!.count, 0);
  cutBody(mesh, new Set());
  assert.equal(mesh.geometry.index!.count, 6, "the whole body again");
});

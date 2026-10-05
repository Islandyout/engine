import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { StaticBatcher } from "../src/editor/staticBatcher";

test("static batching merges look-alike scenery and lets movers go", () => {
  const objects: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: i < 4 ? "#808080" : "#ff0000" }));
    mesh.position.set(i * 2, 0, 0);
    objects.push(mesh);
  }
  const batcher = new StaticBatcher();
  batcher.build(
    objects,
    (i) => i !== 5,
    () => "site",
  );
  assert.equal(batcher.size, 5, "the ineligible one stays out");
  assert.equal(batcher.drawn, 2, "one mesh per look");
  assert.equal(objects[0]!.visible, false, "the original hides");
  assert.equal(objects[5]!.visible, true);
  objects[1]!.position.x += 3;
  batcher.check(() => false);
  assert.equal(batcher.size, 4, "a member that moved leaves its batch");
  assert.equal(objects[1]!.visible, true);
  batcher.clear();
  assert.equal(objects[0]!.visible, true, "clearing shows the originals again");
});

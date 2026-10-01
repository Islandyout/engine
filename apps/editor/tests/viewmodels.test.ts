import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { buildViewmodel, viewmodelNames } from "../src/editor/viewmodels";

test("every viewmodel builds with a muzzle in front of the grip and a sight above it", () => {
  for (const name of viewmodelNames) {
    const model = buildViewmodel(name);
    const meshes: THREE.Mesh[] = [];
    model.group.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    assert.ok(meshes.length >= 4, `${name} has parts`);
    assert.ok(model.muzzle.position.z < -0.15, `${name} muzzle is forward`);
    assert.ok(model.sightHeight > 0 && model.hip.x > 0 && model.hip.y < 0, `${name} hip pose`);
    const bounds = new THREE.Box3().setFromObject(model.group);
    assert.ok(bounds.min.z <= model.muzzle.position.z + 0.02, `${name} barrel reaches the muzzle`);
  }
  assert.equal(buildViewmodel("unknown").group.name, "viewmodel:unknown", "unknown names fall back to the rifle");
});

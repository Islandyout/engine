import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { ClothSkirt, findClothBones } from "../src/editor/cloth";

// A two-legged rig, 1 m at the hip, standing in an anchor group.
function rig() {
  const anchor = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, 0);
    parent.add(b);
    return b;
  };
  const pelvis = bone("pelvis", anchor, 0, 1);
  for (const [side, x] of [["l", -0.1], ["r", 0.1]] as const) {
    const thigh = bone(`thigh_${side}`, pelvis, x, 0);
    const calf = bone(`calf_${side}`, thigh, 0, -0.45);
    bone(`foot_${side}`, calf, 0, -0.45);
  }
  const scene = new THREE.Scene();
  scene.add(anchor);
  anchor.updateMatrixWorld(true);
  const bones = findClothBones(anchor)!;
  const skirt = new ClothSkirt(bones, anchor, new THREE.MeshStandardMaterial(), { length: 0.8 });
  return { anchor, pelvis, skirt };
}

const run = (skirt: ClothSkirt, seconds: number, each?: (t: number) => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    each?.(t);
    skirt.update(1 / 60, t);
  }
};
const hem = (skirt: ClothSkirt, j = 0) => new THREE.Vector3().fromArray(skirt.position, ((skirt.rows - 1) * skirt.segments + j) * 3);
const top = (skirt: ClothSkirt, j = 0) => new THREE.Vector3().fromArray(skirt.position, j * 3);

test("a standing skirt hangs from the waist and settles", () => {
  const { skirt } = rig();
  run(skirt, 2);
  assert.ok(top(skirt).y > 0.95 && top(skirt).y < 1.05, "the waist stays at the pelvis");
  assert.ok(hem(skirt).y < top(skirt).y - 0.6, `the hem hangs well below the waist (${hem(skirt).y})`);
  assert.ok(hem(skirt).y > 0.05, "and does not fall to the floor");
  const before = hem(skirt).clone();
  run(skirt, 0.5);
  assert.ok(hem(skirt).distanceTo(before) < 0.05, "it is at rest");
});

test("cloth lags behind a run: the hem trails the body, then catches up when it stops", () => {
  const { anchor, skirt } = rig();
  run(skirt, 1);
  const resting = hem(skirt, 0).z - anchor.position.z; // the front of the hem sits ahead of the waist's centre
  // Run forward (+z) at 5 m/s for a second.
  run(skirt, 1, (t) => {
    anchor.position.z += (5 / 60);
    anchor.updateMatrixWorld(true);
    void t;
  });
  const behind = resting - (hem(skirt, 0).z - anchor.position.z);
  assert.ok(behind > 0.12, `the hem is dragged behind the waist (${behind.toFixed(2)} m)`);
  assert.ok(hem(skirt, 0).distanceTo(top(skirt, 0)) < 1.0, "but never stretches past its reach");
  run(skirt, 1.5);
  assert.ok(Math.abs(hem(skirt, 0).z - anchor.position.z - resting) < 0.1, "and it comes back under the waist once the body stops");
});

test("a teleport does not stretch the cloth across the map", () => {
  const { anchor, skirt } = rig();
  run(skirt, 0.5);
  anchor.position.set(200, 0, -80);
  anchor.updateMatrixWorld(true);
  skirt.update(1 / 60, 1);
  assert.ok(hem(skirt).distanceTo(top(skirt)) < 1.1, "the hem went with the body");
});

test("the legs push the cloth out of the way", () => {
  const { pelvis, skirt } = rig();
  const left = pelvis.children.find((c) => c.name === "thigh_l")!;
  run(skirt, 1);
  // Swing the left leg forward 60 degrees.
  left.rotation.x = -1.05;
  left.updateMatrixWorld(true);
  run(skirt, 0.5);
  const calf = left.children[0]!.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < skirt.rows; i++)
    for (let j = 0; j < skirt.segments; j++) {
      const point = new THREE.Vector3().fromArray(skirt.position, (i * skirt.segments + j) * 3);
      if (i > 3) assert.ok(point.distanceTo(calf) > 0.06, "no cloth inside the shin");
    }
});

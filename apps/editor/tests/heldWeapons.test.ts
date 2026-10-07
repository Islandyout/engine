import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { clearOffHands, holdWeapon, updateOffHands, weaponGrip } from "../src/editor/heldWeapons";

test("each catalog weapon has its grip: daggers reverse, claymores two-handed, shields on the arm", () => {
  assert.equal(weaponGrip("./kit/weapons/dagger.glb").grip, "reverse");
  assert.equal(weaponGrip("./kit/weapons/sword.glb").grip, "forward");
  const claymore = weaponGrip("./kit/weapons/claymore.glb");
  assert.equal(claymore.grip, "twohand");
  assert.ok(claymore.offHand! < claymore.hold, "the off hand holds below the main hand");
  assert.equal(weaponGrip("./kit/weapons/shield-round.glb").grip, "shield");
  // Models not in the table: guessed by name.
  assert.equal(weaponGrip("Kite Shield").grip, "shield");
  assert.equal(weaponGrip("Mace").grip, "forward");
});

// A T-posed human, 1.75 units tall: arms along x, palms down (the thumb
// below and ahead of the hand), knuckles ahead of the wrist.
function rig(): THREE.Object3D {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const hips = bone("pelvis", root, 0, 0.95, 0);
  bone("head", hips, 0, 0.65, 0);
  bone("foot_l", root, 0.1, 0.05, 0);
  bone("foot_r", root, -0.1, 0.05, 0);
  for (const [side, s] of [
    ["l", 1],
    ["r", -1],
  ] as const) {
    const upper = bone(`upperarm_${side}`, hips, s * 0.18, 0.45, 0);
    const lower = bone(`lowerarm_${side}`, upper, s * 0.28, 0, 0);
    const hand = bone(`hand_${side}`, lower, s * 0.25, 0, 0);
    bone(`index_01_${side}`, hand, s * 0.09, 0, 0.03);
    bone(`middle_01_${side}`, hand, s * 0.09, 0, 0.01);
    bone(`pinky_01_${side}`, hand, s * 0.08, 0, -0.03);
    bone(`thumb_01_${side}`, hand, s * 0.03, -0.02, 0.04);
    bone(`thumb_02_${side}`, hand, s * 0.05, -0.04, 0.05);
  }
  root.updateMatrixWorld(true);
  return root;
}

// A weapon along +y, 1 unit from pommel (y = 0) to tip.
const blade = () => new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.02).translate(0, 0.5, 0));

test("a held weapon hangs from the hand bone at its grip and is drawn at its real length", () => {
  const rest = rig();
  const target = rig();
  const grip = weaponGrip("sword");
  const holder = holdWeapon(rest, target, "r", blade(), grip)!;
  assert.ok(holder);
  assert.equal(holder.parent?.name, "hand_r");
  target.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - grip.length) < 0.02, `drawn ${Math.max(size.x, size.y, size.z)} long`);
  // The grip (hold) is at the holder's origin, near the fist.
  const hand = target.getObjectByName("hand_r")!.getWorldPosition(new THREE.Vector3());
  assert.ok(holder.getWorldPosition(new THREE.Vector3()).distanceTo(hand) < 0.15);
});

test("two-handed: the off hand is put on the handle, wherever the clip left it", () => {
  clearOffHands();
  const rest = rig();
  const target = rig();
  // A clip has the right hand in front of the chest and the left arm
  // hanging at the side.
  target.getObjectByName("upperarm_r")!.rotation.set(0, -1.2, 0);
  target.getObjectByName("lowerarm_r")!.rotation.set(0, -1.3, 0);
  target.getObjectByName("upperarm_l")!.rotation.set(0, 0, -1.4);
  target.updateMatrixWorld(true);
  const grip = { grip: "twohand" as const, length: 1.2, hold: 0.25, offHand: 0.1 };
  const holder = holdWeapon(rest, target, "r", blade(), grip)!;
  const handL = target.getObjectByName("hand_l")!;
  const distanceToHandle = () => {
    target.updateMatrixWorld(true);
    const origin = holder.getWorldPosition(new THREE.Vector3());
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
    const p = handL.getWorldPosition(new THREE.Vector3()).sub(origin);
    return p.sub(axis.multiplyScalar(p.dot(axis))).length();
  };
  const before = distanceToHandle();
  updateOffHands();
  const after = distanceToHandle();
  // The hand bone sits a fist's width off the handle line, no more.
  assert.ok(after < 0.12, `the left hand ends ${after.toFixed(3)} from the handle (was ${before.toFixed(3)})`);
  assert.ok(after < before);
  clearOffHands();
});

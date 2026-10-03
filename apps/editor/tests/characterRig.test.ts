import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { attachToHand, faceWeaponForward, splitForWeapon } from "../src/editor/characterRig";

// pelvis > (thigh_l, spine_01 > spine_02 > (hand_r, hand_l)), hands placed
// by the caller.
function rig(right: THREE.Vector3, left: THREE.Vector3) {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, position = new THREE.Vector3()) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.copy(position);
    parent.add(b);
    return b;
  };
  const pelvis = bone("pelvis", root, new THREE.Vector3(0, 1, 0));
  bone("thigh_l", pelvis);
  const spine = bone("spine_02", bone("spine_01", pelvis));
  bone("hand_r", spine, right.clone().sub(new THREE.Vector3(0, 1, 0)));
  bone("hand_l", spine, left.clone().sub(new THREE.Vector3(0, 1, 0)));
  root.updateMatrixWorld(true);
  return root;
}
const turn = (name: string) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);

test("an armed rig plays locomotion on the legs and the holding clip on the upper body", () => {
  const root = rig(new THREE.Vector3(0.2, 1.3, 0), new THREE.Vector3(0.2, 1.3, 0.4));
  const walk = new THREE.AnimationClip("walk", 1, [turn("thigh_l"), turn("hand_r"), turn("spine_02")]);
  const hold = new THREE.AnimationClip("firing_rifle", 1, [turn("thigh_l"), turn("hand_l")]);
  const split = splitForWeapon(root, [walk, hold])!;
  assert.deepEqual(split.lower.find((c) => c.name === "walk")!.tracks.map((t) => t.name), ["thigh_l.quaternion"]);
  assert.deepEqual(split.upper.tracks.map((t) => t.name), ["hand_l.quaternion"]);
  assert.equal(splitForWeapon(root, [walk]), undefined, "no holding clip");
});

test("a weapon rides the right hand with its barrel toward the left hand", () => {
  const root = rig(new THREE.Vector3(0.2, 1.3, 0), new THREE.Vector3(0.2, 1.3, 0.4));
  const gun = new THREE.Group();
  gun.scale.setScalar(0.85);
  assert.ok(attachToHand(root, gun));
  assert.equal(gun.parent?.name, "hand_r");
  root.updateMatrixWorld(true);
  const barrel = gun.getWorldDirection(new THREE.Vector3()).negate(); // -z is forward
  assert.ok(barrel.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-5, `barrel ${barrel.toArray()}`);
  assert.ok(Math.abs(gun.getWorldScale(new THREE.Vector3()).x - 0.85) < 1e-5, "keeps its own size");
  assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0.2, 1.3, 0)) < 1e-5);
});

test("a bladed hold is turned so the weapon points where the character faces", () => {
  const parent = new THREE.Group();
  const root = rig(new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(-0.3, 1.3, 0.3)); // 45 degrees off +z
  parent.add(root);
  faceWeaponForward(root);
  const right = root.getObjectByName("hand_r")!.getWorldPosition(new THREE.Vector3());
  const left = root.getObjectByName("hand_l")!.getWorldPosition(new THREE.Vector3());
  const direction = left.sub(right).normalize();
  assert.ok(Math.abs(direction.x) < 1e-5 && direction.z > 0.99, `points +z: ${direction.toArray()}`);
});

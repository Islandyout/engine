// Characters holding weapons (0.69.0): an armed humanoid plays its
// locomotion clips on the legs and a weapon-holding clip on the upper body
// at the same time, and its weapon rides the right hand bone, so the
// model's own arms hold the gun whatever the legs are doing. Used for AI
// soldiers in the world and for the first-person arms.
import * as THREE from "three";

// Bones from here up (spine, arms, hands, head) take the upper-body clip.
export const upperBodyBone = "spine_02";
// Clips that hold a weapon up, in order of preference.
export const weaponHoldClips = ["firing_rifle", "aim", "rifle_aim", "shoot"];

// The names of `boneName` and every bone below it.
export function boneSubtree(root: THREE.Object3D, boneName: string): Set<string> {
  const names = new Set<string>();
  root.getObjectByName(boneName)?.traverse((child) => names.add(child.name));
  return names;
}

// The clip with only the tracks animating (keep = true) or not animating
// (keep = false) the named nodes. Track names are "node.property".
export function filterClip(clip: THREE.AnimationClip, names: Set<string>, keep: boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const node = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    return names.has(node) === keep;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export interface SplitClips {
  // Every clip without its upper-body tracks (legs, hips, root).
  lower: THREE.AnimationClip[];
  // The weapon-holding clip's upper-body tracks.
  upper: THREE.AnimationClip;
}

// Splits a rig's clips for an armed character, or undefined when the rig has
// no upper-body bone or no weapon-holding clip.
export function splitForWeapon(root: THREE.Object3D, clips: THREE.AnimationClip[]): SplitClips | undefined {
  const upperNames = boneSubtree(root, upperBodyBone);
  if (upperNames.size === 0) return undefined;
  const hold = weaponHoldClips.map((name) => clips.find((clip) => clip.name === name)).find(Boolean);
  if (!hold) return undefined;
  return {
    lower: clips.map((clip) => filterClip(clip, upperNames, false)),
    upper: filterClip(hold, upperNames, true),
  };
}

const scratch = {
  right: new THREE.Vector3(),
  left: new THREE.Vector3(),
  palm: new THREE.Vector3(),
  finger: new THREE.Vector3(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  world: new THREE.Matrix4(),
};

// Parents `weapon` (built with its grip at the origin, barrel along -z) to
// the rig's right hand: grip in the palm, barrel toward the left hand, top
// up, at its own scale in world units. Uses the rig's current pose, so play
// the holding clip and update the world matrices first. False (weapon left
// alone) when the rig has no hands.
export function attachToHand(root: THREE.Object3D, weapon: THREE.Object3D): boolean {
  const hand = root.getObjectByName("hand_r");
  const support = root.getObjectByName("hand_l");
  if (!hand || !support) return false;
  const { right, left, palm, finger, x, y, z, world } = scratch;
  hand.getWorldPosition(right);
  support.getWorldPosition(left);
  // The palm is between the wrist (the hand bone) and the knuckles.
  const knuckle = hand.getObjectByName("middle_01_r");
  palm.copy(right);
  if (knuckle) palm.lerp(knuckle.getWorldPosition(finger), 0.6);
  // Barrel from the trigger hand toward the support hand; -z is forward.
  z.subVectors(right, left);
  if (z.lengthSq() < 1e-8) z.set(0, 0, -1);
  z.normalize();
  y.set(0, 1, 0);
  x.crossVectors(y, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  y.crossVectors(z, x).normalize();
  const scale = weapon.scale.x;
  world.makeBasis(x, y, z).scale(new THREE.Vector3(scale, scale, scale)).setPosition(palm);
  hand.updateWorldMatrix(true, false);
  world.premultiply(new THREE.Matrix4().copy(hand.matrixWorld).invert());
  world.decompose(weapon.position, weapon.quaternion, weapon.scale);
  hand.add(weapon);
  return true;
}

// Turns `root` about its vertical axis so the line from its right hand to its
// left hand (the barrel of a two-handed hold) points along `forward`, an
// angle in its parent's space measured like atan2(x, z): 0 is +z (how
// characters face), PI is -z. Uses the current pose.
export function faceWeaponForward(root: THREE.Object3D, forward = 0) {
  const hand = root.getObjectByName("hand_r");
  const support = root.getObjectByName("hand_l");
  if (!hand || !support || !root.parent) return;
  root.parent.updateMatrixWorld(true);
  const right = root.parent.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
  const left = root.parent.worldToLocal(support.getWorldPosition(new THREE.Vector3()));
  root.rotation.y += forward - Math.atan2(left.x - right.x, left.z - right.z);
  root.updateMatrixWorld(true);
}

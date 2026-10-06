// Weapons in a fighter's hands (GATEBREAKER M0): a catalog model parented
// to the hand bone of a character on the Quaternius skeleton, so it follows
// every clip. The pose is found once, at the rig's rest pose: the grip runs
// across the fist from the index knuckle to the pinky's, the blade leaves
// the pinky side (a reverse grip: in the guard it points at the opponent)
// with its edge facing the knuckles. The model is scaled to `length` along
// its long axis.
import * as THREE from "three";

export const HELD_LENGTH = { dagger: 0.34, shield: 0.62, blade: 0.95 } as const;

// How long a held model is drawn: daggers and knives short, shields
// forearm-sized, the rest blade-length.
export function heldLength(name: string): number {
  if (/dagger|knife/i.test(name)) return HELD_LENGTH.dagger;
  if (/shield/i.test(name)) return HELD_LENGTH.shield;
  return HELD_LENGTH.blade;
}

const scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };

// Parents a copy of `model` to `side`'s hand bone in `target`. The grip is
// measured on `rest`, an unanimated copy of the same rig (the catalog's
// cached model), so it doesn't matter what pose `target` is in. Returns the
// holder, or undefined when the rig lacks the bones.
export function holdWeapon(rest: THREE.Object3D, target: THREE.Object3D, side: "l" | "r", model: THREE.Object3D, length: number): THREE.Object3D | undefined {
  const root = rest;
  const targetHand = target.getObjectByName(`hand_${side}`);
  const hand = root.getObjectByName(`hand_${side}`);
  const middle = root.getObjectByName(`middle_01_${side}`);
  const index = root.getObjectByName(`index_01_${side}`);
  const pinky = root.getObjectByName(`pinky_01_${side}`);
  if (!targetHand || !hand || !middle || !index || !pinky) return undefined;
  root.updateMatrixWorld(true);
  const at = hand.getWorldPosition(new THREE.Vector3());
  const fingers = middle.getWorldPosition(scratch.a).sub(at).normalize();
  const across = pinky.getWorldPosition(scratch.b).sub(index.getWorldPosition(scratch.c));
  const blade = across.sub(fingers.clone().multiplyScalar(across.dot(fingers))).normalize();
  if (!Number.isFinite(blade.x)) return undefined;

  // The model, normalized: its long axis is +y, the grip a little above the pommel.
  const weapon = model.clone(true);
  const box = new THREE.Box3().setFromObject(weapon);
  const size = box.getSize(new THREE.Vector3());
  weapon.scale.multiplyScalar(length / Math.max(size.y, 1e-6));
  box.setFromObject(weapon);
  weapon.position.set(-(box.min.x + box.max.x) / 2, -(box.min.y + (box.max.y - box.min.y) * 0.13), -(box.min.z + box.max.z) / 2);
  const holder = new THREE.Group();
  holder.name = `held_${side}`;
  holder.add(weapon);

  // +y along the blade, the edge (+z) toward the knuckles.
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), blade);
  const edge = new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
  const toward = fingers.clone().sub(blade.clone().multiplyScalar(fingers.dot(blade))).normalize();
  turn.premultiply(new THREE.Quaternion().setFromUnitVectors(edge, toward));
  const world = new THREE.Matrix4().compose(at.addScaledVector(fingers, 0.045), turn, new THREE.Vector3(1, 1, 1));
  hand.matrixWorld.clone().invert().multiply(world).decompose(holder.position, holder.quaternion, holder.scale);
  targetHand.add(holder);
  holder.traverse((node) => {
    if (node instanceof THREE.Mesh) node.castShadow = true;
  });
  return holder;
}

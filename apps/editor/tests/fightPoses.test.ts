import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { guardedKick, makeHighBlock, withHeldTracks } from "../src/editor/fightPoses";

// A small humanoid: pelvis, spine, head and two arms (clavicle, upper arm, forearm, hand), facing +z.
function rig() {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const pelvis = bone("pelvis", root, 0, 1);
  const spine = bone("spine_02", pelvis, 0, 0.3);
  bone("Head", spine, 0, 0.35);
  for (const [side, x] of [["l", 0.2], ["r", -0.2]] as const) {
    const clavicle = bone(`clavicle_${side}`, spine, x * 0.5, 0.2);
    const upper = bone(`upperarm_${side}`, clavicle, x * 0.5, 0);
    const lower = bone(`lowerarm_${side}`, upper, 0, -0.28);
    bone(`hand_${side}`, lower, 0, -0.25);
  }
  root.updateMatrixWorld(true);
  return root;
}
const round = (values: ArrayLike<number>) => Array.from(values, (v) => Math.round(v * 1000) / 1000);
const still = (name: string) => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack("pelvis.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);

test("the held tracks replace the clip's own for the named nodes only", () => {
  const kick = new THREE.AnimationClip("kick", 0.8, [
    new THREE.QuaternionKeyframeTrack("thigh_r.quaternion", [0, 0.8], [0, 0, 0, 1, 0.5, 0, 0, 0.87]),
    new THREE.QuaternionKeyframeTrack("upperarm_r.quaternion", [0, 0.8], [0, 0, 0, 1, 0, 0.5, 0, 0.87]),
  ]);
  const guard = new THREE.AnimationClip("guard", 2, [new THREE.QuaternionKeyframeTrack("upperarm_r.quaternion", [0, 2], [0.3, 0, 0, 0.95, 0, 0, 0, 1])]);
  const out = withHeldTracks(kick, guard, new Set(["upperarm_r"]));
  assert.equal(out.name, "kick");
  assert.equal(out.duration, 0.8);
  assert.deepEqual(round(out.tracks.find((t) => t.name === "thigh_r.quaternion")!.values), [0, 0, 0, 1, 0.5, 0, 0, 0.87], "the leg is the kick's");
  const arm = out.tracks.find((t) => t.name === "upperarm_r.quaternion")!;
  assert.deepEqual(round(arm.times), [0, 0.8]);
  assert.deepEqual(round(arm.values), [0.3, 0, 0, 0.95, 0.3, 0, 0, 0.95], "the arm holds the guard's first frame");
});

test("a guarded kick takes both arms from the guard", () => {
  const root = rig();
  const kick = new THREE.AnimationClip("front_kick_r", 0.8, [new THREE.QuaternionKeyframeTrack("hand_l.quaternion", [0, 0.8], [0, 0, 0, 1, 0, 0, 1, 0])]);
  const guard = new THREE.AnimationClip("guard", 1, [new THREE.QuaternionKeyframeTrack("hand_l.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
  const out = guardedKick(root, kick, guard);
  assert.deepEqual(Array.from(out.tracks[0]!.values), [0, 0, 0, 1, 0, 0, 0, 1]);
});

test("the high block puts both hands in front of the face and leaves the rig as it was", () => {
  const root = rig();
  const before = root.getObjectByName("hand_l")!.getWorldPosition(new THREE.Vector3());
  const clip = makeHighBlock(root, still("guard"))!;
  assert.ok(clip, "made");
  assert.equal(clip.name, "block_high");
  assert.ok(root.getObjectByName("hand_l")!.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-6, "the rig is restored");
  // Play it and look at the hands.
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const head = root.getObjectByName("Head")!.getWorldPosition(new THREE.Vector3());
  for (const side of ["l", "r"]) {
    const hand = root.getObjectByName(`hand_${side}`)!.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(hand.y - head.y) < 0.12, `${side} hand at head height (${hand.y.toFixed(2)} vs ${head.y.toFixed(2)})`);
    assert.ok(Math.abs(hand.z - head.z) > 0.1, `${side} hand in front of the face, not in it`);
  }
});

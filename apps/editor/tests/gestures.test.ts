import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { applyGesture, findGestureBones, gestureAngles, gestureFor } from "../src/editor/gestures";

test("gestures are small, differ per character, and layer over the pose", () => {
  assert.equal(gestureFor("talk"), "talk");
  assert.equal(gestureFor("punching"), "work");
  assert.equal(gestureFor("sit"), "sit");
  assert.equal(gestureFor("walk"), undefined);
  for (const kind of ["talk", "work", "sit"] as const)
    for (let t = 0; t < 20; t += 0.37) {
      const a = gestureAngles(kind, t, 3);
      for (const v of [...a.head, ...a.spine, ...a.upper, ...a.lower]) assert.ok(Math.abs(v) < 0.9, `${kind} stays a gesture`);
    }
  const differ = [0, 1, 2, 3].some((t) => gestureAngles("talk", t, 1).head[1] !== gestureAngles("talk", t, 2).head[1]);
  assert.ok(differ, "two talkers aren't in step");

  const root = new THREE.Group();
  const head = new THREE.Bone();
  head.name = "Head";
  const arm = new THREE.Bone();
  arm.name = "upperarm_r";
  root.add(head, arm);
  const bones = findGestureBones(root);
  assert.equal(bones.head, head);
  assert.equal(bones.upper, arm);
  applyGesture(bones, "talk", 1.3, 4);
  assert.ok(head.rotation.x !== 0 || head.rotation.y !== 0, "the head moves");
});

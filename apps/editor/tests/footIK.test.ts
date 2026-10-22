import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { FootIK, solveKnee } from "../src/editor/footIK";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

test("the knee keeps both bone lengths and bends the way it was bending", () => {
  const hip = v(0, 1, 0), knee = v(0, 0.55, 0.08), foot = v(0, 0.1, 0);
  const l1 = knee.distanceTo(hip), l2 = foot.distanceTo(knee);
  const target = v(0, 0.3, 0.1); // the foot is asked to lift
  const next = solveKnee(hip, knee, foot, target);
  assert.ok(Math.abs(next.distanceTo(hip) - l1) < 1e-6, "thigh length kept");
  assert.ok(Math.abs(next.distanceTo(target) - l2) < 1e-6, "calf length kept");
  assert.ok(next.z > target.z * 0.5, "the knee still bends forward");
});

test("an unreachable foot stretches the leg straight toward the target, never past it", () => {
  const hip = v(0, 1, 0), knee = v(0, 0.55, 0.05), foot = v(0, 0.1, 0);
  const next = solveKnee(hip, knee, foot, v(0, -2, 0));
  assert.ok(next.distanceTo(hip) < 0.46 && next.y < 1 && Number.isFinite(next.x + next.y + next.z));
});

test("a character on a slope: the body drops to the lower foot and the high foot comes up", () => {
  // A two-leg rig, 1 m tall, feet 0.1 apart.
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const pelvis = bone("pelvis", root, 0, 1);
  for (const [side, x] of [["l", -0.1], ["r", 0.1]] as const) {
    const thigh = bone(`thigh_${side}`, pelvis, x, 0);
    const calf = bone(`calf_${side}`, thigh, 0, -0.45, 0.04);
    bone(`foot_${side}`, calf, 0, -0.45, -0.04);
  }
  root.updateMatrixWorld(true);
  const ik = new FootIK(root);
  assert.equal(ik.legs.length, 2);
  // The left foot stands 0.2 m lower than the right.
  const drop = ik.apply((x) => (x < 0 ? -0.2 : 0));
  assert.ok(Math.abs(drop + 0.2) < 1e-6, `the body drops 0.2 (${drop})`);
  const feet = ik.legs.map((leg) => leg.foot.getWorldPosition(new THREE.Vector3()));
  assert.ok(Math.abs(feet[0]!.y - -0.1) < 0.01, `the low foot follows the body down (${feet[0]!.y})`);
  assert.ok(Math.abs(feet[1]!.y - 0.1) < 0.01, `the high foot is solved back up to where it was (${feet[1]!.y})`);
});

test("a held pose is not turned further each frame", () => {
  const root = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const pelvis = bone("pelvis", root, 0, 1);
  for (const [side, x] of [["l", -0.1], ["r", 0.1]] as const) {
    const thigh = bone(`thigh_${side}`, pelvis, x, 0);
    const calf = bone(`calf_${side}`, thigh, 0, -0.45, 0.04);
    bone(`foot_${side}`, calf, 0, -0.45, -0.04);
  }
  root.updateMatrixWorld(true);
  const ik = new FootIK(root);
  const ground = (x: number) => (x < 0 ? -0.2 : 0);
  const rightFoot = () => ik.legs[1]!.foot.getWorldPosition(new THREE.Vector3());
  ik.apply(ground);
  const first = rightFoot();
  // Each frame the editor puts the body back; a paused animation does not touch the bones, so they keep what the solver wrote.
  for (let frame = 0; frame < 30; frame++) {
    root.position.y = 0;
    ik.apply(ground);
  }
  assert.ok(rightFoot().distanceTo(first) < 1e-4, "the foot stays where the first solve put it");
  const knee = ik.legs[1]!.calf.getWorldPosition(new THREE.Vector3());
  assert.ok(Number.isFinite(knee.x + knee.y + knee.z) && knee.distanceTo(first) < 0.6, "and the leg is not folded or flung");
});

// Whole-body poses for the villagers. Their models carry only idle, talk, walk, run, wave, hit and death, so a person who sits down to rest,
// kneels to drink, bends to pick fruit, lifts food to their mouth or lies down to sleep would otherwise stand there playing "idle".
// These add rotations to the skeleton right after the mixer has set the frame (like gestures.ts), eased in and out so a pose is a movement,
// not a snap, with a small motion of its own (chewing, reaching, breathing) on each character's own beat.
import * as THREE from "three";

import type { PoseName } from "../eden/motion";
export type { PoseName };
export type PoseBone = "body" | "hips" | "abdomen" | "torso" | "chest" | "neck" | "head" | "armL" | "armR" | "foreL" | "foreR" | "thighL" | "thighR" | "shinL" | "shinR" | "footL" | "footR" | "toeL" | "toeR";
type V = [number, number, number];
export type PoseBones = Partial<Record<PoseBone, THREE.Bone>> & { facing?: 1 | -1 }; // facing: which way along z the figure looks (the villagers' models look toward -z, the hunter bodies' toward +z)

// Two skeletons: the clothed villagers' (Hips, Abdomen, UpperArm.L...) and the hunter bodies' (pelvis, spine_01, upperarm_l...).
const NAMES: Record<PoseBone, RegExp> = {
  body: /^body$|^pelvis$/i, hips: /^hips$|^pelvis$/i, abdomen: /^abdomen$|^spine_01$/i, torso: /^torso$|^spine_02$/i, chest: /^chest$|^spine_03$/i,
  neck: /^neck$|^neck_01$/i, head: /^head$/i,
  armL: /^upperarm[._]?l$/i, armR: /^upperarm[._]?r$/i, foreL: /^lowerarm[._]?l$/i, foreR: /^lowerarm[._]?r$/i,
  toeL: /^pt[._]?l$|^ball_l$/i, toeR: /^pt[._]?r$|^ball_r$/i, footL: /^foot[._]?l$/i, footR: /^foot[._]?r$/i,
  thighL: /^upperleg[._]?l$|^thigh_l$/i, thighR: /^upperleg[._]?r$|^thigh_r$/i, shinL: /^lowerleg[._]?l$|^calf_l$/i, shinR: /^lowerleg[._]?r$|^calf_r$/i,
};

export function findPoseBones(root: THREE.Object3D): PoseBones {
  const bones: PoseBones = {};
  root.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    for (const key of Object.keys(NAMES) as PoseBone[]) if (!bones[key] && NAMES[key].test(node.name)) bones[key] = node;
  });
  // The hunter bodies have a ball-of-foot bone, which sits in front of the ankle.
  bones.facing = -1;
  if (bones.toeL && bones.footL && /^ball/i.test(bones.toeL.name)) {
    root.updateWorldMatrix(true, true);
    const toe = root.worldToLocal(bones.toeL.getWorldPosition(new THREE.Vector3()));
    const foot = root.worldToLocal(bones.footL.getWorldPosition(new THREE.Vector3()));
    bones.facing = toe.z > foot.z ? 1 : -1;
  }
  return bones;
}

export interface Pose {
  rot: Partial<Record<PoseBone, V>>; // radians added to each bone's rotation
  drop: number; // how far the hips go down, as a fraction of the hips' height above the ground (read from the rest pose)
  lie?: number; // radians the whole figure tips over (sleep)
}

export function poseAt(name: PoseName, t: number, seed: number): Pose {
  const s = seed * 1.7;
  const slow = Math.sin(t * 0.9 + s);
  switch (name) {
    case "sit":
      return { drop: 0.5, rot: { thighL: [-1.45, 0, 0], thighR: [-1.45, 0, 0], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], abdomen: [0.05 + 0.02 * slow, 0, 0], head: [0.02 * Math.sin(t * 0.3 + s), Math.sin(t * 0.25 + s) * 0.3, 0], armL: [-0.35, 0, 0], armR: [-0.35, 0, 0], foreL: [-0.6, 0, 0], foreR: [-0.6, 0, 0] } };
    case "eat": {
      const bite = 0.5 + 0.5 * Math.sin(t * 1.6 + s);
      return { drop: 0.45, rot: { thighL: [-1.45, 0, 0], thighR: [-1.45, 0, 0], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], armR: [-1.0 - 0.3 * bite, 0, 0.1], foreR: [-1.9 + 0.3 * bite, 0, 0], armL: [-0.35, 0, 0], foreL: [-0.8, 0, 0], head: [0.12 + 0.12 * bite, 0, 0], neck: [0.05 * bite, 0, 0] } };
    }
    case "drink": {
      const cup = 0.5 + 0.5 * Math.sin(t * 0.8 + s);
      return { drop: 0.55, rot: { thighL: [-1.9, 0, 0], thighR: [-1.9, 0, 0], shinL: [2.2, 0, 0], shinR: [2.2, 0, 0], abdomen: [0.3, 0, 0], torso: [0.25, 0, 0], head: [0.15, 0, 0], armL: [-1.0, 0, 0.1], armR: [-1.0, 0, -0.1], foreL: [-0.4 - 0.5 * cup, 0, 0], foreR: [-0.4 - 0.5 * cup, 0, 0] } };
    }
    case "forage": {
      const reach = 0.5 + 0.5 * Math.sin(t * 1.1 + s);
      return { drop: 0.28, rot: { thighL: [-0.7, 0, 0], thighR: [-0.7, 0, 0], shinL: [0.9, 0, 0], shinR: [0.9, 0, 0], abdomen: [0.45, 0, 0], torso: [0.4, 0, 0], head: [-0.25, 0, 0], armR: [-1.2 - 0.4 * reach, 0, -0.1], foreR: [-0.4, 0, 0], armL: [-0.5, 0, 0.1], foreL: [-0.4, 0, 0] } };
    }
    case "work": {
      const beat = Math.sin(t * 2.6 + s);
      return { drop: 0.12, rot: { thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], shinL: [0.35, 0, 0], shinR: [0.35, 0, 0], abdomen: [0.18 + 0.1 * beat, 0, 0], torso: [0.12, 0, 0], head: [0.1, 0, 0], armL: [-0.9 - 0.4 * beat, 0, 0.1], armR: [-0.9 - 0.4 * beat, 0, -0.1], foreL: [-0.9, 0, 0], foreR: [-0.9, 0, 0] } };
    }
    case "fish":
      return { drop: 0.2, rot: { thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], shinL: [0.5, 0, 0], shinR: [0.5, 0, 0], abdomen: [0.1, 0, 0], head: [0.25, 0, 0], armL: [-0.8, 0, 0.1], armR: [-1.0 + 0.1 * slow, 0, -0.1], foreL: [-0.7, 0, 0], foreR: [-0.5, 0, 0] } };
    case "mourn":
      return { drop: 0.5, rot: { thighL: [-1.45, 0, 0], thighR: [-1.45, 0, 0], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], abdomen: [0.3, 0, 0], torso: [0.25, 0, 0], head: [0.55 + 0.03 * slow, 0, 0], armL: [-0.7, 0, 0.1], armR: [-0.7, 0, -0.1], foreL: [-1.5, 0, 0], foreR: [-1.5, 0, 0] } };
    case "warm":
      return { drop: 0.05, rot: { armL: [-1.2, 0, 0.15], armR: [-1.2, 0, -0.15], foreL: [-0.4 + 0.05 * slow, 0, 0], foreR: [-0.4 - 0.05 * slow, 0, 0], head: [0.05, 0, 0] } };
    case "talk": {
      // Now and then a hand comes up to make a point, and the head moves with the words.
      const point = Math.max(0, Math.sin(t * 1.3 + s)) ** 2;
      return { drop: 0, rot: { head: [0.05 * Math.sin(t * 2.1 + s), 0.15 * Math.sin(t * 0.8 + s), 0.04 * Math.sin(t * 1.7 + s)], armR: [-0.6 - 0.5 * point, 0, -0.2], foreR: [-0.9 - 0.4 * point, 0, 0], armL: [-0.15, 0, 0], abdomen: [0.02 * slow, 0, 0] } };
    }
    case "wave": {
      const wag = Math.sin(t * 9 + s);
      return { drop: 0, rot: { armR: [-0.3, 0, -1.4], foreR: [-0.2, 0, -1.3 + 0.35 * wag], head: [0, 0.1, 0.06] } };
    }
    // Body language: what a feeling or a need does to a person standing or sitting about.
    case "slump":
      return { drop: 0.02, rot: { abdomen: [0.2 + 0.02 * slow, 0, 0], torso: [0.2, 0, 0], head: [0.3, 0.05 * Math.sin(t * 0.3 + s), 0], armL: [-0.08, 0, 0.05], armR: [-0.08, 0, -0.05] } };
    case "tense": {
      const jaw = Math.sin(t * 5 + s);
      return { drop: 0.02, rot: { chest: [-0.08, 0, 0], head: [0.12 + 0.01 * jaw, 0, 0], armL: [-0.3, 0, 0.2], armR: [-0.3, 0, -0.2], foreL: [-1.1, 0, 0], foreR: [-1.1, 0, 0] } };
    }
    case "alert":
      return { drop: 0.07, rot: { thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], shinL: [0.4, 0, 0], shinR: [0.4, 0, 0], abdomen: [0.06, 0, 0], head: [-0.05, 0.55 * Math.sin(t * 0.9 + s), 0], armL: [-0.5, 0, 0.1], armR: [-0.5, 0, -0.1], foreL: [-1.5, 0, 0], foreR: [-1.5, 0, 0] } };
    case "hug": {
      const shiver = 0.015 * Math.sin(t * 22 + s);
      return { drop: 0.03, rot: { abdomen: [0.1 + shiver, 0, 0], torso: [0.08, 0, shiver], head: [0.12, 0, 0], armL: [-0.7, 0, -0.55], armR: [-0.7, 0, 0.55], foreL: [-2.1, 0, 0], foreR: [-2.1, 0, 0] } };
    }
    case "laugh": {
      const ha = Math.sin(t * 13 + s);
      return { drop: 0.03, rot: { abdomen: [0.06 + 0.05 * ha, 0, 0], torso: [-0.04, 0, 0], head: [-0.28 + 0.06 * ha, 0, 0], armR: [-0.6, 0, -0.1], foreR: [-1.4, 0, 0], armL: [-0.25, 0, 0.15] } };
    }
    case "yawn":
      return { drop: 0, rot: { chest: [-0.1, 0, 0], head: [-0.3, 0, 0], armR: [-1.1, 0, 0.3], foreR: [-2.5, 0, 0], armL: [-0.15, 0, 0.1] } };
    case "belly":
      return { drop: 0.02, rot: { abdomen: [0.1, 0, 0], head: [0.1, 0, 0], armR: [-0.35, 0, 0.3], foreR: [-1.1, 0, 0], armL: [-0.15, 0, 0.1] } };
    case "proud":
      return { drop: 0, rot: { abdomen: [-0.04, 0, 0], chest: [-0.1, 0, 0], head: [-0.08, 0.1 * Math.sin(t * 0.4 + s), 0], armL: [-0.1, 0, 0.18], armR: [-0.1, 0, -0.18] } };
    case "stretch": {
      const up = 0.5 + 0.5 * Math.sin(t * 1.6 + s);
      return { drop: 0, rot: { abdomen: [-0.15 * up, 0, 0], torso: [-0.1 * up, 0, 0], head: [-0.2 * up, 0, 0], armL: [-1.6 - 1.0 * up, 0, 0.3], armR: [-1.6 - 1.0 * up, 0, -0.3], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0] } };
    }
    case "scan":
      return { drop: 0, rot: { head: [0.02, 0.6 * Math.sin(t * 0.7 + s), 0], abdomen: [0, 0.12 * Math.sin(t * 0.7 + s), 0], armL: [-0.03, 0, 0.04 * slow], armR: [-0.03, 0, -0.04 * slow] } };
    case "sleep":
      return { drop: 0.9, lie: Math.PI / 2, rot: { armL: [-0.2, 0, 0.2], armR: [-0.2, 0, -0.2], abdomen: [0.02 * slow, 0, 0], head: [0, 0.2, 0] } };
  }
}

// Eased in and out: each figure's pose weight moves toward 1 while it holds and back to 0 when it ends (about half a second each way).
const weights = new WeakMap<object, { w: number; pose?: PoseName; last?: number }>();
// A clip only rewrites the bones it has tracks for, so a bone it leaves alone would keep last frame's pose and be turned a little further every
// frame. Each posed bone remembers what it was before and what we set it to; if it still holds what we set, the clip did not touch it, so go back.
const memory = new WeakMap<THREE.Bone, { p: THREE.Vector3; q: THREE.Quaternion; ap: THREE.Vector3; aq: THREE.Quaternion }>();
function fresh(bone: THREE.Bone) {
  const m = memory.get(bone);
  if (!m) return;
  if (bone.position.distanceToSquared(m.ap) < 1e-12 && Math.abs(bone.quaternion.dot(m.aq)) > 0.999999) {
    bone.position.copy(m.p);
    bone.quaternion.copy(m.q);
    bone.updateMatrix();
  }
}
function remember(bone: THREE.Bone, before: { p: THREE.Vector3; q: THREE.Quaternion }) {
  memory.set(bone, { p: before.p, q: before.q, ap: bone.position.clone(), aq: bone.quaternion.clone() });
}

const ORDER: PoseBone[] = ["body", "hips", "abdomen", "torso", "chest", "neck", "head", "thighL", "thighR", "shinL", "shinR", "armL", "armR", "foreL", "foreR"];
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const eu = new THREE.Euler();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();

// The bones' own axes depend on how the model was exported, so the rotations here are made about the figure's own axes instead:
// x is across the body (positive tips the top of a limb forward, as written in the poses), y is up, z is front to back. Applied from the hips down.
function turnInFigure(bone: THREE.Bone, root: THREE.Object3D, r: V, facing: 1 | -1) {
  const parent = bone.parent;
  if (!parent) return;
  bone.updateWorldMatrix(true, false);
  root.getWorldQuaternion(qA);
  bone.getWorldQuaternion(qB);
  eu.set(facing * r[0], r[1], r[2], "XYZ"); // a model that faces -z tips forward with a negative turn about x
  qC.setFromEuler(eu);
  // world = root * (R * (root^-1 * bone))
  qB.premultiply(qA.clone().invert()).premultiply(qC).premultiply(qA);
  parent.getWorldQuaternion(qA);
  bone.quaternion.copy(qA.invert().multiply(qB));
  bone.updateMatrix();
}

// Remembers where a foot is in its shin's own frame now (before the pose), and returns a function that puts it back there once the shin has moved.
function carry(foot: THREE.Bone, shin: THREE.Bone): () => void {
  foot.updateWorldMatrix(true, false);
  shin.updateWorldMatrix(true, false);
  const shinP = shin.getWorldPosition(new THREE.Vector3());
  const shinQ = shin.getWorldQuaternion(new THREE.Quaternion());
  const footP = foot.getWorldPosition(new THREE.Vector3());
  const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
  const inv = shinQ.clone().invert();
  const offset = footP.clone().sub(shinP).applyQuaternion(inv);
  const turn = inv.clone().multiply(footQ); // the foot's orientation in the shin's frame
  return () => {
    const parent = foot.parent;
    if (!parent) return;
    shin.updateWorldMatrix(true, false);
    const q = shin.getWorldQuaternion(new THREE.Quaternion());
    const p = shin.getWorldPosition(new THREE.Vector3()).add(offset.clone().applyQuaternion(q));
    parent.updateWorldMatrix(true, false);
    foot.position.copy(parent.worldToLocal(p));
    const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    foot.quaternion.copy(pq.multiply(q.multiply(turn)));
    foot.updateMatrix();
  };
}

/** Call every frame right after the mixer, for each figure within sight. `want` is the pose they should be in, if any. */
export function applyPose(key: object, root: THREE.Object3D, bones: PoseBones, want: PoseName | undefined, t: number, seed: number): void {
  const state = weights.get(key) ?? { w: 0 };
  weights.set(key, state);
  const moving = (Object.keys(NAMES) as PoseBone[]).map((name) => bones[name]).filter((b): b is THREE.Bone => !!b);
  for (const bone of moving) fresh(bone);
  const dt = Math.min(0.25, Math.max(0, t - (state.last ?? t))); // real time, so a slow screen eases as fast as a quick one
  state.last = t;
  if (want && want !== state.pose) {
    if (state.w > 0.05 && state.pose) state.w = Math.max(0, state.w - dt * 3);
    else state.pose = want;
  }
  const target = want && want === state.pose ? 1 : 0;
  state.w += Math.sign(target - state.w) * Math.min(Math.abs(target - state.w), dt * 2);
  if (state.w <= 0.001 || !state.pose) return;
  const facing = bones.facing ?? -1;
  const pose = poseAt(state.pose, t, seed);
  const e = state.w * state.w * (3 - 2 * state.w);
  const before = new Map(moving.map((b) => [b, { p: b.position.clone(), q: b.quaternion.clone() }]));
  root.updateWorldMatrix(true, true);
  // The shoes hang from control bones that are not children of the legs, so they stay where they were unless carried along with each shin.
  const feet = ([[bones.footL, bones.shinL], [bones.footR, bones.shinR], [bones.toeL, bones.shinL], [bones.toeR, bones.shinR]] as const)
    .filter((pair): pair is readonly [THREE.Bone, THREE.Bone] => !!pair[0] && !!pair[1])
    .map(([foot, shin]) => carry(foot, shin));
  // The whole figure moves with the body bone (the legs hang from it as well as the hips); without one, the hips stand in.
  const body = bones.body ?? bones.hips;
  const hips = bones.hips ?? body;
  if (body?.parent && hips) {
    // How high the hips are above the feet (the figure's origin is near the hips, not at the ground).
    const feetY = [bones.footL, bones.footR].filter((b): b is THREE.Bone => !!b).map((b) => root.worldToLocal(b.getWorldPosition(vA)).y);
    const hipsY = root.worldToLocal(hips.getWorldPosition(vA)).y;
    const height = Math.max(0.3, hipsY - (feetY.length ? Math.min(...feetY) : hipsY - 0.9));
    if (pose.lie) turnInFigure(body, root, [-pose.lie * e, 0, 0], facing);
    root.updateWorldMatrix(true, true);
    // Down by a fraction of the hips' height, or, lying, until the hips are a hand's breadth off the ground.
    const nowY = root.worldToLocal(hips.getWorldPosition(vA)).y;
    const down = pose.lie ? Math.max(0, nowY - (hipsY - height * (1 - 0.12) * e)) : height * pose.drop * e;
    const at = root.worldToLocal(body.getWorldPosition(vB));
    at.y -= down;
    body.position.copy(body.parent.worldToLocal(root.localToWorld(at)));
    body.updateMatrix();
  }
  for (const name of ORDER) {
    const bone = bones[name];
    if (!bone || name === "body") continue;
    const r = pose.rot[name] ?? [0, 0, 0];
    turnInFigure(bone, root, [r[0] * e, r[1] * e, r[2] * e], facing);
  }
  for (const place of feet) place();
  for (const bone of moving) remember(bone, before.get(bone)!);
}

/** True while a figure is in, or easing in or out of, a pose. */
export function poseActive(key: object): boolean {
  return (weights.get(key)?.w ?? 0) > 0.001;
}
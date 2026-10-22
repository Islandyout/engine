// Fight poses made from the clips a fighter already has, on its own skeleton:
//   - a high guard block: from the boxing guard, both forearms come up in front of the face (palms in, elbows down and in), the chin
//     tucked behind them and the knees a little more bent, the way a boxer or a sanda fighter covers up. The library's "block" clip
//     twists, crosses the wrists and ends in a wide crouch with the arms apart; held, that read as anything but a block.
//   - kicks with the hands kept up: the kick clips fling both arms forward and down as the leg goes out. Real kicks keep the guard
//     (the hands protect the head while the leg is out), so the kick's arm and shoulder tracks are replaced with the guard's.
import * as THREE from "three";

const ARM_BONES = ["clavicle", "upperarm", "lowerarm", "hand"];

// The names of a side's arm bones and everything below the hand (fingers).
function armNames(root: THREE.Object3D, side: "l" | "r"): Set<string> {
  const names = new Set<string>();
  for (const bone of ARM_BONES) {
    const node = root.getObjectByName(`${bone}_${side}`);
    if (bone === "hand") node?.traverse((child) => names.add(child.name));
    else if (node) names.add(node.name);
  }
  return names;
}

const nodeOf = (track: THREE.KeyframeTrack) => THREE.PropertyBinding.parseTrackName(track.name).nodeName;

// Keeps a clip but takes the named nodes' tracks from another clip (held at that clip's first frame, stretched over this one).
export function withHeldTracks(clip: THREE.AnimationClip, from: THREE.AnimationClip, names: Set<string>, name = clip.name): THREE.AnimationClip {
  const kept = clip.tracks.filter((track) => !names.has(nodeOf(track)));
  const held = from.tracks
    .filter((track) => names.has(nodeOf(track)))
    .map((track) => {
      const size = track.getValueSize();
      const first = Array.from(track.values.slice(0, size));
      const Track = track.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
      return new Track(track.name, [0, clip.duration], [...first, ...first]);
    });
  return new THREE.AnimationClip(name, clip.duration, [...kept, ...held]);
}

// Turns `bone` in world space so the direction `from` (from the bone) becomes `to`.
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const rotation = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(rotation);
  const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(world));
  bone.updateMatrixWorld(true);
}

// Where an elbow goes for the hand to reach `target`: lengths kept, bent toward `hint`.
function elbowFor(shoulder: THREE.Vector3, elbow: THREE.Vector3, hand: THREE.Vector3, target: THREE.Vector3, hint: THREE.Vector3) {
  const l1 = elbow.distanceTo(shoulder), l2 = hand.distanceTo(elbow);
  const toTarget = target.clone().sub(shoulder);
  const reach = Math.min(Math.max(toTarget.length(), 1e-4), l1 + l2 - 1e-4);
  const dir = toTarget.normalize();
  const bend = hint.clone().sub(shoulder);
  bend.addScaledVector(dir, -bend.dot(dir)).normalize();
  const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return shoulder.clone().addScaledVector(dir, along).addScaledVector(bend, out);
}

// The high guard block for this skeleton, from its guard clip; undefined when the skeleton lacks the bones.
export function makeHighBlock(root: THREE.Object3D, guard: THREE.AnimationClip): THREE.AnimationClip | undefined {
  const bone = (name: string) => root.getObjectByName(name);
  const head = bone("head") ?? bone("Head"), pelvis = bone("pelvis");
  const sides = (["l", "r"] as const).map((side) => ({ side, upper: bone(`upperarm_${side}`), lower: bone(`lowerarm_${side}`), hand: bone(`hand_${side}`) }));
  if (!head || !pelvis || sides.some((s) => !s.upper || !s.lower || !s.hand)) return undefined;
  // Pose the skeleton in the guard's first frame, in its own frame of reference (the root at the origin, unturned).
  const saved = new Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion]>();
  root.traverse((node) => saved.set(node, [node.position.clone(), node.quaternion.clone()]));
  const rootMatrix = root.matrix.clone();
  const mixer = new THREE.AnimationMixer(root);
  try {
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    mixer.clipAction(guard).play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    const w = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());
    // Which way the fighter faces, and its right: from the shoulders.
    const left = w(sides[0]!.upper!), right = w(sides[1]!.upper!);
    const across = right.clone().sub(left).setY(0).normalize(); // toward its right... or left, the sign is settled below
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3().crossVectors(across, up).normalize();
    // The guard's fists are in front of the chest: forward is the side they are on.
    const fists = w(sides[0]!.hand!).add(w(sides[1]!.hand!)).multiplyScalar(0.5).sub(left.clone().add(right).multiplyScalar(0.5));
    if (fists.dot(forward) < 0) forward.negate();
    const headAt = w(head);
    const shoulderWidth = left.distanceTo(right);
    for (const { side, upper, lower, hand } of sides) {
      const outward = side === "l" ? left.clone().sub(right).setY(0).normalize() : right.clone().sub(left).setY(0).normalize();
      // Fists up in front of the brow, a hand's width apart; elbows down, in front of the ribs.
      const target = headAt.clone().addScaledVector(forward, 0.26).addScaledVector(up, -0.02).addScaledVector(outward, shoulderWidth * 0.32);
      const hint = w(upper!).addScaledVector(forward, 0.25).addScaledVector(up, -0.35).addScaledVector(outward, shoulderWidth * 0.05);
      const s = w(upper!), e = w(lower!), h = w(hand!);
      const elbow = elbowFor(s, e, h, target, hint);
      aim(upper!, e.clone().sub(s), elbow.clone().sub(s));
      const e2 = w(lower!), h2 = w(hand!);
      aim(lower!, h2.clone().sub(e2), target.clone().sub(e2));
    }
    // A tucked chin.
    head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12));
    const names = new Set<string>([head.name]);
    for (const s of sides) for (const node of [s.upper!, s.lower!]) names.add(node.name);
    const tracks: THREE.KeyframeTrack[] = guard.tracks.filter((track) => !(names.has(nodeOf(track)) && track.name.endsWith(".quaternion")));
    for (const name of names) {
      const q = bone(name)!.quaternion;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, guard.duration], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]));
    }
    return new THREE.AnimationClip("block_high", guard.duration, tracks);
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    for (const [node, [p, q]] of saved) {
      node.position.copy(p);
      node.quaternion.copy(q);
    }
    root.matrix.copy(rootMatrix);
    root.updateMatrixWorld(true);
  }
}

// The kick clips with the guard's arms (both sides) instead of their own.
export const KICKS = ["front_kick_r", "front_kick_l", "roundhouse_r", "roundhouse_l", "side_kick_r", "side_kick_l"];
export function guardedKick(root: THREE.Object3D, kick: THREE.AnimationClip, guard: THREE.AnimationClip): THREE.AnimationClip {
  const names = new Set([...armNames(root, "l"), ...armNames(root, "r")]);
  return withHeldTracks(kick, guard, names);
}

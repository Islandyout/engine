// Procedural gestures (0.76.0): over the shared talk, work and sit clips,
// each character adds its own small motions -- nods and head tilts, a hand
// that comes up to make a point and drops again, a back that bends into
// the work, a seated reader glancing about -- on its own beat, so a square
// full of people on the same clip no longer moves in step.
import * as THREE from "three";

export type GestureKind = "talk" | "work" | "sit";

export interface GestureBones {
  head?: THREE.Bone;
  spine?: THREE.Bone;
  upper?: THREE.Bone;
  lower?: THREE.Bone;
}

// Radians added to each bone's local rotation (x, y, z).
export interface GestureAngles {
  head: [number, number, number];
  spine: [number, number, number];
  upper: [number, number, number];
  lower: [number, number, number];
}

const PATTERNS: Record<keyof GestureBones, RegExp> = {
  head: /^head$/i,
  spine: /^spine_?0?3$|^spine2$|chest/i,
  upper: /^upperarm_r$|^upper_?arm\.?r$|rightarm$/i,
  lower: /^lowerarm_r$|^lower_?arm\.?r$|rightforearm$/i,
};

export function findGestureBones(root: THREE.Object3D): GestureBones {
  const bones: GestureBones = {};
  root.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    for (const key of Object.keys(PATTERNS) as Array<keyof GestureBones>) if (!bones[key] && PATTERNS[key].test(node.name)) bones[key] = node;
  });
  return bones;
}

// Which clip calls for which gesture layer.
export function gestureFor(clip: string | undefined): GestureKind | undefined {
  if (!clip) return undefined;
  if (/talk/i.test(clip)) return "talk";
  if (/punch|work|hammer/i.test(clip)) return "work";
  if (/sit/i.test(clip)) return "sit";
  return undefined;
}

// A slow 0..1 envelope: a gesture rises, holds a moment, and falls, every
// few seconds at an irregular rhythm.
function envelope(t: number, seed: number, period: number) {
  const phase = (t / period + seed * 0.618) % 1;
  const rise = Math.sin(Math.PI * Math.min(1, phase / 0.45));
  return phase < 0.45 ? Math.max(0, rise) : 0;
}

export function gestureAngles(kind: GestureKind, t: number, seed: number): GestureAngles {
  const s = seed * 1.37;
  const angles: GestureAngles = { head: [0, 0, 0], spine: [0, 0, 0], upper: [0, 0, 0], lower: [0, 0, 0] };
  if (kind === "talk") {
    const point = envelope(t, seed, 3.2 + (seed % 3));
    angles.head = [Math.sin(t * 2.3 + s) * 0.07, Math.sin(t * 0.7 + s * 2) * 0.12, Math.sin(t * 1.1 + s) * 0.05];
    angles.upper = [-0.55 * point, 0, -0.25 * point];
    angles.lower = [0, 0, -(0.5 + 0.2 * Math.sin(t * 4 + s)) * point];
    angles.spine = [Math.sin(t * 0.9 + s) * 0.03, Math.sin(t * 0.5 + s) * 0.05, 0];
  } else if (kind === "work") {
    const beat = Math.sin(t * (2.4 + (seed % 2) * 0.5) + s);
    angles.spine = [0.08 + beat * 0.06, Math.sin(t * 0.4 + s) * 0.08, 0];
    angles.head = [0.12 + beat * 0.04, 0, 0];
    angles.lower = [0, 0, -0.2 * (beat * 0.5 + 0.5)];
  } else {
    const glance = envelope(t, seed, 7 + (seed % 4));
    angles.head = [0.18 - glance * 0.15, Math.sin(t * 0.3 + s) * 0.25 * glance, 0];
    angles.lower = [0, 0, -0.15 * Math.max(0, Math.sin(t * 3.1 + s))];
  }
  return angles;
}

// Adds the gesture over whatever pose the mixer just set (call right after
// the mixer's update, every frame the mixer updates).
export function applyGesture(bones: GestureBones, kind: GestureKind, t: number, seed: number) {
  const a = gestureAngles(kind, t, seed);
  for (const key of Object.keys(a) as Array<keyof GestureAngles>) {
    const bone = bones[key];
    if (!bone) continue;
    const [x, y, z] = a[key];
    bone.rotation.x += x;
    bone.rotation.y += y;
    bone.rotation.z += z;
  }
}

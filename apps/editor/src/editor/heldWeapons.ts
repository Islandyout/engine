// Weapons in a fighter's hands, the way game engines equip them: a socket on
// the skeleton, a grip on the weapon, and a grip type that says how the two
// meet (Unreal's hand sockets plus weapon data; Unity's attach points).
//
// - The weapon: `WEAPON_GRIPS` says, per catalog model, how it's held
//   (forward, reverse, two-handed, on the forearm, a bow), how long it is in
//   the world, and where along it the hands go (a fraction of its length
//   from the pommel). The Quaternius weapons are authored along +y with the
//   flat of the blade facing z, so +x is the edge.
// - The socket: found once on the rig's rest pose, so it doesn't matter what
//   pose the fighter is in. A closed fist holds a handle across the palm,
//   from the index knuckle to the pinky's. In a forward (hammer) grip the
//   blade leaves the thumb side with its edge toward the knuckles; in a
//   reverse grip it leaves the pinky side, along the forearm. A shield
//   straps to the forearm, face out.
// - Two-handed weapons: the right hand holds the weapon and, every frame
//   after the animation, two-bone IK puts the left hand on the handle at its
//   off-hand grip, turned like the right (both thumbs toward the blade).
//
// Every fighter on these rigs is the same human skeleton scaled to its
// body, so weapons are sized for a 1.75 m human and scale with the wielder:
// a brute's axe is bigger than a goblin's.
import * as THREE from "three";

export type Grip = "forward" | "reverse" | "twohand" | "shield" | "bow";
export type WeaponGrip = {
  grip: Grip;
  // Pommel to tip (a shield: its diameter), metres, for a 1.75 m wielder.
  length: number;
  // Where the main hand holds it, 0 pommel to 1 tip.
  hold: number;
  // Two-handed: where the off hand holds it.
  offHand?: number;
};

// Measured from each model's handle, guard and head.
export const WEAPON_GRIPS: Record<string, WeaponGrip> = {
  dagger: { grip: "reverse", length: 0.36, hold: 0.14 },
  knife: { grip: "forward", length: 0.34, hold: 0.15 },
  sword: { grip: "forward", length: 0.82, hold: 0.09 },
  "sword-2": { grip: "forward", length: 0.78, hold: 0.12 },
  "axe-double": { grip: "forward", length: 0.85, hold: 0.14 },
  claymore: { grip: "twohand", length: 1.45, hold: 0.17, offHand: 0.06 },
  scythe: { grip: "twohand", length: 1.6, hold: 0.5, offHand: 0.38 },
  spear: { grip: "twohand", length: 2.0, hold: 0.42, offHand: 0.3 },
  bow: { grip: "bow", length: 1.1, hold: 0.5 },
  "shield-round": { grip: "shield", length: 0.6, hold: 0.5 },
};

// A catalog model's grip: by its name, or a guess for a model not listed
// (a shield by name, anything else a one-handed blade held near its end).
export function weaponGrip(name: string): WeaponGrip {
  const key = name
    .toLowerCase()
    .replace(/\.glb$/, "")
    .replace(/.*\//, "");
  if (WEAPON_GRIPS[key]) return WEAPON_GRIPS[key]!;
  if (/shield/.test(key)) return WEAPON_GRIPS["shield-round"]!;
  if (/dagger/.test(key)) return WEAPON_GRIPS.dagger!;
  return { grip: "forward", length: /knife/.test(key) ? 0.34 : 0.85, hold: 0.12 };
}

const HUMAN_HEIGHT = 1.75;
const v = () => new THREE.Vector3();

// A hand's frame on the rest rig, in world space: where the fist closes,
// the line through it (index knuckle to pinky's), where the knuckles point,
// and which way the palm faces.
type Hand = { at: THREE.Vector3; across: THREE.Vector3; knuckles: THREE.Vector3; palm: THREE.Vector3; size: number };
function restHand(rest: THREE.Object3D, side: "l" | "r"): Hand | undefined {
  const bone = (name: string) => rest.getObjectByName(`${name}_${side}`);
  const hand = bone("hand"),
    index = bone("index_01"),
    middle = bone("middle_01"),
    pinky = bone("pinky_01"),
    thumb = bone("thumb_02") ?? bone("thumb_01");
  if (!hand || !index || !middle || !pinky || !thumb) return undefined;
  const wrist = hand.getWorldPosition(v());
  const i = index.getWorldPosition(v()),
    m = middle.getWorldPosition(v()),
    p = pinky.getWorldPosition(v()),
    t = thumb.getWorldPosition(v());
  const knuckles = m.clone().sub(wrist);
  const size = knuckles.length();
  knuckles.normalize();
  const across = p.clone().sub(i);
  across.sub(knuckles.clone().multiplyScalar(across.dot(knuckles))).normalize();
  // The palm faces the side the thumb sits on.
  const palm = v().crossVectors(knuckles, across).normalize();
  if (palm.dot(t.clone().sub(wrist)) < 0) palm.negate();
  if (![across, palm].every((u) => Number.isFinite(u.x))) return undefined;
  // A fist closes around a handle just past the knuckle line, a little in
  // from the back of the hand.
  const at = wrist.clone().lerp(i.clone().add(m).add(p).divideScalar(3), 1.15).addScaledVector(palm, size * 0.22);
  return { at, across, knuckles, palm, size };
}

// The grip frame on the rest rig, world space: +y along the blade, +x the
// edge, origin where the hand holds it.
function gripFrame(hand: Hand, grip: Grip): THREE.Matrix4 {
  // Measured on the bind pose, `across` leaves the fist on the pinky side
  // and `palm` faces the thumb. The combat clips (retargeted from the
  // Mannequin) roll the hand half a turn from that pose, so in every
  // animated fist both come out the other way. The signs here are the ones
  // that render right: a reverse-grip dagger along the forearm from the
  // pinky side, a sword ahead of the fist in the sword guard.
  const y = hand.across.clone();
  if (grip === "reverse") y.negate();
  const x = hand.knuckles.clone().sub(y.clone().multiplyScalar(hand.knuckles.dot(y))).normalize();
  const z = v().crossVectors(x, y).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(hand.at);
}

// A shield on the forearm: its +y along the forearm, its face out and its
// straps against the arm, a little off it. (As with gripFrame, the signs are
// the ones that render right on the animated fighters.)
function shieldFrame(rest: THREE.Object3D, side: "l" | "r", hand: Hand): THREE.Matrix4 | undefined {
  const lower = rest.getObjectByName(`lowerarm_${side}`);
  const wristBone = rest.getObjectByName(`hand_${side}`);
  if (!lower || !wristBone) return undefined;
  const elbow = lower.getWorldPosition(v());
  const wrist = wristBone.getWorldPosition(v());
  const y = wrist.clone().sub(elbow);
  const forearm = y.length();
  y.normalize();
  const out = hand.palm.clone().negate();
  const z = out.sub(y.clone().multiplyScalar(out.dot(y))).normalize();
  const x = v().crossVectors(y, z).normalize();
  const at = elbow.clone().addScaledVector(y, forearm * 0.6).addScaledVector(z, forearm * 0.28);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(at);
}

// How tall the rest rig is (head over the lowest foot), in its own units.
function rigHeight(rest: THREE.Object3D): number {
  const head = rest.getObjectByName("head");
  const feet = ["foot_l", "foot_r"].map((n) => rest.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  if (!head || !feet.length) return HUMAN_HEIGHT;
  const top = head.getWorldPosition(v()).y;
  const bottom = Math.min(...feet.map((f) => f.getWorldPosition(v()).y));
  // The head bone sits at the base of the skull: the crown is ~12% higher.
  return Math.max(1e-3, (top - bottom) * 1.12);
}

// Two-handed weapons whose off hand is pinned to the handle every frame.
type OffHand = {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  holder: THREE.Object3D;
  // The off-hand grip, in the holder's space; and the hand bone relative to
  // a grip frame (from the rest rig).
  grip: THREE.Matrix4;
  handInGrip: THREE.Matrix4;
};
const offHands = new Set<OffHand>();

// Parents a copy of `model` to the hand (or forearm) of `target`, held as
// `grip` says. `rest` is an unanimated copy of the same rig (the catalog's
// cached model). Returns the holder, or undefined when the rig lacks the
// bones.
export function holdWeapon(rest: THREE.Object3D, target: THREE.Object3D, side: "l" | "r", model: THREE.Object3D, grip: WeaponGrip): THREE.Object3D | undefined {
  rest.updateMatrixWorld(true);
  const hand = restHand(rest, side);
  if (!hand) return undefined;
  const attachName = grip.grip === "shield" ? `lowerarm_${side}` : `hand_${side}`;
  const restBone = rest.getObjectByName(attachName);
  const targetBone = target.getObjectByName(attachName);
  if (!restBone || !targetBone) return undefined;
  const frame = grip.grip === "shield" ? shieldFrame(rest, side, hand) : gripFrame(hand, grip.grip);
  if (!frame) return undefined;

  // The model, sized and moved so its hold point sits at the holder's origin.
  const weapon = model.clone(true);
  weapon.position.set(0, 0, 0);
  weapon.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(weapon);
  const size = box.getSize(v());
  const along = grip.grip === "shield" ? Math.max(size.x, size.y) : size.y;
  const scale = (grip.length * (rigHeight(rest) / HUMAN_HEIGHT)) / Math.max(along, 1e-6);
  weapon.scale.multiplyScalar(scale);
  const centre = box.getCenter(v()).multiplyScalar(scale);
  const holdY = (box.min.y + size.y * grip.hold) * scale;
  weapon.position.set(-centre.x, -holdY, -centre.z);
  const holder = new THREE.Group();
  holder.name = `held_${side}`;
  holder.add(weapon);
  restBone.matrixWorld.clone().invert().multiply(frame).decompose(holder.position, holder.quaternion, holder.scale);
  targetBone.add(holder);
  holder.traverse((node) => {
    if (node instanceof THREE.Mesh) node.castShadow = true;
  });

  // A two-hander: the other hand, on the handle below.
  if (grip.grip === "twohand" && grip.offHand !== undefined) {
    const other = side === "r" ? "l" : "r";
    const otherHand = restHand(rest, other);
    const upper = target.getObjectByName(`upperarm_${other}`);
    const lower = target.getObjectByName(`lowerarm_${other}`);
    const handBone = target.getObjectByName(`hand_${other}`);
    const restHandBone = rest.getObjectByName(`hand_${other}`);
    if (otherHand && upper && lower && handBone && restHandBone) {
      const offFrame = gripFrame(otherHand, "forward");
      const handInGrip = offFrame.clone().invert().multiply(restHandBone.matrixWorld);
      // Down the handle from the main hand, in the holder's (unscaled) space.
      const drop = (grip.offHand - grip.hold) * size.y * scale;
      offHands.add({ upper, lower, hand: handBone, holder, grip: new THREE.Matrix4().makeTranslation(0, drop, 0), handInGrip });
    }
  }
  return holder;
}

// Forgets the off hands of fighters that are gone (a rebuild).
export function clearOffHands() {
  offHands.clear();
}

const ik = {
  a: v(),
  b: v(),
  c: v(),
  t: v(),
  q: new THREE.Quaternion(),
  pq: new THREE.Quaternion(),
  target: new THREE.Matrix4(),
  rot: new THREE.Quaternion(),
  scl: v(),
};

// Turns `bone` in world space by `delta`.
function rotateWorld(bone: THREE.Object3D, delta: THREE.Quaternion) {
  bone.getWorldQuaternion(ik.q);
  ik.q.premultiply(delta);
  bone.parent!.getWorldQuaternion(ik.pq);
  bone.quaternion.copy(ik.pq.invert().multiply(ik.q));
  bone.updateMatrixWorld(true);
}

const clampUnit = (x: number) => Math.min(1, Math.max(-1, x));

// Every frame, after the mixers: each two-hander's off hand onto its handle.
// Analytic two-bone IK in the arm's own bend plane, then the hand turned to
// the grip.
export function updateOffHands() {
  for (const o of offHands) {
    if (!o.holder.parent || !o.hand.parent || !o.upper.parent) {
      offHands.delete(o);
      continue;
    }
    o.holder.updateMatrixWorld(true);
    // Where the hand bone should be: the grip on the handle, then the hand
    // relative to that grip.
    // (The holder's world scale is the fighter's size against the rest rig,
    // which the rest-rig offsets need too.)
    ik.target.copy(o.holder.matrixWorld).multiply(o.grip).multiply(o.handInGrip);
    ik.target.decompose(ik.t, ik.rot, ik.scl);

    const a = o.upper.getWorldPosition(ik.a);
    const b = o.lower.getWorldPosition(ik.b);
    const c = o.hand.getWorldPosition(ik.c);
    const lab = b.distanceTo(a);
    const lcb = c.distanceTo(b);
    const lat = Math.min(Math.max(ik.t.distanceTo(a), 1e-4), (lab + lcb) * 0.999);
    const ca = c.clone().sub(a).normalize();
    const ba = b.clone().sub(a).normalize();
    const ab = a.clone().sub(b).normalize();
    const cb = c.clone().sub(b).normalize();
    const ta = ik.t.clone().sub(a).normalize();
    const shoulder0 = Math.acos(clampUnit(ca.dot(ba)));
    const elbow0 = Math.acos(clampUnit(ab.dot(cb)));
    const swing = Math.acos(clampUnit(ca.dot(ta)));
    const shoulder1 = Math.acos(clampUnit((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)));
    const elbow1 = Math.acos(clampUnit((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));
    const bend = v().crossVectors(ca, ba);
    if (bend.lengthSq() < 1e-10) bend.set(0, 1, 0);
    bend.normalize();
    const reach = v().crossVectors(ca, ta);
    rotateWorld(o.upper, new THREE.Quaternion().setFromAxisAngle(bend, shoulder1 - shoulder0));
    rotateWorld(o.lower, new THREE.Quaternion().setFromAxisAngle(bend, elbow1 - elbow0));
    if (reach.lengthSq() > 1e-10) rotateWorld(o.upper, new THREE.Quaternion().setFromAxisAngle(reach.normalize(), swing));
    // The hand turned to hold the handle.
    o.hand.parent.getWorldQuaternion(ik.pq);
    o.hand.quaternion.copy(ik.pq.invert().multiply(ik.rot));
    o.hand.updateMatrixWorld(true);
  }
}

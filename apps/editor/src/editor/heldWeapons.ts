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
  // Its guard, for a weapon the clip library has no stance for: where the
  // main hand's grip sits and which way the blade and the edge point, in
  // the body's frame (from the pelvis, in body heights; +z ahead, +x to its
  // left, +y up). While the fighter stands in guard, IK puts the hand there;
  // its clips drive it everywhere else.
  pose?: { at: [number, number, number]; blade: [number, number, number]; edge: [number, number, number] };
  // The clips it fights with: the boxing set (jabs and hooks; daggers and
  // knives) or the sword set (everything else). The two sets hold the hand
  // rolled half a turn apart, so the side of the fist the blade leaves by
  // depends on the set.
  clips: "boxing" | "sword";
};

// Grips measured from each model's handle, guard and head. Guards from
// fencing and martial-arts references:
// - knife, forward grip: the knife hand ahead at the waist, point forward and
//   a little up, the live hand up in guard (the boxing clip's).
// - one-handed sword: hilt by the right hip, point forward at the opponent's
//   chest; an axe the same with its head up.
// - claymore: Pflug (the plough): hilt at the right hip, hands crossed, point
//   at the opponent's face, long edge down.
// - spear: rear (right) hand by the hip near the butt, the lead hand a
//   forearm or more up the shaft, point at the opponent's neck.
// - scythe: a polearm's close guard, the shaft across the body, the blade
//   high over the lead shoulder.
// - bow at rest: the bow hand low in front, the bow nearly upright.
// - daggers in reverse grip: fists up by the chin, each blade down along the
//   outside of the forearm, edge forward.
// A pose is written for the right hand; a weapon in the left is mirrored.
export const WEAPON_GRIPS: Record<string, WeaponGrip> = {
  dagger: { grip: "reverse", length: 0.36, hold: 0.14, clips: "boxing", pose: { at: [-0.08, 0.36, 0.16], blade: [-0.2, -1, 0.15], edge: [0, 0, 1] } },
  knife: { grip: "forward", length: 0.34, hold: 0.15, clips: "boxing", pose: { at: [-0.06, 0.13, 0.26], blade: [0.08, 0.3, 1], edge: [0, -1, 0] } },
  sword: { grip: "forward", length: 0.82, hold: 0.09, clips: "sword", pose: { at: [-0.1, 0.05, 0.2], blade: [0.12, 0.32, 1], edge: [0, -1, 0] } },
  "sword-2": { grip: "forward", length: 0.78, hold: 0.12, clips: "sword", pose: { at: [-0.1, 0.05, 0.2], blade: [0.12, 0.32, 1], edge: [0, -1, 0] } },
  "axe-double": { grip: "forward", length: 0.85, hold: 0.14, clips: "sword", pose: { at: [-0.12, 0.04, 0.18], blade: [0.05, 1, 0.5], edge: [0, 0, 1] } },
  claymore: { grip: "twohand", length: 1.45, hold: 0.17, offHand: 0.06, clips: "sword", pose: { at: [-0.09, 0.02, 0.17], blade: [0.18, 0.5, 1], edge: [0, -1, 0] } },
  scythe: { grip: "twohand", length: 1.6, hold: 0.3, offHand: 0.44, clips: "sword", pose: { at: [-0.1, 0.02, 0.2], blade: [0.4, 1, 0.55], edge: [0, 0, 1] } },
  spear: { grip: "twohand", length: 2.0, hold: 0.2, offHand: 0.4, clips: "sword", pose: { at: [-0.12, -0.02, 0.06], blade: [0.1, 0.28, 1], edge: [0, -1, 0] } },
  bow: { grip: "bow", length: 1.1, hold: 0.5, clips: "sword", pose: { at: [-0.16, 0.06, 0.22], blade: [0, 1, 0.25], edge: [0, 0, 1] } },
  "shield-round": { grip: "shield", length: 0.6, hold: 0.5, clips: "sword" },
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
  if (/knife/.test(key)) return WEAPON_GRIPS.knife!;
  return { grip: "forward", length: 0.85, hold: 0.12, clips: "sword" };
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
function gripFrame(hand: Hand, grip: Grip, clips: "boxing" | "sword"): THREE.Matrix4 {
  // Measured on the bind pose, `across` leaves the fist on the pinky side.
  // The sword clips hold the hand as the bind pose does: a forward grip's
  // blade leaves by the thumb (-across), a reverse grip's by the pinky. The
  // boxing clips hold it rolled half a turn, so there the sides swap.
  // (Checked on rendered poses: a sword ahead of the fist in the sword
  // guard, a reverse-grip dagger along the forearm in the boxing guard.)
  const y = hand.across.clone();
  if ((grip === "reverse") !== (clips === "sword")) y.negate();
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

// The middle of the handle at height `y` (model units): the centroid of the
// vertices in a thin slice there. A weapon's bounding box isn't centred on
// its handle when its head sticks out to one side (a scythe, an axe, a bow).
function handleCentre(weapon: THREE.Object3D, y: number, depth: number): THREE.Vector3 {
  const sum = v();
  let n = 0;
  const p = v();
  weapon.updateMatrixWorld(true);
  weapon.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const pos = node.geometry.getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
      if (Math.abs(p.y - y) <= depth) {
        sum.add(p);
        n++;
      }
    }
  });
  return n ? sum.divideScalar(n).setY(y) : new THREE.Vector3(0, y, 0);
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

// Weapons with a guard pose: the hand that holds one, its arm, the body it
// is posed against, and how far the pose is blended in (0 to 1).
type Posed = {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  holder: THREE.Object3D;
  pelvis: THREE.Object3D;
  body: THREE.Object3D;
  at: THREE.Vector3;
  frame: THREE.Matrix4; // the weapon's axes in the body frame
  height: number; // rest rig height, rig units
  weight: number;
};
const posed = new Set<Posed>();

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
  const frame = grip.grip === "shield" ? shieldFrame(rest, side, hand) : gripFrame(hand, grip.grip, grip.clips);
  if (!frame) return undefined;

  // The model, sized and moved so its hold point sits at the holder's origin.
  const weapon = model.clone(true);
  weapon.position.set(0, 0, 0);
  weapon.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(weapon);
  const size = box.getSize(v());
  const along = grip.grip === "shield" ? Math.max(size.x, size.y) : size.y;
  const scale = (grip.length * (rigHeight(rest) / HUMAN_HEIGHT)) / Math.max(along, 1e-6);
  // The hold point on the handle (a shield: its middle), unscaled model units.
  const at = (f: number) => (grip.grip === "shield" ? box.getCenter(v()) : handleCentre(weapon, box.min.y + size.y * f, size.y * 0.025));
  const hold = at(grip.hold);
  weapon.scale.multiplyScalar(scale);
  weapon.position.copy(hold).multiplyScalar(-scale);
  const holder = new THREE.Group();
  holder.name = `held_${side}`;
  holder.add(weapon);
  restBone.matrixWorld.clone().invert().multiply(frame).decompose(holder.position, holder.quaternion, holder.scale);
  targetBone.add(holder);
  holder.traverse((node) => {
    if (node instanceof THREE.Mesh) node.castShadow = true;
  });

  // A guard pose for the main hand.
  if (grip.pose && grip.grip !== "shield") {
    const upper = target.getObjectByName(`upperarm_${side}`);
    const lower = target.getObjectByName(`lowerarm_${side}`);
    const pelvis = target.getObjectByName("pelvis");
    if (upper && lower && pelvis) {
      // Mirrored across the body for the left hand.
      const m = side === "l" ? -1 : 1;
      const n = (a: [number, number, number]) => new THREE.Vector3(a[0] * m, a[1], a[2]).normalize();
      const blade = n(grip.pose.blade);
      const edge = n(grip.pose.edge).sub(blade.clone().multiplyScalar(n(grip.pose.edge).dot(blade))).normalize();
      const frame = new THREE.Matrix4().makeBasis(edge, blade, v().crossVectors(edge, blade).normalize());
      const at = new THREE.Vector3(grip.pose.at[0] * m, grip.pose.at[1], grip.pose.at[2]);
      posed.add({ upper, lower, hand: targetBone, holder, pelvis, body: target, at, frame, height: rigHeight(rest), weight: 0 });
    }
  }

  // A two-hander: the other hand, on the handle below.
  if (grip.grip === "twohand" && grip.offHand !== undefined) {
    const other = side === "r" ? "l" : "r";
    const otherHand = restHand(rest, other);
    const upper = target.getObjectByName(`upperarm_${other}`);
    const lower = target.getObjectByName(`lowerarm_${other}`);
    const handBone = target.getObjectByName(`hand_${other}`);
    const restHandBone = rest.getObjectByName(`hand_${other}`);
    if (otherHand && upper && lower && handBone && restHandBone) {
      const offFrame = gripFrame(otherHand, "forward", grip.clips);
      const handInGrip = offFrame.clone().invert().multiply(restHandBone.matrixWorld);
      // Along the handle from the main hand, in the holder's space.
      const off = at(grip.offHand).sub(hold).multiplyScalar(scale);
      offHands.add({ upper, lower, hand: handBone, holder, grip: new THREE.Matrix4().makeTranslation(off.x, off.y, off.z), handInGrip });
    }
  }
  return holder;
}

// Forgets the off hands of fighters that are gone (a rebuild).
export function clearOffHands() {
  offHands.clear();
  posed.clear();
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

// Analytic two-bone IK in the arm's own bend plane: the hand bone to `t`,
// then turned to `rot` (world).
function solveArm(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, t: THREE.Vector3, rot: THREE.Quaternion) {
  const a = upper.getWorldPosition(ik.a);
  const b = lower.getWorldPosition(ik.b);
  const c = hand.getWorldPosition(ik.c);
  const lab = b.distanceTo(a);
  const lcb = c.distanceTo(b);
  const lat = Math.min(Math.max(t.distanceTo(a), 1e-4), (lab + lcb) * 0.999);
  const ca = c.clone().sub(a).normalize();
  const ba = b.clone().sub(a).normalize();
  const ab = a.clone().sub(b).normalize();
  const cb = c.clone().sub(b).normalize();
  const ta = t.clone().sub(a).normalize();
  const shoulder0 = Math.acos(clampUnit(ca.dot(ba)));
  const elbow0 = Math.acos(clampUnit(ab.dot(cb)));
  const swing = Math.acos(clampUnit(ca.dot(ta)));
  const shoulder1 = Math.acos(clampUnit((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)));
  const elbow1 = Math.acos(clampUnit((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb)));
  const bend = v().crossVectors(ca, ba);
  if (bend.lengthSq() < 1e-10) bend.set(0, 1, 0);
  bend.normalize();
  const reach = v().crossVectors(ca, ta);
  rotateWorld(upper, new THREE.Quaternion().setFromAxisAngle(bend, shoulder1 - shoulder0));
  rotateWorld(lower, new THREE.Quaternion().setFromAxisAngle(bend, elbow1 - elbow0));
  if (reach.lengthSq() > 1e-10) rotateWorld(upper, new THREE.Quaternion().setFromAxisAngle(reach.normalize(), swing));
  hand.parent!.getWorldQuaternion(ik.pq);
  hand.quaternion.copy(ik.pq.invert().multiply(rot));
  hand.updateMatrixWorld(true);
}

const pose = {
  m: new THREE.Matrix4(),
  body: new THREE.Quaternion(),
  pos: v(),
  s: v(),
  q: new THREE.Quaternion(),
  cur: v(),
  curQ: new THREE.Quaternion(),
};

// Every frame, after the mixers. First the guard poses: while `guarding`
// says a fighter (its root object) stands in guard, its weapon hand is
// moved to the weapon's guard, blended in and out over a fifth of a second.
// Then each two-hander's off hand onto its handle.
export function updateHeldWeapons(dt: number, guarding: (body: THREE.Object3D) => boolean) {
  for (const p of posed) {
    if (!p.holder.parent || !p.hand.parent) {
      posed.delete(p);
      continue;
    }
    const goal = guarding(p.body) ? 1 : 0;
    p.weight += Math.sign(goal - p.weight) * Math.min(Math.abs(goal - p.weight), dt * 5);
    if (p.weight <= 0.001) continue;
    p.holder.updateMatrixWorld(true);
    // The fighter's size against the rest rig, and its heading.
    p.holder.matrixWorld.decompose(pose.pos, pose.q, pose.s);
    const scale = pose.s.x;
    p.body.getWorldQuaternion(pose.body);
    const at = p.at.clone().multiplyScalar(p.height * scale).applyQuaternion(pose.body).add(p.pelvis.getWorldPosition(v()));
    // Where the holder should be, then the hand that puts it there.
    const axes = new THREE.Quaternion().setFromRotationMatrix(p.frame).premultiply(pose.body);
    pose.m.compose(at, axes, pose.s).multiply(p.holder.matrix.clone().invert());
    pose.m.decompose(pose.pos, pose.q, pose.s);
    // Blended with where the clip put it.
    p.hand.getWorldPosition(pose.cur);
    p.hand.getWorldQuaternion(pose.curQ);
    pose.cur.lerp(pose.pos, p.weight);
    pose.curQ.slerp(pose.q, p.weight);
    solveArm(p.upper, p.lower, p.hand, pose.cur, pose.curQ);
  }
  for (const o of offHands) {
    if (!o.holder.parent || !o.hand.parent || !o.upper.parent) {
      offHands.delete(o);
      continue;
    }
    o.holder.updateMatrixWorld(true);
    // Where the hand bone should be: the grip on the handle, then the hand
    // relative to that grip. (The holder's world scale is the fighter's
    // size against the rest rig, which the rest-rig offsets need too.)
    ik.target.copy(o.holder.matrixWorld).multiply(o.grip).multiply(o.handInGrip);
    ik.target.decompose(ik.t, ik.rot, ik.scl);
    solveArm(o.upper, o.lower, o.hand, ik.t, ik.rot);
  }
}

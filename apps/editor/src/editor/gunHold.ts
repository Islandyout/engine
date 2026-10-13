// A gun in a character's hands in third person, the way shooters pose it:
// the gun is placed first (its stock in the shoulder pocket, or a handgun
// at arm's length in front of the eyes, pointed at what the crosshair is
// on; lowered to a ready position when not aiming; across the chest when
// sprinting), then two-bone IK closes the hands on it, at the sockets the
// gun carries (tools/models/import_weapons.mjs): the firing hand on the
// grip at the gun's origin, the support hand on its "offhand" node (a
// foregrip or the handguard; cupping the firing hand on a handgun). The
// spine turns toward the aim first, so the chest follows the gun.
//
// It works on any humanoid rig with arms, hands and fingers: the
// Quaternius mannequin (pelvis, spine_01, upperarm_r, hand_r, index_01_r...)
// and the pedestrians (Hips, Abdomen, UpperArm.R, Wrist.R, Index1.R...).
import * as THREE from "three";
import { rotateWorld, solveArm } from "./heldWeapons";

// The gun a loadout's `model=` holds when it names no `held=` gun.
export const defaultHeldGun: Record<string, string> = {
  rifle: "rifle-2",
  pistol: "pistol-1",
  shotgun: "shotgun-1",
  smg: "smg-2",
  sniper: "sniper-1",
};
export function heldGunName(model: string, held: string): string {
  return held || defaultHeldGun[model] || "";
}
// The gun a Weapons loadout's first weapon holds (its held= gun, or the
// default for its model=): what a character holds before Play has a
// current weapon to ask about.
export function loadoutGun(loadout: string): string {
  const line = loadout.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
  return heldGunName(/\bmodel=(\w+)/.exec(line)?.[1] ?? "rifle", /\bheld=([\w-]+)/.exec(line)?.[1] ?? "");
}
// Pistols and revolvers are held at arm's length with both hands; the rest
// are shouldered.
export function isHandgun(name: string): boolean {
  return /^(pistol|revolver)-/.test(name);
}

type Side = "l" | "r";
// The pedestrians' names lose their dots on loading (three.js strips
// reserved characters from node names: "Wrist.R" is "WristR").
const NAMES: Record<string, (s: Side) => string[]> = {
  pelvis: () => ["pelvis", "Hips"],
  spine1: () => ["spine_01", "Abdomen"],
  spine2: () => ["spine_02", "Torso"],
  spine3: () => ["spine_03", "Chest"],
  upperarm: (s) => [`upperarm_${s}`, `UpperArm${s.toUpperCase()}`],
  lowerarm: (s) => [`lowerarm_${s}`, `LowerArm${s.toUpperCase()}`],
  hand: (s) => [`hand_${s}`, `Wrist${s.toUpperCase()}`],
  index: (s) => [`index_01_${s}`, `Index1${s.toUpperCase()}`],
  middle: (s) => [`middle_01_${s}`, `Middle1${s.toUpperCase()}`],
  pinky: (s) => [`pinky_01_${s}`, `Pinky1${s.toUpperCase()}`],
  thumb: (s) => [`thumb_02_${s}`, `Thumb2${s.toUpperCase()}`],
};
// A bone by its role, whichever naming the rig uses.
export function rigBone(root: THREE.Object3D, role: string, side: Side = "r"): THREE.Object3D | undefined {
  for (const name of NAMES[role]?.(side) ?? []) {
    const bone = root.getObjectByName(name);
    if (bone) return bone;
  }
  return undefined;
}

const v = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Where a fist closes on the rest rig and which way it faces, world space:
// knuckles (wrist to the middle knuckle) and across (index knuckle to the
// pinky's, square to the knuckles).
type RestHand = { at: THREE.Vector3; knuckles: THREE.Vector3; across: THREE.Vector3; bone: THREE.Matrix4 };
function restHand(rest: THREE.Object3D, side: Side): RestHand | undefined {
  const hand = rigBone(rest, "hand", side),
    index = rigBone(rest, "index", side),
    middle = rigBone(rest, "middle", side),
    pinky = rigBone(rest, "pinky", side);
  if (!hand || !index || !middle || !pinky) return undefined;
  const wrist = hand.getWorldPosition(v());
  let i = index.getWorldPosition(v()),
    m = middle.getWorldPosition(v()),
    p = pinky.getWorldPosition(v());
  // The pedestrians' first finger bones all start at one point in the
  // palm: their next joints are the knuckles.
  if (i.distanceTo(p) < 0.3 * m.distanceTo(wrist)) {
    const next = (bone: THREE.Object3D, at: THREE.Vector3) => bone.children[0]?.getWorldPosition(v()) ?? at;
    i = next(index, i);
    m = next(middle, m);
    p = next(pinky, p);
  }
  const knuckles = m.clone().sub(wrist);
  const size = knuckles.length();
  knuckles.normalize();
  const across = p.clone().sub(i);
  across.sub(knuckles.clone().multiplyScalar(across.dot(knuckles)));
  if (size < 1e-6 || across.lengthSq() < 1e-10) return undefined;
  across.normalize();
  // The palm faces the thumb's side: for a right hand that is knuckles x
  // across, for a left hand the opposite (checked on both rigs' bind poses).
  const palm = v().crossVectors(knuckles, across).multiplyScalar(side === "r" ? 1 : -1);
  const at = wrist.clone().lerp(i.clone().add(m).add(p).divideScalar(3), 1.1).addScaledVector(palm, size * 0.2);
  return { at, knuckles, across, bone: hand.matrixWorld.clone() };
}

// The hand bone relative to a grip frame whose knuckles and across point
// along `k` and `a` (unit, square to each other) in the gun's frame.
function handInGrip(hand: RestHand, k: THREE.Vector3, a: THREE.Vector3): THREE.Matrix4 {
  const gun = new THREE.Matrix4().makeBasis(k, a, v().crossVectors(k, a));
  const world = new THREE.Matrix4().makeBasis(hand.knuckles, hand.across, v().crossVectors(hand.knuckles, hand.across));
  const frame = world.multiply(gun.transpose()).setPosition(hand.at);
  return frame.invert().multiply(hand.bone);
}

// A gun model as built by import_weapons.mjs: muzzle along +z, y up, the
// origin at the firing grip, metres, with "offhand" and "muzzle" nodes.
export type GunModel = {
  name: string;
  scene: THREE.Object3D;
  offhand: THREE.Vector3;
  muzzle: THREE.Vector3;
  // The stock's back end (or the gun's), gun space.
  butt: THREE.Vector3;
  handgun: boolean;
};
export function gunModel(name: string, scene: THREE.Object3D): GunModel | undefined {
  scene.updateMatrixWorld(true);
  const offhand = scene.getObjectByName("offhand");
  const muzzle = scene.getObjectByName("muzzle");
  if (!offhand || !muzzle) return undefined;
  const box = new THREE.Box3().setFromObject(scene);
  const m = muzzle.getWorldPosition(v());
  return {
    name,
    scene,
    offhand: offhand.getWorldPosition(v()),
    muzzle: m,
    butt: new THREE.Vector3(0, m.y * 0.5, box.min.z),
    handgun: isHandgun(name),
  };
}

export interface GunPoseInput {
  aimPoint: THREE.Vector3; // the world point the gun points at
  aim: number; // 0 at the ready .. 1 aimed
  sprint: number; // 0..1
  reload: number; // reload progress 0..1, or -1
  equip: number; // equip progress 0..1, or -1
  kick: number; // recoil 0..1
  // How much the firing arm is posed (1) or left to its clip (0), the gun
  // staying in the hand either way; default 1.
  hold?: number;
  // No support hand (the other holds a blade).
  oneHanded?: boolean;
}

// Rotates `d` about `axis` by `angle` (radians).
const turn = (d: THREE.Vector3, axis: THREE.Vector3, angle: number) => d.applyAxisAngle(axis, angle);

// One character holding one gun. `rest` is an unanimated copy of the rig
// (the catalog's cached model), `body` the animated clone it is posed on.
export class GunPose {
  readonly holder = new THREE.Group();
  private readonly bones: {
    spine: THREE.Object3D[];
    arms: Record<Side, { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D }>;
  };
  private readonly grips: { right: THREE.Matrix4; long: THREE.Matrix4; cup: THREE.Matrix4 };
  private readonly restArm: number;
  private gun: GunModel | undefined;
  private offWeight = 1;
  // How far each hand ended from where it was sent (metres; 0 when it
  // wasn't): small when the arms reach the gun.
  readonly gap = { right: 0, left: 0 };

  private constructor(
    private readonly body: THREE.Object3D,
    bones: GunPose["bones"],
    grips: GunPose["grips"],
    restArm: number,
  ) {
    this.bones = bones;
    this.grips = grips;
    this.restArm = restArm;
    this.holder.name = "held_gun";
    body.add(this.holder);
  }

  // Undefined when the rig lacks arms, hands or fingers.
  static create(rest: THREE.Object3D, body: THREE.Object3D): GunPose | undefined {
    rest.updateMatrixWorld(true);
    const arm = (root: THREE.Object3D, side: Side) => {
      const upper = rigBone(root, "upperarm", side),
        lower = rigBone(root, "lowerarm", side),
        hand = rigBone(root, "hand", side);
      return upper && lower && hand ? { upper, lower, hand } : undefined;
    };
    const right = arm(body, "r"),
      left = arm(body, "l"),
      restRight = arm(rest, "r");
    const spine = ["spine1", "spine2", "spine3"].map((role) => rigBone(body, role)).filter(Boolean) as THREE.Object3D[];
    const handR = restHand(rest, "r"),
      handL = restHand(rest, "l");
    if (!right || !left || !restRight || !handR || !handL || spine.length === 0) return undefined;
    // The grips, in the gun's frame. A pistol grip slants back ~18 degrees:
    // the firing hand's knuckle line runs down it (index on top), the
    // knuckles point along the barrel. The support hand under a handguard:
    // index forward, fingers wrapping up its right side. On a handgun it
    // closes over the firing hand from the left, the same way round.
    const s = Math.sin(THREE.MathUtils.degToRad(18)),
      c = Math.cos(THREE.MathUtils.degToRad(18));
    const k = new THREE.Vector3(0, -s, c),
      a = new THREE.Vector3(0, -c, -s);
    const grips = {
      right: handInGrip(handR, k, a),
      long: handInGrip(handL, new THREE.Vector3(-0.9, 0.35, 0).normalize(), new THREE.Vector3(0, 0, -1)),
      cup: handInGrip(handL, k, a),
    };
    const restArm =
      restRight.upper.getWorldPosition(v()).distanceTo(restRight.lower.getWorldPosition(v())) +
      restRight.lower.getWorldPosition(v()).distanceTo(restRight.hand.getWorldPosition(v()));
    return new GunPose(body, { spine, arms: { r: right, l: left } }, grips, restArm);
  }

  // Puts `gun` in the hands (undefined: none).
  setGun(gun: GunModel | undefined) {
    if (this.gun?.scene === gun?.scene) return;
    this.holder.clear();
    this.gun = gun;
    if (gun) {
      const copy = gun.scene.clone(true);
      copy.traverse((node) => {
        if (node instanceof THREE.Mesh) node.castShadow = true;
      });
      this.holder.add(copy);
    }
  }

  get holding(): GunModel | undefined {
    return this.gun;
  }

  // The muzzle in world space, or undefined with no gun.
  muzzleWorld(target: THREE.Vector3): THREE.Vector3 | undefined {
    if (!this.gun) return undefined;
    this.holder.updateMatrixWorld(true);
    return target.copy(this.gun.muzzle).applyMatrix4(this.holder.matrixWorld);
  }

  dispose() {
    this.holder.removeFromParent();
  }

  // Every frame, after the animation mixer.
  update(dt: number, input: GunPoseInput) {
    const gun = this.gun;
    this.holder.visible = !!gun;
    if (!gun) return;
    const { arms, spine } = this.bones;
    this.body.updateMatrixWorld(true);
    const shoulderR = () => arms.r.upper.getWorldPosition(v());
    const shoulderL = () => arms.l.upper.getWorldPosition(v());
    // The body's size against the rest rig.
    const armLength =
      arms.r.upper.getWorldPosition(v()).distanceTo(arms.r.lower.getWorldPosition(v())) +
      arms.r.lower.getWorldPosition(v()).distanceTo(arms.r.hand.getWorldPosition(v()));
    const ratio = armLength / Math.max(this.restArm, 1e-6);
    // Guns are sized for a 1.75 m human: a person's arm is ~0.6 m.
    const gunScale = armLength / 0.6;

    // 1. The chest turns to the aim: a long gun's shooter stands bladed,
    // the chest ~20 degrees right of the line; a handgun's square to it.
    // At the ready the gun and chest follow the body's facing; raised, the
    // aim (a character's models face +z).
    const bodyForward = v().set(0, 0, 1).applyQuaternion(this.body.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const toward = (from: THREE.Vector3) => {
      const to = input.aimPoint.clone().sub(from);
      if (to.lengthSq() < 1e-6) to.copy(bodyForward);
      to.normalize();
      const turnTo = new THREE.Quaternion().setFromUnitVectors(bodyForward, to);
      return bodyForward.clone().applyQuaternion(new THREE.Quaternion().slerp(turnTo, input.aim));
    };
    const toAim = toward(shoulderR().lerp(shoulderL(), 0.5));
    const chestForward = () => v().crossVectors(shoulderL().sub(shoulderR()), UP).normalize();
    const wantYaw = Math.atan2(toAim.x, toAim.z) - (gun.handgun ? 0 : THREE.MathUtils.degToRad(20)) * input.aim;
    const forward = chestForward();
    const haveYaw = Math.atan2(forward.x, forward.z);
    const twistWeight = 1 - input.sprint * 0.7;
    const yaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(wantYaw - haveYaw), Math.cos(wantYaw - haveYaw)), -1.3, 1.3) * twistWeight;
    const pitch = Math.asin(THREE.MathUtils.clamp(toAim.y, -1, 1)) * 0.55;
    for (const bone of spine) {
      rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(UP, yaw / spine.length));
      // About the left-to-right axis, a positive turn lifts the chest.
      const right = shoulderR().sub(shoulderL()).normalize();
      rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(right, pitch / spine.length));
    }

    // 2. Where the gun goes and which way it points.
    const R = shoulderR(),
      L = shoulderL();
    const mid = R.clone().lerp(L, 0.5);
    const chestRight = R.clone().sub(L).normalize();
    const chest = chestForward();
    const aimDir = toward(gun.handgun ? mid : R);
    const ready = aimDir.clone();
    turn(ready, chestRight, gun.handgun ? -0.95 : -0.6);
    turn(ready, UP, gun.handgun ? 0 : 0.25);
    const sprintDir = chest.clone();
    turn(sprintDir, UP, gun.handgun ? 0 : 1.1);
    turn(sprintDir, chestRight, gun.handgun ? -1.2 : 0.45);
    const dir = ready.lerp(aimDir, input.aim).normalize().lerp(sprintDir, input.sprint).normalize();
    // Recoil kicks the muzzle up; a reload tips it down and rolls it;
    // equipping raises it from low.
    const side = v().crossVectors(dir, UP).normalize();
    if (input.kick > 0) turn(dir, side, input.kick * (gun.handgun ? 0.14 : 0.07));
    const reload = input.reload >= 0 ? Math.sin(Math.PI * Math.min(1, input.reload)) : 0;
    if (reload > 0) turn(dir, side, -reload * 0.45);
    if (input.equip >= 0) turn(dir, side, -(1 - Math.min(1, input.equip)) * 1.1);
    dir.normalize();
    const up = UP.clone().sub(dir.clone().multiplyScalar(dir.dot(UP))).normalize();
    if (reload > 0) up.applyAxisAngle(dir, -reload * 0.6);
    const x = v().crossVectors(up, dir).normalize();
    up.crossVectors(dir, x).normalize();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, dir));
    let grip: THREE.Vector3;
    if (gun.handgun) {
      // At arm's length in front of the eyes, aimed; close in at the chest,
      // muzzle down, at the ready.
      const aimed = mid.clone().addScaledVector(UP, -0.03 * gunScale).addScaledVector(dir, armLength * 0.82);
      const low = mid.clone().addScaledVector(UP, -0.22 * gunScale).addScaledVector(chest, 0.22 * gunScale).addScaledVector(chestRight, 0.06 * gunScale);
      grip = low.lerp(aimed, input.aim);
    } else {
      // The stock in the shoulder pocket (just inside the right shoulder),
      // dropped a little at the ready and tucked further in when sprinting.
      const pocket = R.clone().lerp(mid, 0.3).addScaledVector(UP, -0.03 * gunScale);
      pocket.addScaledVector(UP, -0.06 * gunScale * (1 - input.aim)).addScaledVector(chest, 0.04 * gunScale * (1 - input.aim));
      pocket.lerp(mid.clone().addScaledVector(UP, -0.12 * gunScale).addScaledVector(chest, 0.15 * gunScale), input.sprint);
      grip = pocket.sub(gun.butt.clone().multiplyScalar(gunScale).applyQuaternion(rotation));
    }
    grip.addScaledVector(dir, -input.kick * 0.05 * gunScale);
    // 3. The firing hand to the grip (blended with its clip by `hold`),
    // then the gun in that hand wherever it ended up: the gun never leaves
    // the hand, even where the arm can't reach.
    const hold = input.hold ?? 1;
    const handAt = (point: THREE.Vector3, at: THREE.Quaternion, inGrip: THREE.Matrix4) => {
      const m = new THREE.Matrix4().compose(point, at, new THREE.Vector3(ratio, ratio, ratio)).multiply(inGrip);
      const position = v(),
        quaternion = new THREE.Quaternion();
      m.decompose(position, quaternion, v());
      return { position, quaternion };
    };
    const reach = (arm: { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D }, target: { position: THREE.Vector3; quaternion: THREE.Quaternion }, weight: number) => {
      if (weight < 0.01) return 0;
      const position = arm.hand.getWorldPosition(v()).lerp(target.position, weight);
      const quaternion = arm.hand.getWorldQuaternion(new THREE.Quaternion()).slerp(target.quaternion, weight);
      solveArm(arm.upper, arm.lower, arm.hand, position, quaternion);
      arm.hand.updateMatrixWorld(true);
      return arm.hand.getWorldPosition(v()).distanceTo(position);
    };
    this.gap.left = 0;
    this.gap.right = reach(arms.r, handAt(grip, rotation, this.grips.right), hold);
    arms.r.hand.updateMatrixWorld(true);
    const inHand = arms.r.hand.matrixWorld.clone().multiply(this.grips.right.clone().invert());
    const gripAt = v(),
      gripRotation = new THREE.Quaternion();
    inHand.decompose(gripAt, gripRotation, v());
    const world = new THREE.Matrix4().compose(gripAt, gripRotation, new THREE.Vector3(gunScale, gunScale, gunScale));
    this.body.updateMatrixWorld(true);
    world.premultiply(this.body.matrixWorld.clone().invert()).decompose(this.holder.position, this.holder.quaternion, this.holder.scale);
    this.holder.updateMatrixWorld(true);
    // 4. The support hand onto the gun's offhand socket. It lets go of a
    // handgun while sprinting and goes to the magazine during a reload.
    const wantOff = input.oneHanded ? 0 : (gun.handgun ? 1 - input.sprint : 1) * hold;
    this.offWeight += (wantOff - this.offWeight) * (1 - Math.exp(-dt * 10));
    if (this.offWeight < 0.02) return;
    const gunLeft = v().set(1, 0, 0).applyQuaternion(gripRotation);
    const socket = gun.offhand.clone().applyMatrix4(this.holder.matrixWorld);
    if (gun.handgun) socket.addScaledVector(gunLeft, 0.03 * gunScale);
    if (reload > 0) socket.lerp(new THREE.Vector3(0, gun.butt.y - 0.12, gun.handgun ? -0.01 : gun.offhand.z * 0.4).applyMatrix4(this.holder.matrixWorld), reload);
    this.gap.left = reach(arms.l, handAt(socket, gripRotation, gun.handgun ? this.grips.cup : this.grips.long), this.offWeight);
  }
}

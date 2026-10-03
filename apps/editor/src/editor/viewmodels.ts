// First-person weapon models (0.61.0), built from primitives so the engine
// ships usable guns without external assets, held by gloved first-person
// arms (0.68.0). Each model is in camera space:
// -z forward (the barrel), +y up, origin at the grip. `muzzle` marks where
// the flash and tracers start; `sightHeight` is how far the sight line sits
// above the origin, so aiming down sights can center it on the screen.
import * as THREE from "three";

export type ViewmodelName = "rifle" | "pistol" | "shotgun" | "smg" | "sniper" | "launcher";
export const viewmodelNames: readonly ViewmodelName[] = ["rifle", "pistol", "shotgun", "smg", "sniper", "launcher"];

export interface Viewmodel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  sightHeight: number;
  // Where the model sits at the hip, in camera space.
  hip: THREE.Vector3;
}

const viewmodelScale = 0.85;

const materials = {
  metal: new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.55, roughness: 0.38 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.1, roughness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2b, metalness: 0.0, roughness: 0.6 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x8c7a5a, metalness: 0.05, roughness: 0.75 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.2, roughness: 0.1, emissive: 0x0a1a2a }),
  sight: new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3300, emissiveIntensity: 2 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x6e5c45, metalness: 0.0, roughness: 0.8 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4a5236, metalness: 0.0, roughness: 0.95 }),
  cuff: new THREE.MeshStandardMaterial({ color: 0x3a4029, metalness: 0.0, roughness: 0.95 }),
};

// Where the shooter's elbows sit, in camera space: below and outside the
// view, so the forearms run from the hands off the bottom of the screen.
const rightElbow = new THREE.Vector3(0.26, -0.4, -0.16);
const leftElbow = new THREE.Vector3(0.0, -0.34, -0.42);

// A tapered cylinder from `from` to `to` (model space).
function limb(parent: THREE.Object3D, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) {
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, length, 12), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  parent.add(mesh);
  return mesh;
}

// First-person arms holding the weapon: gloved hands at the grip and the
// support point, forearms in sleeves running back to elbows off screen.
// Built into the weapon's own group, so they move with it exactly.
function addArms(group: THREE.Group, hip: THREE.Vector3, rightHand: THREE.Vector3, leftHand: THREE.Vector3) {
  const toModel = (camera: THREE.Vector3) => camera.clone().sub(hip).divideScalar(viewmodelScale);
  for (const [hand, elbowCamera, side] of [
    [rightHand, rightElbow, 1],
    [leftHand, leftElbow, -1],
  ] as const) {
    const elbow = toModel(elbowCamera);
    const direction = elbow.clone().sub(hand).normalize();
    const wrist = hand.clone().addScaledVector(direction, 0.06);
    const cuff = hand.clone().addScaledVector(direction, 0.11);
    // Glove: a palm wrapped around the grip, knuckles on the outside, a thumb.
    const glove = new THREE.Group();
    glove.name = side === 1 ? "glove:right" : "glove:left";
    glove.position.copy(hand);
    group.add(glove);
    const grip = side === 1;
    box(glove, materials.glove, grip ? [0.05, 0.08, 0.06] : [0.06, 0.035, 0.095], [0.004 * side, 0, 0]);
    box(glove, materials.glove, grip ? [0.012, 0.075, 0.05] : [0.012, 0.03, 0.085], [0.03 * side, grip ? 0 : 0.012, -0.004]);
    box(glove, materials.glove, [0.016, 0.018, 0.045], [-0.026 * side, grip ? 0.03 : 0.018, grip ? -0.02 : 0.01]);
    // Wrist, cuff and sleeve.
    limb(group, materials.glove, hand, wrist, 0.03, 0.028);
    limb(group, materials.cuff, wrist, cuff, 0.034, 0.036);
    limb(group, materials.sleeve, cuff, elbow, 0.036, 0.044);
  }
}

function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: [number, number, number],
  position: [number, number, number],
  rotationX = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.x = rotationX;
  parent.add(mesh);
  return mesh;
}

// A cylinder along -z (a barrel), from z0 to z1.
function tube(parent: THREE.Object3D, material: THREE.Material, radius: number, z0: number, z1: number, y = 0, x = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.abs(z1 - z0), 14), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, (z0 + z1) / 2);
  parent.add(mesh);
  return mesh;
}

function sightPost(parent: THREE.Object3D, y: number, z: number) {
  box(parent, materials.metal, [0.008, 0.02, 0.008], [0, y, z]);
  box(parent, materials.sight, [0.004, 0.004, 0.004], [0, y + 0.012, z]);
}

export function buildViewmodel(name: string): Viewmodel {
  const group = new THREE.Group();
  group.name = `viewmodel:${name}`;
  const muzzle = new THREE.Object3D();
  let sightHeight = 0.06;
  const hip = new THREE.Vector3(0.17, -0.16, -0.36);
  // Where the gloves hold it (model space): the grip and the support point.
  const rightHand = new THREE.Vector3(0, -0.045, 0.065);
  const leftHand = new THREE.Vector3(0, -0.013, -0.3);
  switch (name as ViewmodelName) {
    case "pistol": {
      box(group, materials.metal, [0.032, 0.036, 0.19], [0, 0.045, -0.06]); // slide
      box(group, materials.polymer, [0.03, 0.03, 0.15], [0, 0.015, -0.04]); // frame
      box(group, materials.polymer, [0.03, 0.11, 0.045], [0, -0.04, 0.02], -0.25); // grip
      box(group, materials.polymer, [0.006, 0.03, 0.04], [0, -0.005, -0.02]); // trigger guard
      tube(group, materials.metal, 0.007, -0.155, -0.17, 0.05);
      sightPost(group, 0.066, -0.14);
      box(group, materials.metal, [0.03, 0.012, 0.01], [0, 0.068, 0.02]); // rear sight
      muzzle.position.set(0, 0.05, -0.175);
      sightHeight = 0.074;
      hip.set(0.12, -0.115, -0.36);
      rightHand.set(0, -0.04, 0.022);
      leftHand.set(-0.006, -0.065, 0.012);
      break;
    }
    case "shotgun": {
      box(group, materials.metal, [0.05, 0.07, 0.24], [0, 0.03, -0.02]); // receiver
      tube(group, materials.metal, 0.016, -0.14, -0.62, 0.05); // barrel
      tube(group, materials.metal, 0.013, -0.14, -0.52, 0.018); // magazine tube
      box(group, materials.wood, [0.06, 0.05, 0.18], [0, 0.02, -0.33]); // pump
      box(group, materials.wood, [0.045, 0.09, 0.26], [0, -0.01, 0.2], 0.12); // stock
      box(group, materials.polymer, [0.035, 0.09, 0.04], [0, -0.05, 0.04], -0.3); // grip
      sightPost(group, 0.073, -0.6);
      muzzle.position.set(0, 0.05, -0.63);
      sightHeight = 0.086;
      hip.set(0.16, -0.15, -0.42);
      rightHand.set(0, -0.05, 0.045);
      leftHand.set(-0.012, -0.03, -0.33);
      break;
    }
    case "smg": {
      box(group, materials.polymer, [0.05, 0.075, 0.26], [0, 0.03, -0.05]); // body
      tube(group, materials.metal, 0.011, -0.18, -0.3, 0.045); // barrel
      tube(group, materials.metal, 0.02, -0.25, -0.33, 0.045); // suppressor-ish shroud
      box(group, materials.metal, [0.03, 0.15, 0.04], [0, -0.07, -0.08], 0.1); // magazine
      box(group, materials.polymer, [0.033, 0.09, 0.04], [0, -0.05, 0.05], -0.3); // grip
      box(group, materials.metal, [0.015, 0.02, 0.2], [0, 0.0, 0.16]); // folded stock
      box(group, materials.metal, [0.02, 0.025, 0.1], [0, 0.08, -0.04]); // rail
      sightPost(group, 0.093, -0.08);
      muzzle.position.set(0, 0.045, -0.34);
      sightHeight = 0.105;
      hip.set(0.14, -0.14, -0.38);
      rightHand.set(0, -0.05, 0.05);
      leftHand.set(-0.012, -0.03, -0.14);
      break;
    }
    case "sniper": {
      box(group, materials.tan, [0.055, 0.08, 0.5], [0, 0.0, -0.05]); // chassis/stock
      box(group, materials.metal, [0.045, 0.055, 0.2], [0, 0.04, -0.12]); // receiver
      tube(group, materials.metal, 0.012, -0.22, -0.82, 0.045); // long barrel
      tube(group, materials.metal, 0.018, -0.8, -0.86, 0.045); // muzzle brake
      tube(group, materials.metal, 0.024, -0.02, -0.26, 0.11); // scope tube
      tube(group, materials.glass, 0.027, -0.26, -0.27, 0.11);
      box(group, materials.metal, [0.02, 0.04, 0.02], [0, 0.08, -0.06]); // scope rings
      box(group, materials.metal, [0.02, 0.04, 0.02], [0, 0.08, -0.2]);
      box(group, materials.metal, [0.03, 0.1, 0.04], [0, -0.07, -0.1], 0.1); // magazine
      box(group, materials.polymer, [0.035, 0.09, 0.04], [0, -0.05, 0.06], -0.3); // grip
      muzzle.position.set(0, 0.045, -0.87);
      sightHeight = 0.11;
      hip.set(0.16, -0.155, -0.44);
      rightHand.set(0, -0.05, 0.06);
      leftHand.set(-0.015, -0.06, -0.28);
      break;
    }
    case "launcher": {
      tube(group, materials.tan, 0.055, 0.25, -0.55, 0.04); // tube
      tube(group, materials.metal, 0.06, -0.5, -0.56, 0.04); // front ring
      tube(group, materials.metal, 0.06, 0.2, 0.26, 0.04); // rear ring
      box(group, materials.polymer, [0.035, 0.1, 0.045], [0, -0.06, 0.0], -0.25); // grip
      box(group, materials.polymer, [0.035, 0.09, 0.045], [0, -0.05, -0.25], -0.1); // fore grip
      box(group, materials.metal, [0.02, 0.05, 0.06], [-0.065, 0.06, -0.1]); // side sight
      muzzle.position.set(0, 0.04, -0.57);
      sightHeight = 0.04;
      hip.set(0.18, -0.17, -0.48);
      rightHand.set(0, -0.06, 0.0);
      leftHand.set(0, -0.05, -0.25);
      break;
    }
    case "rifle":
    default: {
      box(group, materials.metal, [0.05, 0.075, 0.3], [0, 0.03, -0.05]); // receiver
      box(group, materials.polymer, [0.055, 0.06, 0.22], [0, 0.035, -0.3]); // handguard
      tube(group, materials.metal, 0.011, -0.4, -0.58, 0.04); // barrel
      tube(group, materials.metal, 0.016, -0.56, -0.62, 0.04); // flash hider
      box(group, materials.metal, [0.032, 0.13, 0.06], [0, -0.06, -0.1], 0.2); // magazine
      box(group, materials.polymer, [0.034, 0.1, 0.04], [0, -0.05, 0.06], -0.3); // grip
      box(group, materials.polymer, [0.045, 0.075, 0.2], [0, 0.015, 0.2]); // stock
      box(group, materials.metal, [0.022, 0.012, 0.36], [0, 0.074, -0.15]); // top rail
      // Rear sight: two ears with an open notch, so aiming looks through it.
      box(group, materials.metal, [0.009, 0.03, 0.04], [-0.013, 0.095, 0.04]);
      box(group, materials.metal, [0.009, 0.03, 0.04], [0.013, 0.095, 0.04]);
      sightPost(group, 0.09, -0.36);
      muzzle.position.set(0, 0.04, -0.63);
      sightHeight = 0.103;
      hip.set(0.15, -0.145, -0.4);
      rightHand.set(0, -0.045, 0.065);
      leftHand.set(-0.015, -0.025, -0.28);
      break;
    }
  }
  group.add(muzzle);
  addArms(group, hip, rightHand, leftHand);
  // Built at real-world size; drawn a little smaller so it doesn't crowd the view.
  group.scale.setScalar(viewmodelScale);
  sightHeight *= viewmodelScale;
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  return { group, muzzle, sightHeight, hip };
}

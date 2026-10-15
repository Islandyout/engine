// What loot looks like (the Pickup, LootDrop and Container components;
// engine/gameplay/loot.hpp): a pickup turns slowly over a ring on the
// ground, under a beam of its rarity's colour (taller for rarer loot), the
// way looter shooters mark loot (Fortnite, Apex, Borderlands); a weapon
// shows its own model, ammo a crate of rounds, health a medkit, an item a
// coin, key or gem. A container's lid swings open (or a lidless crate
// breaks) when it is opened.
import * as THREE from "three";
import type { PickupComponent, Rarity } from "../scene/Components";
import { loadoutSlot } from "./gunHold";

export const rarities: readonly Rarity[] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
// The common colour code: grey, green, blue, purple, gold.
export const rarityColors = ["#b8bec8", "#4fd25a", "#3b9bff", "#b45cff", "#ffb52e"] as const;
export function rarityIndex(rarity: Rarity | number): number {
  return typeof rarity === "number" ? Math.max(0, Math.min(4, Math.round(rarity))) : Math.max(0, rarities.indexOf(rarity));
}

// A Pickup component as the one loot-table line the runtime takes
// (editor_set_pickup).
export function pickupLootLine(pickup: PickupComponent): string {
  const rarity = ` rarity=${pickup.rarity}`;
  switch (pickup.kind) {
    case "Weapon":
      return `1 weapon ${pickup.weapon.trim()}${rarity}`;
    case "Ammo":
      return `1 ammo ${pickup.amount}${rarity}`;
    case "Health":
      return `1 health ${pickup.amount}${rarity}`;
    case "Item":
      return `1 item ${pickup.item.trim()} ${pickup.amount}${rarity}`;
  }
}

// The kit/weapons model a pickup shows ("" for none): a weapon's gun or
// blade.
export function pickupModelName(pickup: Pick<PickupComponent, "kind" | "weapon">): string {
  if (pickup.kind !== "Weapon") return "";
  const slot = loadoutSlot(pickup.weapon);
  return slot.melee && slot.melee !== "fists" ? slot.melee : slot.gun;
}

const standard = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });

// A stand-in model for loot without one of its own.
function propFor(kind: PickupComponent["kind"], item: string): THREE.Object3D {
  const group = new THREE.Group();
  if (kind === "Ammo") {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), standard(0x56613a));
    group.add(box);
    for (let i = 0; i < 3; i++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), standard(0xd4a646, { metalness: 0.7, roughness: 0.3 }));
      round.position.set(-0.07 + i * 0.07, 0.14, 0);
      group.add(round);
    }
  } else if (kind === "Health") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.22), standard(0xf2f2f2)));
    for (const [w, h] of [
      [0.16, 0.05],
      [0.05, 0.16],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), standard(0xd8262b));
      bar.position.z = 0.115;
      group.add(bar);
    }
  } else if (/coin|gold|cash|money/i.test(item)) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 24), standard(0xffc83d, { metalness: 0.85, roughness: 0.25 }));
    coin.rotation.x = Math.PI / 2;
    group.add(coin);
  } else if (/key/i.test(item)) {
    const metal = standard(0xe0b84a, { metalness: 0.85, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 20), metal);
    ring.position.x = -0.08;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.022), metal);
    shaft.position.x = 0.04;
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.022), metal);
    bit.position.set(0.1, -0.03, 0);
    group.add(ring, shaft, bit);
  } else {
    group.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.1), standard(0x9d6bff, { emissive: 0x3b1f80, metalness: 0.3, roughness: 0.2 })));
  }
  return group;
}

export interface PickupVisual {
  group: THREE.Group; // the turning, bobbing part
  root: THREE.Group;
  holder: THREE.Group; // where the model goes
  rarity: number;
}

// A pickup's look; `model` (a weapon's own) can arrive later with setModel.
export function buildPickupVisual(kind: PickupComponent["kind"], item: string, rarity: number): PickupVisual {
  const root = new THREE.Group();
  root.name = "pickup";
  const color = new THREE.Color(rarityColors[rarity]);
  const group = new THREE.Group();
  group.position.y = 0.45;
  const holder = new THREE.Group();
  group.add(holder);
  if (kind !== "Weapon") holder.add(propFor(kind, item));
  // The beam: taller for rarer loot, fading upward.
  const height = 1.4 + rarity * 0.7;
  const beamGeometry = new THREE.CylinderGeometry(0.06, 0.16, height, 16, 1, true);
  beamGeometry.translate(0, height / 2, 0);
  const fade = new Float32Array(beamGeometry.attributes.position!.count);
  for (let i = 0; i < fade.length; i++) fade[i] = 1 - beamGeometry.attributes.position!.getY(i) / height;
  beamGeometry.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
  const beam = new THREE.Mesh(
    beamGeometry,
    new THREE.ShaderMaterial({
      uniforms: { color: { value: color } },
      vertexShader: "attribute float fade; varying float vFade; void main() { vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 color; varying float vFade; void main() { gl_FragColor = vec4(color * (0.35 + 0.65 * vFade), 0.55 * vFade * vFade); }",
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  beam.name = "pickup_beam";
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.36, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(group, beam, ring);
  return { group, root, holder, rarity };
}

// Puts a weapon's model in a pickup, lying on its side and at most a
// metre and a bit long (melee kit models are authored large).
export function setPickupModel(visual: PickupVisual, model: THREE.Object3D, realLength?: number) {
  visual.holder.clear();
  const copy = model.clone(true);
  const box = new THREE.Box3().setFromObject(copy);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 1e-6);
  const length = realLength ?? Math.min(longest, 1.2);
  copy.scale.multiplyScalar(length / longest);
  // Centred on its middle; a melee weapon (authored along +y) laid down.
  const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(length / longest);
  copy.position.sub(centre);
  const pivot = new THREE.Group();
  pivot.add(copy);
  if (size.y >= size.z && size.y >= size.x) pivot.rotation.z = Math.PI / 2;
  visual.holder.add(pivot);
}

// Every frame: turns and bobs.
export function animatePickup(visual: PickupVisual, time: number, phase: number) {
  visual.group.rotation.y = time * 1.2 + phase;
  visual.group.position.y = 0.45 + Math.sin(time * 2.2 + phase) * 0.06;
}

// A container opening over `t` seconds (0..0.6): a lid swings back on its
// far edge from `viewer`, or a lidless crate breaks apart. Returns false
// when there's nothing left to animate.
export function openContainer(object: THREE.Object3D, viewer: THREE.Vector3): (t: number) => boolean {
  let lid: THREE.Object3D | undefined;
  object.traverse((node) => {
    if (!lid && node !== object && /lid|top/i.test(node.name) && !(node as THREE.Bone).isBone) lid = node;
  });
  if (!lid?.parent) {
    // No lid: it pops and breaks.
    const scale = object.scale.clone();
    return (t) => {
      const k = t < 0.12 ? 1 + t : Math.max(0, 1.12 * (1 - (t - 0.12) / 0.3));
      object.scale.copy(scale).multiplyScalar(k);
      if (k <= 0) object.visible = false;
      return k > 0;
    };
  }
  const hinged = lid;
  const parent = hinged.parent!;
  // The hinge: the lid's edge farthest from the viewer, at its bottom.
  parent.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(hinged);
  const toViewer = viewer.clone().sub(box.getCenter(new THREE.Vector3()));
  const alongX = Math.abs(toViewer.x) > Math.abs(toViewer.z);
  const far = new THREE.Vector3(
    alongX ? (toViewer.x > 0 ? box.min.x : box.max.x) : (box.min.x + box.max.x) / 2,
    box.min.y,
    alongX ? (box.min.z + box.max.z) / 2 : toViewer.z > 0 ? box.min.z : box.max.z,
  );
  const hingeLocal = parent.worldToLocal(far.clone());
  const axisWorld = alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const pivot = new THREE.Group();
  pivot.position.copy(hingeLocal);
  parent.add(pivot);
  pivot.attach(hinged);
  // The way that lifts the lid's front (the side toward the viewer).
  const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const axis = axisWorld.applyQuaternion(parentQuat).normalize();
  const centre = box.getCenter(new THREE.Vector3());
  const lift = (angle: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    return parent.worldToLocal(centre.clone()).sub(hingeLocal).applyQuaternion(q).y;
  };
  const sign = lift(1.2) > lift(-1.2) ? 1 : -1;
  return (t) => {
    const k = Math.min(1, t / 0.5);
    const ease = 1 - (1 - k) * (1 - k) * (1 - k);
    pivot.quaternion.setFromAxisAngle(axis, sign * 1.9 * ease);
    return k < 1;
  };
}

// A pickup component's look, from the component.
export function pickupVisualFor(pickup: PickupComponent): PickupVisual {
  return buildPickupVisual(pickup.kind, pickup.item, rarityIndex(pickup.rarity));
}

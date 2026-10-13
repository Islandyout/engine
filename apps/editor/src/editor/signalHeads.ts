// What a TrafficSignal looks like: a pole and a three-lamp head on each
// corner of its junction, one facing each approach, lit from the
// simulation's state each frame (editor_signal_state).
import * as THREE from "three";

export interface SignalHeads {
  group: THREE.Group;
  // Per head: the road it serves (0: traffic along z, 1: along x) and its
  // red, yellow and green lamps.
  heads: Array<{ axis: number; lamps: THREE.MeshStandardMaterial[] }>;
}

const lampColors = [0xff2a1a, 0xffb21a, 0x2aff6a];
const pole = new THREE.CylinderGeometry(0.09, 0.11, 4.6, 8);
const housing = new THREE.BoxGeometry(0.4, 1.15, 0.32);
const lamp = new THREE.SphereGeometry(0.12, 12, 8);
const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6, metalness: 0.4 });

// Heads at the four corners, `radius` metres out (the stop lines), each on
// the far-right corner of the approach it faces, as drivers see them.
export function buildSignalHeads(radius: number): SignalHeads {
  const group = new THREE.Group();
  group.name = "signal-heads";
  const heads: SignalHeads["heads"] = [];
  const c = Math.max(2, radius - 0.6);
  // [x, z, yaw facing the approach, axis]
  const corners: Array<[number, number, number, number]> = [
    [c, c, Math.PI, 0], // traffic heading +z sees it ahead, on the right
    [-c, -c, 0, 0], // heading -z
    [c, -c, -Math.PI / 2, 1], // heading -x
    [-c, c, Math.PI / 2, 1], // heading +x
  ];
  for (const [x, z, yaw, axis] of corners) {
    const post = new THREE.Mesh(pole, dark);
    post.position.set(x, 2.3, z);
    post.castShadow = true;
    const head = new THREE.Group();
    head.position.set(x, 4.2, z);
    head.rotation.y = yaw;
    head.add(new THREE.Mesh(housing, dark));
    const lamps = lampColors.map((color, k) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0.05 });
      const bulb = new THREE.Mesh(lamp, material);
      bulb.position.set(0, 0.36 - k * 0.36, 0.17);
      head.add(bulb);
      return material;
    });
    group.add(post, head);
    heads.push({ axis, lamps });
  }
  return { group, heads };
}

// state: axis 0's light (0 green, 1 yellow, 2 red) plus 3 times axis 1's.
export function setSignalHeads(signal: SignalHeads, state: number) {
  if (state < 0) return;
  const lights = [state % 3, Math.floor(state / 3) % 3];
  for (const head of signal.heads) {
    const on = 2 - lights[head.axis]!; // lamps are red, yellow, green top to bottom
    head.lamps.forEach((material, k) => (material.emissiveIntensity = k === on ? 2.4 : 0.05));
  }
}

export function disposeSignalHeads(signal: SignalHeads) {
  for (const head of signal.heads) for (const material of head.lamps) material.dispose();
}

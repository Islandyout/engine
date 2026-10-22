// What a flying projectile looks like. The C++ side only knows a position, a velocity and a shape number
// (the move's `shape=`); the look is built here from a few shared glowing parts, all unlit and additive,
// so a dozen of them cost almost nothing to draw.
import * as THREE from "three";

const SHAPES = ["orb", "crescent", "arrow", "fireball", "lightning", "shuriken", "wooden arrow"] as const;
export const projectileShapeNames = SHAPES;

const COLORS = [0x7fe6ff, 0xbfe9ff, 0xfff0b0, 0xff7a2a, 0xc9a8ff, 0xd8e4ee, 0xd8c9a8];

let halo: THREE.CanvasTexture | undefined;
function haloTexture() {
  if (halo) return halo;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return (halo = new THREE.CanvasTexture(canvas));
}

const additive = (color: number, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const shared = new Map<string, THREE.BufferGeometry>();
const geometry = (key: string, make: () => THREE.BufferGeometry) => {
  let g = shared.get(key);
  if (!g) shared.set(key, (g = make()));
  return g;
};

function star(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 0.1 : 0.34;
    const a = (i / 8) * Math.PI * 2;
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// A projectile's group: local +z is the way it flies. Shape -1 (a gun's bolt) stays the plain box.
export function makeProjectile(shape: number): THREE.Group {
  const group = new THREE.Group();
  group.userData.shape = shape;
  const color = COLORS[shape] ?? 0x78c8ff;
  const add = (mesh: THREE.Object3D) => (group.add(mesh), mesh);
  if (shape < 0 || shape >= SHAPES.length) {
    add(new THREE.Mesh(geometry("box", () => new THREE.BoxGeometry(0.3, 0.3, 0.3)), new THREE.MeshStandardMaterial({ color: 0x78c8ff })));
    return group;
  }
  if (shape === 6) {
    // A real arrow: a wooden shaft, a steel head and three feathers, lit like the world (a bow's arrow does not glow).
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.7 });
    const feather = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9, side: THREE.DoubleSide });
    add(new THREE.Mesh(geometry("arrow-shaft", () => new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6).rotateX(Math.PI / 2)), wood));
    add(new THREE.Mesh(geometry("arrow-head", () => new THREE.ConeGeometry(0.05, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0, 0.46)), steel));
    // A faint streak behind it so a fast arrow can be followed.
    const streak = new THREE.Mesh(geometry("arrow-streak", () => new THREE.ConeGeometry(1, 1, 6, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), additive(0xfff2d0, 0.18));
    streak.scale.set(0.04, 0.04, 2.2);
    streak.position.z = -0.4;
    streak.name = "streak";
    add(streak);
    for (let i = 0; i < 3; i++) {
      const vane = new THREE.Mesh(geometry("arrow-vane", () => new THREE.PlaneGeometry(0.08, 0.2).translate(0.03, 0, -0.34)), feather);
      vane.rotation.z = (i / 3) * Math.PI * 2;
      add(vane);
    }
    return group;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sprite.scale.setScalar(shape === 3 ? 1.9 : 1.3);
  sprite.name = "halo";
  add(sprite);
  const tail = (length: number, radius: number, c = color) => {
    const cone = new THREE.Mesh(geometry(`tail${length}`, () => new THREE.ConeGeometry(1, 1, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5)), additive(c, 0.55));
    cone.scale.set(radius, radius, length);
    cone.name = "tail";
    return add(cone);
  };
  if (shape === 0) {
    add(new THREE.Mesh(geometry("sphere", () => new THREE.SphereGeometry(0.2, 14, 10)), additive(0xffffff)));
    tail(1.6, 0.17);
  } else if (shape === 1) {
    // An arc of light, opening behind the blow.
    const arc = new THREE.Mesh(geometry("arc", () => new THREE.TorusGeometry(0.55, 0.055, 6, 28, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 1, 0.35)), additive(0xffffff));
    arc.rotation.z = Math.PI / 2;
    add(arc);
    tail(1.1, 0.4, 0x8fd4ff);
  } else if (shape === 2) {
    add(new THREE.Mesh(geometry("arrow", () => new THREE.ConeGeometry(0.1, 0.9, 8).rotateX(Math.PI / 2)), additive(0xffffff)));
    tail(1.8, 0.07);
  } else if (shape === 3) {
    add(new THREE.Mesh(geometry("sphere", () => new THREE.SphereGeometry(0.2, 14, 10)), additive(0xffd27a)));
    const outer = add(new THREE.Mesh(geometry("sphere2", () => new THREE.SphereGeometry(0.32, 12, 8)), additive(color, 0.5)));
    outer.name = "flicker";
    tail(2.2, 0.3, 0xff4a10);
  } else if (shape === 4) {
    add(new THREE.Mesh(geometry("spear", () => new THREE.OctahedronGeometry(0.2, 0).scale(0.7, 0.7, 3.4)), additive(0xffffff)));
    tail(2.4, 0.12);
  } else {
    const blade = add(new THREE.Mesh(geometry("star", star), additive(0xf2f8ff)));
    blade.name = "spin";
    blade.rotation.x = Math.PI / 2;
    tail(0.9, 0.2, 0x9fb4c8);
  }
  return group;
}

// Place it, point it along its velocity, and give it its motion (spin, flicker).
export function updateProjectile(group: THREE.Object3D, x: number, y: number, z: number, vx: number, vy: number, vz: number, time: number) {
  group.position.set(x, y, z);
  if (vx * vx + vy * vy + vz * vz > 1e-4) group.lookAt(x + vx, y + vy, z + vz);
  const spin = group.getObjectByName("spin");
  if (spin) spin.rotation.z = time * 24;
  const flicker = group.getObjectByName("flicker");
  if (flicker) flicker.scale.setScalar(0.9 + 0.2 * Math.sin(time * 40));
  const halo = group.getObjectByName("halo");
  if (halo) halo.scale.setScalar((group.userData.shape === 3 ? 1.9 : 1.3) * (0.92 + 0.12 * Math.sin(time * 30)));
}

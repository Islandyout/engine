// Birds in the sky and fish that leap from the water, drawn here because the catalog has no free bird or fish model that moves. They are
// simple shapes (an ellipsoid body, a beak, two flapping wings) made from three.js primitives, so there is no asset to license. Purely scenery:
// the minds never see them. Birds circle about whoever you are looking at, by day, fewer in rain and winter; fish jump near the water.
import * as THREE from "three";

export interface WildlifeState {
  x: number;
  z: number;
  ground: number;
  hour: number;
  rain: number;
  season: number; // 0 spring .. 3 winter
  water?: { x: number; z: number; y: number }; // the nearest water to you, if it is within sight
}

interface Bird {
  group: THREE.Group;
  left: THREE.Object3D;
  right: THREE.Object3D;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  flap: number;
}

interface Leap {
  mesh: THREE.Mesh;
  born: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const BIRDS = 9;
const PALETTE = [0x3b2f2a, 0x544638, 0x8a8f94, 0xe8e6df, 0x2c3a4a];

function makeBird(colour: number): Bird {
  const mat = new THREE.MeshLambertMaterial({ color: colour, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
  body.scale.set(0.8, 0.7, 1.6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
  head.position.set(0, 0.06, 0.38);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), new THREE.MeshLambertMaterial({ color: 0xd9a441 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.05, 0.5);
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), mat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0, -0.45);
  const wingShape = new THREE.PlaneGeometry(0.75, 0.3);
  wingShape.translate(0.375, 0, 0);
  const left = new THREE.Object3D();
  const right = new THREE.Object3D();
  const lw = new THREE.Mesh(wingShape, mat);
  lw.rotation.x = -Math.PI / 2;
  const rw = new THREE.Mesh(wingShape, mat);
  rw.rotation.x = -Math.PI / 2;
  rw.scale.x = -1;
  left.add(lw);
  right.add(rw);
  left.position.set(0.08, 0.04, 0.05);
  right.position.set(-0.08, 0.04, 0.05);
  group.add(body, head, beak, tail, left, right);
  group.scale.setScalar(1.4);
  group.visible = false;
  return { group, left, right, angle: 0, radius: 0, height: 0, speed: 0, phase: 0, flap: 0 };
}

export class EdenWildlife {
  private birds: Bird[] = [];
  private leaps: Leap[] = [];
  private state?: WildlifeState;
  private last = performance.now();
  private nextLeap = 0;
  private frame = 0;
  private fishMat = new THREE.MeshLambertMaterial({ color: 0xb8c4cc });
  private ring: THREE.Mesh[] = [];

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < BIRDS; i++) {
      const b = makeBird(PALETTE[i % PALETTE.length]!);
      b.angle = (i / BIRDS) * Math.PI * 2;
      b.radius = 35 + ((i * 37) % 55);
      b.height = 16 + ((i * 11) % 18);
      b.speed = (0.06 + (i % 3) * 0.02) * (i % 2 ? 1 : -1);
      b.phase = i * 1.7;
      b.flap = 6 + (i % 4);
      this.birds.push(b);
      scene.add(b.group);
    }
  }

  update(state: WildlifeState) {
    this.state = state;
    if (!this.frame) this.tick();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const b of this.birds) this.scene.remove(b.group);
    for (const l of this.leaps) this.scene.remove(l.mesh);
    for (const r of this.ring) this.scene.remove(r);
  }

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.state;
    if (!s) return;
    const t = now / 1000;
    const day = s.hour > 6.5 && s.hour < 18.5 && s.rain < 0.3;
    const count = !day ? 0 : Math.round(BIRDS * [1, 0.9, 0.7, 0.3][Math.max(0, Math.min(3, s.season))]!);
    this.birds.forEach((b, i) => {
      b.group.visible = i < count;
      if (!b.group.visible) return;
      b.angle += b.speed * dt;
      const wob = Math.sin(t * 0.3 + b.phase) * 6;
      const px = s.x + Math.cos(b.angle) * (b.radius + wob);
      const pz = s.z + Math.sin(b.angle) * (b.radius + wob);
      const py = s.ground + b.height + Math.sin(t * 0.5 + b.phase) * 2.5;
      const heading = Math.atan2(-Math.sin(b.angle) * Math.sign(b.speed), Math.cos(b.angle) * Math.sign(b.speed));
      b.group.position.set(px, py, pz);
      b.group.rotation.set(0, Math.PI / 2 - heading, -0.22 * Math.sign(b.speed));
      // Flap in bursts, glide between.
      const gliding = Math.sin(t * 0.4 + b.phase * 2) > 0.45;
      const beat = gliding ? 0.12 : Math.sin(t * b.flap + b.phase) * 0.7;
      b.left.rotation.z = beat;
      b.right.rotation.z = -beat;
    });
    // A fish leaps now and then where you can see the water.
    if (s.water && now > this.nextLeap && this.leaps.length < 2 && s.rain < 0.5) {
      this.nextLeap = now + 6000 + Math.random() * 14000;
      const from = new THREE.Vector3(s.water.x + (Math.random() - 0.5) * 6, s.water.y, s.water.z + (Math.random() - 0.5) * 6);
      const a = Math.random() * Math.PI * 2;
      const to = from.clone().add(new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6));
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.fishMat);
      mesh.scale.set(0.5, 0.6, 1.8);
      this.scene.add(mesh);
      this.leaps.push({ mesh, born: now, from, to });
      this.splash(from);
    }
    for (const l of [...this.leaps]) {
      const k = (now - l.born) / 900;
      if (k >= 1) {
        this.scene.remove(l.mesh);
        this.leaps.splice(this.leaps.indexOf(l), 1);
        this.splash(l.to);
        continue;
      }
      l.mesh.position.lerpVectors(l.from, l.to, k);
      l.mesh.position.y += Math.sin(k * Math.PI) * 0.9;
      l.mesh.lookAt(l.to.x, l.mesh.position.y - Math.cos(k * Math.PI) * 0.9, l.to.z);
    }
    for (const r of [...this.ring]) {
      const k = (now - (r.userData.born as number)) / 1100;
      if (k >= 1) {
        this.scene.remove(r);
        this.ring.splice(this.ring.indexOf(r), 1);
        continue;
      }
      r.scale.setScalar(0.2 + k * 1.6);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
  };

  private splash(at: THREE.Vector3) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(at);
    ring.position.y += 0.03;
    ring.userData.born = performance.now();
    this.scene.add(ring);
    this.ring.push(ring);
  }
}

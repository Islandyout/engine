// A skirt (or robe hem) that behaves like cloth: a grid of particles hung from the waist, stepped with Verlet integration,
// held together by distance constraints, kept out of the legs by capsules, and drawn as its own mesh in world space. When the
// character runs the hem trails behind it, a kick pushes the cloth aside, and a stop makes it swing forward and settle.
// It follows the body only through the waist ring (pinned to the pelvis bone), so every animation, in every clip and fight,
// moves it the same way, with nothing authored per clip.
import * as THREE from "three";

export interface ClothBones {
  pelvis: THREE.Object3D;
  thighL: THREE.Object3D;
  calfL: THREE.Object3D;
  footL: THREE.Object3D;
  thighR: THREE.Object3D;
  calfR: THREE.Object3D;
  footR: THREE.Object3D;
}

export interface ClothOptions {
  segments?: number; // columns around the waist
  rows?: number; // rows from waist to hem
  length?: number; // metres, waist to hem
  waist?: [number, number]; // half-width and half-depth at the waist
  flare?: number; // how much wider the hem is than the waist (1 = straight)
  drag?: number; // 0..1, how much velocity is lost per step
}

interface Capsule {
  a: THREE.Object3D;
  b: THREE.Object3D;
  radius: number;
}

const FIXED_STEP = 1 / 60;

export class ClothSkirt {
  readonly mesh: THREE.Mesh;
  readonly rows: number;
  readonly segments: number;
  readonly count: number;
  readonly position: Float32Array; // world positions, row-major
  private readonly previous: Float32Array;
  private readonly local: Float32Array; // every particle's rest place, in pelvis-local space
  private readonly rest: { a: number; b: number; length: number }[] = [];
  private readonly reach: Float32Array; // farthest a particle may be from its column's waist point
  private readonly capsules: Capsule[];
  private readonly normals: Float32Array;
  private readonly drag: number;
  private accumulator = 0;
  private lastWaist = new THREE.Vector3();
  private readonly scratch = { v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), a: new THREE.Vector3(), b: new THREE.Vector3() };

  constructor(
    private readonly bones: ClothBones,
    readonly anchor: THREE.Object3D,
    material: THREE.Material,
    options: ClothOptions = {},
  ) {
    this.segments = options.segments ?? 24;
    this.rows = options.rows ?? 13;
    const length = options.length ?? 0.9;
    const [rx, rz] = options.waist ?? [0.19, 0.15];
    const flare = options.flare ?? 1.9;
    this.drag = options.drag ?? 0.03;
    this.count = this.segments * this.rows;
    this.position = new Float32Array(this.count * 3);
    this.previous = new Float32Array(this.count * 3);
    this.local = new Float32Array(this.count * 3);
    this.reach = new Float32Array(this.count);
    this.normals = new Float32Array(this.count * 3);
    this.capsules = [
      { a: bones.thighL, b: bones.calfL, radius: 0.11 },
      { a: bones.calfL, b: bones.footL, radius: 0.085 },
      { a: bones.thighR, b: bones.calfR, radius: 0.11 },
      { a: bones.calfR, b: bones.footR, radius: 0.085 },
    ];

    // The rest shape in the character's own frame (upright, facing +z), then pinned to wherever the pelvis is now.
    anchor.updateMatrixWorld(true);
    bones.pelvis.updateMatrixWorld(true);
    const frame = new THREE.Matrix4().extractRotation(anchor.matrixWorld);
    const pelvisWorld = bones.pelvis.getWorldPosition(new THREE.Vector3());
    const inverse = bones.pelvis.matrixWorld.clone().invert();
    const point = new THREE.Vector3();
    for (let j = 0; j < this.segments; j++) {
      const angle = (j / this.segments) * Math.PI * 2;
      for (let i = 0; i < this.rows; i++) {
        const t = i / (this.rows - 1);
        const spread = 1 + (flare - 1) * t * t;
        point.set(Math.sin(angle) * rx * spread, -t * length, Math.cos(angle) * rz * spread).applyMatrix4(frame).add(pelvisWorld);
        const at = (i * this.segments + j) * 3;
        this.position[at] = this.previous[at] = point.x;
        this.position[at + 1] = this.previous[at + 1] = point.y;
        this.position[at + 2] = this.previous[at + 2] = point.z;
        point.applyMatrix4(inverse);
        this.local[at] = point.x;
        this.local[at + 1] = point.y;
        this.local[at + 2] = point.z;
      }
    }
    const index = (i: number, j: number) => i * this.segments + ((j + this.segments) % this.segments);
    const link = (a: number, b: number) => this.rest.push({ a, b, length: this.distance(a, b) });
    for (let i = 0; i < this.rows; i++)
      for (let j = 0; j < this.segments; j++) {
        link(index(i, j), index(i, j + 1)); // around
        if (i + 1 < this.rows) {
          link(index(i, j), index(i + 1, j)); // down
          link(index(i, j), index(i + 1, j + 1)); // shear
          link(index(i, j + 1), index(i + 1, j));
        }
        if (i + 2 < this.rows) link(index(i, j), index(i + 2, j)); // bend
      }
    for (let i = 0; i < this.rows; i++)
      for (let j = 0; j < this.segments; j++) this.reach[i * this.segments + j] = this.distance(i * this.segments + j, j) * 1.12 + 0.01;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    for (let i = 0; i + 1 < this.rows; i++)
      for (let j = 0; j < this.segments; j++) {
        const a = index(i, j), b = index(i, j + 1), c = index(i + 1, j), d = index(i + 1, j + 1);
        indices.push(a, c, b, b, c, d);
      }
    geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = "cloth-skirt";
    this.lastWaist.copy(pelvisWorld);
    this.updateNormals();
  }

  private distance(a: number, b: number) {
    const p = this.position;
    return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
  }

  // The waist ring's current world positions (from the pelvis bone).
  private waist(j: number, out: THREE.Vector3) {
    return out.set(this.local[j * 3]!, this.local[j * 3 + 1]!, this.local[j * 3 + 2]!).applyMatrix4(this.bones.pelvis.matrixWorld);
  }

  // Puts every particle back at its rest place on the body (after a teleport).
  reset() {
    const { v } = this.scratch;
    this.bones.pelvis.updateMatrixWorld(true);
    for (let i = 0; i < this.count; i++) {
      v.set(this.local[i * 3]!, this.local[i * 3 + 1]!, this.local[i * 3 + 2]!).applyMatrix4(this.bones.pelvis.matrixWorld);
      this.position[i * 3] = this.previous[i * 3] = v.x;
      this.position[i * 3 + 1] = this.previous[i * 3 + 1] = v.y;
      this.position[i * 3 + 2] = this.previous[i * 3 + 2] = v.z;
    }
  }

  // Steps the cloth by `dt` seconds (in fixed steps) and refreshes the mesh.
  update(dt: number, time: number) {
    this.anchor.updateMatrixWorld(true);
    this.bones.pelvis.updateMatrixWorld(true);
    const waist = this.bones.pelvis.getWorldPosition(this.scratch.a);
    // A jump of several metres in one frame is a teleport, not a run.
    if (waist.distanceToSquared(this.lastWaist) > 9) this.reset();
    this.lastWaist.copy(waist);
    this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * 3);
    while (this.accumulator >= FIXED_STEP) {
      this.step(FIXED_STEP, time);
      this.accumulator -= FIXED_STEP;
    }
    // The mesh is in world space: undo its parent's transform so it lands where the particles are.
    this.mesh.matrix.copy((this.mesh.parent ?? this.anchor).matrixWorld).invert();
    this.mesh.matrixWorldNeedsUpdate = true;
    this.updateNormals();
    (this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute).needsUpdate = true;
  }

  private step(dt: number, time: number) {
    const p = this.position, q = this.previous;
    const g = -9.8 * dt * dt;
    const { v } = this.scratch;
    for (let i = 1; i < this.rows; i++) {
      // Air catches loose cloth most at the hem: more drag the farther down.
      const keep = 1 - this.drag * (1 + 10 * (i / (this.rows - 1)));
      for (let j = 0; j < this.segments; j++) {
        const at = (i * this.segments + j) * 3;
        // A light, moving breeze (more at the hem).
        const breeze = Math.sin(time * 1.7 + j * 0.9 + i * 0.3) * 0.5 * dt * dt * (i / this.rows);
        for (let k = 0; k < 3; k++) {
          const now = p[at + k]!;
          const gain = (now - q[at + k]!) * keep + (k === 1 ? g : k === 0 ? breeze : 0);
          q[at + k] = now;
          p[at + k] = now + gain;
        }
      }
    }
    for (let iteration = 0; iteration < 4; iteration++) {
      for (let j = 0; j < this.segments; j++) {
        this.waist(j, v);
        p[j * 3] = v.x; p[j * 3 + 1] = v.y; p[j * 3 + 2] = v.z;
        q[j * 3] = v.x; q[j * 3 + 1] = v.y; q[j * 3 + 2] = v.z;
      }
      for (const { a, b, length } of this.rest) {
        const ax = p[a * 3]!, ay = p[a * 3 + 1]!, az = p[a * 3 + 2]!;
        let dx = p[b * 3]! - ax, dy = p[b * 3 + 1]! - ay, dz = p[b * 3 + 2]! - az;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const correction = (d - length) / d * 0.5;
        dx *= correction; dy *= correction; dz *= correction;
        const pinA = a < this.segments, pinB = b < this.segments;
        if (!pinA) { p[a * 3] = ax + dx * (pinB ? 2 : 1); p[a * 3 + 1] = ay + dy * (pinB ? 2 : 1); p[a * 3 + 2] = az + dz * (pinB ? 2 : 1); }
        if (!pinB) { p[b * 3] = p[b * 3]! - dx * (pinA ? 2 : 1); p[b * 3 + 1] = p[b * 3 + 1]! - dy * (pinA ? 2 : 1); p[b * 3 + 2] = p[b * 3 + 2]! - dz * (pinA ? 2 : 1); }
      }
      this.collide();
      this.tether();
    }
  }

  // Keeps each particle within reach of its column's waist point (cloth does not stretch to the floor).
  private tether() {
    const p = this.position, { v } = this.scratch;
    for (let i = 1; i < this.rows; i++)
      for (let j = 0; j < this.segments; j++) {
        this.waist(j, v);
        const at = (i * this.segments + j) * 3;
        const dx = p[at]! - v.x, dy = p[at + 1]! - v.y, dz = p[at + 2]! - v.z;
        const d = Math.hypot(dx, dy, dz);
        const limit = this.reach[i * this.segments + j]!;
        if (d > limit) {
          const s = limit / d;
          p[at] = v.x + dx * s; p[at + 1] = v.y + dy * s; p[at + 2] = v.z + dz * s;
        }
      }
  }

  // Pushes particles out of the legs.
  private collide() {
    const p = this.position;
    const { a, b, v, w } = this.scratch;
    for (const capsule of this.capsules) {
      capsule.a.getWorldPosition(a);
      capsule.b.getWorldPosition(b);
      const axis = w.copy(b).sub(a);
      const lengthSq = axis.lengthSq() || 1e-6;
      for (let i = 1; i < this.rows; i++)
        for (let j = 0; j < this.segments; j++) {
          const at = (i * this.segments + j) * 3;
          v.set(p[at]! - a.x, p[at + 1]! - a.y, p[at + 2]! - a.z);
          const t = Math.min(1, Math.max(0, v.dot(axis) / lengthSq));
          const cx = a.x + axis.x * t, cy = a.y + axis.y * t, cz = a.z + axis.z * t;
          let dx = p[at]! - cx, dy = p[at + 1]! - cy, dz = p[at + 2]! - cz;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const radius = capsule.radius + 0.02;
          if (d < radius) {
            const s = radius / d;
            dx *= s; dy *= s; dz *= s;
            p[at] = cx + dx; p[at + 1] = cy + dy; p[at + 2] = cz + dz;
          }
        }
    }
  }

  private updateNormals() {
    const p = this.position, n = this.normals;
    n.fill(0);
    const geometry = this.mesh.geometry;
    const index = geometry.getIndex()!.array;
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { n[o] = n[o]! + nx; n[o + 1] = n[o + 1]! + ny; n[o + 2] = n[o + 2]! + nz; }
    }
    for (let i = 0; i < this.count; i++) {
      const l = Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!) || 1;
      n[i * 3] = n[i * 3]! / l; n[i * 3 + 1] = n[i * 3 + 1]! / l; n[i * 3 + 2] = n[i * 3 + 2]! / l;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// The bones a skirt needs, found on a character (null when it lacks any).
export function findClothBones(root: THREE.Object3D): ClothBones | null {
  const found = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) found.set(node.name, node);
  });
  const get = (name: string) => found.get(name);
  const [pelvis, thighL, calfL, footL, thighR, calfR, footR] = ["pelvis", "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r"].map(get);
  if (!pelvis || !thighL || !calfL || !footL || !thighR || !calfR || !footR) return null;
  return { pelvis, thighL, calfL, footL, thighR, calfR, footR };
}

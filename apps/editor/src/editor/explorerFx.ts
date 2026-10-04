// Exploration effects (0.73.0): weather (rain streaks, fog, wind), ambient
// dust motes near the walker, footprints on soft ground, and the ship
// settling on its gear at touchdown. Each owns its Three.js objects; main.ts
// feeds them the player, camera and what scripts asked for.
import * as THREE from "three";

export interface WeatherState {
  rain: number; // 0..1
  fog: number; // 0..1
  windX: number; // m/s in the frame
  windZ: number;
}

export function parseWeather(text: string): WeatherState {
  const [rain = 0, fog = 0, windX = 0, windZ = 0] = text.split(/\s+/).map(Number);
  const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const finite = (v: number) => (Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0);
  return { rain: clamp01(rain), fog: clamp01(fog), windX: finite(windX), windZ: finite(windZ) };
}

const RAIN = 2400;
const DUST = 700;

export class ExplorerFx {
  readonly group = new THREE.Group();
  weather: WeatherState = { rain: 0, fog: 0, windX: 0, windZ: 0 };
  private readonly rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly rainSeeds = new Float32Array(RAIN * 3);
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly dustSeeds = new Float32Array(DUST * 4);
  private readonly prints: THREE.InstancedMesh;
  private printCount = 0;
  private printAge: number[] = [];
  private lastPrint?: THREE.Vector3;
  private stepSide = 1;
  private time = 0;
  private settle = 0; // seconds left of the touchdown settle
  private settleDepth = 0;
  reducedMotion = false;
  dustColor = new THREE.Color("#d8cfb8");
  dustDensity = 0.5;
  footprints = true;

  constructor() {
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAIN * 6), 3));
    this.rain = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({ color: 0xbfd2dc, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    for (let i = 0; i < RAIN * 3; i++) this.rainSeeds[i] = Math.random();
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({ size: 0.022, color: this.dustColor, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.dust.frustumCulled = false;
    for (let i = 0; i < DUST * 4; i++) this.dustSeeds[i] = Math.random();
    const print = new THREE.PlaneGeometry(0.16, 0.3);
    print.rotateX(-Math.PI / 2);
    this.prints = new THREE.InstancedMesh(
      print,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
      160,
    );
    this.prints.count = 0;
    this.prints.frustumCulled = false;
    this.group.add(this.rain, this.dust, this.prints);
  }

  // Touchdown: the ship sinks onto its gear and springs back.
  touchdown(vertical: number) {
    this.settle = 0.9;
    this.settleDepth = Math.min(0.5, 0.08 + vertical * 0.05);
  }

  // The ship's settle offset this frame (metres down).
  settleOffset() {
    if (this.settle <= 0) return 0;
    const t = 1 - this.settle / 0.9;
    return this.settleDepth * Math.exp(-t * 5) * Math.cos(t * 14);
  }

  clearPrints() {
    this.printCount = 0;
    this.printAge = [];
    this.prints.count = 0;
    this.lastPrint = undefined;
  }

  update(
    dt: number,
    camera: THREE.Camera,
    walker: THREE.Object3D | undefined,
    walking: boolean,
    ground: (x: number, z: number) => number,
    soft: boolean,
  ) {
    this.time += dt;
    this.settle = Math.max(0, this.settle - dt);
    const eye = camera.getWorldPosition(new THREE.Vector3());
    // Rain: streaks in a box around the eye, slanted by the wind.
    const rain = this.weather.rain;
    this.rain.visible = rain > 0.01;
    if (this.rain.visible) {
      const pos = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
      const count = Math.floor(RAIN * rain);
      const fall = 14, box = 28;
      const sx = this.weather.windX / fall, sz = this.weather.windZ / fall;
      for (let i = 0; i < RAIN; i++) {
        if (i >= count) {
          pos.setXYZ(i * 2, 0, -1e5, 0);
          pos.setXYZ(i * 2 + 1, 0, -1e5, 0);
          continue;
        }
        const a = this.rainSeeds[i * 3]!, b = this.rainSeeds[i * 3 + 1]!, c = this.rainSeeds[i * 3 + 2]!;
        const y = ((c * box - this.time * fall) % box + box) % box;
        const x = eye.x + (a - 0.5) * box + sx * y, z = eye.z + (b - 0.5) * box + sz * y;
        const top = eye.y - box / 2 + y;
        pos.setXYZ(i * 2, x, top, z);
        pos.setXYZ(i * 2 + 1, x - sx * 0.6, top - 0.6, z - sz * 0.6);
      }
      pos.needsUpdate = true;
      this.rain.material.opacity = 0.18 + rain * 0.3;
    }
    // Dust motes drifting around the walker.
    this.dust.visible = !!walker && this.dustDensity > 0.01 && !this.reducedMotion;
    if (this.dust.visible && walker) {
      const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
      const box = 10;
      const n = Math.floor(DUST * Math.min(1, this.dustDensity));
      for (let i = 0; i < DUST; i++) {
        if (i >= n) {
          pos.setXYZ(i, 0, -1e5, 0);
          continue;
        }
        const s = i * 4;
        const drift = this.time * (0.2 + this.dustSeeds[s + 3]! * 0.4);
        const x = ((this.dustSeeds[s]! * box + drift * (0.4 + this.weather.windX * 0.1)) % box + box) % box - box / 2;
        const z = ((this.dustSeeds[s + 1]! * box + drift * (0.3 + this.weather.windZ * 0.1)) % box + box) % box - box / 2;
        const y = this.dustSeeds[s + 2]! * 3 + Math.sin(drift + i) * 0.2;
        pos.setXYZ(i, walker.position.x + x, walker.position.y - 0.8 + y, walker.position.z + z);
      }
      pos.needsUpdate = true;
      this.dust.material.color.copy(this.dustColor);
    }
    // Footprints every 0.75 m on soft ground, fading out.
    if (walker && walking && soft && this.footprints) {
      const at = walker.position;
      if (!this.lastPrint || this.lastPrint.distanceTo(at) > 0.75) {
        const heading = this.lastPrint ? Math.atan2(at.x - this.lastPrint.x, at.z - this.lastPrint.z) : 0;
        this.lastPrint = at.clone();
        this.stepSide = -this.stepSide;
        const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(0.12 * this.stepSide);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(at.x + side.x, ground(at.x, at.z) + 0.03, at.z + side.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading),
          new THREE.Vector3(1, 1, 1),
        );
        const slot = this.printCount % this.prints.instanceMatrix.count;
        this.prints.setMatrixAt(slot, m);
        this.printAge[slot] = 0;
        this.printCount++;
        this.prints.count = Math.min(this.printCount, this.prints.instanceMatrix.count);
        this.prints.instanceMatrix.needsUpdate = true;
      }
    }
    for (let i = 0; i < this.printAge.length; i++) this.printAge[i]! += dt;
  }

  dispose() {
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.prints.geometry.dispose();
    (this.prints.material as THREE.Material).dispose();
  }
}

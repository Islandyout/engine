// Car presentation (0.70.0): body roll and pitch, brake and police lights,
// nitro flames, skid marks and tyre smoke for arcade cars, plus the driving
// HUD (speedometer, gear, nitro) and a minimap. Driven by the runtime's car
// state; it never changes the simulation.
import * as THREE from "three";
import { burst, createEmitter, stepEmitter, type EmitterState } from "./particles";

// One car's state for this frame (editor_vehicle_value).
export interface CarView {
  speed: number;
  forward: number;
  gear: number;
  rpm: number;
  nitro: number;
  drifting: boolean;
  boosting: boolean;
  slip: number;
  yawRate: number;
  brake: number;
  handbrake: boolean;
  throttle: number;
  pursuit: boolean; // a pursuit driver: lights and siren
}

// Decorations added to a car's anchor (built once from its size).
interface Decor {
  // Under the anchor with its scale undone, so children are in metres.
  holder: THREE.Group;
  size: THREE.Vector3;
  brakeLights: THREE.MeshStandardMaterial;
  flames: THREE.Mesh[];
  police?: { red: THREE.MeshBasicMaterial; blue: THREE.MeshBasicMaterial; glowRed: THREE.Sprite; glowBlue: THREE.Sprite };
  roll: number;
  pitch: number;
  previousForward: number;
}

export interface MinimapRoad {
  x: number;
  z: number;
  size: number;
}
export interface MinimapBlip {
  x: number;
  z: number;
  kind: "player" | "racer" | "police" | "traffic" | "marker";
  yaw?: number;
  label?: string;
}

const skidCount = 900;

function glowTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class CarFx {
  private readonly decor = new Map<THREE.Object3D, Decor>();
  private readonly skids: THREE.InstancedMesh;
  private nextSkid = 0;
  private readonly lastSkid = new Map<string, THREE.Vector3>();
  private readonly smoke: EmitterState;
  private time = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly redGlow = glowTexture("rgba(255,40,40,1)");
  private readonly blueGlow = glowTexture("rgba(60,120,255,1)");
  private readonly flameGlow = glowTexture("rgba(120,180,255,1)");

  constructor(
    scene: THREE.Scene,
    makePoints: (emitter: EmitterState) => THREE.Points,
  ) {
    const mark = new THREE.PlaneGeometry(0.32, 1).rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(
      mark,
      new THREE.MeshBasicMaterial({
        color: 0x0b0b0b,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      skidCount,
    );
    this.skids.frustumCulled = false;
    this.skids.count = 0;
    scene.add(this.skids);
    this.smoke = createEmitter(
      {
        rate: 0,
        lifetime: 1.6,
        speed: 1.2,
        size: 0.6,
        endSize: 3.2,
        color: [0.85, 0.85, 0.85],
        endColor: [0.6, 0.6, 0.62],
        direction: [0, 1, 0],
        spread: 0.9,
        gravity: -0.6,
        shape: "Point",
        shapeSize: 0,
        coneAngle: 0,
      },
      800,
    );
    this.smoke.emitting = false;
    scene.add(makePoints(this.smoke));
  }

  reset() {
    this.skids.count = 0;
    this.nextSkid = 0;
    this.lastSkid.clear();
    for (const [anchor, decor] of this.decor) {
      anchor.rotation.x = anchor.rotation.z = 0;
      decor.roll = decor.pitch = 0;
    }
  }

  private decorate(anchor: THREE.Object3D, size: THREE.Vector3, pursuit: boolean): Decor {
    this.decor.get(anchor)?.holder.removeFromParent();
    const holder = new THREE.Group();
    holder.scale.set(1 / (anchor.scale.x || 1), 1 / (anchor.scale.y || 1), 1 / (anchor.scale.z || 1));
    anchor.add(holder);
    // Brake lights: two red bars at the back.
    const brakeLights = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0.3 });
    const lightGeometry = new THREE.BoxGeometry(size.x * 0.22, size.y * 0.06, 0.04);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeometry, brakeLights);
      light.position.set(side * size.x * 0.32, size.y * 0.55 - size.y / 2, -size.z / 2 - 0.01);
      holder.add(light);
    }
    // Nitro flames: additive glows from the exhausts.
    const flames: THREE.Mesh[] = [];
    const flameMaterial = new THREE.SpriteMaterial({ map: this.flameGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (const side of [-1, 1]) {
      const flame = new THREE.Sprite(flameMaterial);
      flame.position.set(side * size.x * 0.25, size.y * 0.25 - size.y / 2, -size.z / 2 - 0.35);
      flame.visible = false;
      holder.add(flame);
      flames.push(flame as unknown as THREE.Mesh);
    }
    const decor: Decor = { holder, size, brakeLights, flames, roll: 0, pitch: 0, previousForward: 0 };
    if (pursuit) {
      // Light bar: red and blue blocks on the roof, with glows.
      const red = new THREE.MeshBasicMaterial({ color: 0x550000 });
      const blue = new THREE.MeshBasicMaterial({ color: 0x000055 });
      const block = new THREE.BoxGeometry(size.x * 0.32, 0.12, 0.25);
      const y = size.y / 2 + 0.05;
      const left = new THREE.Mesh(block, red);
      left.position.set(size.x * 0.18, y, 0);
      const right = new THREE.Mesh(block, blue);
      right.position.set(-size.x * 0.18, y, 0);
      const glowRed = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.redGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glowRed.position.copy(left.position);
      glowRed.scale.setScalar(2.4);
      const glowBlue = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.blueGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glowBlue.position.copy(right.position);
      glowBlue.scale.setScalar(2.4);
      holder.add(left, right, glowRed, glowBlue);
      decor.police = { red, blue, glowRed, glowBlue };
    }
    return decor;
  }

  // Per car, per frame. `size` is its box (width, height, length).
  updateCar(anchor: THREE.Object3D, size: THREE.Vector3, car: CarView, dt: number) {
    let decor = this.decor.get(anchor);
    if (!decor || (car.pursuit && !decor.police)) {
      decor = this.decorate(anchor, size, car.pursuit);
      this.decor.set(anchor, decor);
    }
    // Body roll into turns and pitch under acceleration and braking.
    const lateral = car.forward * car.yawRate; // m/s^2 toward the turn
    const accel = (car.forward - decor.previousForward) / Math.max(dt, 1e-3);
    decor.previousForward = car.forward;
    const rollTarget = THREE.MathUtils.clamp(lateral * 0.006, -0.07, 0.07);
    const pitchTarget = THREE.MathUtils.clamp(-accel * 0.0035, -0.05, 0.05);
    const ease = 1 - Math.exp(-dt * 6);
    decor.roll += (rollTarget - decor.roll) * ease;
    decor.pitch += (pitchTarget - decor.pitch) * ease;
    anchor.rotation.order = "YXZ";
    anchor.rotation.z = decor.roll;
    anchor.rotation.x = decor.pitch;
    decor.brakeLights.emissiveIntensity = car.brake > 0.05 || car.handbrake ? 3 : 0.35;
    for (const flame of decor.flames) {
      flame.visible = car.boosting;
      if (car.boosting) flame.scale.setScalar(0.5 + Math.random() * 0.35);
    }
    if (decor.police) {
      const phase = Math.floor(this.time * 6) % 2 === 0;
      decor.police.red.color.setHex(phase ? 0xff2020 : 0x330000);
      decor.police.blue.color.setHex(phase ? 0x000022 : 0x3060ff);
      decor.police.glowRed.visible = car.pursuit && phase;
      decor.police.glowBlue.visible = car.pursuit && !phase;
    }
    // Rear tyres sliding or locked: skid marks and smoke.
    const sliding = (car.drifting || car.handbrake || Math.abs(car.slip) > 0.18) && car.speed > 5;
    const locking = car.brake > 0.7 && car.forward > 12;
    for (const side of [-1, 1]) {
      const key = `${anchor.id}:${side}`;
      if (!sliding && !locking) {
        this.lastSkid.delete(key);
        continue;
      }
      const wheel = decor.holder.localToWorld(new THREE.Vector3(side * size.x * 0.38, -size.y / 2, -size.z * 0.33));
      wheel.y = anchor.position.y - size.y / 2 + 0.03;
      const last = this.lastSkid.get(key);
      if (last && last.distanceTo(wheel) > 0.6) {
        this.addSkid(last, wheel);
        this.lastSkid.set(key, wheel);
      } else if (!last) this.lastSkid.set(key, wheel);
      if (sliding && Math.random() < 0.5) {
        this.smoke.origin = [wheel.x, wheel.y + 0.2, wheel.z];
        burst(this.smoke, 1);
      }
    }
  }

  private addSkid(from: THREE.Vector3, to: THREE.Vector3) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const length = from.distanceTo(to);
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    this.matrix.compose(mid, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, length));
    this.skids.setMatrixAt(this.nextSkid, this.matrix);
    this.nextSkid = (this.nextSkid + 1) % skidCount;
    this.skids.count = Math.max(this.skids.count, this.nextSkid === 0 ? skidCount : this.nextSkid);
    this.skids.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    stepEmitter(this.smoke, dt);
  }

  // Bottom-right: speed, gear, a rev arc and the nitro bar.
  drawSpeedometer(ctx: CanvasRenderingContext2D, width: number, height: number, car: CarView, topSpeed: number) {
    const cx = width - 120,
      cy = height - 110,
      r = 78;
    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
    ctx.fill();
    // Rev arc, red near the limiter.
    const start = Math.PI * 0.75,
      sweep = Math.PI * 1.5;
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    ctx.strokeStyle = car.rpm > 0.9 ? "#ff4030" : "#f0c040";
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep * Math.min(1, car.rpm));
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "800 44px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
    ctx.fillText(String(Math.round(car.speed * 3.6)), cx, cy - 6);
    ctx.font = "600 13px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("KM/H", cx, cy + 22);
    ctx.font = "800 22px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
    ctx.fillStyle = car.drifting ? "#ff9f30" : "#7fd0ff";
    ctx.fillText(car.gear < 0 ? "R" : String(car.gear), cx, cy + 48);
    // Speed fraction tick.
    const fraction = Math.min(1, car.speed / Math.max(topSpeed, 1));
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const a = start + sweep * fraction;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14), 3, 0, Math.PI * 2);
    ctx.fill();
    // Nitro bar under the dial.
    const bw = 150,
      bh = 9,
      bx = cx - bw / 2,
      by = cy + r + 22;
    ctx.fillStyle = "rgba(8,10,14,0.6)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = car.boosting ? "#9fe8ff" : "#3aa0ff";
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, car.nitro)), bh);
    ctx.font = "700 11px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "left";
    ctx.fillText("NITRO", bx, by - 9);
    ctx.restore();
  }

  // Bottom-left: a heading-up radar of the roads, cars and markers around
  // the player, `range` metres to the edge.
  drawMinimap(
    ctx: CanvasRenderingContext2D,
    height: number,
    center: { x: number; z: number; yaw: number },
    roads: MinimapRoad[],
    blips: MinimapBlip[],
    range = 160,
  ) {
    const r = 92,
      cx = 24 + r,
      cy = height - 24 - r;
    const scale = r / range;
    // World (x, z) to minimap: the player's facing points up the screen.
    const cos = Math.cos(center.yaw),
      sin = Math.sin(center.yaw);
    const toMap = (x: number, z: number) => {
      const dx = x - center.x,
        dz = z - center.z;
      // Forward (sin, cos) maps to up; right (-cos, sin) maps to screen right.
      const forward = dx * sin + dz * cos;
      const right = -dx * cos + dz * sin;
      return { x: cx + right * scale, y: cy - forward * scale };
    };
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,14,20,0.72)";
    ctx.fill();
    ctx.clip();
    // Roads as rotated squares.
    ctx.fillStyle = "rgba(170,180,195,0.55)";
    for (const road of roads) {
      if (Math.abs(road.x - center.x) > range + road.size || Math.abs(road.z - center.z) > range + road.size) continue;
      const p = toMap(road.x, road.z);
      const half = (road.size / 2) * scale;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(center.yaw);
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    }
    const colors = { player: "#ffffff", racer: "#ffd040", police: "#ff3030", traffic: "#8a96a8", marker: "#ff9f30" };
    for (const blip of blips) {
      if (blip.kind === "player") continue;
      let p = toMap(blip.x, blip.z);
      const dx = p.x - cx,
        dy = p.y - cy,
        d = Math.hypot(dx, dy);
      if (blip.kind === "marker") {
        // Markers stay on the rim when out of range.
        if (d > r - 8) p = { x: cx + (dx / d) * (r - 8), y: cy + (dy / d) * (r - 8) };
        ctx.fillStyle = colors.marker;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5, -5, 10, 10);
        ctx.restore();
        continue;
      }
      if (d > r) continue;
      ctx.fillStyle = blip.kind === "police" ? (Math.floor(this.time * 6) % 2 ? "#ff3030" : "#3a70ff") : colors[blip.kind];
      ctx.beginPath();
      ctx.arc(p.x, p.y, blip.kind === "traffic" ? 2.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // The player: an arrow at the center pointing up.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

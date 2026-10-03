// First-person weapon presentation (0.61.0): the viewmodel (drawn in its own
// scene after the world so it never clips into walls), its animation (sway,
// bob, recoil, reload, equip, aim down sights, sprint), muzzle flashes,
// tracers, impact sparks and decals, explosions, and the combat HUD
// (ammo, dynamic crosshair, hit markers, damage direction indicators,
// health). Driven by the runtime's weapon events and state; it never
// changes the simulation.
import * as THREE from "three";
import { burst, createEmitter, stepEmitter, type EmitterState } from "./particles";
import { buildViewmodel, type Viewmodel } from "./viewmodels";

// editor_weapon_event's kinds and flags (bridge.cpp).
export const EventKind = {
  fire: 0,
  impact: 1,
  reload: 2,
  reloaded: 3,
  empty: 4,
  switched: 5,
  explode: 6,
  damaged: 7,
} as const;
export const EventFlag = { headshot: 1, killed: 2, flesh: 4 } as const;

export interface CombatEvent {
  kind: number;
  shooter: number;
  target: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  value: number;
  flags: number;
}

export interface ViewmodelInput {
  look: { yaw: number; pitch: number };
  aiming: boolean;
  reloadProgress: number; // 0..1, or < 0 when not reloading
  equipProgress: number; // 0..1, or < 0 when ready
  speed: number;
  grounded: boolean;
  sprinting: boolean;
}

export interface CombatHud {
  weaponName: string;
  magazine: number;
  reserve: number; // -1 unlimited
  reloadProgress: number;
  spread: number; // degrees
  aiming: boolean;
  fov: number; // vertical degrees of the world camera
  health: number; // 0..1, or < 0 without Health
  slot: number;
  weaponNames: string[];
}

function radialTexture(inner: string, outer: string, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function flashTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(size / 2, size / 2);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  glow.addColorStop(0, "rgba(255,255,230,1)");
  glow.addColorStop(0.25, "rgba(255,200,90,0.9)");
  glow.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = glow;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(size / 2, 0);
    ctx.lineTo(0, 6);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, size / 5, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const decalCount = 96;
const tracerCount = 24;

export class WeaponFx {
  readonly viewScene = new THREE.Scene();
  readonly viewCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  // Extra camera pitch from recoil, radians, decaying back to 0.
  punch = 0;
  private readonly rig = new THREE.Group();
  private readonly models = new Map<string, Viewmodel>();
  private current: Viewmodel | undefined;
  private currentName = "";
  private kick = 0;
  private kickVelocity = 0;
  private aimBlend = 0;
  private sprintBlend = 0;
  private sway = new THREE.Vector2();
  private lastLook: { yaw: number; pitch: number } | undefined;
  private bobPhase = 0;
  private bobAmount = 0;
  private flashLife = 0;
  private readonly flash: THREE.Sprite;
  private readonly muzzleLight = new THREE.PointLight(0xffb060, 0, 7, 2);
  private readonly blastLight = new THREE.PointLight(0xff8030, 0, 30, 2);
  private readonly tracers: Array<{ line: THREE.Line; life: number }> = [];
  private nextTracer = 0;
  private readonly decals: THREE.Mesh[] = [];
  private nextDecal = 0;
  private readonly sparks: EmitterState;
  private readonly sparkPoints: THREE.Points;
  private readonly blood: EmitterState;
  private readonly bloodPoints: THREE.Points;
  private readonly blasts: Array<{ mesh: THREE.Mesh; life: number; radius: number }> = [];
  private hitmarker = { life: 0, kill: false, headshot: false };
  private readonly indicators: Array<{ angle: number; life: number }> = [];
  private hurtFlash = 0;
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    makePoints: (emitter: EmitterState) => THREE.Points,
  ) {
    this.viewScene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 1.5);
    this.viewScene.add(key, this.rig);
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.flash.visible = false;
    this.scene.add(this.muzzleLight, this.blastLight);
    const tracerMaterial = new THREE.LineBasicMaterial({
      color: 0xffe0a0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < tracerCount; i++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geometry, tracerMaterial);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    const decalMaterial = new THREE.MeshBasicMaterial({
      map: radialTexture("rgba(10,10,10,0.95)", "rgba(30,30,30,0)"),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const decalGeometry = new THREE.PlaneGeometry(0.13, 0.13);
    for (let i = 0; i < decalCount; i++) {
      const decal = new THREE.Mesh(decalGeometry, decalMaterial);
      decal.visible = false;
      this.scene.add(decal);
      this.decals.push(decal);
    }
    const sparkSettings = {
      rate: 0,
      lifetime: 0.35,
      speed: 4.5,
      size: 0.05,
      endSize: 0.3,
      color: [1, 0.75, 0.35] as [number, number, number],
      endColor: [1, 0.3, 0.05] as [number, number, number],
      direction: [0, 1, 0] as [number, number, number],
      spread: 0.65,
      gravity: 9,
      shape: "Point" as const,
      shapeSize: 0,
      coneAngle: 0,
    };
    this.sparks = createEmitter(sparkSettings, 400);
    this.sparks.emitting = false;
    this.sparkPoints = makePoints(this.sparks);
    this.blood = createEmitter(
      { ...sparkSettings, lifetime: 0.5, speed: 2, size: 0.09, endSize: 1.6, color: [0.6, 0.04, 0.03], endColor: [0.25, 0.02, 0.02], gravity: 6 },
      200,
    );
    this.blood.emitting = false;
    this.bloodPoints = makePoints(this.blood);
    this.scene.add(this.sparkPoints, this.bloodPoints);
  }

  // Shows `model` (or nothing for "").
  equip(model: string) {
    if (model === this.currentName) return;
    this.currentName = model;
    if (this.current) this.rig.remove(this.current.group);
    this.current = undefined;
    if (!model) return;
    let viewmodel = this.models.get(model);
    if (!viewmodel) {
      viewmodel = buildViewmodel(model);
      this.models.set(model, viewmodel);
    }
    this.current = viewmodel;
    this.rig.add(viewmodel.group);
    viewmodel.muzzle.add(this.flash);
  }

  // The local player fired: kick the viewmodel and flash the muzzle.
  fire(recoil: number) {
    this.kickVelocity += 0.9 + recoil * 0.35;
    this.punch += THREE.MathUtils.degToRad(recoil) * 0.35;
    this.flashLife = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
    const scale = 0.12 + Math.random() * 0.06 + recoil * 0.015;
    this.flash.scale.set(scale, scale, scale);
  }

  // Where the muzzle is in the world, given the first-person camera.
  muzzleWorld(camera: THREE.Camera, target: THREE.Vector3): THREE.Vector3 {
    if (!this.current) return camera.getWorldPosition(target);
    this.rig.updateMatrixWorld(true);
    this.current.muzzle.getWorldPosition(target); // view space (the view camera sits at the origin)
    camera.updateMatrixWorld();
    return target.applyMatrix4(camera.matrixWorld);
  }

  // A world-space light flash at a muzzle (any shooter).
  muzzleFlashAt(point: THREE.Vector3) {
    this.muzzleLight.position.copy(point);
    this.muzzleLight.intensity = 8;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const slot = this.tracers[this.nextTracer]!;
    this.nextTracer = (this.nextTracer + 1) % tracerCount;
    const positions = slot.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    // Start a little way out so the line doesn't cover the muzzle flash.
    this.scratch.copy(to).sub(from);
    const length = this.scratch.length();
    if (length < 0.5) return;
    const start = from.clone().addScaledVector(this.scratch, 0.6 / length);
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    slot.line.visible = true;
    slot.life = 0.06;
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, flesh: boolean) {
    const emitter = flesh ? this.blood : this.sparks;
    emitter.origin = [point.x + normal.x * 0.02, point.y + normal.y * 0.02, point.z + normal.z * 0.02];
    emitter.settings.direction = [normal.x, normal.y, normal.z];
    burst(emitter, flesh ? 14 : 10);
    if (flesh) return;
    const decal = this.decals[this.nextDecal]!;
    this.nextDecal = (this.nextDecal + 1) % decalCount;
    decal.position.copy(point).addScaledVector(normal, 0.005);
    decal.lookAt(this.scratch.copy(point).add(normal));
    decal.rotateZ(Math.random() * Math.PI * 2);
    const scale = 0.7 + Math.random() * 0.6;
    decal.scale.set(scale, scale, 1);
    decal.visible = true;
  }

  explosion(point: THREE.Vector3, radius: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffa040,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.position.copy(point);
    mesh.scale.setScalar(0.1);
    this.scene.add(mesh);
    this.blasts.push({ mesh, life: 0.45, radius });
    this.blastLight.position.copy(point);
    this.blastLight.intensity = 60;
    this.sparks.origin = [point.x, point.y + 0.1, point.z];
    this.sparks.settings.direction = [0, 1, 0];
    burst(this.sparks, 60);
  }

  // The local player hit something with Health.
  hit(kill: boolean, headshot: boolean) {
    this.hitmarker = { life: kill ? 0.35 : 0.2, kill, headshot };
  }

  // The local player was hurt by something at `from` (world), facing `yaw`.
  hurt(from: THREE.Vector3, playerPosition: THREE.Vector3, yaw: number, amount: number) {
    const dx = from.x - playerPosition.x,
      dz = from.z - playerPosition.z;
    if (dx * dx + dz * dz > 0.01) {
      // 0 = straight ahead (-z at yaw 0), positive = to the right.
      const worldAngle = Math.atan2(dx, -dz);
      this.indicators.push({ angle: worldAngle + yaw, life: 1.4 });
      if (this.indicators.length > 8) this.indicators.shift();
    }
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.25 + amount / 60);
  }

  update(dt: number, input: ViewmodelInput | undefined, aspect: number) {
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
    this.punch *= Math.exp(-dt * 9);
    this.muzzleLight.intensity *= Math.exp(-dt * 60);
    this.blastLight.intensity *= Math.exp(-dt * 7);
    this.flashLife -= dt;
    this.flash.visible = this.flashLife > 0;
    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
    stepEmitter(this.sparks, dt);
    stepEmitter(this.blood, dt);
    for (const points of [this.sparkPoints, this.bloodPoints]) {
      points.geometry.getAttribute("position").needsUpdate = true;
      points.geometry.getAttribute("color").needsUpdate = true;
      points.geometry.getAttribute("size").needsUpdate = true;
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i]!;
      blast.life -= dt;
      const t = 1 - Math.max(0, blast.life) / 0.45;
      blast.mesh.scale.setScalar(Math.max(0.1, blast.radius * Math.sqrt(t)));
      (blast.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      if (blast.life <= 0) {
        this.scene.remove(blast.mesh);
        blast.mesh.geometry.dispose();
        (blast.mesh.material as THREE.Material).dispose();
        this.blasts.splice(i, 1);
      }
    }
    this.hitmarker.life -= dt;
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      this.indicators[i]!.life -= dt;
      if (this.indicators[i]!.life <= 0) this.indicators.splice(i, 1);
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.2);

    this.rig.visible = !!input && !!this.current;
    if (!input || !this.current) return;
    const model = this.current;
    // Recoil: a spring kicked by fire(), stepped at 240 Hz or finer. One
    // explicit step per frame goes unstable above about 1/20 s (a slow or
    // hitching frame), which flung the weapon away from the view.
    const substeps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      this.kickVelocity += (-160 * this.kick - 18 * this.kickVelocity) * h;
      this.kick += this.kickVelocity * h;
    }
    this.aimBlend += ((input.aiming ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-dt * 14));
    this.sprintBlend += ((input.sprinting && !input.aiming ? 1 : 0) - this.sprintBlend) * (1 - Math.exp(-dt * 8));
    // Sway lags behind look changes.
    if (this.lastLook) {
      const dyaw = Math.atan2(Math.sin(input.look.yaw - this.lastLook.yaw), Math.cos(input.look.yaw - this.lastLook.yaw));
      const dpitch = input.look.pitch - this.lastLook.pitch;
      this.sway.x = THREE.MathUtils.clamp(this.sway.x + dyaw * 0.5, -0.06, 0.06);
      this.sway.y = THREE.MathUtils.clamp(this.sway.y - dpitch * 0.5, -0.06, 0.06);
    }
    this.lastLook = { ...input.look };
    this.sway.multiplyScalar(Math.exp(-dt * 10));
    const moving = input.grounded && input.speed > 0.5 ? Math.min(input.speed / 4.5, 1.6) : 0;
    this.bobAmount += (moving - this.bobAmount) * (1 - Math.exp(-dt * 10));
    this.bobPhase += dt * (5.2 + input.speed * 0.9) * (moving > 0 ? 1 : 0);
    const steady = 1 - this.aimBlend * 0.85;
    const bobX = Math.cos(this.bobPhase) * 0.012 * this.bobAmount * steady;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.014 * this.bobAmount * steady;

    const ads = new THREE.Vector3(0, -model.sightHeight, model.hip.z + 0.05);
    const position = model.hip.clone().lerp(ads, this.aimBlend);
    position.x += bobX + this.sway.x * steady;
    position.y += bobY + this.sway.y * steady;
    position.z += this.kick * 0.035;
    let pitch = this.kick * 0.05 * (1 - this.aimBlend * 0.6);
    let yaw = 0;
    let roll = 0;
    // Sprinting tucks the weapon down and across.
    position.x -= this.sprintBlend * 0.05;
    position.y -= this.sprintBlend * 0.04;
    yaw += this.sprintBlend * 0.55;
    pitch -= this.sprintBlend * 0.25;
    if (input.reloadProgress >= 0) {
      const s = Math.sin(Math.PI * Math.min(1, input.reloadProgress));
      position.y -= s * 0.1;
      roll += s * 0.55;
      pitch -= s * 0.25;
    }
    if (input.equipProgress >= 0) {
      const down = 1 - Math.min(1, input.equipProgress);
      position.y -= down * 0.28;
      pitch -= down * 0.9;
    }
    this.rig.position.copy(position);
    this.rig.rotation.set(pitch, yaw, roll);
  }

  drawHud(ctx: CanvasRenderingContext2D, width: number, height: number, hud: CombatHud) {
    const cx = width / 2,
      cy = height / 2;
    ctx.save();
    // Hurt flash and low-health vignette.
    const lowHealth = hud.health >= 0 && hud.health < 0.35 ? (0.35 - hud.health) * 1.6 : 0;
    const vignette = Math.min(0.75, this.hurtFlash * 0.6 + lowHealth * (0.75 + 0.25 * Math.sin(performance.now() / 180)));
    if (vignette > 0.01) {
      const gradient = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.25, cx, cy, Math.max(width, height) * 0.7);
      gradient.addColorStop(0, "rgba(160,0,0,0)");
      gradient.addColorStop(1, `rgba(160,0,0,${vignette})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    // Crosshair: four lines whose gap follows the real spread cone.
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2;
    if (hud.aiming) {
      ctx.beginPath();
      ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const halfFov = THREE.MathUtils.degToRad(hud.fov) / 2;
      const gap = 3 + (Math.tan(THREE.MathUtils.degToRad(hud.spread)) / Math.tan(halfFov)) * (height / 2);
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        ctx.moveTo(cx + dx * gap, cy + dy * gap);
        ctx.lineTo(cx + dx * (gap + 8), cy + dy * (gap + 8));
      }
      ctx.stroke();
    }
    // Hit marker.
    if (this.hitmarker.life > 0) {
      const alpha = Math.min(1, this.hitmarker.life * 6);
      ctx.strokeStyle = this.hitmarker.kill
        ? `rgba(255,60,50,${alpha})`
        : this.hitmarker.headshot
          ? `rgba(255,210,60,${alpha})`
          : `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = this.hitmarker.kill ? 3 : 2;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        ctx.moveTo(cx + dx * 6, cy + dy * 6);
        ctx.lineTo(cx + dx * 13, cy + dy * 13);
      }
      ctx.stroke();
    }
    // Damage direction: a red arc toward the attacker.
    for (const indicator of this.indicators) {
      const alpha = Math.min(1, indicator.life);
      ctx.strokeStyle = `rgba(255,40,30,${0.85 * alpha})`;
      ctx.lineWidth = 6;
      const angle = indicator.angle - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 110, angle - 0.3, angle + 0.3);
      ctx.stroke();
    }
    // Reload progress under the crosshair.
    if (hud.reloadProgress >= 0) {
      ctx.fillStyle = "rgba(10,16,24,0.6)";
      ctx.fillRect(cx - 50, cy + 40, 100, 6);
      ctx.fillStyle = "#ffd36a";
      ctx.fillRect(cx - 50, cy + 40, 100 * Math.min(1, hud.reloadProgress), 6);
      ctx.font = "600 12px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#fff";
      ctx.fillText("RELOADING", cx, cy + 50);
    }
    // Ammo, bottom right.
    if (hud.weaponName) {
      const right = width - 28,
        bottom = height - 26;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = hud.magazine === 0 ? "#ff6b5a" : "#fff";
      ctx.font = "700 40px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      const reserve = hud.reserve < 0 ? "∞" : String(hud.reserve);
      ctx.font = "600 18px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      const reserveWidth = ctx.measureText(` / ${reserve}`).width;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(` / ${reserve}`, right, bottom);
      ctx.font = "700 40px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.fillStyle = hud.magazine === 0 ? "#ff6b5a" : "#fff";
      ctx.fillText(String(hud.magazine), right - reserveWidth, bottom);
      ctx.font = "600 13px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(hud.weaponName.toUpperCase(), right, bottom - 44);
      // Weapon slots.
      ctx.font = "600 11px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      hud.weaponNames.forEach((name, i) => {
        ctx.fillStyle = i === hud.slot ? "#ffd36a" : "rgba(255,255,255,0.5)";
        ctx.fillText(`${i + 1} ${name}`, right, bottom - 64 - (hud.weaponNames.length - 1 - i) * 15);
      });
    }
    // Health, bottom left.
    if (hud.health >= 0) {
      const x = 28,
        y = height - 40,
        w = 220;
      ctx.fillStyle = "rgba(10,16,24,0.6)";
      ctx.fillRect(x, y, w, 12);
      ctx.fillStyle = hud.health > 0.5 ? "#5fd35f" : hud.health > 0.25 ? "#ffb300" : "#ff4a3a";
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, hud.health)), 12);
      ctx.font = "700 14px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#fff";
      ctx.fillText(`HEALTH ${Math.round(hud.health * 100)}`, x, y - 4);
    }
    ctx.restore();
  }

  // Forget transient effects (Stop / a new Play).
  reset() {
    this.equip("");
    this.punch = 0;
    this.kick = this.kickVelocity = 0;
    this.lastLook = undefined;
    this.indicators.length = 0;
    this.hurtFlash = 0;
    this.hitmarker.life = 0;
    for (const tracer of this.tracers) {
      tracer.life = 0;
      tracer.line.visible = false;
    }
    for (const decal of this.decals) decal.visible = false;
    for (const blast of this.blasts) this.scene.remove(blast.mesh);
    this.blasts.length = 0;
    this.sparks.alive.fill(0);
    this.blood.alive.fill(0);
    this.muzzleLight.intensity = this.blastLight.intensity = 0;
  }
}

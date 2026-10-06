// Melee combat in the view (0.78.0): what a fighter's body does, and how a
// blow feels. The simulation (bridge_melee.cpp) owns every decision; this
// draws it:
//   - the martial-arts clip library (kit/people/combat_clips.glb), shared by
//     every fighter on the Quaternius skeleton and loaded the first time a
//     scene has one;
//   - each fighter's pose: its move's clip scrubbed in step with the
//     simulation (so the blow lands on the frame the hit is dealt), a guard
//     stance over strafing legs when it shuffles, reactions matched to the
//     kind of hit (head/body snaps, knockback, launches and air hits, the
//     fall, getting up), the held block, the death;
//   - impact: sparks and a flash where the blow lands, a ring for parries and
//     guard breaks, a shockwave under finishers, limb trails through the
//     active frames, hit-stop (both fighters freeze, the one hit shudders),
//     camera shake and slow motion for parries, perfect dodges, finishers
//     and knockouts;
//   - the fighter HUD: health, energy and guard, the combo count, the
//     lock-on marker.
import * as THREE from "three";
import { boneSubtree, filterClip, upperBodyBone } from "./characterRig";
import { FighterField, MeleeEventField } from "./bridgeFields";
import { buildRibbon, updateTrail, type TrailPoint } from "./trail";
import { ComicFx } from "./comicFx";

export const combatClipsPath = "./kit/people/combat_clips.glb";

// The simulation's fighter modes and hit kinds (engine::gameplay).
export const FighterMode = { idle: 0, move: 1, block: 2, stun: 3, airborne: 4, down: 5, getup: 6, dead: 7 } as const;
export const StunKind = { none: 0, light: 1, heavy: 2, launched: 3, knockdown: 4, guardBreak: 5, parried: 6 } as const;
export const MeleeEvent = { start: 0, hit: 1, blocked: 2, parried: 3, dodged: 4, guardBreak: 5, fire: 6, land: 7, ko: 8 } as const;
export const MeleeFlag = { finisher: 1, launch: 2, knockdown: 4, heavy: 8, killed: 16 } as const;

// What the view reads from the runtime.
export interface CombatHost {
  value(index: number, field: number): number; // editor_fighter_value
  text(index: number, move: number, field: number): string; // editor_fighter_text
  takeEvents(): number;
  event(index: number, field: number): number;
  playerIndex(): number;
  health(index: number): number; // 0..1, -1 without Health
  sound(at: THREE.Vector3 | undefined): CombatSounds | undefined;
  shake(intensity: number, seconds: number): void;
}
export interface CombatSounds {
  whoosh(heavy?: boolean, volume?: number): void;
  punch(heavy?: boolean, volume?: number): void;
  block(volume?: number): void;
  parry(volume?: number): void;
  bodyFall(volume?: number): void;
  energy(volume?: number): void;
}

// The clip a fighter shows when it isn't in a move.
export interface StancePick {
  clip: string;
  loop: boolean;
  // Legs only, with the guard held on the upper body.
  lower?: boolean;
}

// The stance for a free fighter: blocking, in the air, standing in guard,
// shuffling in guard (strafing toward the way it moves, relative to where
// it faces) or running.
export function pickStance(mode: number, speed: number, verticalSpeed: number, grounded: boolean, forward: number, right: number): StancePick {
  if (mode === FighterMode.block) return { clip: "block", loop: false };
  if (!grounded && Math.abs(verticalSpeed) > 1.5) return { clip: "jump_loop", loop: true };
  if (speed < 0.3) return { clip: "guard", loop: true };
  if (speed > 3.4) return { clip: speed > 5.5 ? "sprint" : "run", loop: true };
  if (Math.abs(forward) >= Math.abs(right)) return { clip: forward >= 0 ? "strafe_f" : "strafe_b", loop: true, lower: true };
  return { clip: right >= 0 ? "strafe_r" : "strafe_l", loop: true, lower: true };
}

// The reaction clip for a stunned fighter.
export function pickReaction(kind: number, alternate: boolean): string {
  switch (kind) {
    case StunKind.heavy:
      return "hit_knockback";
    case StunKind.guardBreak:
    case StunKind.parried:
      return "guard_break";
    case StunKind.knockdown:
      return "hit_knockback";
    default:
      return alternate ? "hit_chest" : "hit_head";
  }
}

let library: Promise<THREE.AnimationClip[]> | undefined;
// The clip library, loaded once.
export function loadCombatClips(load: (path: string) => Promise<{ animations: THREE.AnimationClip[] }>): Promise<THREE.AnimationClip[]> {
  library ??= load(combatClipsPath).then((gltf) => gltf.animations);
  library.catch(() => (library = undefined));
  return library;
}

type Action = THREE.AnimationAction;

interface Fighter {
  object: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  full: Map<string, Action>;
  lower: Map<string, Action>;
  guardUpper?: Action;
  playing: Set<Action>;
  pose: string;
  moveAction?: Action;
  moveDuration: number;
  moveSerial: number;
  lastMode: number;
  stunTotal: number;
  alternate: boolean;
  airHit: number; // seconds of an air-hit clip left
  limb?: THREE.Object3D;
  limbName: string;
  trail: TrailPoint[];
  trailMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  dead: boolean;
}

interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  age: number;
  color: THREE.Color;
}
interface Burst {
  mesh: THREE.Mesh | THREE.Sprite;
  age: number;
  life: number;
  grow: number;
  opacity: number;
}

const maxSparks = 400;
const trailLife = 0.16;
const fade = 0.1; // seconds between poses
const scratch = new THREE.Vector3();

function glowTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,240,200,0.8)");
  gradient.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CombatView {
  // Seconds of game time per real second (slow motion), for the caller's
  // simulation clock and mixers.
  timeScale = 1;
  private slowLeft = 0;
  private slowTarget = 1;
  private readonly fighters = new Map<number, Fighter>();
  private readonly group = new THREE.Group();
  private readonly sparks: Spark[] = [];
  private readonly sparkGeometry = new THREE.BufferGeometry();
  private readonly sparkPositions = new Float32Array(maxSparks * 3);
  private readonly sparkColors = new Float32Array(maxSparks * 3);
  private readonly bursts: Burst[] = [];
  private readonly glow = glowTexture();
  private comboShown = 0;
  // Manhwa lettering, speed lines and impact frames (on with the Manhwa style).
  readonly comic = new ComicFx();
  private comboAge = 9;

  constructor(
    scene: THREE.Scene,
    private readonly host: CombatHost,
  ) {
    this.sparkGeometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkGeometry.setAttribute("color", new THREE.BufferAttribute(this.sparkColors, 3));
    const points = new THREE.Points(
      this.sparkGeometry,
      new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    points.frustumCulled = false;
    this.group.add(points);
    scene.add(this.group);
  }

  // Whether the view drives this fighter's body (its clips are attached).
  has(index: number): boolean {
    return this.fighters.has(index);
  }

  isFighter(index: number): boolean {
    return this.host.value(index, FighterField.has) === 1;
  }

  // The Player's locked-on target, or -1.
  lockTarget(): number {
    const player = this.host.playerIndex();
    return player >= 0 ? this.host.value(player, FighterField.lockTarget) : -1;
  }

  // Readies a fighter's body: the library's clips join its own, and the
  // guard (upper body) and strafing legs become their own layers.
  attach(index: number, object: THREE.Object3D, mixer: THREE.AnimationMixer, actions: Map<string, Action>, clips: THREE.AnimationClip[], current?: string) {
    this.detach(index);
    for (const clip of clips) if (!actions.has(clip.name)) actions.set(clip.name, mixer.clipAction(clip));
    const upper = boneSubtree(object, upperBodyBone);
    const lower = new Map<string, Action>();
    let guardUpper: Action | undefined;
    if (upper.size) {
      for (const name of ["strafe_f", "strafe_b", "strafe_l", "strafe_r"]) {
        const clip = clips.find((c) => c.name === name);
        if (clip) lower.set(name, mixer.clipAction(filterClip(clip, upper, false)));
      }
      const guard = clips.find((c) => c.name === "guard");
      if (guard) guardUpper = mixer.clipAction(filterClip(guard, upper, true));
    }
    const trailMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(index === this.host.playerIndex() ? 0x9fe8ff : 0xffa070) } },
        vertexShader: `attribute float fade; varying float vFade;
          void main() { vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 color; varying float vFade;
          void main() { gl_FragColor = vec4(color * vFade * 0.8, 1.0); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    trailMesh.frustumCulled = false;
    this.group.add(trailMesh);
    const playing = new Set<Action>();
    const resting = current ? actions.get(current) : undefined;
    if (resting) playing.add(resting);
    this.fighters.set(index, {
      object,
      mixer,
      full: actions,
      lower,
      guardUpper,
      playing,
      pose: current ?? "",
      moveDuration: 0.6,
      moveSerial: 0,
      lastMode: -1,
      stunTotal: 0.4,
      alternate: false,
      airHit: 0,
      limbName: "",
      trail: [],
      trailMesh,
      dead: false,
    });
  }

  detach(index: number) {
    const fighter = this.fighters.get(index);
    if (!fighter) return;
    this.group.remove(fighter.trailMesh);
    fighter.trailMesh.geometry.dispose();
    fighter.trailMesh.material.dispose();
    this.fighters.delete(index);
  }

  // Everything back to rest (Play stopped, or a rebuild).
  reset() {
    for (const index of [...this.fighters.keys()]) this.detach(index);
    this.sparks.length = 0;
    for (const burst of this.bursts) this.group.remove(burst.mesh);
    this.bursts.length = 0;
    this.timeScale = 1;
    this.slowLeft = 0;
    this.comboShown = 0;
    this.comic.clear();
  }

  // True once the fighter has played its own death (the caller skips its
  // generic death clip then).
  diedInCombat(index: number): boolean {
    return this.fighters.get(index)?.dead ?? false;
  }

  private setPose(fighter: Fighter, key: string, actions: Action[], blend = fade) {
    if (fighter.pose === key) return;
    fighter.pose = key;
    for (const action of actions) {
      if (!fighter.playing.has(action) || action.getEffectiveWeight() < 0.999) {
        action.stopFading();
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        if (!fighter.playing.has(action)) action.reset();
        action.fadeIn(blend).play();
      }
    }
    for (const action of fighter.playing) if (!actions.includes(action)) action.fadeOut(blend);
    fighter.playing = new Set(actions);
  }

  private once(action: Action, clamp = true) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = clamp;
    return action;
  }

  private loop(action: Action) {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    return action;
  }

  // One fixed-tick batch: picks the fighter's pose. `speed` is its ground
  // speed (m/s), `verticalSpeed` its climb.
  tick(index: number, speed: number, verticalSpeed: number, velocity: THREE.Vector3) {
    const fighter = this.fighters.get(index);
    if (!fighter) return;
    const host = this.host;
    const mode = host.value(index, FighterField.mode);
    const get = (name: string) => fighter.full.get(name);
    const entering = mode !== fighter.lastMode;
    fighter.lastMode = mode;
    switch (mode) {
      case FighterMode.move: {
        const move = host.value(index, FighterField.move);
        const clip = host.text(index, -1, 1);
        const action = get(clip) ?? get("jab");
        if (!action) break;
        const key = `move:${move}:${fighter.moveSerial}`;
        if (fighter.pose !== key) {
          this.once(action);
          action.setEffectiveTimeScale(0);
          fighter.moveAction = action;
          fighter.limbName = host.text(index, -1, 2);
          fighter.limb = fighter.object.getObjectByName(fighter.limbName) ?? undefined;
          // A chain from the same clip (power hook after hook) restarts it.
          if (fighter.playing.has(action)) {
            fighter.playing.delete(action);
            action.stop();
          }
          this.setPose(fighter, key, [action], 0.07);
          action.setEffectiveTimeScale(0);
        }
        break;
      }
      case FighterMode.stun: {
        if (entering) {
          fighter.stunTotal = Math.max(0.15, host.value(index, FighterField.stunLeft) + 1 / 60);
          fighter.alternate = !fighter.alternate;
        }
        const name = pickReaction(host.value(index, FighterField.stunKind), fighter.alternate);
        const action = get(name);
        if (action && (entering || !fighter.pose.startsWith("stun:"))) {
          this.once(action);
          fighter.pose = "";
          this.setPose(fighter, `stun:${name}:${fighter.moveSerial++}`, [action], 0.05);
          // Fit the clip to the stun.
          action.setEffectiveTimeScale(Math.max(0.6, Math.min(2.5, action.getClip().duration / fighter.stunTotal)));
        }
        break;
      }
      case FighterMode.airborne: {
        if (fighter.airHit > 0) break;
        const rising = verticalSpeed > 0.5 && host.value(index, FighterField.time) < 0.6;
        const name = rising ? "launched" : "air_loop";
        const action = get(name);
        if (action) this.setPose(fighter, `air:${name}`, [rising ? this.once(action) : this.loop(action)], 0.12);
        break;
      }
      case FighterMode.down: {
        const action = get("fall_impact");
        if (action) this.setPose(fighter, "down", [this.once(action)], 0.08);
        break;
      }
      case FighterMode.getup: {
        const name = host.value(index, FighterField.stunKind) === StunKind.knockdown && fighter.alternate ? "kip_up" : "get_up";
        const action = get(name) ?? get("get_up");
        if (action && fighter.pose !== "getup") {
          this.setPose(fighter, "getup", [this.once(action)], 0.15);
          action.setEffectiveTimeScale(action.getClip().duration / 0.9);
        }
        break;
      }
      case FighterMode.dead: {
        const action = get("death");
        if (action && fighter.pose !== "dead") {
          this.setPose(fighter, "dead", [this.once(action)], 0.12);
          fighter.dead = true;
        }
        break;
      }
      default: {
        // Free: block, jump, guard, shuffle or run.
        const yaw = fighter.object.rotation.y;
        const forward = velocity.x * Math.sin(yaw) + velocity.z * Math.cos(yaw);
        // The fighter's right is -x in its own frame (it faces +z).
        const right = -(velocity.x * Math.cos(yaw) - velocity.z * Math.sin(yaw));
        const grounded = Math.abs(verticalSpeed) < 1.5;
        const stance = pickStance(mode, speed, verticalSpeed, grounded, forward, right);
        if (stance.lower) {
          const legs = fighter.lower.get(stance.clip);
          if (legs && fighter.guardUpper) {
            this.setPose(fighter, `lower:${stance.clip}`, [this.loop(legs), this.loop(fighter.guardUpper)], 0.15);
            legs.setEffectiveTimeScale(Math.max(0.6, Math.min(1.6, speed / 1.4)));
            break;
          }
        }
        const action = get(stance.clip) ?? get("guard") ?? get("idle");
        if (!action) break;
        if (stance.clip === "block") {
          this.setPose(fighter, "block", [this.once(action)], 0.06);
          action.setEffectiveTimeScale(2);
        } else {
          this.setPose(fighter, `free:${stance.clip}`, [stance.loop ? this.loop(action) : this.once(action)], 0.15);
          if (stance.clip === "run" || stance.clip === "sprint") action.setEffectiveTimeScale(1);
        }
      }
    }
  }

  // Melee events since the last call: sounds, effects, slow motion.
  events(objects: readonly (THREE.Object3D | undefined)[]) {
    const host = this.host;
    const count = host.takeEvents();
    const player = host.playerIndex();
    for (let e = 0; e < count; e++) {
      const kind = host.event(e, MeleeEventField.kind);
      const attacker = host.event(e, MeleeEventField.attacker);
      const target = host.event(e, MeleeEventField.target);
      const flags = host.event(e, MeleeEventField.flags);
      const value = host.event(e, MeleeEventField.value);
      const point = new THREE.Vector3(host.event(e, MeleeEventField.x), host.event(e, MeleeEventField.y), host.event(e, MeleeEventField.z));
      const heavy = (flags & (MeleeFlag.heavy | MeleeFlag.launch | MeleeFlag.knockdown | MeleeFlag.finisher)) !== 0;
      const involved = attacker === player || target === player;
      switch (kind) {
        case MeleeEvent.start: {
          const fighter = this.fighters.get(attacker);
          if (fighter) {
            fighter.moveSerial++;
            fighter.moveDuration = Math.max(0.05, value);
            fighter.trail.length = 0;
          }
          host.sound(point)?.whoosh((flags & MeleeFlag.finisher) !== 0, 0.8);
          break;
        }
        case MeleeEvent.hit: {
          const killed = (flags & MeleeFlag.killed) !== 0;
          const finisher = (flags & MeleeFlag.finisher) !== 0;
          this.impact(point, heavy ? 1.6 : 1, new THREE.Color(1, 0.85, 0.55));
          this.comic.hit(finisher || killed ? "finisher" : heavy ? "heavy" : "light", point);
          host.sound(point)?.punch(heavy, 1);
          if (involved) host.shake(finisher || killed ? 0.12 : heavy ? 0.07 : 0.035, finisher ? 0.35 : 0.18);
          if (finisher || killed) {
            this.slow(0.3, killed ? 0.7 : 0.45);
            this.shockwave(new THREE.Vector3(point.x, (objects[target]?.position.y ?? point.y) - 0.85, point.z), 3);
          }
          // A juggled target flinches in the air.
          const struck = this.fighters.get(target);
          if (struck && host.value(target, FighterField.mode) === FighterMode.airborne) {
            const name = struck.alternate ? "air_hit_l" : "air_hit_r";
            struck.alternate = !struck.alternate;
            const action = struck.full.get(name);
            if (action) {
              struck.pose = "";
              this.setPose(struck, `airhit:${struck.moveSerial++}`, [this.once(action)], 0.04);
              struck.airHit = action.getClip().duration * 0.8;
            }
          }
          if (attacker === player && !killed) this.combo(host.value(player, FighterField.combo));
          break;
        }
        case MeleeEvent.blocked:
          this.impact(point, 0.7, new THREE.Color(0.55, 0.75, 1));
          this.comic.hit("block", point);
          host.sound(point)?.block();
          if (involved) host.shake(0.025, 0.12);
          break;
        case MeleeEvent.parried:
          this.ring(point, new THREE.Color(1, 0.85, 0.3), 1.4);
          this.comic.hit("parry", point);
          host.sound(point)?.parry();
          this.slow(0.35, 0.4);
          if (involved) host.shake(0.05, 0.2);
          break;
        case MeleeEvent.dodged:
          // A perfect dodge: the Player slips a blow in its i-frames.
          if (target === player) {
            this.slow(0.45, 0.35);
            this.comic.hit("dodge", objects[player]?.position.clone().add(new THREE.Vector3(0, 1.2, 0)) ?? point);
            host.sound(point)?.whoosh(false, 0.5);
          }
          break;
        case MeleeEvent.guardBreak:
          this.ring(point, new THREE.Color(1, 1, 1), 1.8);
          this.comic.hit("guardBreak", point);
          this.impact(point, 1.4, new THREE.Color(0.7, 0.85, 1));
          host.sound(point)?.punch(true);
          if (involved) host.shake(0.08, 0.25);
          break;
        case MeleeEvent.fire:
          this.ring(point, new THREE.Color(0.5, 0.8, 1), 0.8);
          this.comic.hit("blast", point);
          host.sound(point)?.energy();
          break;
        case MeleeEvent.land: {
          const at = objects[attacker]?.position ?? point;
          this.shockwave(new THREE.Vector3(at.x, at.y - 0.85, at.z), 1.2, new THREE.Color(0.75, 0.7, 0.6));
          host.sound(at)?.bodyFall();
          break;
        }
      }
    }
  }

  // Every frame: moves scrubbed with the simulation, hit-stop and the
  // shudder, trails and effects. `alpha` is how far into the next tick the
  // frame is; `realDt` is unscaled by slow motion.
  frame(realDt: number, alpha: number, camera: THREE.Camera) {
    const host = this.host;
    this.comic.update(realDt);
    // Slow motion eases back to full speed.
    if (this.slowLeft > 0) {
      this.slowLeft -= realDt;
      this.timeScale += (this.slowTarget - this.timeScale) * (1 - Math.exp(-realDt * 30));
    } else this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-realDt * 8));
    if (Math.abs(1 - this.timeScale) < 0.01 && this.slowLeft <= 0) this.timeScale = 1;
    const dt = realDt * this.timeScale;
    for (const [index, fighter] of this.fighters) {
      const mode = host.value(index, FighterField.mode);
      const frozen = host.value(index, FighterField.hitstop) > 0;
      fighter.mixer.timeScale = frozen ? 0 : 1;
      if (fighter.airHit > 0) fighter.airHit -= dt;
      // The move's clip follows the simulation's clock exactly.
      if (mode === FighterMode.move && fighter.moveAction) {
        const progress = host.value(index, FighterField.progress);
        const ahead = frozen ? 0 : alpha / 60 / fighter.moveDuration;
        const clip = fighter.moveAction.getClip();
        fighter.moveAction.time = Math.min(clip.duration - 1e-3, Math.min(1, progress + ahead) * clip.duration);
      }
      // The one taking the blow shudders through the hit-stop.
      if (frozen && (mode === FighterMode.stun || mode === FighterMode.airborne)) {
        fighter.object.position.x += (Math.random() - 0.5) * 0.06;
        fighter.object.position.z += (Math.random() - 0.5) * 0.06;
      }
      // A ribbon behind the striking limb while the blow is live.
      const active = host.value(index, FighterField.active) === 1 || (mode === FighterMode.move && fighter.trail.length > 0 && fighter.trail[fighter.trail.length - 1]!.age < trailLife);
      if (active && fighter.limb && mode === FighterMode.move && host.value(index, FighterField.active) === 1) {
        fighter.limb.getWorldPosition(scratch);
        updateTrail(fighter.trail, scratch, dt, trailLife, 0.02);
      } else if (fighter.trail.length) {
        for (const p of fighter.trail) p.age += dt;
        while (fighter.trail.length && fighter.trail[0]!.age > trailLife) fighter.trail.shift();
      }
      const ribbon = buildRibbon(fighter.trail, camera.position, 0.16, trailLife);
      const geometry = fighter.trailMesh.geometry;
      geometry.setAttribute("position", new THREE.BufferAttribute(ribbon.positions, 3));
      geometry.setAttribute("fade", new THREE.BufferAttribute(ribbon.fades, 1));
      geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
    }
    this.stepEffects(dt, camera);
    this.comboAge += realDt;
  }

  // Slows the game to `scale` for `seconds` of real time.
  slow(scale: number, seconds: number) {
    this.slowTarget = this.slowLeft > 0 ? Math.min(this.slowTarget, scale) : scale;
    this.slowLeft = Math.max(this.slowLeft, seconds);
  }

  private combo(count: number) {
    if (count >= 2) {
      this.comboShown = count;
      this.comboAge = 0;
    }
  }

  private impact(point: THREE.Vector3, size: number, color: THREE.Color) {
    const n = Math.round(14 * size);
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= maxSparks) this.sparks.shift();
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize();
      this.sparks.push({
        position: point.clone(),
        velocity: direction.multiplyScalar(3 + Math.random() * 5 * size),
        life: 0.18 + Math.random() * 0.22,
        age: 0,
        color: color.clone().multiplyScalar(0.8 + Math.random() * 0.4),
      });
    }
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    flash.position.copy(point);
    flash.scale.setScalar(0.35 * size);
    this.group.add(flash);
    this.bursts.push({ mesh: flash, age: 0, life: 0.12, grow: 4 * size, opacity: 1 });
  }

  private ring(point: THREE.Vector3, color: THREE.Color, size: number) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    ring.position.copy(point);
    ring.userData.faceCamera = true;
    ring.scale.setScalar(0.2);
    this.group.add(ring);
    this.bursts.push({ mesh: ring, age: 0, life: 0.3, grow: 6 * size, opacity: 0.9 });
  }

  private shockwave(point: THREE.Vector3, size: number, color = new THREE.Color(1, 0.8, 0.5)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(point).add(new THREE.Vector3(0, 0.05, 0));
    ring.scale.setScalar(0.3);
    this.group.add(ring);
    this.bursts.push({ mesh: ring, age: 0, life: 0.45, grow: 2.2 * size, opacity: 0.8 });
  }

  private stepEffects(dt: number, camera: THREE.Camera) {
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i]!;
      spark.age += dt;
      if (spark.age >= spark.life) {
        this.sparks.splice(i, 1);
        continue;
      }
    }
    for (const spark of this.sparks) {
      spark.velocity.y -= 9 * dt;
      spark.velocity.multiplyScalar(Math.exp(-4 * dt));
      spark.position.addScaledVector(spark.velocity, dt);
      const fadeOut = 1 - spark.age / spark.life;
      this.sparkPositions.set([spark.position.x, spark.position.y, spark.position.z], n * 3);
      this.sparkColors.set([spark.color.r * fadeOut, spark.color.g * fadeOut, spark.color.b * fadeOut], n * 3);
      n++;
    }
    this.sparkGeometry.setDrawRange(0, n);
    (this.sparkGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!;
      burst.age += dt;
      const t = burst.age / burst.life;
      if (t >= 1) {
        this.group.remove(burst.mesh);
        burst.mesh.geometry.dispose();
        (burst.mesh.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      burst.mesh.scale.addScalar(burst.grow * dt);
      (burst.mesh.material as THREE.MeshBasicMaterial).opacity = burst.opacity * (1 - t);
      if (burst.mesh.userData.faceCamera) burst.mesh.quaternion.copy(camera.quaternion);
    }
  }

  // The fighter HUD for the Player: health, energy and guard bars, the combo
  // counter and a marker over the locked-on target. `project` maps a world
  // point to the canvas (undefined behind the camera). Returns lines for the
  // screen-reader mirror.
  drawHud(ctx: CanvasRenderingContext2D, width: number, height: number, project: (point: THREE.Vector3) => { x: number; y: number } | undefined, objects: readonly (THREE.Object3D | undefined)[]): string[] {
    const host = this.host;
    this.comic.draw(ctx, width, height, project);
    const player = host.playerIndex();
    if (player < 0 || !this.isFighter(player)) return [];
    const lines: string[] = [];
    const health = Math.max(0, host.health(player));
    const energy = host.value(player, FighterField.energy);
    const guard = host.value(player, FighterField.guard);
    const x = 24,
      y = height - 76,
      w = Math.min(320, width * 0.32);
    const bar = (top: number, h: number, ratio: number, fill: string, label: string) => {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - 2, top - 2, w + 4, h + 4);
      ctx.fillStyle = fill;
      ctx.fillRect(x, top, w * Math.max(0, Math.min(1, ratio)), h);
      ctx.font = "700 11px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(label, x + w + 10, top + h / 2);
    };
    bar(y, 14, health, health > 0.3 ? "#5fd16a" : "#e2483c", "HP");
    bar(y + 22, 9, energy, energy >= 0.7 ? "#ffd84a" : "#4ab8ff", "ENERGY");
    bar(y + 37, 6, guard, "#c9d3e6", "GUARD");
    lines.push(`Health ${Math.round(health * 100)}%, energy ${Math.round(energy * 100)}%, guard ${Math.round(guard * 100)}%`);
    // Combo counter, fading a moment after the string ends.
    if (this.comboShown >= 2 && this.comboAge < 1.4) {
      const alpha = Math.min(1, 1.4 - this.comboAge);
      const pop = 1 + Math.max(0, 0.25 - this.comboAge) * 1.6;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(width - 40, height * 0.38);
      ctx.scale(pop, pop);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = "900 44px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.fillStyle = this.comboShown >= 8 ? "#ff6a3a" : this.comboShown >= 5 ? "#ffd84a" : "#ffffff";
      ctx.strokeText(`${this.comboShown}`, 0, 0);
      ctx.fillText(`${this.comboShown}`, 0, 0);
      ctx.font = "800 14px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      ctx.strokeText("HITS", 0, 30);
      ctx.fillText("HITS", 0, 30);
      ctx.restore();
      lines.push(`${this.comboShown} hit combo`);
    }
    // Lock-on marker.
    const lock = this.lockTarget();
    const target = lock >= 0 ? objects[lock] : undefined;
    if (target) {
      const at = project(target.position.clone().add(new THREE.Vector3(0, 0.1, 0)));
      if (at) {
        const spin = performance.now() / 600;
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(spin);
        ctx.strokeStyle = "rgba(255,90,70,0.95)";
        ctx.lineWidth = 2.5;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(0, 0, 18, k * (Math.PI / 2) + 0.25, k * (Math.PI / 2) + Math.PI / 2 - 0.25);
          ctx.stroke();
        }
        ctx.restore();
        lines.push("Locked on");
      }
    }
    return lines;
  }
}

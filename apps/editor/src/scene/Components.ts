export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export interface TransformComponent {
  position: Vec3;
}
export interface RotationComponent {
  euler: Vec3;
}
export interface ScaleComponent {
  value: Vec3;
}
export interface VelocityComponent {
  value: Vec3;
}
export interface AccelerationComponent {
  value: Vec3;
}
export interface RigidBodyComponent {
  mass: number;
  inverseMass: number;
  dynamic: boolean;
}
export interface ColliderComponent {
  type: "AABB" | "Sphere";
  halfExtents: Vec3;
  radius: number;
}
export interface HealthComponent {
  current: number;
  maximum: number;
}
export type AIStateName =
  | "Idle"
  | "Walking"
  | "Running"
  | "Driving"
  | "Fleeing"
  | "Chasing"
  | "Dead";
export interface AIStateComponent {
  state: AIStateName;
}
export interface PedestrianComponent {
  archetype: number;
}
// Lua source defining an on_tick(dt) function this entity runs every fixed
// tick, driving its own velocity — see engine::script::Runtime's own doc
// comment (include/engine/script/script.hpp) for exactly what a script can
// and can't do (self.x/y/z read-only, self.vx/vy/vz read-write, a sandboxed
// VM with no io/os/package/debug and an instruction-count watchdog).
export interface ScriptComponent {
  source: string;
}
export interface VehicleComponent {
  archetype: number;
}
// clip names a clip on the entity's own animated Renderable model (e.g.
// "idle"/"walk"/"wave") -- "" means no authored override, so main.ts's
// automatic ground-speed-based clip selection (animationClips.ts's
// pickClipName) picks instead. Unlike Sound.clip, this can't be a catalog
// index: every animated model has its own, differently-named clip set.
export interface AnimationStateComponent {
  clip: string;
  time: number;
  looping: boolean;
}
export interface RenderableComponent {
  mesh: number;
  material: number;
  visible: boolean;
}
// A clip from soundCatalog.ts, played through the Web Audio API starting when
// Play mode begins (and stopped when it ends) if autoplay is set -- the same
// Play-mode-scoped lifecycle Script's on_tick and AIAgent already run under.
// Not an event-triggered one-shot system (no "play this when melee lands"):
// that needs the bridge to expose which tick a combat/collision event
// actually fired, which this round doesn't add. loop keeps it playing for
// the whole Play session (an engine hum, a force-field drone); without loop
// it plays once at Play start and then stops on its own.
export interface SoundComponent {
  clip: number;
  volume: number;
  loop: boolean;
  autoplay: boolean;
}
// A real light source, not just a static ambience/sun -- main.ts's rebuild()
// spawns an actual THREE.PointLight/SpotLight/DirectionalLight as a child of
// this entity's own object, so it moves with Transform like everything else,
// and Play-mode/Edit-mode both see it live (no Play-only lifecycle, unlike
// Script/Sound -- a light is as "always on" as the entity itself). color is
// 0-1 RGB, matching THREE.Color's own component range, not 0-255 or a hex
// string, so it round-trips through save/load as plain finite numbers like
// every other Vec3 field. range is Point/Spot-only (THREE's own
// distance-cutoff meaning: 0 is "no cutoff, falls off forever"); angle is
// Spot-only (radians, the cone half-angle) -- both are stored and validated
// unconditionally, the same "meaningless but harmless off-type" pattern
// Collider's shape-specific fields already use, rather than threading a type
// check through validation just to leave one of two numbers unset.
export type LightType = "Point" | "Spot" | "Directional";
export interface LightComponent {
  type: LightType;
  color: Vec3;
  intensity: number;
  range: number;
  angle: number;
}
// A lightweight, non-collidable particle emitter -- main.ts's rebuild()
// spawns an actual THREE.Points system as a sibling of this entity's mesh and
// Light (same always-visible anchor those live under, see main.ts's own doc
// comment on `anchor`), simulated every frame in both Edit and Play mode, the
// same "as always-on as the entity itself" precedent Light already set (no
// Play-only lifecycle like Script/Sound). preset picks the emission shape/
// motion (a fixed small table in main.ts: initial direction bias, spread, and
// gravity/buoyancy) -- not itself authored per-field, the same "type picks
// the behavior, the rest are generic knobs" split LightComponent.type uses.
// color is 0-1 RGB like Light.color; particles render additively and fade by
// darkening toward black as they age, so a fully-aged particle contributes
// nothing rather than needing a separate alpha channel or a custom shader.
export type ParticlePreset = "Sparkle" | "Smoke" | "Fire" | "Confetti";
export interface ParticlesComponent {
  preset: ParticlePreset;
  color: Vec3;
  rate: number;
  lifetime: number;
  speed: number;
  size: number;
}
export interface NameComponent {
  value: string;
}
export interface ParentComponent {
  entity: EntityRef;
}
// Marks this entity as an instance of a named prefab (see Scene's own
// prefabableComponentNames/PrefabDefinition doc comment for exactly which
// component types a prefab can define and how an instance's data resolves).
// Never itself prefab-defined -- an instance can't be an instance of an
// instance.
export interface PrefabInstanceComponent {
  prefab: string;
}
// A marker, not a data component: its presence, not any field on it, is what
// WASD/jump input in Play mode drives. Authoring is responsible for keeping
// this to at most one entity — nothing here enforces that.
export type PlayerComponent = Record<string, never>;

export interface EntityRef {
  index: number;
  generation: number;
}

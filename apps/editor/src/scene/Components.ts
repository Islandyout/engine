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
export interface AnimationStateComponent {
  clip: number;
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

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
export interface NameComponent {
  value: string;
}
export interface ParentComponent {
  entity: EntityRef;
}
// A marker, not a data component: its presence, not any field on it, is what
// WASD/jump input in Play mode drives. Authoring is responsible for keeping
// this to at most one entity — nothing here enforces that.
export type PlayerComponent = Record<string, never>;

export interface EntityRef {
  index: number;
  generation: number;
}

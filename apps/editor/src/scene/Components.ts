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
  // Non-solid: reports overlaps (Lua on_trigger_enter/exit) instead of blocking.
  isTrigger: boolean;
  // 0..31. Two colliders interact only when each one's mask has the other's layer bit.
  layer: number;
  // 32-bit layer bitmask; 4294967295 (every bit) collides with every layer.
  mask: number;
  // 0..1: fraction of into-surface speed reflected on contact.
  bounciness: number;
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
// Screen-space UI -- a HUD/menu element, not a 3D object: rendered on the
// existing 2D HUD canvas (main.ts's drawHud(), previously Health bars only)
// at a fixed screen anchor, never projected from this entity's own Transform
// the way a Health bar is. An entity carrying UI still gets the usual
// placeholder box in the 3D viewport like any other component combination
// that has no inherent 3D appearance (a Script-only or Sound-only entity
// already works the same way) -- author Renderable.visible: false on it if
// that's unwanted, rather than this component silently special-casing it.
// kind picks Text (label only) or Button (clickable; fires only while
// doc.mode is "play" or "pause", never "edit", so authoring a scene can
// never accidentally trigger one).
//
// action is a fixed, small vocabulary (Restart/Resume/Pause/Quit-to-edit),
// not an arbitrary JSON command like the Authoring Console's own text box
// takes -- deliberately, not for lack of trying: EditorDocument.execute()
// unconditionally rejects every command while doc.mode isn't "edit" (so
// simulation state -- the native runtime, objects[]/animStates[]' own
// per-entity indexing -- can't be corrupted by a scene mutation arriving
// mid-Play), which a real click-through-to-command test caught: a Button
// clickable only in Play/Pause could therefore never fire a command that
// actually does anything. Each action instead reuses the exact same,
// already-correct code the Play/Pause/Stop transport buttons themselves run
// (main.ts's own doc comment on `action` has the mapping), the same way
// those buttons already safely take a scene through a mode transition
// without going through doc.execute() at all. Stored and validated
// unconditionally even for a Text element that never reads it, the same
// "meaningless but harmless off-type field" pattern Collider's shape-specific
// fields already use. visibleWhen controls which of Edit/Play/Pause the
// element renders in: "always" (Edit included, so an author sees where it
// lands without pressing Play), "play", or "pause" (e.g. a pause menu that
// isn't there the rest of the time).
export type UIKind = "Text" | "Button";
export type UIAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type UIVisibility = "always" | "play" | "pause";
export type UIAction = "restart" | "resume" | "pause" | "quit";
export interface UIComponent {
  kind: UIKind;
  text: string;
  anchor: UIAnchor;
  visibleWhen: UIVisibility;
  action: UIAction;
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

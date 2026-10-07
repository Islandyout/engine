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
  // Values for the props the source declares with `-- @prop name default`
  // (see scriptProps.ts); always reconciled against the source on load/edit.
  props: Record<string, number | boolean | string>;
}
// model "Classic" is the original constant-turn-rate drive on a Player
// (archetype picks its tuning); "Arcade" (0.70.0) is engine::gameplay car
// dynamics -- grip, drifting, handbrake, nitro, gears -- driven by the
// Player or by a Driver. Speeds m/s, accelerations m/s^2, grip in g.
export type VehicleModel = "Classic" | "Arcade";
export interface VehicleComponent {
  archetype: number;
  model: VehicleModel;
  topSpeed: number;
  acceleration: number;
  braking: number;
  grip: number;
  driftGrip: number; // 0..1: grip kept while drifting / on the handbrake
  steering: number; // full-lock wheel angle, degrees
  nitroBoost: number;
  nitroSeconds: number;
  gears: number;
}
// An AI driver for an Arcade Vehicle (0.70.0): races along `route`
// ("x,z x,z ..."), chases `target` (an entity Name; "" = the Player) in
// Pursuit, or cruises the route as Traffic, braking for cars ahead.
export type DriverMode = "Off" | "Race" | "Pursuit" | "Traffic";
export interface DriverComponent {
  mode: DriverMode;
  route: string;
  loop: boolean;
  target: string;
  skill: number; // 0..1
  aggression: number; // 0..1
  speedScale: number;
}
// Many copies of catalog models from one entity (0.70.0): one per line,
// "model x z [yaw degrees] [scale] [solid]", positions relative to the
// entity. Drawn instanced in chunks; "solid" ones collide with their full
// footprint. For cities: road tiles, buildings, street furniture.
export interface ModelInstancesComponent {
  instances: string;
}
// A star system to fly through (0.71.0). `bodies` is one planet or moon per
// line: "name parent orbitRadius period phase inclination radius gravity
// atmosphereHeight atmosphereDensity terrainAmplitude terrainScale seed
// color haze" -- parent "-" for the star, metres/seconds/degrees, colors as
// #rrggbb. Authored entities sit around a site on `siteBody` at the given
// latitude/longitude (+y up, out of the planet); the ground is flattened
// within siteRadius and walkable within evaRange.
export interface SpaceSystemComponent {
  bodies: string;
  starGm: number;
  starColor: Vec3;
  siteBody: string;
  siteLatitude: number;
  siteLongitude: number;
  siteRadius: number;
  evaRange: number;
  startTime: number;
  // Surface landmarks, one per line: "body latitude longitude #color label"
  // -- beacons seen from orbit and marked on the flight HUD.
  landmarks: string;
  // Species to find on the bodies (0.72.0), one per line: "id body class
  // model weight scale Name | description" -- class flora, mineral or
  // fauna; flora and minerals are scattered (catalog model, relative
  // weight, size) around wherever you walk, and all can be scanned.
  species: string;
}
// The ship the SpaceSystem flies (0.71.0). kg, N, rad/s^2 (rcs), degrees/s
// (maxRate), tank units and units/s (burn). startOrbit >= 0 starts in orbit
// that high above the site body; otherwise landed where authored.
export interface SpaceshipComponent {
  mass: number;
  thrust: number;
  liftThrust: number;
  rcs: number;
  maxRate: number;
  fuel: number;
  burn: number;
  hull: number;
  gearClearance: number;
  startPiloting: boolean;
  startOrbit: number;
  // "Kestrel" draws the built-in survey ship over the entity (its own mesh
  // is hidden); "" keeps the authored look.
  model: string;
}
// Something the scanner can study (0.72.0): hold F facing it within range
// and a scan completes, calling on_ui("scan", id) in every script.
export type ScanKind = "Flora" | "Fauna" | "Mineral" | "Culture" | "Landmark";
export interface ScannableComponent {
  id: string;
  name: string;
  kind: ScanKind;
  range: number;
}
// A second (third, ...) place in a SpaceSystem scene (0.73.0): its child
// entities are authored around this surface point (metres, +y up, the
// Site entity at the origin) and only exist -- solid and drawn -- while the
// frame is there, which happens when the ship lands within `radius`.
export interface SiteComponent {
  name: string;
  body: string;
  latitude: number;
  longitude: number;
  radius: number;
}
// A daily routine (0.73.0): "hour x z" stops separated by ";" -- the entity
// walks to the latest stop whose hour has passed on the scene clock
// (world.set_clock) and waits there.
export interface RoutineComponent {
  stops: string;
  speed: number;
}
// Wildlife (0.73.0): calm, then wary (stops and watches) inside `wary`
// metres of the player or a running ship, fleeing inside `flee`, never
// more than `leash` metres from home.
export interface WildlifeComponent {
  wary: number;
  flee: number;
  speed: number;
  leash: number;
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
export type SoundBus = "SFX" | "Music" | "Ambient" | "UI";
export interface SoundComponent {
  clip: number;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  // 0.64.0 (older scenes get these defaults): positional playback from the
  // entity (HRTF panning, full volume within minDistance, fading out toward
  // maxDistance, following it as it moves), and which mixer bus it plays on.
  spatial: boolean;
  bus: SoundBus;
  minDistance: number;
  maxDistance: number;
}
// Scene audio mix (0.64.0): bus volumes (0-2), room reverb (0-1), and
// whether sounds behind solid geometry are muffled. The first entity with
// one sets the mix; scripts can change bus volumes with sound.volume().
export interface AudioSettingsComponent {
  master: number;
  sfx: number;
  music: number;
  ambient: number;
  ui: number;
  reverb: number;
  occlusion: boolean;
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
  // Casts real-time shadows (0.52.0). Off by default: every shadow-casting
  // Point light renders the scene six more times.
  castShadows: boolean;
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
export type ParticleShape = "Point" | "Sphere" | "Box" | "Cone";
export interface ParticlesComponent {
  preset: ParticlePreset;
  color: Vec3;
  rate: number;
  lifetime: number;
  speed: number;
  size: number;
  // 0.57.0 (older scenes get these defaults, which match the old look):
  endColor: Vec3; // color at the end of life (defaults to `color`)
  endSize: number; // size multiplier at the end of life
  gravityScale: number; // multiplies the preset's gravity
  shape: ParticleShape;
  shapeSize: number; // sphere radius / box half-extent / cone base radius
  coneAngle: number; // degrees
  space: "Local" | "World"; // World: particles stay behind a moving emitter
  burst: number; // particles emitted at once when Play starts
}
// A ribbon following the entity's recent path during Play (0.57.0).
export interface TrailComponent {
  color: Vec3;
  width: number; // world units at the head
  lifetime: number; // seconds a point lasts
  minDistance: number; // world units between recorded points
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
export type UIKind = "Text" | "Button" | "Panel" | "Image" | "Bar" | "Slider" | "Toggle";
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
// "script" (0.56.0): a click calls on_ui(name, "click") in every script.
export type UIAction = "restart" | "resume" | "pause" | "quit" | "script";
export interface UIComponent {
  kind: UIKind;
  text: string;
  anchor: UIAnchor;
  visibleWhen: UIVisibility;
  action: UIAction;
  // Layout and look (0.56.0; older scenes get these defaults). Offsets move
  // the element from its anchor in screen pixels (+y down); a width/height
  // of 0 sizes it automatically (see uiLayout.ts).
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  fontSize: number;
  // Background (Button/Panel/Toggle box) or fill (Bar/Slider) color.
  color: Vec3;
  opacity: number;
  // Image: a picture URL, e.g. one imported into the project.
  image: string;
  // Bar/Slider: 0..1; Toggle: 0 or 1. Scripts change it with ui.set_value.
  value: number;
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

// Scene-wide look (0.52.0): sky, sun, ambient light, fog, shadows and
// exposure. The first entity carrying one wins; without any, the scene keeps
// the defaults below, which reproduce the editor's original fixed lighting.
export type SkyMode = "Color" | "Gradient" | "Procedural";
export type FogMode = "None" | "Linear" | "Exponential";
export interface EnvironmentComponent {
  sky: SkyMode;
  // Color: the whole background. Gradient: zenith, horizon and below-horizon.
  skyColor: Vec3;
  horizonColor: Vec3;
  groundColor: Vec3;
  // Degrees. Elevation 90 is straight overhead; azimuth 0 points the sun
  // from +Z, 90 from +X. Also positions the Procedural sky's sun disc.
  sunElevation: number;
  sunAzimuth: number;
  sunIntensity: number;
  sunColor: Vec3;
  ambientIntensity: number;
  fog: FogMode;
  fogColor: Vec3;
  fogNear: number;
  fogFar: number;
  fogDensity: number;
  shadows: boolean;
  exposure: number;
}
// A game camera (0.52.0). During Play the highest-priority Camera entity
// renders the game view from its own position and Rotation instead of the
// editor's orbit camera.
export type CameraProjection = "Perspective" | "Orthographic";
export interface CameraComponent {
  projection: CameraProjection;
  fov: number; // vertical, degrees
  near: number;
  far: number;
  orthoSize: number; // half the view height, world units
  priority: number;
}
// Surface appearance override (0.52.0). On the placeholder box it replaces
// the default material; on a catalog model it tints every mesh, keeping the
// model's own textures when keepTextures is on.
export interface MaterialComponent {
  color: Vec3;
  metalness: number;
  roughness: number;
  emissive: Vec3;
  emissiveIntensity: number;
  opacity: number;
  keepTextures: boolean;
  // Color texture (0.58.0): a URL, or "asset:<file>" for an imported image.
  texture: string;
  // Which parts of a catalog model it applies to (0.75.0): meshes whose
  // own material's name contains one of these comma-separated words
  // ("Cloth" tints a character's clothes, not their skin); empty for all.
  parts: string;
}

// Animation state machine (0.53.0), authored as text -- see
// src/editor/animator.ts for the syntax.
export interface AnimatorComponent {
  graph: string;
}

// Camera rig (0.54.0), on the same entity as a Camera: during Play the
// camera follows a target from `offset` (in the target's frame when
// orbit is off: +z is behind), eases toward it over `smoothing` seconds,
// looks at the target raised by `lookHeight`, pulls in front of anything
// between it and the target when `collision` is on, and can be orbited by
// dragging when `orbit` is on.
export interface CameraFollowComponent {
  target: string; // entity Name; "" follows the Player
  offset: Vec3;
  smoothing: number;
  lookHeight: number;
  collision: boolean;
  orbit: boolean;
}

// A character controller (0.60.0) for the Player: acceleration-based
// movement from the named input actions (move_x/move_y, jump, sprint,
// crouch), coyote time, jump buffering, step climbing and crouching (see
// engine::gameplay, include/engine/gameplay/character.hpp). FirstPerson puts
// the Play camera at the player's eyes with mouse look (click the viewport
// to capture the mouse; right-drag also looks); ThirdPerson moves relative
// to the camera instead. Sizes the player's collision box itself.
export type ControllerMode = "FirstPerson" | "ThirdPerson";
export interface CharacterControllerComponent {
  mode: ControllerMode;
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  jumpHeight: number;
  standHeight: number;
  crouchHeight: number;
  stepHeight: number;
  acceleration: number;
  airControl: number;
  // First person only.
  lookSensitivity: number;
  invertY: boolean;
  fov: number; // vertical, degrees
  headBob: number; // 0 = off, 1 = normal
}

// Weapons (0.61.0): a loadout, one weapon per line as `name: key=value ...`
// (see engine::gameplay::parse_weapons in include/engine/gameplay/weapons.hpp
// for every key). A Player fires with the fire/aim/reload/next_weapon/
// weapon_scroll actions and 1-9; any other entity fires from its script with
// weapon.fire(dx, dy, dz). Invalid text falls back to the default loadout.
export interface WeaponsComponent {
  loadout: string;
}

// Melee (0.78.0): martial-arts fighting. `style` picks a built-in move
// list (Martial arts: punches, kicks, heavies, air and dash attacks, rolls
// and four specials; Sword) or Custom, which uses `moves`: one move per line
// as `name: key=value ...` (see engine::gameplay::parse_moves in
// include/engine/gameplay/melee.hpp; invalid text falls back to Martial
// arts). The Player fights with the light/heavy/kick/special/dodge/block/
// lock actions; with `ai` on, a melee brain drives any other entity against
// other teams (the Player is team 0). Hits build `energy` (0-100) for
// specials; blocking drains `guard` until it breaks.
export type MeleeStyle = "Martial arts" | "Sword" | "Custom";
export interface MeleeComponent {
  style: MeleeStyle;
  moves: string;
  team: number;
  ai: boolean;
  aggression: number; // 0..1
  skill: number; // 0..1: blocking, parrying, dodging, longer strings
  reaction: number; // seconds
  energy: number; // starting energy, 0..100
  guard: number;
  // Catalog models held in each hand (0: empty), e.g. twin daggers.
  rightHand: number;
  leftHand: number;
  // GATEBREAKER (0.80.0): a stagger bar that Breaks it (0: none) and how
  // long the Break floors it; the mana pool skills spend and its refill per
  // second; a ranged brain's distance (0: melee); a shield-bearer's guard.
  poise: number;
  breakTime: number;
  manaMax: number;
  manaRegen: number;
  range: number;
  shield: boolean;
}

// Combat AI (0.62.0): a soldier on `team` (the Player is team 0) that
// perceives hostiles (a sight cone with line of sight, gunfire within
// hearingRange, being shot), patrols its comma-separated `patrol` waypoint
// Names / guards its spawn / hunts the nearest hostile, fights from
// preferredRange in bursts with its Weapons (melee without them), strafes,
// takes cover to reload or when hurt, and searches where it lost you.
// Replaces AIState wander/chase on the same entity.
export type AICombatBehavior = "Patrol" | "Guard" | "Hunt";
export interface AICombatComponent {
  team: number;
  behavior: AICombatBehavior;
  patrol: string;
  sightRange: number;
  fov: number; // degrees
  hearingRange: number;
  reactionTime: number; // seconds before the first shot after spotting you
  accuracy: number; // 0..1
  preferredRange: number;
  moveSpeed: number;
  burst: number; // shots per burst
  burstPause: number; // seconds between bursts
  useCover: boolean;
  fleeHealth: number; // 0..1; flees below this health fraction (0 = never)
  meleeDamage: number; // without Weapons
}

// Terrain (0.63.0): a square heightfield of `size` centered on the entity's
// Transform (Rotation and Scale don't apply), from seeded fractal noise
// (height, frequency in features per 100 units, octaves) plus sculpted
// offsets painted with the viewport's Sculpt tool. Colored sand / grass /
// rock (by slope) / snow by height. `scatter` places catalog models on it,
// one rule per line: "model density [minScale maxScale] [minNormalY]
// [collide]" (see terrain.ts). Bodies stand on it, rays hit it, and steep
// slopes block AI paths. The first Terrain in a scene is the simulated one.
export interface TerrainComponent {
  size: number;
  resolution: number;
  height: number;
  seed: number;
  frequency: number;
  octaves: number;
  sculpt: string;
  grassColor: Vec3;
  rockColor: Vec3;
  sandColor: Vec3;
  snowColor: Vec3;
  sandHeight: number;
  snowHeight: number;
  rockSlope: number;
  scatter: string;
}

// Post-processing (0.65.0): anti-aliasing, ambient occlusion, bloom, color
// grading (contrast, saturation, temperature), vignette, film grain and sun
// shadow quality. The first entity with one sets the scene's look; without
// one the editor keeps its original subtle bloom.
export type AntialiasMode = "None" | "FXAA" | "SMAA";
export type ShadowQuality = "Low" | "Medium" | "High";
// "Manhwa" (GATEBREAKER): toon shading, ink lines and a rim light on
// characters (editor/manhwa.ts). It turns ambient occlusion off.
export type RenderStyle = "Standard" | "Manhwa";
export interface PostProcessingComponent {
  style: RenderStyle;
  ink: number; // 0..1, Manhwa line strength
  rim: number; // 0..1, Manhwa rim light on characters
  antialias: AntialiasMode;
  ambientOcclusion: boolean;
  aoRadius: number;
  aoIntensity: number; // 0..2
  bloom: number; // strength
  bloomRadius: number; // 0..1
  bloomThreshold: number; // 0..1 luminance
  exposure: number; // multiplies Environment.exposure
  contrast: number; // -1..1
  saturation: number; // -1..1
  temperature: number; // -1 (cool) .. 1 (warm)
  vignette: number; // 0..1
  grain: number; // 0..1
  shadowQuality: ShadowQuality;
}

// Named input actions (0.55.0): one `action: source, source` per line (see
// apps/editor/runtime/bindings.hpp). The first entity with one sets the
// scene's bindings; without one the defaults below apply.
export interface InputActionsComponent {
  bindings: string;
}

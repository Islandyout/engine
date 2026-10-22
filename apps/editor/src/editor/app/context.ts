import type { SwayTracker } from "../clothSway";
import type { ClothSkirt } from "../cloth";
import type { DepthFxPass } from "../depthFx";
import type { ObjectiveDef } from "../actionScript";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { CommandResult } from "../../authoring/CommandInterpreter";
import type {
	AIStateName, CharacterControllerComponent, EntityRef,
	EnvironmentComponent,
	MaterialComponent,
	ParticlePreset,
	ParticlesComponent, PostProcessingComponent, ScannableComponent, SpaceSystemComponent, TerrainComponent, TrailComponent,
	UIAction, UIComponent,
	UIKind,
	Vec3
} from "../../scene/Components";
import type { SceneComponents } from "../../scene/Scene";
import type { CatalogEntry } from "../../scene/modelCatalog";
import { CanvasRenderer } from "../CanvasRenderer";
import { EditorDocument } from "../Document";
import { Ambience } from "../ambience";
import { AnimatorRuntime, type AnimatorGraph } from "../animator";
import { AudioMixer, FootstepTracker } from "../audioMixer";
import { EngineVoice, SirenVoice, TireVoice } from "../carAudio";
import { CarFx, type CarView, type MinimapRoad } from "../carFx";
import { CombatView } from "../combatView";
import { ExplorerFx } from "../explorerFx";
import { type MapSite } from "../explorerHud";
import { ViewEffects, type Look } from "../fpsView";
import type { GovernorTier } from "../frameGovernor";
import { FrameGovernor } from "../frameGovernor";
import { type GestureBones } from "../gestures";
import { GunPose } from "../gunHold";
import { LedgerHud } from "../ledger";
import { LightPool } from "../lightPool";
import { type PickupVisual } from "../lootView";
import { InkPass } from "../manhwa";
import { DistrictMap } from "../minimap";
import { Music } from "../music";
import { type EmitterState } from "../particles";
import type { PlayerSettings } from "../playerSettings";
import {
	Announcer
} from "../playerSettings";
import { type PostSettings } from "../postFx";
import { ReflectionProbe } from "../reflectionProbe";
import type { RuntimeExports } from "../runtimeExports";
import { Scanner, type ScanTarget } from "../scanner";
import type { SwayUniforms } from "../scatterSway";
import { Sfx } from "../sfx";
import { ShooterView } from "../shooterView";
import type { SpaceBody } from "../spaceView";
import { SpaceView, type Species } from "../spaceView";
import { StaticBatcher } from "../staticBatcher";
import {
	type TerrainParams
} from "../terrain";
import { type TerrainLook } from "../terrainMesh";
import type { SkyState } from "../timeOfDay";
import { type TouchControls } from "../touchControls";
import { type TrailPoint } from "../trail";
import { UIPainter } from "../uiDraw";
import { type UIData, type UIHit } from "../uiKit";
import { type UIRect } from "../uiLayout";
import { type StoredAsset } from "../userAssets";
import { Visor } from "../visor";
import { WeaponFx } from "../weaponFx";



// Each preset's emission shape/motion. `direction` is the base emit
// direction in the entity's own local space (particles are parented under
// `anchor`, same as a Light, so they rotate with the entity); `spread`
// blends that toward a uniformly-random direction (0 = exactly `direction`,
// 1 = fully random). `gravity` is a constant world-space Y acceleration
// added to every particle's velocity each frame -- negative falls
// (Confetti), a small positive value stands in for buoyancy so Smoke/Fire
// visibly rise, not real buoyancy physics.
export const PARTICLE_PRESETS: Record<ParticlePreset, { direction: THREE.Vector3; spread: number; gravity: number }> = {
  Sparkle: { direction: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 0 },
  Smoke: { direction: new THREE.Vector3(0, 1, 0), spread: 0.3, gravity: 0.6 },
  Fire: { direction: new THREE.Vector3(0, 1, 0), spread: 0.55, gravity: 1.1 },
  Confetti: { direction: new THREE.Vector3(0, 1, 0), spread: 0.85, gravity: -4 },
};

  export interface AnimState {
    mixer: THREE.AnimationMixer;
    // Seconds not yet applied while the frame governor skips this
    // (distant) character's frames.
    skipped?: number;
    actions: Map<string, THREE.AnimationAction>;
    current?: string;
    prevPosition: THREE.Vector3;
    // True while a one-shot animation request (see pollAnimationRequests
    // below) is still playing -- either a script's own self.animate, or one
    // of editor.combat/editor.move/editor.ai_attack's own native F/G
    // requests (bridge.cpp's engine::script::Runtime::request_animation).
    // Cleared once the mixer reports that specific action finished. The
    // ground-speed locomotion picker must skip an entity while this is
    // true, the same "don't fight a clip that was just deliberately
    // started" reasoning startDeath()'s own deathStates gate already
    // established.
    oneShot?: boolean;
    // The mixer "finished" listener for whichever one-shot is currently
    // playing (see pollAnimationRequests below), so a second request
    // arriving before the first one's own clip finishes (e.g. F then G in
    // quick succession) can detach the first's now-stale handler before it
    // has a chance to fire later and clobber state set by the second.
    oneShotHandler?: (event: { action: THREE.AnimationAction }) => void;
    // An armed character's upper-body weapon-holding action (characterRig.ts).
    upper?: THREE.AnimationAction;
  }

  export interface ParticleState {
    emitter: EmitterState;
    points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    // World-space emitters live at the scene root and spawn from this
    // anchor's world position; local ones are parented under it.
    anchor: THREE.Object3D;
    world: boolean;
    burstOnPlay: number;
  }

  export interface DeathState {
    elapsed: number; // seconds since editor_alive(i) first read false this Play session
    // Materials cloned specifically for this one dying object -- see
    // startDeath's own doc comment for why fading in place isn't safe.
    // Disposed once the fade finishes or on the next rebuild(), whichever
    // comes first. baseOpacity is each clone's own opacity at the moment it
    // was cloned (an already-transparent material -- vehicle glass, several
    // building materials -- starts below 1, not at it), so the fade always
    // multiplies down from where it actually started instead of snapping to
    // fully opaque on its first frame.
    materials: { material: THREE.Material; baseOpacity: number }[];
  }

  // Trails: a camera-facing ribbon behind each Trail entity,
  // recorded during Play (trail.ts builds the geometry).
  export interface TrailState {
    component: TrailComponent;
    anchor: THREE.Object3D;
    points: TrailPoint[];
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  }

  export interface CachedModel {
    scene: THREE.Group;
    clips: THREE.AnimationClip[];
    // The model's own rest-pose bounding-box size in its source units — a
    // catalog GLB carries real-world dimensions baked into its meshes (a
    // sedan is ~4.7m long before any scale is applied), unlike the
    // BoxGeometry primitive below, which is a unit cube. An authored Scale
    // is documented (BTAI_EDITOR.md) as literal world-space size — the same
    // dimensions the physics Box uses — so a catalog model's visual scale is
    // normalized by this native size rather than applied directly, or a
    // Scale matching the physics box would blow the mesh up by its own
    // native size on top (see rebuild()).
    nativeSize: THREE.Vector3;
    // Center of the model's own bounds: catalog models are authored with
    // their origin at their feet, so they're shifted by this to sit centered
    // on the entity's collision box.
    nativeCenter: THREE.Vector3;
    // Its distant version, if the GLB has one (see loadCatalogModel).
    far?: THREE.Object3D;
  }

  // Script-set UI text (ui.set_text), keyed by the UI entity's Name.
  // Play-session state only: cleared whenever the runtime is rebuilt.
  // Each object's simulated position (and soldier yaw) at the last two
  // fixed ticks, for drawing in between (see frame()). Reset when Play starts;
  // declared before the player-mode bootstrap, which starts Play.
  export interface TickState {
    previous: THREE.Vector3;
    current: THREE.Vector3;
    previousYaw: number;
    currentYaw: number;
  }

  // The UI kit (uiKit.ts): this frame's widget click regions, the pointer
  // over the viewport (hover), each widget's text and when it last changed
  // (typed dialogue, notifications), widgets their Play button hid, which
  // widgets the scene has (the rest draw by default where they apply), and
  // this Play's hits, kills and damage numbers.
  export interface WidgetHit extends UIHit {
    name: string;
    entity: number;
  }

  // anchor -> (x/y fraction of the HUD canvas, canvas textAlign/textBaseline)
  // -- a UI element's screen position, unlike a Health bar's, is never
  // projected from a world position; it's just one of nine fixed points on
  // the viewport, the same layout language any screen-anchored HUD/menu uses.
  // Populated fresh by drawHud() every frame a Button is visible; consulted
  // by the pointerdown handler below to hit-test a click before it falls
  // through to normal 3D entity-selection raycasting. Screen-space rects,
  // not scene objects, so no relation to objects[]/animStates[]'s own
  // per-entity indexing.
  export interface UIButtonHit extends UIRect {
    kind: UIKind;
    name: string;
    action: UIAction;
    value: number;
  }

// The state and helpers the editor's parts share (app/*.ts install their functions here).
export interface Ctx {
  // The UI kit's actions, toggle keys and the Objectives engine (app/actions.ts).
  openUI: Set<string>;
  // The scene index of the walker hidden inside the car the Player drives (-1 none).
  hiddenWalker: number;
  objectives: { defs: ObjectiveDef[]; active: string; counts: Map<string, number>; done: Set<string>; dead: Set<number> };
  setUIOpen: (name: string, open: boolean) => void;
  toggleUI: (name: string) => void;
  toggleKeyPressed: (code: string) => boolean;
  runActions: (text: string, event: string, source: string) => void;
  runOnClick: (name: string, event: string) => void;
  startObjectives: () => void;
  startObjective: (id: string) => void;
  completeObjective: (id: string) => void;
  objectiveCommand: (text: string) => void;
  objectiveEvent: (kind: "interact", name: string) => void;
  updateObjectives: () => void;
  objectiveReadout: () => [string, number] | undefined;
  accumulator: number;
  actionClipSynonyms: Map<string, string[]>;
  activePanners: Map<number, PannerNode>;
  activeSounds: Map<number, AudioBufferSourceNode>;
  adoptSpawnedEntities: () => void;
  aiStateNames: readonly AIStateName[];
  ambience: Ambience | undefined;
  animationClipOptions: (entity: EntityRef) => { label: string; value: string; }[];
  animatorErrors: string[];
  animators: ({ graph: AnimatorGraph; runtime: AnimatorRuntime; } | undefined)[];
  animStates: (AnimState | undefined)[];
  announcer: Announcer;
  app: HTMLDivElement;
  applyEnvironment: (env: EnvironmentComponent) => void;
  applyExposure: () => void;
  applyGovernor: () => void;
  applyInk: () => void;
  applyMaterial: (mesh: THREE.Mesh, m: MaterialComponent) => void;
  applyPlayerSettings: () => void;
  applyPostProcessing: (settings: PostSettings) => void;
  applyScatterDensity: (fraction: number) => void;
  applyShake: (view: THREE.Camera, dt: number) => void;
  applySiteView: () => void;
  applyTimeOfDay: (hours: number | undefined) => void;
  attachFighter: (index: number, object: THREE.Object3D, state: AnimState) => void;
  audioContext: AudioContext | undefined;
  audioMixer: () => AudioMixer;
  backend: string;
  batchAt: number;
  batchCheckAt: number;
  blockCodes: Set<string>;
  blockCodesFor: string | undefined;
  blockPoint: THREE.Vector3;
  blockSegment: THREE.Line3;
  blockSphere: THREE.Sphere;
  bloomPass: UnrealBloomPass | undefined;
  bodyCentre: (index: number) => THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  cameraForwardScratch: THREE.Vector3;
  carFx: CarFx;
  carSizes: WeakMap<THREE.Object3D<THREE.Object3DEventMap>, THREE.Vector3>;
  carView: (i: number) => CarView;
  catalogCache: Map<number, CachedModel>;
  catalogEntry: (meshId: number) => CatalogEntry | undefined;
  catalogPromises: Map<number, Promise<CachedModel>>;
  catalogued: Set<string>;
  colorOf: (v: Vec3) => THREE.Color;
  combat: CombatView;
  combatClips: THREE.AnimationClip[] | undefined;
  composer: EffectComposer | undefined;
  configureSnap: () => void;
  controls: OrbitControls;
  createEntityObject: (get: <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined) => void;
  createParticles: (particles: ParticlesComponent, anchor: THREE.Object3D) => ParticleState;
  createTrail: (component: TrailComponent, anchor: THREE.Object3D) => TrailState;
  crouchKeyCode: "KeyC";
  crowdFrame: number;
  cue: (name: string) => void;
  currentEnvironment: EnvironmentComponent | undefined;
  deathFadeDuration: 1;
  deathRoll: number;
  deathStates: (DeathState | undefined)[];
  dirtyCheck: { at: number; value: boolean; mode: "edit" | "play" | "pause"; };
  districtMap: DistrictMap;
  doc: EditorDocument;
  draggingSlider: UIButtonHit | undefined;
  draggingWidget: WidgetHit | undefined;
  drawExplorerHud: (lines: string[]) => void;
  drawHud: () => void;
  drawUIElement: (ui: UIComponent, rect: UIRect, value: number) => void;
  el: <T extends HTMLElement = HTMLElement>(id: string) => T;
  endExplorer: () => void;
  endSpaceView: () => void;
  engineVoice: EngineVoice | undefined;
  entityLabel: (index: number) => string;
  environmentExposure: number;
  environmentKey: string;
  environmentTexture: THREE.Texture | undefined;
  execute: (command: unknown) => CommandResult;
  explorerBodies: SpaceBody[];
  explorerFx: ExplorerFx | undefined;
  failedSaveWrites: Map<string, string>;
  fighterVelocity: THREE.Vector3;
  firstPerson: () => boolean;
  firstPersonBodyFallback: 132;
  flushPointerInput: () => void;
  fps: { look: Look; view: ViewEffects; camera: THREE.PerspectiveCamera; previous: THREE.Vector3; current: THREE.Vector3; };
  fpsLanding: number;
  frame: (now: number) => void;
  frameQuaternion: () => THREE.Quaternion;
  frameToLatLon: (index: number, p: THREE.Vector3) => { latitude: number; longitude: number; };
  frameUIData: UIData | undefined;
  fxaaPass: ShaderPass;
  gameCamera: () => THREE.Camera | undefined;
  gameKeyUp: (code: string, fallbackKey?: string) => void;
  gameOrthographic: THREE.OrthographicCamera;
  gamepadButtonMap: { [x: number]: number; };
  gamePerspective: THREE.PerspectiveCamera;
  geometry: THREE.BoxGeometry;
  gestureBones: WeakMap<AnimState, GestureBones>;
  getAudioContext: () => AudioContext;
  gizmo: TransformControls;
  gizmoPaused: boolean;
  gltfLoader: GLTFLoader;
  governedMode: string;
  governFrame: (intervalMs: number) => void;
  governor: FrameGovernor;
  governorTier: () => GovernorTier;
  gradingPass: ShaderPass;
  grid: THREE.GridHelper;
  gtaoPass: GTAOPass | undefined;
  depthFxPass: DepthFxPass;
  gunPoses: Map<number, { pose: GunPose; gun: string; raised: number; kick: number; oneHanded?: boolean; rest: THREE.Object3D; object: THREE.Object3D; hands: string; holders: THREE.Object3D[]; blades?: THREE.Object3D[]; }>;
  handleHost: (kind: string, text: string) => void;
  harvest: (key: string) => void;
  harvested: Set<number>;
  harvestedSpots: Set<string>;
  heldKeys: Set<string>;
  heldScriptKeys: Set<string>;
  hemisphere: THREE.HemisphereLight;
  hiddenAway: Set<number>;
  hiddenWidgets: Set<number>;
  hideHarvestedHere: () => void;
  hideScatter: (index: number) => void;
  holdFirstPersonWeapons: () => void;
  hud: HTMLCanvasElement;
  hudCtx: CanvasRenderingContext2D;
  hudScratch: THREE.Vector3;
  hudText: HTMLDivElement;
  importedImages: Map<string, string>;
  importFiles: (files: FileList | File[]) => Promise<void>;
  inkPass: InkPass;
  inputFrameConsumed: boolean;
  inspectorIssues: (entity: EntityRef, type: string) => string[];
  isBlockCode: (code: string) => boolean;
  isGunPath: (path: string) => boolean;
  keyQueue: [code: string, down: number][];
  keyRemap: { [x: string]: string; };
  latLonToFrame: (index: number, latitude: number, longitude: number, lift?: number) => THREE.Vector3;
  latLonWaypoints: Map<string, { body: string; latitude: number; longitude: number; label: string; }>;
  ledger: LedgerHud;
  lightOverride: { ambient: number; sun: number; } | undefined;
  lightPool: LightPool;
  listenerPosition: THREE.Vector3;
  loadCatalogModel: (meshId: number) => Promise<CachedModel> | undefined;
  loadDocument: (data: unknown) => void;
  log: (value: unknown) => void;
  lootFeed: { label: string; rarity: number; amount: number; kind: number; at: number; }[];
  makeEffectPoints: (emitter: EmitterState) => THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes>, THREE.ShaderMaterial, THREE.Object3DEventMap>;
  mapMode: string;
  mapSites: Map<string, MapSite & { body: string; }>;
  material: THREE.MeshStandardMaterial;
  materialAppliesTo: (mesh: THREE.Mesh, m: MaterialComponent) => boolean;
  materialOverrides: THREE.Material[];
  memberSite: number[];
  minimapAllowed: boolean;
  minimapRoads: MinimapRoad[];
  missingGuns: Set<string>;
  mixer: AudioMixer | undefined;
  mouseStick: { x: number; y: number; idle: number; sent: boolean; locked: boolean; };
  movingComponents: readonly ["Script", "AIState", "Pedestrian", "Routine", "Wildlife", "Walker", "Vehicle", "Player", "Spaceship", "Particles", "Trail", "Health", "Terrain", "ModelInstances", "AICombat", "CharacterController", "Animator", "Site"];
  music: Music | undefined;
  musicMood: string;
  nearHarvest: string;
  objects: THREE.Object3D<THREE.Object3DEventMap>[];
  onPickupTimers: { name: string; until: number; }[];
  openEntityMenu: (x: number, y: number) => void;
  openings: { step: (t: number) => boolean; t: number; }[];
  openPlayerSettings: (paused?: boolean) => void;
  outfits: Map<number, THREE.Object3D<THREE.Object3DEventMap>[]>;
  padSnapshot: { buttons: boolean[]; axes: number[]; } | undefined;
  parseOutfit: (text: string) => { id: number; tint: string | undefined; }[];
  particleFragmentShader: "\n    varying vec3 vColor;\n    void main() {\n      vec2 c = gl_PointCoord - 0.5;\n      float d = dot(c, c);\n      if (d > 0.25) discard;\n      gl_FragColor = vec4(vColor * (1.0 - d * 4.0), 1.0);\n    }";
  particleOrigin: THREE.Vector3;
  particleScale: { value: number; };
  particleStates: (ParticleState | undefined)[];
  particleVertexShader: "\n    attribute float size;\n    attribute vec3 color;\n    uniform float scale;\n    varying vec3 vColor;\n    void main() {\n      vColor = color;\n      vec4 mv = modelViewMatrix * vec4(position, 1.0);\n      gl_PointSize = size * scale / max(-mv.z, 0.001);\n      gl_Position = projectionMatrix * mv;\n    }";
  pauseMenu: boolean;
  pendingCatalogRebuilds: Set<number>;
  persistDirtySaves: () => void;
  pickupViews: Map<number, { visual: PickupVisual; phase: number; }>;
  playerBaseScale: THREE.Vector3 | null;
  playerCarSpeed: number;
  playerController: () => CharacterControllerComponent | undefined;
  playerFeet: (target: THREE.Vector3) => THREE.Vector3;
  playerIndex: number;
  playerPrevY: number;
  playerSettings: PlayerSettings;
  playerSteps: FootstepTracker;
  playerWeaponModel: (slot?: number) => string;
  playMovementSounds: (dt: number) => void;
  playOneShot: (clip: string, position?: THREE.Vector3, volume?: number) => void;
  playSession: number;
  pmrem: THREE.PMREMGenerator | undefined;
  pointerQueue: (() => void)[];
  pollAnimationRequests: () => void;
  pollGamepad: () => void;
  populateCatalogModels: () => void;
  postSettings: PostProcessingComponent;
  previous: number;
  probe: ReflectionProbe;
  probeScanAt: number;
  processCombatEvents: () => void;
  profileCapture: { frames: number[]; until: number; } | undefined;
  projectileMeshes: THREE.Object3D[];
  prospect: { keys: Set<string>; label: string; range: number; } | undefined;
  rebuild: () => void;
  registerAsset: (asset: StoredAsset) => void;
  releaseHeldKeys: () => void;
  releasePointer: () => void;
  renderer: THREE.WebGLRenderer | CanvasRenderer;
  renderPass: RenderPass;
  resizeAntialias: () => void;
  applyDepthFx: () => void;
  resolveActionClip: (state: AnimState, requested: string) => string | undefined;
  retiredNoted: Set<number>;
  rig: { position: THREE.Vector3; yaw: number; pitch: number; placed: boolean; frameDt: number; fovExtra: number; lastTarget: THREE.Object3D | undefined; lastTargetPosition: THREE.Vector3; movementDirection: THREE.Vector3; movementSpeed: number; };
  rigRaycaster: THREE.Raycaster;
  runAnimator: (i: number, state: AnimState, animator: AnimatorRuntime, speed: number, verticalSpeed: number, dt: number) => void;
  runScriptCommands: () => void;
  runtime: RuntimeExports & { HEAPF64: Float64Array; HEAPF32: Float32Array; HEAPU8: Uint8Array; _malloc(bytes: number): number; _free(ptr: number): void; ccall(name: "editor_input_key", returnType: null, argTypes: ["string", "number"], args: [string, number]): void; ccall(name: "editor_set_input_bindings", returnType: null, argTypes: ["string"], args: [string]): void; ccall(name: "editor_bindings_error", returnType: "string", argTypes: [], args: []): string; ccall(name: "editor_set_name" | "editor_set_script_props", returnType: null, argTypes: ["number", "string"], args: [number, string]): void; ccall(name: "editor_template_begin", returnType: null, argTypes: ["string"], args: [string]): void; ccall(name: "editor_profile_text", returnType: "string", argTypes: [], args: []): string; ccall(name: "editor_ui_event", returnType: null, argTypes: ["string", "string"], args: [string, string]): void; ccall(name: "editor_script_notify", returnType: null, argTypes: ["number", "string", "string"], args: [number, string, string]): void; ccall(name: "editor_spawned_prefab", returnType: "string", argTypes: ["number"], args: [number]): string; ccall(name: "editor_command_text", returnType: "string", argTypes: ["number", "number"], args: [number, number]): string; ccall(name: string, returnType: "string" | "number" | null, argTypes: Array<"string" | "number">, args: Array<string | number>): any; ccall(name: "editor_set_script_source", returnType: null, argTypes: ["number", "string"], args: [number, string]): void; ccall(name: "editor_script_error", returnType: "string", argTypes: ["number"], args: [number]): string; ccall(name: "editor_seed_save", returnType: null, argTypes: ["string", "string"], args: [string, string]): void; ccall(name: "editor_dirty_save_key", returnType: "string", argTypes: ["number"], args: [number]): string; ccall(name: "editor_dirty_save_value", returnType: "string", argTypes: ["number"], args: [number]): string; ccall(name: "editor_script_key", returnType: null, argTypes: ["string", "number"], args: [string, number]): void; ccall(name: "editor_take_animation_request", returnType: "string", argTypes: ["number"], args: [number]): string; };
  runUIAction: (action: UIAction) => void;
  sampleTickState: (i: number) => TickState;
  sampleTickStates: () => void;
  scanHeld: () => boolean;
  scannableIndices: number[];
  scanner: Scanner;
  scatterFrameKey: () => string;
  scatterModelsReady: boolean;
  scatterPlacements: { x: number; y: number; z: number; key: string; kind: string; scale: number; }[];
  scatterTargets: ScanTarget[];
  scene: THREE.Scene;
  sceneWidgets: Set<"Health" | "Inventory" | "Ammo" | "Crosshair" | "Damage numbers" | "Kill feed" | "Boss bar" | "Minimap" | "Compass" | "Objective" | "Waypoints" | "Interact prompt" | "Pickup feed" | "Loot card" | "Hotbar" | "Weapon wheel" | "Pause menu" | "Main menu" | "Settings" | "Dialogue" | "Notification" | "Fighter bars" | "World health bar" | "Hint" | "Vehicle instruments" | "Flight instruments" | "Skill bar" | "Resource bar" | "Status effects" | "Target frame" | "Damage direction" | "Death screen" | "Character sheet" | "Quest log" | "Skill tree" | "Key hints" | "Shop window" | "Quick slots">;
  scheduleContentCheck: () => void;
  scriptKeyByCode: Map<string, string>;
  scriptKeyQueue: [key: string, down: number][];
  sculptDab: (event: PointerEvent) => void;
  sculptElement: <T extends HTMLElement>(id: string) => T | null;
  sculpting: () => boolean;
  sculptMode: () => string;
  sculptRadius: HTMLInputElement;
  sculptRay: THREE.Raycaster;
  sculptStrength: HTMLInputElement;
  sculptStroke: { index: number; entity: EntityRef; } | undefined;
  sculptTool: HTMLSelectElement;
  seedSavedProgress: () => void;
  selectAt: (clientX: number, clientY: number) => boolean;
  selectedTerrainIndex: () => number;
  selection: THREE.BoxHelper;
  setOutfit: (index: number, spec: { id: number; tint?: string; }[]) => void;
  settingsPanel: { close(): void; } | undefined;
  setUIValue: (name: string, value: number) => void;
  sfx: Sfx | undefined;
  shadowGround: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial, THREE.Object3DEventMap>;
  shake: { intensity: number; remaining: number; duration: number; };
  shakeCamera: THREE.PerspectiveCamera;
  shipIndex: number;
  shooterActive: () => boolean;
  sirens: Map<number, { voice: SirenVoice; panner?: PannerNode; }>;
  siteIndices: number[];
  siteView: string;
  siteViewDefaulted: boolean;
  siteViewScene: unknown;
  siteViewSelection: EntityRef | undefined;
  skyBackground: THREE.Color;
  skyFog: THREE.FogExp2;
  skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial, THREE.Object3DEventMap> | undefined;
  skyState: SkyState;
  smaaPass: SMAAPass;
  softGround: boolean;
  soldierSteps: Map<number, { tracker: FootstepTracker; previous: THREE.Vector3; }>;
  soundBufferPromises: Map<number, Promise<AudioBuffer>>;
  soundBuffers: Map<number, AudioBuffer>;
  sounds: () => Sfx;
  soundsAt: (point: THREE.Vector3, volume?: number) => Sfx;
  spaceComponent: () => SpaceSystemComponent | undefined;
  spaceFrame: number;
  spaceGround: THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes>, THREE.ShadowMaterial, THREE.Object3DEventMap> | undefined;
  spacePass: RenderPass | undefined;
  spaceScatter: THREE.Object3D<THREE.Object3DEventMap> | undefined;
  spaceSpecies: Species[];
  spaceView: SpaceView | undefined;
  spawnedScans: Map<number, ScannableComponent>;
  stageSpaceSystem: () => void;
  startDeath: (anchor: THREE.Object3D, animState: AnimState | undefined) => DeathState;
  startExplorer: () => void;
  startSounds: () => void;
  startSpaceView: () => void;
  staticBatcher: StaticBatcher;
  stats: { frames: number; frameMs: number; tickMs: number; since: number; };
  statsPanel: HTMLPreElement;
  stepParticles: (state: ParticleState, dt: number) => void;
  stepTrails: (dt: number) => void;
  stopCarSounds: () => void;
  stopSounds: () => void;
  storedAssets: StoredAsset[];
  suitLight: THREE.SpotLight | undefined;
  suitLightLevel: number;
  suitLightMode: string;
  sun: THREE.DirectionalLight;
  sunDirection: THREE.Vector3;
  surfaceAt: (x: number, feetY: number, z: number) => "grass" | "hard";
  surfaceImages: Map<number, HTMLCanvasElement>;
  sway: SwayUniforms;
  swayCache: Map<THREE.Material, THREE.Material>;
  swayDepth: THREE.MeshDepthMaterial;
  syncRuntime: () => void;
  syncTouchControls: () => void;
  talkerIndices: number[];
  talkerResting: Set<number>;
  talkerScan: number;
  talkerWasResting: Set<number>;
  // The terrain's height at a world x, z (undefined off every terrain): foot IK stands characters on it.
  groundAt: (x: number, z: number) => number | undefined;
  // Hanging cloth and hair follow the characters' movement (clothSway.ts).
  clothSway: SwayTracker;
  // Simulated skirts, stepped each frame while their character is near (cloth.ts).
  cloths: Set<ClothSkirt>;
  terrainMeshes: Map<number, { mesh: THREE.Mesh; params: TerrainParams; look: TerrainLook; offsets: Int16Array; }>;
  terrainParams: (t: TerrainComponent) => TerrainParams;
  textureCache: Map<string, THREE.Texture>;
  textureLoader: THREE.TextureLoader;
  tickAlpha: number;
  ticks: number;
  tickSnapshot: Float64Array | undefined;
  tickSnapshotAlive: (i: number) => boolean;
  tickSnapshotFlags: (i: number) => number;
  tickStates: TickState[];
  timeOfDay: number | undefined;
  tireVoice: TireVoice | undefined;
  toLiteralScale: (entity: EntityRef, scale: Vec3) => Vec3;
  touchControls: TouchControls | undefined;
  tps: { view: ShooterView; camera: THREE.PerspectiveCamera; kick: number; lastFire: number; aimWasDown: boolean; lookScale: number; over: number; padSwap: boolean; hits: number; kills: number; meleeInHand: boolean; };
  trailScratch: THREE.Vector3;
  trailStates: TrailState[];
  uiButtonHits: UIButtonHit[];
  uiColorOverrides: Map<string, THREE.Color>;
  uiEvent: (name: string, value: string) => void;
  uiFeed: { hitAt: number; killAt: number; damage: { point: THREE.Vector3; amount: number; crit: boolean; at: number; }[]; kills: { killer: string; victim: string; mine: boolean; at: number; }[]; healthGhost: number; bossGhost: number; last: number; };
  uiMarkers: Map<string, { position: THREE.Vector3; label: string; }>;
  uiPainter: UIPainter;
  uiPointer: { x: number; y: number; } | undefined;
  uiTextOverrides: Map<string, string>;
  uiValues: Map<string, number>;
  uiVisibility: Map<string, boolean>;
  unlockingUntil: number;
  updateCars: (dt: number) => void;
  updateExplorer: (dt: number, view: THREE.Camera) => void;
  updateGunPoses: (dt: number) => void;
  updateLoot: (dt: number) => void;
  updateMusic: () => void;
  updatePanels: () => void;
  updateScanner: (dt: number, view: THREE.Camera) => void;
  updateSculptBar: () => void;
  updateShooterAim: (dt: number) => void;
  updateSpace: (view: THREE.Camera, dt: number) => void;
  updateStaticBatches: () => void;
  updateStats: (frameMs: number, tickMs: number) => void;
  updateSunShadow: () => void;
  viewCamera: THREE.Camera;
  viewmodelPass: RenderPass;
  viewmodelStudio: THREE.Texture | undefined;
  viewport: HTMLElement;
  viewportPoint: (event: MouseEvent) => { x: number; y: number; };
  visor: Visor;
  waitingFighters: { index: number; object: THREE.Object3D; state: AnimState; }[];
  wasLanded: boolean;
  weaponFx: WeaponFx;
  widgetAction: (hit: WidgetHit, x: number) => void;
  widgetHits: WidgetHit[];
  widgetTexts: Map<number, { text: string; since: number; }>;
  captions: { text: string; at: number }[];
  zoomBlend: number;
}

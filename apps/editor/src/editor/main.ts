import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { LocalStorageSceneStore } from "../authoring/CommandInterpreter";
import type {
	AIStateName,
	EntityRef,
	ScannableComponent,
	UIComponent,
	UIWidget
} from "../scene/Components";
import { catalogCategories, modelCatalog } from "../scene/modelCatalog";
import { CanvasRenderer } from "./CanvasRenderer";
import { EditorDocument } from "./Document";
import { transformCommand, type TransformMode, type TransformSnapshot } from "./TransformEdit";
import { AnimatorRuntime, type AnimatorGraph } from "./animator";
import { defaultMixerSettings, FootstepTracker } from "./audioMixer";
import { CombatView } from "./combatView";
import { formatIssue } from "./contentCheck";
import { editorLayoutHtml } from "./editorLayout";
import { applyMouseLook, ViewEffects, type Look } from "./fpsView";
import { LedgerHud } from "./ledger";
import { LightPool } from "./lightPool";
import { attachDepth, InkPass, installToonShading } from "./manhwa";
import { DistrictMap } from "./minimap";
import { burst } from "./particles";
import { ProblemsPanel } from "./problemsPanel";
import { openRecipePicker } from "./recipePicker";
import { applyRecipe } from "./recipes";
import { templateScene } from "./sceneTemplates";
import { openTemplatePicker } from "./templatePicker";
import { UIPainter } from "./uiDraw";
import { applySettingHit, widgetInfo } from "./uiKit";
import { openUIKitPicker } from "./uiKitPicker";
import { contains, sliderValue, type UIRect } from "./uiLayout";
import { loadStoredAssets, resolveAssetUrl } from "./userAssets";
import { Visor } from "./visor";
// The header shows the version package.json records (bump.sh keeps it current).
import { version as editorVersion } from "../../package.json";
import { commandTemplates } from "../authoring/commandTemplates";
import { installAnimation } from "./app/animation";
import { installActions } from "./app/actions";
import { installAssets } from "./app/assets";
import { installAudio } from "./app/audio";
import { installCameras } from "./app/cameras";
import type { Ctx } from "./app/context";
import { AnimState, CachedModel, DeathState, ParticleState, TickState, TrailState, UIButtonHit, WidgetHit } from "./app/context";
import { installEffects } from "./app/effects";
import { installEnvironment } from "./app/environment";
import { installExplorer } from "./app/explorer";
import { installFrame } from "./app/frame";
import { installHeldGuns } from "./app/heldGuns";
import { installHud } from "./app/hud";
import { installInput } from "./app/input";
import { installLoot } from "./app/loot";
import { installPanels } from "./app/panels";
import { installPostfx } from "./app/postfx";
import { installRuntimeSync } from "./app/runtimeSync";
import { installSaves } from "./app/saves";
import { installSceneObjects } from "./app/sceneObjects";
import { installScriptHost } from "./app/scriptHost";
import { installSpace } from "./app/space";
import { installUiActions } from "./app/uiActions";
import { installVehicles } from "./app/vehicles";
import { EntityField } from "./bridgeFields";
import { SirenVoice } from "./carAudio";
import { CarFx } from "./carFx";
import { type MapSite } from "./explorerHud";
import { FrameGovernor } from "./frameGovernor";
import { openGamesLibrary } from "./gamesLibrary";
import { type GestureBones } from "./gestures";
import { GunPose } from "./gunHold";
import { type PickupVisual } from "./lootView";
import { parseModelInstances } from "./modelInstances";
import {
	Announcer,
	isTouchDevice,
	keyForCode,
	loadKeyRemap,
	loadSettings,
	storeSettings
} from "./playerSettings";
import { defaultPostSettings, gradingShader } from "./postFx";
import { ReflectionProbe } from "./reflectionProbe";
import type { RuntimeExports } from "./runtimeExports";
import { Scanner } from "./scanner";
import { swayDepthMaterial, swayUniforms } from "./scatterSway";
import { searchBox } from "./searchBox";
import { ShooterView } from "./shooterView";
import { StaticBatcher } from "./staticBatcher";
import "./style.css";
import {
	encodeSculpt,
	parseScatter,
	type TerrainParams
} from "./terrain";
import { type TerrainLook } from "./terrainMesh";
import { createSkyState } from "./timeOfDay";
import { classifyWheel, HOLD_MS, pressKind, type WheelDevice } from "./viewportInput";
import { WeaponFx } from "./weaponFx";

// Drag-to-resize a docked panel, matching mainstream engine editors. Reads
// and writes a CSS custom property on the document root; the stylesheet
// consumes that property in the relevant grid-template-columns/rows track.
function wireResizer(handle: HTMLElement, axis: "x" | "y", cssVar: string, min: number, max: number, invert = false) {
  const root = document.documentElement;
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    const startPos = axis === "x" ? down.clientX : down.clientY;
    const startValue = parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || min;
    handle.setPointerCapture(down.pointerId);
    handle.classList.add("dragging");
    const move = (moveEvent: PointerEvent) => {
      const pos = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const delta = (pos - startPos) * (invert ? -1 : 1);
      const value = Math.min(max, Math.max(min, startValue + delta));
      root.style.setProperty(cssVar, `${value}px`);
    };
    const up = () => {
      handle.releasePointerCapture(down.pointerId);
      handle.classList.remove("dragging");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}

// The C++ runtime's exports, typed from bridge.cpp itself (0.77.0:
// runtimeExports.ts, generated by tools/bridge/gen_exports.mjs).
type Runtime = RuntimeExports & {
  HEAPF64: Float64Array;
  HEAPF32: Float32Array;
  HEAPU8: Uint8Array;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  ccall(name: "editor_input_key", returnType: null, argTypes: ["string", "number"], args: [string, number]): void;
  ccall(name: "editor_set_input_bindings", returnType: null, argTypes: ["string"], args: [string]): void;
  ccall(name: "editor_bindings_error", returnType: "string", argTypes: [], args: []): string;
  // Text-in/text-out calls added with the 0.51.0 script host (bridge.cpp):
  // names, props, prefab templates, spawned-prefab lookup, command text.
  ccall(name: "editor_set_name" | "editor_set_script_props", returnType: null, argTypes: ["number", "string"], args: [number, string]): void;
  ccall(name: "editor_template_begin", returnType: null, argTypes: ["string"], args: [string]): void;
  ccall(name: "editor_profile_text", returnType: "string", argTypes: [], args: []): string;
  ccall(name: "editor_ui_event", returnType: null, argTypes: ["string", "string"], args: [string, string]): void;
  ccall(name: "editor_script_notify", returnType: null, argTypes: ["number", "string", "string"], args: [number, string, string]): void;
  ccall(name: "editor_spawned_prefab", returnType: "string", argTypes: ["number"], args: [number]): string;
  ccall(name: "editor_command_text", returnType: "string", argTypes: ["number", "number"], args: [number, number]): string;
  // Arcade cars and AI drivers: see editor_set_car/editor_set_driver/editor_vehicle_value.
  // Spaceflight: see editor_space_* and editor_set_spaceship.
  // Catch-all for text calls added from 0.59.0 on.
  ccall(name: string, returnType: "string" | "number" | null, argTypes: Array<"string" | "number">, args: Array<string | number>): any;
  // editor_set_script_source/editor_script_error/editor_seed_save/
  // editor_dirty_save_key/editor_dirty_save_value's own doc comments
  // (bridge.cpp) explain why these go through ccall instead of a direct
  // _editor_* binding like everything above: a Lua source string, an error
  // message, and a save key/value are text, which can't travel through the
  // all-double ABI the rest of this type uses. Exported via
  // -sEXPORTED_RUNTIME_METHODS=ccall in tools/build_editor.sh.
  ccall(name: "editor_set_script_source", returnType: null, argTypes: ["number", "string"], args: [number, string]): void;
  ccall(name: "editor_script_error", returnType: "string", argTypes: ["number"], args: [number]): string;
  ccall(name: "editor_seed_save", returnType: null, argTypes: ["string", "string"], args: [string, string]): void;
  ccall(name: "editor_dirty_save_key", returnType: "string", argTypes: ["number"], args: [number]): string;
  ccall(name: "editor_dirty_save_value", returnType: "string", argTypes: ["number"], args: [number]): string;
  ccall(name: "editor_script_key", returnType: null, argTypes: ["string", "number"], args: [string, number]): void;
  ccall(name: "editor_take_animation_request", returnType: "string", argTypes: ["number"], args: [number]): string;
};
declare const createEditorRuntime: () => Runtime | Promise<Runtime>;
// ccall copies string arguments onto the small wasm stack, and scene
// scripts run past 100 KB: copy them to the heap instead, freed after the call.
function heapStrings(runtime: Runtime) {
  const ccall = runtime.ccall.bind(runtime);
  const encoder = new TextEncoder();
  runtime.ccall = ((name: string, returnType: "string" | "number" | null, argTypes: Array<"string" | "number">, args: Array<string | number>) => {
    const pointers: number[] = [];
    const heapArgs = args.slice();
    try {
      const types = argTypes.map((type, i) => {
        const value = args[i];
        if (type !== "string" || typeof value !== "string") return type;
        const bytes = encoder.encode(value);
        const ptr = runtime._malloc(bytes.length + 1);
        if (!ptr) throw new Error(`${name}: out of memory for a ${bytes.length}-byte string`);
        runtime.HEAPU8.set(bytes, ptr);
        runtime.HEAPU8[ptr + bytes.length] = 0;
        pointers.push(ptr);
        heapArgs[i] = ptr;
        return "number";
      });
      return ccall(name, returnType, types, heapArgs);
    } finally {
      for (const ptr of pointers) runtime._free(ptr);
    }
  }) as Runtime["ccall"];
}
async function startEditor() {
  const C = {} as Ctx;
  installEnvironment(C);
  installCameras(C);
  installPostfx(C);
  installAudio(C);
  installHeldGuns(C);
  installEffects(C);
  installActions(C);
  installAssets(C);
  installSpace(C);
  installScriptHost(C);
  installExplorer(C);
  installInput(C);
  installSaves(C);
  installAnimation(C);
  installRuntimeSync(C);
  installLoot(C);
  installSceneObjects(C);
  installPanels(C);
  installUiActions(C);
  installVehicles(C);
  installFrame(C);
  installHud(C);
  Object.assign(C, { el, log });
  const doc = new EditorDocument(new LocalStorageSceneStore("game-engine-editor:command-scene:"));
  C.doc = doc;
  const app = document.querySelector<HTMLDivElement>("#app")!;
  C.app = app;
  app.innerHTML = editorLayoutHtml({ editorVersion, catalogCategories, modelCount: modelCatalog.length });
  function el<T extends HTMLElement = HTMLElement>(id: string) {
    return document.getElementById(id) as T;
  }
  function log(value: unknown) {
    el("log").textContent = JSON.stringify(value, null, 2);
  }
  // Content checks: the scene's authoring mistakes, by entity
  // (problemsPanel.ts).
  const problems = new ProblemsPanel(el("problems"), {
    scene: () => doc.scene,
    modelExists: (id) => !!C.catalogEntry(id),
    select: (ref) => {
      doc.selection = ref;
      C.updatePanels();
    },
  });
  const runContentCheck = () => problems.run();
  const scheduleContentCheck = () => problems.schedule();
  C.scheduleContentCheck = scheduleContentCheck;
  const inspectorIssues = (entity: EntityRef, type: string) => problems.issuesFor(entity, type);
  C.inspectorIssues = inspectorIssues;
  const viewport = el("viewport");
  C.viewport = viewport;
  /* declared in the context */
  C.backend = "WebGL";
  try {
    C.renderer = new THREE.WebGLRenderer({ antialias: true });
    C.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    C.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Real-time shadows: the sun, plus any Light with castShadows.
    C.renderer.shadowMap.enabled = true;
    C.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch {
    C.renderer = new CanvasRenderer();
    C.backend = "Canvas compatibility";
  }
  C.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewport.appendChild(C.renderer.domElement);
  // Screen-space HUD (Health bars): a second canvas layered over the
  // renderer's own via DOM order, sized to match it 1:1. Not part of the
  // Three.js scene graph — bars are 2D rectangles drawn from each Health
  // entity's projected screen position, the same approach the native
  // playground's BoxView::draw_bar uses. pointer-events: none so it never
  // steals the orbit/gizmo drag or click-to-select handling already wired
  // to renderer.domElement underneath it.
  const hud = document.createElement("canvas");
  C.hud = hud;
  hud.id = "hud";
  hud.style.pointerEvents = "none";
  viewport.appendChild(hud);
  const hudCtx = hud.getContext("2d")!;
  C.hudCtx = hudCtx;
  // The canvas HUD's text, mirrored into a visually hidden live region so
  // screen readers (and the browser test) can read what UI elements say.
  const hudText = document.createElement("div");
  C.hudText = hudText;
  hudText.id = "hud-text";
  hudText.setAttribute("aria-live", "polite");
  hudText.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
  viewport.appendChild(hudText);
  const scene = new THREE.Scene();
  C.scene = scene;
  scene.background = new THREE.Color("#101a26");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  C.camera = camera;
  camera.position.set(8, 7, 10);
  const controls = new OrbitControls(camera, C.renderer.domElement);
  C.controls = controls;
  controls.target.set(0, 1, 0);
  controls.update();
  const hemisphere = new THREE.HemisphereLight(0xd8eeff, 0x405036, 3);
  C.hemisphere = hemisphere;
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  C.sun = sun;
  sun.position.set(4, 8, 5);
  scene.add(sun);
  scene.add(sun.target);
  // The sun's shadow frustum is a 50 x 50 box that follows the camera's
  // focus point every frame (see updateSunShadow), so shadows stay sharp
  // near the action instead of stretching over the whole world.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  // Enough normal bias that low suns don't stripe thin flat boxes with acne.
  sun.shadow.normalBias = 0.05;
  const sunDirection = new THREE.Vector3(4, 8, 5).normalize();
  C.sunDirection = sunDirection;
  // The physics ground plane (y = 0) had no visible surface; this one only
  // shows shadows, so the look is otherwise unchanged.
  const shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.35 }));
  C.shadowGround = shadowGround;
  shadowGround.rotation.x = -Math.PI / 2;
  shadowGround.receiveShadow = true;
  scene.add(shadowGround);
  // Environment: sky, sun, ambient, fog, exposure. Applied on every
  // rebuild(); the sky and its image-based lighting are only regenerated
  // when the Environment's values actually change.
  C.environmentKey = "";
  /* declared in the context */
  /* declared in the context */
  const pmrem = C.renderer instanceof THREE.WebGLRenderer ? new THREE.PMREMGenerator(C.renderer) : undefined;
  C.pmrem = pmrem;
  // fx.light (GATEBREAKER M4): a script's ambient and sun intensities over
  // the Environment's, so one scene can be a dark dungeon and a lit street.
  // Cleared when the scene is rebuilt.
  /* declared in the context */
  // fx.time_of_day (GATEBREAKER M4): while set, the hour's sun or moon,
  // sky colour, fog and ambient (timeOfDay.ts) stand in for the
  // Environment's and fx.light's; cleared, those come back (a Gate keeps its
  // own light). Updated in place: nothing is allocated per change.
  /* declared in the context */
  const skyState = createSkyState();
  C.skyState = skyState;
  const skyBackground = new THREE.Color();
  C.skyBackground = skyBackground;
  const skyFog = new THREE.FogExp2(0x000000, 0);
  C.skyFog = skyFog;
  /* declared in the context */
  C.environmentExposure = 1;
  // Game cameras: during Play the highest-priority Camera entity
  // renders the view from its own position and rotation.
  const gamePerspective = new THREE.PerspectiveCamera();
  C.gamePerspective = gamePerspective;
  const shakeCamera = new THREE.PerspectiveCamera();
  C.shakeCamera = shakeCamera;
  const gameOrthographic = new THREE.OrthographicCamera();
  C.gameOrthographic = gameOrthographic;
  // -- First-person view ----------------------------------------
  // The editor owns look (mouse, right-drag, right stick) so it stays smooth
  // at any display rate, and sends it to the runtime every frame
  // (editor_set_look). The camera sits at the player's feet, interpolated
  // between the last two fixed ticks, plus the eased eye height and the
  // view effects in fpsView.ts.
  const fps = {
    look: { yaw: 0, pitch: 0 } as Look,
    view: new ViewEffects(),
    camera: new THREE.PerspectiveCamera(75, 1, 0.05, 2000),
    previous: new THREE.Vector3(),
    current: new THREE.Vector3(),
  };
  C.fps = fps;
  // Third-person shooting (shooterView.ts, gunHold.ts): a Player with a
  // ThirdPerson controller and Weapons aims over the shoulder, and every
  // character with Weapons holds its current gun.
  const tps = {
    view: new ShooterView(),
    camera: new THREE.PerspectiveCamera(60, 1, 0.05, 2000),
    kick: 0,
    lastFire: -Infinity,
    aimWasDown: false,
    // Aim assist's look slowdown for the next look input, and the hostile
    // under the crosshair (-1 none).
    lookScale: 1,
    over: -1,
    padSwap: false,
    // Hits and kills this Play, for the HUD's hit markers and tests.
    hits: 0,
    kills: 0,
    // The Player's current Weapons slot is a melee one (refreshed each frame).
    meleeInHand: false,
  };
  C.tps = tps;
  // Characters holding a gun, by object index, and the gun each holds.
  // `hands` is what the Weapons slot puts in the hands besides a gun (a
  // melee slot's blade, an off-hand shield or dagger), and `holders` those
  // models (heldWeapons.ts).
  const gunPoses = new Map<
    number,
    { pose: GunPose; gun: string; raised: number; kick: number; oneHanded?: boolean; rest: THREE.Object3D; object: THREE.Object3D; hands: string; holders: THREE.Object3D[] }
  >();
  C.gunPoses = gunPoses;
  const isGunPath = (path: string) => /\/weapons\/(pistol|revolver|smg|rifle|carbine|bullpup|shotgun|sniper)-[\w-]+\.glb$/.test(path);
  C.isGunPath = isGunPath;
  // A first-person player who died: the view stays where they fell,
  // sinking toward the ground and rolling over.
  C.deathRoll = 0;
  // Largest landing speed reported by this frame's ticks.
  C.fpsLanding = 0;
  // -- Camera rig (CameraFollow) and shake --------------------------------
  const rig = { position: new THREE.Vector3(), yaw: 0, pitch: 0, placed: false, frameDt: 1 / 60, fovExtra: 0, lastTarget: undefined as THREE.Object3D | undefined, lastTargetPosition: new THREE.Vector3(), movementDirection: new THREE.Vector3(), movementSpeed: 0 };
  C.rig = rig;
  const shake = { intensity: 0, remaining: 0, duration: 1 };
  C.shake = shake;
  const rigRaycaster = new THREE.Raycaster();
  C.rigRaycaster = rigRaycaster;
  const blockSphere = new THREE.Sphere(),
    blockSegment = new THREE.Line3(),
    blockPoint = new THREE.Vector3();
  C.blockSphere = blockSphere;
  C.blockSegment = blockSegment;
  C.blockPoint = blockPoint;
  // Orbit: dragging on the viewport during Play turns the rig.
  let orbitDrag: { x: number; y: number } | undefined;
  C.renderer.domElement.addEventListener("pointerdown", (event) => {
    if (doc.mode === "play") orbitDrag = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener("pointerup", () => (orbitDrag = undefined));
  window.addEventListener("pointermove", (event) => {
    if (!orbitDrag || C.shooterActive()) return;
    const look = 0.005 * playerSettings.sensitivity;
    rig.yaw -= (event.clientX - orbitDrag.x) * look;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + (event.clientY - orbitDrag.y) * look * (playerSettings.invertY ? -1 : 1), -0.2, 1.4);
    orbitDrag = { x: event.clientX, y: event.clientY };
  });
  const grid = new THREE.GridHelper(40, 40, 0x658ca8, 0x2b3c4c);
  C.grid = grid;
  scene.add(grid);
  // Post-processing: a subtle, always-on bloom so a bright authored Light (or
  // the sun/hemisphere above) actually reads as glowing instead of just a
  // flat-lit surface -- no per-scene toggle, matching this project's existing
  // preference for fixing the default look rather than exposing a render
  // knob (see F32's tone-mapping fix). WebGL-only: the CanvasRenderer
  // compatibility fallback below has no render-target/shader pipeline for
  // EffectComposer to drive, so frame() falls back to a plain renderer.render
  // for it, same as before this round.
  const composer = C.renderer instanceof THREE.WebGLRenderer ? new EffectComposer(C.renderer) : undefined;
  C.composer = composer;
  const renderPass = new RenderPass(scene, camera);
  C.renderPass = renderPass;
  // The camera the last frame rendered with: the editor camera, or a game
  // Camera entity during Play. HUD projection and WASD use the same one.
  C.viewCamera = camera;
  /* declared in the context */
  // The Manhwa style (manhwa.ts): toon shading on every standard material,
  // and the ink pass reading the scene's depth.
  installToonShading();
  const inkPass = new InkPass(camera);
  C.inkPass = inkPass;
  if (composer) {
    attachDepth([composer.renderTarget1, composer.renderTarget2]);
    composer.addPass(renderPass);
    C.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.85);
    composer.addPass(C.bloomPass);
    composer.addPass(new OutputPass());
  }
  const objects: THREE.Object3D[] = [];
  C.objects = objects;
  // Animator state machines, indexed like objects[]: the parsed graph plus a
  // runtime that is recreated whenever Play starts.
  const animators: ({ graph: AnimatorGraph; runtime: AnimatorRuntime } | undefined)[] = [];
  C.animators = animators;
  const animatorErrors: string[] = [];
  C.animatorErrors = animatorErrors;
  // Parallel to `objects`; index i holds the animation state for objects[i], or
  // undefined for a non-animated (static) entity. Reset alongside objects on every rebuild().
  const animStates: (AnimState | undefined)[] = [];
  C.animStates = animStates;
  const governor = new FrameGovernor();
  C.governor = governor;
  const gestureBones = new WeakMap<AnimState, GestureBones>();
  C.gestureBones = gestureBones;
  const probe = new ReflectionProbe();
  C.probe = probe;
  C.probeScanAt = 0;
  // Static batching: still scenery merged per material while playing.
  const staticBatcher = new StaticBatcher();
  C.staticBatcher = staticBatcher;
  C.batchAt = Infinity;
  C.batchCheckAt = 0;
  C.crowdFrame = 0;
  // Characters who can talk, and which of them stood still last tick.
  C.talkerIndices = [];
  C.talkerScan = -1; // objects.length when talkerIndices was built
  C.talkerResting = new Set<number>();
  C.talkerWasResting = new Set<number>();
  // Parallel to `objects`, same shape as animStates. Reset alongside objects
  // on every rebuild().
  const particleStates: (ParticleState | undefined)[] = [];
  C.particleStates = particleStates;
  // Parallel to `objects`, same shape as animStates/particleStates. Reset
  // (disposing any still-fading materials) alongside objects on every
  // rebuild() -- safe because rebuild() never runs mid-Play (doc.execute()
  // itself refuses outside Edit mode, and the one async rebuild trigger
  // that could fire during Play, a catalog model finishing its load, is
  // gated to doc.mode === "edit"), so a fade in progress is never
  // interrupted by one.
  const deathStates: (DeathState | undefined)[] = [];
  C.deathStates = deathStates;
  // A fresh emitter per rebuild(), same as every mesh/light here. The
  // simulation lives in particles.ts; this owns the GPU side: a Points
  // cloud whose shader reads per-particle color and size and draws each as
  // a soft round sprite, blended additively (a fully faded particle is
  // black, which adds nothing).
  const particleVertexShader = `
    attribute float size;
    attribute vec3 color;
    uniform float scale;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * scale / max(-mv.z, 0.001);
      gl_Position = projectionMatrix * mv;
    }`;
  C.particleVertexShader = particleVertexShader;
  const particleFragmentShader = `
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = dot(c, c);
      if (d > 0.25) discard;
      gl_FragColor = vec4(vColor * (1.0 - d * 4.0), 1.0);
    }`;
  C.particleFragmentShader = particleFragmentShader;
  const particleScale = { value: 500 };
  C.particleScale = particleScale;
  // Weapons: viewmodel, effects and combat HUD (weaponFx.ts), and
  // the viewmodel's own render pass after the world (depth cleared, so the
  // gun never clips into walls).
  const weaponFx = new WeaponFx(scene, C.makeEffectPoints);
  C.weaponFx = weaponFx;
  // Arcade cars' presentation and HUD.
  const carFx = new CarFx(scene, C.makeEffectPoints);
  C.carFx = carFx;
  // Each car's box size (width, height, length), recorded when built.
  const carSizes = new WeakMap<THREE.Object3D, THREE.Vector3>();
  C.carSizes = carSizes;
  const viewmodelPass = new RenderPass(weaponFx.viewScene, weaponFx.viewCamera);
  C.viewmodelPass = viewmodelPass;
  viewmodelPass.clear = false;
  viewmodelPass.clearDepth = true;
  viewmodelPass.enabled = false;
  composer?.insertPass(viewmodelPass, 1);
  // Right after the scene (and the viewmodel): it needs the depth the scene left.
  composer?.insertPass(inkPass, 2);
  // Post-processing (postFx.ts): grading and anti-aliasing after
  // tone mapping, ambient occlusion on the world before the viewmodel.
  const gradingPass = new ShaderPass(gradingShader);
  C.gradingPass = gradingPass;
  gradingPass.enabled = false;
  const fxaaPass = new ShaderPass(FXAAShader);
  C.fxaaPass = fxaaPass;
  fxaaPass.enabled = false;
  const smaaPass = new SMAAPass(1, 1);
  C.smaaPass = smaaPass;
  smaaPass.enabled = false;
  composer?.addPass(gradingPass);
  composer?.addPass(fxaaPass);
  composer?.addPass(smaaPass);
  /* declared in the context */
  C.postSettings = defaultPostSettings;
  // Audio: every sound goes through the mixer's buses; world
  // sounds are positional and muffled behind solid geometry.
  /* declared in the context */
  /* declared in the context */
  const listenerPosition = new THREE.Vector3();
  C.listenerPosition = listenerPosition;
  // Melee: fighters' bodies, impacts and the fighter HUD (combatView.ts).
  // GATEBREAKER's interface (ledger.ts): system windows, panel cutscenes, the boss bar.
  const ledger = new LedgerHud();
  C.ledger = ledger;
  // GATEBREAKER M4: the minimap and the M map from a script's hud.map_layout (minimap.ts).
  const districtMap = new DistrictMap();
  C.districtMap = districtMap;
  // At most 8 point lights shade the scene at once (lightPool.ts).
  const lightPool = new LightPool(scene);
  C.lightPool = lightPool;
  const combat = new CombatView(scene, {
    value: (i, field) => C.runtime._editor_fighter_value(i, field),
    text: (i, move, field) => C.runtime.ccall("editor_fighter_text", "string", ["number", "number", "number"], [i, move, field]),
    takeEvents: () => C.runtime._editor_take_melee_events(),
    event: (i, field) => C.runtime._editor_melee_event(i, field),
    playerIndex: () => C.playerIndex,
    health: (i) => (C.runtime._editor_alive(i) ? C.runtime._editor_value(i, EntityField.health) : 0),
    sound: (at) => (C.audioContext ? (at ? C.soundsAt(at) : C.sounds()) : undefined),
    shake: (intensity, seconds) => {
      shake.intensity = Math.max(shake.intensity, intensity);
      shake.duration = shake.remaining = Math.max(shake.remaining, seconds);
    },
  });
  C.combat = combat;
  // The clip library once loaded, and the fighters waiting for it.
  /* declared in the context */
  const waitingFighters: { index: number; object: THREE.Object3D; state: AnimState }[] = [];
  C.waitingFighters = waitingFighters;
  const fighterVelocity = new THREE.Vector3();
  C.fighterVelocity = fighterVelocity;
  const playerSteps = new FootstepTracker();
  C.playerSteps = playerSteps;
  const soldierSteps = new Map<number, { tracker: FootstepTracker; previous: THREE.Vector3 }>();
  C.soldierSteps = soldierSteps;
  // Ease in/out of the aim-down-sights zoom.
  C.zoomBlend = 0;
  /* declared in the context */
  // First-person arms: the player's own animated Renderable (it may
  // be invisible) or, without one, the Mannequin, holds the weapons, tinted
  // by the player's Material.
  const firstPersonBodyFallback = 132;
  C.firstPersonBodyFallback = firstPersonBodyFallback;
  // Every gun in a character's hands, posed after the animation (gunHold.ts).
  // A third-person Player's points where the crosshair does, raised while
  // aiming or just after a shot and at the ready otherwise; a soldier's
  // points where it faces, raised while it fights.
  const missingGuns = new Set<string>();
  C.missingGuns = missingGuns;
  const particleOrigin = new THREE.Vector3();
  C.particleOrigin = particleOrigin;
  const trailStates: TrailState[] = [];
  C.trailStates = trailStates;
  const trailScratch = new THREE.Vector3();
  C.trailScratch = trailScratch;
  const deathFadeDuration = 1.0;
  C.deathFadeDuration = deathFadeDuration;
  const geometry = new THREE.BoxGeometry();
  C.geometry = geometry;
  const material = new THREE.MeshStandardMaterial({ color: 0x61adba });
  C.material = material;
  // Blast projectiles are spawned entirely at runtime in C++ (see
  // editor_projectile_count/_value in bridge.cpp) and have no authored
  // entity of their own, so they get their own small pool of meshes here
  // instead of living in `objects`/`rebuild()`, grown/shrunk to match
  // however many currently exist each Play-mode frame.
  const projectileGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  C.projectileGeometry = projectileGeometry;
  const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0x78c8ff });
  C.projectileMaterial = projectileMaterial;
  const projectileMeshes: THREE.Mesh[] = [];
  C.projectileMeshes = projectileMeshes;
  const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xffce70);
  C.selection = selection;
  selection.visible = false;
  scene.add(selection);
  const gizmo = new TransformControls(camera, C.renderer.domElement);
  C.gizmo = gizmo;
  scene.add(gizmo.getHelper());
  // Off while two or more fingers are down (a pinch or pan, not a drag).
  C.gizmoPaused = false;
  const snapshot = (object: THREE.Object3D): TransformSnapshot => ({
    position: {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
    },
    rotation: {
      x: object.rotation.x,
      y: object.rotation.y,
      z: object.rotation.z,
    },
    scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
  });
  let gesture:
    | {
        entity: NonNullable<typeof doc.selection>;
        mode: TransformMode;
        before: TransformSnapshot;
      }
    | undefined;
  gizmo.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value;
  });
  gizmo.addEventListener("mouseDown", () => {
    if (doc.mode === "edit" && doc.selection && gizmo.object)
      gesture = {
        entity: doc.selection,
        mode: gizmo.mode,
        before: snapshot(gizmo.object),
      };
  });
  gizmo.addEventListener("mouseUp", () => {
    const current = gesture;
    gesture = undefined;
    if (!current || !gizmo.object) return;
    const after = snapshot(gizmo.object);
    if (current.mode === "scale") {
      current.before.scale = C.toLiteralScale(current.entity, current.before.scale);
      after.scale = C.toLiteralScale(current.entity, after.scale);
    }
    const command = transformCommand(current.entity, current.mode, current.before, after);
    queueMicrotask(() => {
      if (command) C.execute(command);
      C.rebuild();
    });
  });
  for (const mode of ["translate", "rotate", "scale"] as const)
    el(mode).onclick = () => {
      if (doc.mode !== "edit" || gizmo.dragging) return;
      gizmo.setMode(mode);
      for (const id of ["translate", "rotate", "scale"]) el(id).setAttribute("aria-pressed", String(mode === id));
    };
  el<HTMLSelectElement>("space").onchange = () => gizmo.setSpace(el<HTMLSelectElement>("space").value as "world" | "local");
  el("snap").onchange = C.configureSnap;
  el("snap-size").onchange = C.configureSnap;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && gesture && gizmo.object) {
      const b = gesture.before;
      gizmo.object.position.set(b.position.x, b.position.y, b.position.z);
      gizmo.object.rotation.set(b.rotation.x, b.rotation.y, b.rotation.z);
      gizmo.object.scale.set(b.scale.x, b.scale.y, b.scale.z);
      gesture = undefined;
      gizmo.dragging = false;
      gizmo.axis = null;
      queueMicrotask(C.rebuild);
    }
  });
  const gltfLoader = new GLTFLoader();
  C.gltfLoader = gltfLoader;
  const catalogCache = new Map<number, CachedModel>();
  C.catalogCache = catalogCache;
  const catalogPromises = new Map<number, Promise<CachedModel>>();
  C.catalogPromises = catalogPromises;
  // Ids with a rebuild()-on-load callback already attached (see the rebuild()
  // fallback branch below). A scene with N entities sharing one uncached
  // catalog id must trigger exactly one rebuild() when it resolves, not N —
  // each rebuild() re-clones the whole scene, so N would be O(N) redundant
  // full-scene rebuilds for what is, functionally, one load finishing.
  const pendingCatalogRebuilds = new Set<number>();
  C.pendingCatalogRebuilds = pendingCatalogRebuilds;
  // A retired id (a saved scene from before its model was replaced) draws
  // its replacement, and says so once.
  const retiredNoted = new Set<number>();
  C.retiredNoted = retiredNoted;
  // -- Audio ------------------------------------------------------------
  // A Sound component's playback is scoped to a Play session the same way
  // Script's on_tick and AIAgent already are: autoplay starts every marked
  // entity's clip the moment Play begins, Pause suspends the whole
  // AudioContext (pausing every currently-playing sound's output in place,
  // not just muting it) and Stop tears them down. There is no per-event
  // trigger (a melee hit landing, a footstep) -- that needs the bridge to
  // expose which tick an event actually fired, which this round doesn't add.
  /* declared in the context */
  // Generative music: scripts pick the mood (host.send("music", ...)).
  /* declared in the context */
  C.musicMood = "off";
  const soundBuffers = new Map<number, AudioBuffer>();
  C.soundBuffers = soundBuffers;
  const soundBufferPromises = new Map<number, Promise<AudioBuffer>>();
  C.soundBufferPromises = soundBufferPromises;
  // Keyed by entity index, the same indexing syncRuntime()/objects[] use --
  // populated on Play start, torn down on Stop, so a sound never keeps
  // playing (or gets started twice) across a Stop/Play cycle.
  const activeSounds = new Map<number, AudioBufferSourceNode>();
  C.activeSounds = activeSounds;
  // Positional Sound components, moved with their entity every frame.
  const activePanners = new Map<number, PannerNode>();
  C.activePanners = activePanners;
  // Bumped on every fresh Play (edit -> play). A clip load kicked off by one
  // Play session can still be in flight (loadSoundBuffer's promise cache is
  // keyed by clip id, not by session) when Stop, then Play again, happens
  // before it resolves -- without this, both the stale and the fresh
  // session's callback would fire off that one shared promise, starting two
  // independent sources for the same entity; the second activeSounds.set()
  // would then only ever let Stop reach one of them, leaking the other
  // (audibly, forever, for a looping clip) until the page reloads.
  C.playSession = 0;
  /* declared in the context */
  try {
    C.runtime = await createEditorRuntime();
    heapStrings(C.runtime);
    el("runtime").textContent = "C++ runtime ready";
  } catch (error) {
    el("status").textContent = "Runtime failed to load. Reload or check build.";
    throw error;
  }
  // Whether the last Play frame ran at least one fixed tick (see frame()).
  C.inputFrameConsumed = true;
  C.accumulator = 0;
  C.previous = performance.now();
  C.ticks = 0;
  // Index into objects[]/the runtime's own entity list of the first
  // Player-tagged entity synced this Play session, or -1 if there is none.
  // Recomputed by syncRuntime() (Play, and Stop-then-Play again); stays
  // fixed for the rest of that session, matching the fact that entities
  // can't be added or removed while playing.
  C.playerIndex = -1;
  // -- Spaceflight: the scene's SpaceSystem, drawn by SpaceView ---
  C.shipIndex = -1;
  /* declared in the context */
  /* declared in the context */
  /* declared in the context */
  // Walking anywhere: the frame the scatter and ground were built
  // for, the plants and rocks around it, and authored objects hidden while
  // the frame is away from the site.
  C.spaceFrame = -1;
  /* declared in the context */
  C.spaceSpecies = [];
  C.scatterTargets = [];
  C.scatterModelsReady = false;
  const hiddenAway = new Set<number>();
  C.hiddenAway = hiddenAway;
  // Sites: the Site entities' indices, and each entity's site
  // (-1: the home site).
  C.siteIndices = [];
  C.memberSite = [];
  // The scanner, for any scene with Scannable entities or species.
  const scanner = new Scanner();
  C.scanner = scanner;
  C.scannableIndices = [];

  // -- Exploration: maps, weather, harvesting, settings ----------
  // Scripts drive these through host.send(kind, text); see handleHost.
  const playerSettings = loadSettings();
  C.playerSettings = playerSettings;
  const announcer = new Announcer(app);
  C.announcer = announcer;
  /* declared in the context */
  // The visor and the suit light.
  const visor = new Visor();
  C.visor = visor;
  /* declared in the context */
  C.suitLightMode = "auto";
  C.suitLightLevel = 0;
  /* declared in the context */
  C.explorerBodies = [];
  C.mapMode = "off";
  C.minimapAllowed = true;
  const mapSites = new Map<string, MapSite & { body: string }>();
  C.mapSites = mapSites;
  const latLonWaypoints = new Map<string, { body: string; latitude: number; longitude: number; label: string }>();
  C.latLonWaypoints = latLonWaypoints;
  const surfaceImages = new Map<number, HTMLCanvasElement>();
  C.surfaceImages = surfaceImages;
  const catalogued = new Set<string>();
  C.catalogued = catalogued;
  C.scatterPlacements = [];
  const harvested = new Set<number>();
  C.harvested = harvested;
  C.nearHarvest = "";
  C.softGround = true;
  // Prospecting: species keys to find and the marker label ("" = off).
  /* declared in the context */
  /* declared in the context */
  /* declared in the context */
  C.wasLanded = true;
  // Gear (world.wear, GATEBREAKER M3.5): catalog models skinned to the
  // same skeleton as a character, bound to its bones by name, so they move
  // with every clip it plays; "id:#rrggbb" tints a piece. Indexed like
  // objects[].
  const outfits = new Map<number, THREE.Object3D[]>();
  C.outfits = outfits;
  // The settings panel while it's open: during Play the game waits and the
  // keys stay with the panel (Esc closes it).
  /* declared in the context */
  // hud.pause_menu(true) (GATEBREAKER M4): Esc, or the browser taking back
  // a captured mouse (Esc never reaches the page then), opens it as a pause
  // menu. A click on Resume or outside closes it; the mouse isn't captured
  // again on its own (the browser refuses for a moment after an Esc).
  C.pauseMenu = false;
  C.unlockingUntil = 0;
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement || doc.mode !== "play" || !C.pauseMenu || performance.now() < C.unlockingUntil) return;
    C.openPlayerSettings(true);
  });
  // Rebound keys (the settings' Keys), per game: a pressed code -> the code
  // the game sees.
  C.keyRemap = loadKeyRemap(document.title);
  // Toggle block (a setting): the codes the game's block action is bound to.
  C.blockCodes = new Set<string>();
  /* declared in the context */
  // Harvested specimens by place: "<body>:<lat>:<lon>|<index>".
  const harvestedSpots = new Set<string>();
  C.harvestedSpots = harvestedSpots;
  const sway = swayUniforms();
  C.sway = sway;
  const swayCache = new Map<THREE.Material, THREE.Material>();
  C.swayCache = swayCache;
  const swayDepth = swayDepthMaterial(sway);
  C.swayDepth = swayDepth;
  // The player's authored scale at the moment Play started, and its y position
  // the moment before this frame's ticks ran — the jump squash/stretch effect
  // (see frame()) needs an un-squashed baseline to scale from each frame,
  // since it mutates player.scale directly, and a per-frame vertical delta to
  // react to. Both null/0 until Play actually starts (see the Play handler).
  C.playerBaseScale = null;
  C.playerPrevY = 0;
  // Orbit target saved when Play starts, so Stop can restore it — Play mode
  // overwrites controls.target every frame to follow the player, and without
  // this the edit camera would stay aimed at wherever the player last was
  // instead of back at whatever the user had framed before pressing Play.
  let prePlayTarget: THREE.Vector3 | null = null;
  // W/A/S/D/Shift/F/G key transitions since the last drained frame, queued
  // here by the keydown/keyup listeners below and drained once per rendered
  // frame in frame() — mirrors the native platform's own poll-events-once-
  // per-frame loop (source/engine/runtime/application.cpp) rather than
  // applying each event to the WASM runtime synchronously from the DOM
  // handler, so editor_input_begin_frame()/editor_key() stay in the same
  // relative order every native InputState consumer already assumes.
  // editor_value's field 5 own contract (apps/editor/runtime/bridge.cpp): a plain int
  // matching AIStateName's declared order in ../scene/Components.
  const aiStateNames: readonly AIStateName[] = ["Idle", "Walking", "Running", "Driving", "Fleeing", "Chasing", "Dead"];
  C.aiStateNames = aiStateNames;
  // Every key by KeyboardEvent.code, for the native InputState (movement,
  // F/G combat and named actions -- see editor_input_key, bridge.cpp).
  const keyQueue: Array<[code: string, down: number]> = [];
  C.keyQueue = keyQueue;
  // Codes currently held down, so a Pause or a lost window focus can force
  // them back up even when no matching keyup DOM event arrives (alt-tab, a
  // window manager shortcut eating the key, etc.).
  const heldKeys = new Set<string>();
  C.heldKeys = heldKeys;
  // C (crouch/sit) freezes Player WASD natively while held (see
  // editor.move, bridge.cpp) and plays a sit clip (see the locomotion picker).
  const crouchKeyCode = "KeyC";
  C.crouchKeyCode = crouchKeyCode;
  // Every physical key (not just the bound seven above) queued the same way,
  // for a Script's own input.down/input.pressed (engine::script::Runtime's
  // own doc comment, script.hpp, on why this is a separate, wider path from
  // InputState/editor_key). Keyed by event.key.toLowerCase(), not
  // event.code -- the readable form a script author actually writes
  // (input.down("f")), not a physical-layout string like "KeyF".
  const scriptKeyQueue: Array<[key: string, down: number]> = [];
  C.scriptKeyQueue = scriptKeyQueue;
  const heldScriptKeys = new Set<string>();
  C.heldScriptKeys = heldScriptKeys;
  // event.key depends on modifier state (Shift+1 is "!"), so recomputing it
  // on keyup can pair a key-down with a different key-up identity -- e.g.
  // Shift released before "1": the down edge queued "!", but the up edge
  // would then queue "1", leaving input.down("!") stuck true forever with
  // no matching release. Recording each physical event.code's logical key
  // at press time and releasing that same value avoids the mismatch.
  const scriptKeyByCode = new Map<string, string>();
  C.scriptKeyByCode = scriptKeyByCode;
  window.addEventListener("keydown", (event) => {
    if (doc.mode !== "play" || event.repeat) return;
    if (event.code === "F10") {
      event.preventDefault();
      C.openPlayerSettings();
      return;
    }
    if (C.settingsPanel) {
      if (event.code === "Escape") {
        event.preventDefault();
        C.settingsPanel.close();
      }
      return;
    }
    if (event.code === "Escape" && C.pauseMenu && document.pointerLockElement !== C.renderer.domElement) {
      event.preventDefault();
      C.openPlayerSettings(true);
      return;
    }
    // Keep Space/arrows from scrolling the page, and Tab (a lock-on key)
    // from moving focus, while a game has the keys -- unless the user is
    // typing into a field.
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (!typing && (event.code === "Space" || event.code === "Tab" || event.code.startsWith("Arrow"))) event.preventDefault();
    // A panel cutscene holds the keys: Space or Enter skips it (and still
    // reaches scripts, so a director knows).
    // A rebound key gives the game the code (and key) it stands for.
    const code = C.keyRemap[event.code] ?? event.code;
    if (ledger.playing) {
      event.preventDefault();
      if (code !== "Space" && code !== "Enter") return;
      ledger.skip();
    }
    // Toggle block: a press raises it, the next lowers it (keyup is ignored).
    if (playerSettings.blockToggle && C.isBlockCode(code) && heldKeys.has(code)) {
      C.gameKeyUp(code);
      return;
    }
    // A key that opens or closes a UI screen (UI.toggleKey) is used up by it.
    if (doc.mode === "play" && !typing && C.toggleKeyPressed(code)) {
      event.preventDefault();
      return;
    }
    keyQueue.push([code, 1]);
    heldKeys.add(code);
    const key = code === event.code ? event.key.toLowerCase() : keyForCode(code);
    scriptKeyByCode.set(code, key);
    scriptKeyQueue.push([key, 1]);
    heldScriptKeys.add(key);
    // Scripts may also name keys by code (KeyG, Enter, Space, Digit1).
    if (code && code !== key) {
      scriptKeyQueue.push([code, 1]);
      heldScriptKeys.add(code);
    }
  });
  window.addEventListener("keyup", (event) => {
    if (doc.mode === "edit") return;
    const code = C.keyRemap[event.code] ?? event.code;
    if (playerSettings.blockToggle && C.isBlockCode(code)) return;
    C.gameKeyUp(code, code === event.code ? event.key.toLowerCase() : keyForCode(code));
  });
  window.addEventListener("blur", () => {
    if (doc.mode !== "edit") C.releaseHeldKeys();
  });
  // The M map holds every key and click while it is open (minimap.ts).
  districtMap.bindInput(window, () => doc.mode === "play", C.releaseHeldKeys);
  // Save keys a previous persistDirtySaves() call failed to write (a full
  // origin quota, or storage access denied) -- engine::script::Runtime has
  // already forgotten these were ever dirty by the time that failure
  // happens (take_dirty_saves() drains its own pending set unconditionally,
  // whether or not the write that follows actually succeeds), so this is
  // the only place left holding them. Retried on every later call until one
  // succeeds; a newly-dirty write to the same key simply replaces the
  // queued value, the same last-write-wins semantics set_saved itself uses.
  const failedSaveWrites = new Map<string, string>();
  C.failedSaveWrites = failedSaveWrites;
  // Synonyms for the three reserved action keys editor.combat/editor.move/
  // editor.ai_attack (bridge.cpp) request natively -- "attack" on F, "blast"
  // on G, "sit" while crouching -- tried in order, case-insensitively,
  // against whatever clips a given model actually has. Different imported
  // packs name the "same" action differently (the Aether animal kit's
  // `Attack`, Mannequin F's own retargeted `punching`/`firing_rifle` vs its
  // native `sit`; see assets/CREDITS.md), so a single literal-name lookup
  // would silently no-op on most of the catalog. Not used for an ordinary
  // Lua self.animate request -- resolveActionClip below only expands a name
  // that's actually one of these three keys; anything else still resolves
  // case-insensitively against its own exact name only, the same as before
  // this list existed.
  // A Map, not a plain object literal -- a script's self.animate can be any
  // string a Lua author writes, including "constructor"/"toString"/
  // "__proto__", which a plain-object lookup would resolve to an inherited
  // Object.prototype value instead of undefined, crashing the render loop
  // (that value isn't an iterable string array) the moment the code below
  // tries to iterate it as one. A Map has no inherited keys to collide with.
  // A Map, not a plain object literal -- a script's self.animate can be any
  // string a Lua author writes, including "constructor"/"toString"/
  // "__proto__", which a plain-object lookup would resolve to an inherited
  // Object.prototype value instead of undefined, crashing the render loop
  // (that value isn't an iterable string array) the moment the code below
  // tries to iterate it as one. A Map has no inherited keys to collide with.
  const actionClipSynonyms = new Map<string, string[]>([
    ["attack", ["attack", "punch", "punching", "melee"]],
    ["blast", ["blast", "shoot", "firing_rifle", "fire", "ranged"]],
    ["sit", ["sit", "sitting", "crouch", "crouching"]],
  ]);
  C.actionClipSynonyms = actionClipSynonyms;
  const tickStates: TickState[] = [];
  C.tickStates = tickStates;
  // The last tick's bulk snapshot (editor_snapshot): six doubles per index
  // after a count; undefined until play's first tick.
  /* declared in the context */
  const tickSnapshotAlive = (i: number) => (C.tickSnapshot && i < C.tickSnapshot[0]! ? C.tickSnapshot[1 + i * 6] === 1 : C.runtime._editor_alive(i) === 1);
  C.tickSnapshotAlive = tickSnapshotAlive;
  const tickSnapshotFlags = (i: number) => (C.tickSnapshot && i < C.tickSnapshot[0]! ? C.tickSnapshot[1 + i * 6 + 5]! : -1);
  C.tickSnapshotFlags = tickSnapshotFlags;
  C.tickAlpha = 1;
  // Arcade car sounds and HUD state (see updateCars), declared
  // before the player-mode bootstrap, which rebuilds and starts Play.
  /* declared in the context */
  /* declared in the context */
  const sirens = new Map<number, { voice: SirenVoice; panner?: PannerNode }>();
  C.sirens = sirens;
  C.playerCarSpeed = 0;
  // Roads for the minimap: road-category ModelInstances, gathered by rebuild().
  C.minimapRoads = [];
  // Play-session UI state from scripts and interaction, keyed by the UI
  // entity's Name: values (Bar/Slider/Toggle) and visibility. Cleared
  // whenever the runtime is rebuilt, like uiTextOverrides. Declared before
  // the player-mode bootstrap starts Play, whose first scripts set them.
  const uiValues = new Map<string, number>();
  C.uiValues = uiValues;
  const uiVisibility = new Map<string, boolean>();
  C.uiVisibility = uiVisibility;
  C.openUI = new Set<string>();
  C.hiddenWalker = -1;
  C.objectives = { defs: [], active: "", counts: new Map(), done: new Set(), dead: new Set() };
  /* declared in the context */
  const uiTextOverrides = new Map<string, string>();
  C.uiTextOverrides = uiTextOverrides;
  const onPickupTimers: { name: string; until: number }[] = [];
  C.onPickupTimers = onPickupTimers;
  // ui.set_color: a UI element's text colour, by name (cleared like the text).
  const uiColorOverrides = new Map<string, THREE.Color>();
  C.uiColorOverrides = uiColorOverrides;
  // Script waypoints (ui.marker), by name.
  const uiMarkers = new Map<string, { position: THREE.Vector3; label: string }>();
  C.uiMarkers = uiMarkers;
  const spawnedScans = new Map<number, ScannableComponent>();
  C.spawnedScans = spawnedScans;
  // Pickups' looks by object index (turned and bobbed each frame, hidden
  // while taken), and containers opening.
  const pickupViews = new Map<number, { visual: PickupVisual; phase: number }>();
  C.pickupViews = pickupViews;
  const openings: { step: (t: number) => boolean; t: number }[] = [];
  C.openings = openings;
  // Recent loot, newest last, for the pickup feed.
  const lootFeed: { label: string; rarity: number; amount: number; kind: number; at: number }[] = [];
  C.lootFeed = lootFeed;
  const widgetHits: WidgetHit[] = [];
  C.widgetHits = widgetHits;
  /* declared in the context */
  /* declared in the context */
  const widgetTexts = new Map<number, { text: string; since: number }>();
  C.widgetTexts = widgetTexts;
  const hiddenWidgets = new Set<number>();
  C.hiddenWidgets = hiddenWidgets;
  const sceneWidgets = new Set<UIWidget>();
  C.sceneWidgets = sceneWidgets;
  /* declared in the context */
  const uiFeed = {
    hitAt: -Infinity,
    killAt: -Infinity,
    damage: [] as { point: THREE.Vector3; amount: number; crit: boolean; at: number }[],
    kills: [] as { killer: string; victim: string; mine: boolean; at: number }[],
    healthGhost: 1,
    bossGhost: 1,
    last: 0,
  };
  C.uiFeed = uiFeed;
  // -- Mouse, touch and gamepad ---------------------------------
  // Pointer events cover mouse, pen and touch alike (a tap is a left click).
  // Positions are viewport pixels; queued and applied once per frame with
  // the keys, so every tick of a frame sees the same edges.
  const pointerQueue: Array<() => void> = [];
  C.pointerQueue = pointerQueue;
  // Right-drag look shouldn't open the browser menu during Play.
  C.renderer.domElement.addEventListener("contextmenu", (event) => {
    if (doc.mode !== "edit") event.preventDefault();
  });
  C.renderer.domElement.addEventListener("pointermove", (event) => {
    if (doc.mode !== "play") return;
    // Flying with the mouse captured: it moves the virtual stick
    //. Otherwise dragging looks around the ship.
    if (C.spaceView?.stick.active && document.pointerLockElement === C.renderer.domElement) {
      const gain = 0.0035 * playerSettings.sensitivity;
      mouseStick.x += event.movementX * gain;
      mouseStick.y += event.movementY * gain * (playerSettings.invertY ? -1 : 1);
      const length = Math.hypot(mouseStick.x, mouseStick.y);
      if (length > 1) {
        mouseStick.x /= length;
        mouseStick.y /= length;
      }
      mouseStick.idle = 0;
    } else if (C.spaceView?.flight.piloting && event.buttons & 3)
      C.spaceView.look(event.movementX * playerSettings.sensitivity, event.movementY * playerSettings.sensitivity * (playerSettings.invertY ? -1 : 1));
    // Right-drag looks around in first person without capturing the mouse.
    const controller = C.playerController();
    if (controller?.mode === "FirstPerson" && event.buttons & 2 && document.pointerLockElement !== C.renderer.domElement)
      applyMouseLook(
        fps.look,
        event.movementX,
        event.movementY,
        controller.lookSensitivity * playerSettings.sensitivity,
        controller.invertY !== playerSettings.invertY,
      );
    const { x, y } = C.viewportPoint(event);
    pointerQueue.push(() => C.runtime._editor_input_mouse_move(x, y, event.movementX, event.movementY));
  });
  C.renderer.domElement.addEventListener("pointerdown", (event) => {
    if (doc.mode !== "play" || event.button > 2) return;
    // A left click while flying captures the mouse for steering.
    if (event.button === 0 && C.spaceView?.stick.available && document.pointerLockElement !== C.renderer.domElement)
      void C.renderer.domElement.requestPointerLock?.();
    const { x, y } = C.viewportPoint(event);
    pointerQueue.push(() => C.runtime._editor_input_mouse_button(event.button, 1, x, y));
  });
  window.addEventListener("pointerup", (event) => {
    if (doc.mode === "edit" || event.button > 2) return;
    const { x, y } = C.viewportPoint(event);
    pointerQueue.push(() => C.runtime._editor_input_mouse_button(event.button, 0, x, y));
  });
  C.renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (doc.mode !== "play") return;
      pointerQueue.push(() => C.runtime._editor_input_wheel(-event.deltaX / 100, -event.deltaY / 100));
    },
    { passive: true },
  );
  // While the pointer is locked (a script's input.lock_mouse(true)) there is
  // no pointermove target position, only movement -- document-level events
  // still carry it.
  document.addEventListener("mousemove", (event) => {
    if (doc.mode !== "play" || document.pointerLockElement !== C.renderer.domElement) return;
    const controller = C.playerController();
    if (controller?.mode === "FirstPerson")
      applyMouseLook(
        fps.look,
        event.movementX,
        event.movementY,
        controller.lookSensitivity * playerSettings.sensitivity,
        controller.invertY !== playerSettings.invertY,
      );
    else if (C.shooterActive()) {
      // Aiming turns slower with the zoom; aim assist slows it near a target.
      tps.view.device = "mouse";
      const zoom = 1 + ((C.runtime._editor_weapon_value(C.playerIndex, 9) || 1) - 1) * tps.view.aimBlend;
      applyMouseLook(tps.view, event.movementX, event.movementY, playerSettings.sensitivity * zoom * tps.lookScale, playerSettings.invertY);
    }
    pointerQueue.push(() => C.runtime._editor_input_mouse_move(0, 0, event.movementX, event.movementY));
  });
  // Standard-mapping gamepad button index -> engine::GamepadButton.
  const gamepadButtonMap: Record<number, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 9,
    5: 10,
    8: 4,
    9: 6,
    10: 7,
    11: 8,
    12: 11,
    13: 12,
    14: 13,
    15: 14,
    16: 5,
  };
  C.gamepadButtonMap = gamepadButtonMap;
  /* declared in the context */
  // Textures by URL, shared by every material that uses them.
  const textureCache = new Map<string, THREE.Texture>();
  C.textureCache = textureCache;
  const textureLoader = new THREE.TextureLoader();
  C.textureLoader = textureLoader;
  // Materials applyMaterial() created, disposed on the next rebuild() --
  // rebuild runs after every edit, so they would otherwise leak GPU memory.
  const materialOverrides: THREE.Material[] = [];
  C.materialOverrides = materialOverrides;
  // Live terrain meshes by objects[] index, for sculpting.
  const terrainMeshes = new Map<number, { mesh: THREE.Mesh; params: TerrainParams; look: TerrainLook; offsets: Int16Array }>();
  C.terrainMeshes = terrainMeshes;
  // Site view: a scene's Sites keep their children at site-local
  // positions, which in the editor would pile on top of the home layout.
  // "Show" picks everything, home, or one site; selecting an entity that
  // lives elsewhere switches to it.
  C.siteView = "all";
  C.siteViewDefaulted = false;
  /* declared in the context */
  /* declared in the context */
  el("add").onclick = () =>
    C.execute({
      command: "spawn_entity",
      name: "Entity " + (doc.scene.entityCount + 1),
      transform: [0, 0.5, 0],
    });
  el("duplicate").onclick = () => {
    log(doc.duplicate());
    C.rebuild();
  };
  el("delete").onclick = () => C.execute({ command: "destroy_entity", entity: doc.selection });
  el("undo").onclick = () => {
    doc.undo();
    C.rebuild();
  };
  el("redo").onclick = () => {
    doc.redo();
    C.rebuild();
  };
  // New: pick a starting point -- empty, or a small playable
  // starter for a kind of game (sceneTemplates.ts).
  el("new").onclick = () => {
    if (doc.mode !== "edit") return;
    openTemplatePicker(document.body, (template) => {
      if (doc.dirty && !confirm("Discard unsaved scene?")) return;
      C.loadDocument(templateScene(template));
      C.rebuild();
    });
  };
  el<HTMLInputElement>("search").oninput = C.updatePanels;
  el<HTMLInputElement>("project").onchange = () => {
    doc.project = el<HTMLInputElement>("project").value;
    C.updatePanels();
  };
  el("save").onclick = () => {
    const text = JSON.stringify(doc.save(), null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "scene.json";
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem("game-engine-editor:scene", text);
    doc.markSaved();
    C.updatePanels();
  };
  el("games").onclick = () =>
    openGamesLibrary(app, {
      currentScene: () => JSON.stringify(doc.save(), null, 2),
      projectName: () => doc.project,
      openScene: (text, name) => {
        if (doc.mode !== "edit") el("stop").click();
        if (doc.dirty && !confirm("Discard unsaved scene?")) return;
        try {
          C.loadDocument(JSON.parse(text));
          doc.project = name;
          el<HTMLInputElement>("project").value = name;
          C.rebuild();
        } catch (e) {
          log(String(e));
        }
      },
      log,
    });
  el<HTMLInputElement>("open").onchange = async () => {
    try {
      const file = el<HTMLInputElement>("open").files?.[0];
      if (file) {
        if (file.size > 2_000_000) throw new Error("Scene file exceeds 2 MB");
        C.loadDocument(JSON.parse(await file.text()));
        C.rebuild();
      }
    } catch (e) {
      log(String(e));
    }
  };
  let playStarting = false;
  el("play").onclick = async () => {
    // Models still loading when Play is pressed would stay placeholder boxes
    // for the whole session (they're swapped in by an edit-mode rebuild), so
    // their clips and Animators would never run: wait for them first, up to
    // 10 s. Nothing pending, nothing awaited: Play starts at once.
    if (doc.mode === "edit" && pendingCatalogRebuilds.size) {
      if (playStarting) return;
      playStarting = true;
      try {
        const loading = [...pendingCatalogRebuilds].map((id) => catalogPromises.get(id)?.catch(() => undefined));
        await Promise.race([Promise.all(loading), new Promise((resolve) => setTimeout(resolve, 10000))]);
      } finally {
        playStarting = false;
      }
      if (doc.mode !== "edit") return;
    }
    try {
      if (doc.mode === "edit") {
        // Content checks before Play: warn, never block.
        const issues = runContentCheck();
        if (issues.length) log(`Playing with ${issues.length} content problem${issues.length > 1 ? "s" : ""} (see Problems): ${formatIssue(issues[0]!)}`);
        prePlayTarget = controls.target.clone();
        C.syncRuntime();
        C.startObjectives();
        C.startSpaceView();
        scanner.reset();
        spawnedScans.clear();
        C.scannableIndices = doc.scene
          .eachAlive()
          .map((e, i) => (doc.scene.effectiveHas(e, "Scannable") ? i : -1))
          .filter((i) => i >= 0);
        rig.placed = false;
        shake.remaining = 0;
        for (const animator of animators) if (animator) animator.runtime = new AnimatorRuntime(animator.graph);
        for (const state of particleStates) if (state?.burstOnPlay) burst(state.emitter, state.burstOnPlay);
        if (animatorErrors.length) log(`Animator: ${animatorErrors.join("; ")}`);
        const playerObject = C.playerIndex >= 0 ? objects[C.playerIndex] : undefined;
        // First person starts looking the way the player entity faces.
        const playerRotation = C.playerIndex >= 0 ? doc.scene.resolve(doc.scene.eachAlive()[C.playerIndex]!, "Rotation") : undefined;
        fps.look.yaw = playerRotation?.euler.y ?? 0;
        fps.look.pitch = 0;
        fps.view.reset();
        C.deathRoll = 0;
        weaponFx.reset();
        carFx.reset();
        C.playerCarSpeed = 0;
        tickStates.length = 0;
        C.tickSnapshot = undefined;
        C.tickAlpha = 1;
        C.zoomBlend = 0;
        weaponFx.equip(C.playerWeaponModel());
        C.holdFirstPersonWeapons();
        if (C.playerIndex >= 0 && C.playerController()) {
          C.playerFeet(fps.previous);
          fps.current.copy(fps.previous);
        }
        C.playerBaseScale = playerObject ? playerObject.scale.clone() : null;
        C.playerPrevY = playerObject?.position.y ?? 0;
        // Set before startSounds(), not after: a clip already decoded from
        // an earlier Play session starts synchronously inside that call, and
        // its own "is this session still running" guard checks doc.mode --
        // checking it while still "edit" would silence every already-cached
        // clip on the second and later Plays.
        // Settings-only entities' stand-in boxes leave the stage.
        for (const anchor of objects) anchor.traverse((node) => node.userData.settingsOnly && (node.visible = false));
        doc.mode = "play";
        C.syncTouchControls();
        C.batchAt = performance.now() + 2500; // once models have loaded
        const mixEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "AudioSettings"));
        C.audioMixer().apply((mixEntity && doc.scene.resolve(mixEntity, "AudioSettings")) ?? defaultMixerSettings);
        soldierSteps.clear();
        C.startSounds();
      } else {
        if (doc.mode === "pause" && C.audioContext) void C.audioContext.resume();
        doc.mode = "play";
      }
      C.updatePanels();
    } catch (e) {
      log(String(e));
    }
  };
  el("pause").onclick = () => {
    if (doc.mode === "play") {
      C.releaseHeldKeys();
      doc.mode = "pause";
      // Suspends the whole audio clock -- every currently-playing sound's
      // output pauses in place, the same way ticks stop advancing, rather
      // than muting while still running out its buffer underneath.
      if (C.audioContext) void C.audioContext.suspend();
    }
    C.updatePanels();
  };
  el("stop").onclick = () => {
    doc.mode = "edit";
    C.syncTouchControls();
    if (document.pointerLockElement) C.releasePointer();
    C.accumulator = 0;
    C.releaseHeldKeys();
    C.stopSounds();
    if (C.audioContext?.state === "suspended") void C.audioContext.resume();
    if (prePlayTarget) {
      controls.target.copy(prePlayTarget);
      prePlayTarget = null;
    }
    // The runtime that owned them is discarded on Stop; drop the pool too,
    // rather than leaving stale blast meshes on screen in Edit mode.
    while (projectileMeshes.length) scene.remove(projectileMeshes.pop()!);
    weaponFx.reset();
    C.endSpaceView();
    C.rebuild();
  };
  // -- Terrain sculpting -------------------------------------------
  // Looked up on use: updatePanels() can run before this section has.
  const sculptElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  C.sculptElement = sculptElement;
  const sculptMode = () => sculptElement<HTMLSelectElement>("sculpt")?.value ?? "off";
  C.sculptMode = sculptMode;
  const sculptTool = el<HTMLSelectElement>("sculpt");
  C.sculptTool = sculptTool;
  const sculptRadius = el<HTMLInputElement>("sculpt-radius");
  C.sculptRadius = sculptRadius;
  const sculptStrength = el<HTMLInputElement>("sculpt-strength");
  C.sculptStrength = sculptStrength;
  sculptTool.onchange = C.updateSculptBar;
  const sculptRay = new THREE.Raycaster();
  C.sculptRay = sculptRay;
  /* declared in the context */
  C.renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !C.sculpting()) return;
    const index = C.selectedTerrainIndex();
    C.sculptStroke = { index, entity: doc.selection! };
    C.sculptDab(event);
  });
  window.addEventListener("pointermove", (event) => {
    if (C.sculptStroke && event.buttons & 1) C.sculptDab(event);
  });
  window.addEventListener("pointerup", () => {
    if (!C.sculptStroke) return;
    const { index, entity } = C.sculptStroke;
    C.sculptStroke = undefined;
    const live = terrainMeshes.get(index);
    const current = doc.scene.resolve(entity, "Terrain");
    if (!live || !current) return;
    // One undoable edit per stroke.
    C.execute({ command: "set_component", entity, type: "Terrain", value: { ...current, sculpt: encodeSculpt(live.offsets) } });
  });
  // -- Imported assets (see userAssets.ts) ------------------------
  // Object URLs for imported images, by file name ("asset:<name>").
  const importedImages = new Map<string, string>();
  C.importedImages = importedImages;
  C.storedAssets = [];
  el<HTMLInputElement>("import-asset").onchange = (event) => {
    const input = event.target as HTMLInputElement;
    if (input.files) void C.importFiles([...input.files]).finally(() => (input.value = ""));
  };
  void loadStoredAssets()
    .then((assets) => {
      C.storedAssets = assets;
      assets.forEach(C.registerAsset);
      if (assets.length) {
        C.populateCatalogModels();
        C.rebuild();
      }
    })
    .catch((error) => log(`Imported assets unavailable: ${String(error)}`));
  // -- Stats overlay --------------------------------------------
  const statsPanel = document.createElement("pre");
  C.statsPanel = statsPanel;
  statsPanel.id = "stats-panel";
  statsPanel.hidden = true;
  statsPanel.style.cssText =
    "position:absolute;top:8px;right:8px;margin:0;padding:8px 10px;background:rgba(8,12,18,0.82);" +
    "color:#cfe8ff;font:12px/1.45 ui-monospace,monospace;border-radius:6px;pointer-events:none;z-index:5";
  viewport.appendChild(statsPanel);
  const stats = { frames: 0, frameMs: 0, tickMs: 0, since: performance.now() };
  C.stats = stats;
  el("site-view").addEventListener("change", (event) => {
    C.siteView = (event.target as HTMLSelectElement).value;
    C.applySiteView();
  });
  el("stats").onclick = () => {
    statsPanel.hidden = !statsPanel.hidden;
    el("stats").setAttribute("aria-pressed", String(!statsPanel.hidden));
  };
  el("check").onclick = () => {
    const issues = runContentCheck();
    log(issues.length ? `${issues.length} problem${issues.length > 1 ? "s" : ""}: ${issues.slice(0, 5).map(formatIssue).join(" | ")}` : "No problems found.");
  };
  el("grid").onclick = () => {
    grid.visible = !grid.visible;
  };
  el("frame").onclick = () => {
    if (doc.selection) {
      const object = objects[doc.scene.eachAlive().findIndex((e) => e.index === doc.selection!.index)];
      if (object) {
        object.getWorldPosition(controls.target);
        camera.position.copy(controls.target).add(new THREE.Vector3(5, 4, 6));
        controls.update();
      }
    }
  };
  el("command").onsubmit = (e) => {
    e.preventDefault();
    C.execute(el<HTMLInputElement>("json").value);
  };
  el("catalog-category").onchange = C.populateCatalogModels;
  el("catalog-search").oninput = C.populateCatalogModels;
  // Enter adds the best match.
  el("catalog-search").onkeydown = (event) => {
    if (event.key === "Enter" && el<HTMLSelectElement>("catalog-model").value) el("catalog-add").click();
    if (event.key === "Escape") {
      el<HTMLInputElement>("catalog-search").value = "";
      C.populateCatalogModels();
    }
  };
  C.populateCatalogModels();
  // The console's commands, searchable; picking one fills in an example.
  el("command").before(
    searchBox({
      placeholder: "Find a command",
      label: "Find a command",
      items: () => commandTemplates.map((t) => ({ label: t.name, detail: t.about, keywords: [t.about], template: t })),
      pick: (item) => {
        const json = el<HTMLInputElement>("json");
        json.value = JSON.stringify(item.template.example);
        json.focus();
      },
    }),
  );
  // Ctrl/Cmd+K: the search box of the panel you were last in (the
  // inspector's filter, the catalog, the console, the Games library),
  // else the entity search.
  let lastPanel = "";
  for (const id of ["panel-hierarchy", "panel-inspector", "dock-project", "dock-console"])
    for (const type of ["pointerdown", "focusin"]) el(id).addEventListener(type, () => (lastPanel = id));
  // V (or the d-pad's left) swaps the shooter's shoulder.
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyV" || event.repeat || !C.shooterActive()) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    tps.view.swapShoulder();
  });
  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
    event.preventDefault();
    const library = document.querySelector<HTMLInputElement>("#games-library input[type=search]");
    const target =
      library ??
      ({
        "panel-inspector": document.querySelector<HTMLInputElement>("#inspector .inspector-tools input"),
        "dock-project": el<HTMLInputElement>("catalog-search"),
        "dock-console": document.querySelector<HTMLInputElement>("#dock-console .search-suggest input"),
      } as Record<string, HTMLInputElement | null>)[lastPanel] ??
      el<HTMLInputElement>("search");
    target.focus();
    target.select();
  });
  el("catalog-add").onclick = async () => {
    const meshId = Number(el<HTMLSelectElement>("catalog-model").value);
    const entry = C.catalogEntry(meshId);
    if (!entry) return;
    try {
      if (!catalogCache.has(meshId)) await C.loadCatalogModel(meshId);
    } catch (error) {
      log("Catalog model failed to load: " + String(error));
      return;
    }
    const result = C.execute({
      command: "spawn_entity",
      name: entry.name,
      transform: [0, 0, 0],
    });
    if (result.ok)
      C.execute({
        command: "set_component",
        entity: result.entity,
        type: "Renderable",
        value: { mesh: entry.id, material: 0, visible: true },
      });
  };
  // Recipes: a kind of thing with the right components, and optionally its HUD widgets.
  el("recipes").onclick = () =>
    openRecipePicker(document.body, (recipe, withHud, style) => {
      try {
        const existing = new Set<string>();
        for (const e of doc.scene.eachAlive()) {
          const ui = doc.scene.resolve(e, "UI");
          if (ui?.kind === "Widget") existing.add(ui.widget);
        }
        const added = applyRecipe(C.execute as never, recipe, withHud, style, doc.scene.entityCount, existing);
        log(`Added ${added.join(", ")}.`);
      } catch (error) {
        log(`Recipe failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  // UI templates: adds UI kit widgets as UI entities, each where its
  // catalog entry puts it.
  el("ui-kit").onclick = () =>
    openUIKitPicker(document.body, (widgets, style) => {
      for (const widget of widgets) {
        const kit = widgetInfo(widget);
        const result = C.execute({ command: "spawn_entity", name: `${widget} (${style})` });
        if (!result.ok) return;
        const added = C.execute({
          command: "set_component",
          entity: result.entity,
          type: "UI",
          value: {
            kind: "Widget",
            widget,
            style,
            text: kit.text,
            anchor: kit.anchor,
            visibleWhen: kit.visibleWhen,
            action: "script",
            offsetX: kit.offsetX,
            offsetY: kit.offsetY,
            width: 0,
            height: 0,
            fontSize: 16,
            color: { x: 0.118, y: 0.165, z: 0.22 },
            opacity: 0.85,
            image: "",
            value: kit.value,
          },
        });
        if (!added.ok) return;
      }
      log(`Added ${widgets.length === 1 ? widgets[0] : `${widgets.length} widgets`} in the ${style} style.`);
    });
  el("prefab-place").onclick = () => {
    const prefab = el<HTMLSelectElement>("prefab-select").value;
    if (prefab) C.execute({ command: "place_instance", prefab, transform: [0, 0.5, 0] });
  };
  window.addEventListener("pointermove", (event) => {
    if (!C.draggingSlider || doc.mode === "edit") return;
    const rect = C.renderer.domElement.getBoundingClientRect();
    const next = sliderValue(C.draggingSlider, event.clientX - rect.left);
    if (next !== uiValues.get(C.draggingSlider.name)) C.setUIValue(C.draggingSlider.name, next);
  });
  window.addEventListener("pointerup", () => (C.draggingSlider = C.draggingWidget = undefined));
  // The pointer over the viewport, for widget hover; a held settings slider.
  C.renderer.domElement.addEventListener("pointermove", (event) => {
    const rect = C.renderer.domElement.getBoundingClientRect();
    C.uiPointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  });
  C.renderer.domElement.addEventListener("pointerleave", () => (C.uiPointer = undefined));
  window.addEventListener("pointermove", (event) => {
    if (!C.draggingWidget || doc.mode === "edit") return;
    const rect = C.renderer.domElement.getBoundingClientRect();
    applySettingHit(C.draggingWidget.action, (event.clientX - rect.left - C.draggingWidget.left) / C.draggingWidget.width, playerSettings);
    storeSettings(playerSettings);
    C.applyPlayerSettings();
  });
  C.renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || gizmo.dragging || gizmo.axis !== null) return;
    if (C.sculpting()) return; // the sculpt brush owns left clicks
    const rect = C.renderer.domElement.getBoundingClientRect();
    // A UI Button's hit-test comes first, in the same CSS-pixel coordinate
    // space drawHud() laid it out in (hud's own width/height are unscaled
    // CSS pixels, same as clientX/clientY - rect.left/top here) -- clicking
    // a Button must never also re-select whatever 3D object happens to sit
    // behind it, so this returns instead of falling through to the raycast
    // below when it hits.
    const clickX = e.clientX - rect.left,
      clickY = e.clientY - rect.top;
    // Checked back-to-front (reverse of uiButtonHits' own paint order,
    // drawHud()'s entity iteration order): two overlapping buttons paint the
    // later entity's on top, so a click there must hit the one the user
    // actually sees, not whichever happened to be pushed first.
    for (let i = widgetHits.length - 1; i >= 0; i--) {
      const hit = widgetHits[i]!;
      if (!contains(hit, clickX, clickY) || (hit.test && !hit.test(clickX, clickY))) continue;
      C.widgetAction(hit, clickX);
      return;
    }
    for (let i = uiButtonHits.length - 1; i >= 0; i--) {
      const hit = uiButtonHits[i]!;
      if (!contains(hit, clickX, clickY)) continue;
      if (hit.kind === "Toggle") C.setUIValue(hit.name, hit.value >= 0.5 ? 0 : 1);
      else if (hit.kind === "Slider") {
        C.draggingSlider = hit;
        C.setUIValue(hit.name, sliderValue(hit, clickX));
      } else if (hit.action === "script") C.uiEvent(hit.name, "click");
      else C.runUIAction(hit.action);
      if (hit.kind === "Button") C.runOnClick(hit.name, "click");
      return;
    }
    // First person and the over-the-shoulder shooter: a click in the
    // viewport captures the mouse for look.
    if (doc.mode === "play" && (C.firstPerson() || (C.shooterActive() && e.pointerType === "mouse"))) {
      if (document.pointerLockElement !== C.renderer.domElement) void C.renderer.domElement.requestPointerLock?.();
      return;
    }
    // Picking entities is for editing: during Play (and in exported games)
    // a click in the world never selects anything.
    if (doc.mode !== "edit") return;
    // A finger selects on a tap instead (below), so a one-finger orbit
    // doesn't select whatever it started on.
    if (e.pointerType === "touch") return;
    C.selectAt(e.clientX, e.clientY);
  });
  let touchPress: { id: number; x: number; y: number; at: number; held: boolean } | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  const touchesDown = new Set<number>();
  // A second finger landing while the first holds a gizmo handle is a pinch
  // or two-finger pan: let go of the handle first (capture phase, so the
  // camera controls see this finger enabled).
  C.renderer.domElement.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch" || touchesDown.size === 0) return;
      // The gizmo sits out until every finger lifts, or it would take this
      // finger too.
      if (gizmo.dragging) gizmo.pointerUp(e);
      C.gizmoPaused = true;
      gizmo.enabled = false;
      controls.enabled = true;
    },
    { capture: true },
  );
  C.renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") touchesDown.add(e.pointerId);
    // A finger down in the editor: a tap selects (on release), a long press
    // opens the entity menu -- on a gizmo handle too, as long as it holds still.
    if (e.pointerType === "touch" && doc.mode === "edit" && touchesDown.size === 1 && !C.sculpting()) {
      touchPress = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), held: false };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        if (!touchPress || touchPress.id !== e.pointerId || touchPress.held) return;
        touchPress.held = true;
        C.selectAt(touchPress.x, touchPress.y);
        C.openEntityMenu(touchPress.x, touchPress.y);
      }, HOLD_MS);
    }
    // A second finger is a pinch or pan, not a tap.
    if (touchesDown.size > 1) touchPress = undefined;
    // Gizmo handles grow under a finger.
    gizmo.size = e.pointerType === "touch" ? 1.7 : 1;
  });
  C.renderer.domElement.addEventListener("pointermove", (e) => {
    if (touchPress && e.pointerId === touchPress.id && pressKind(e.clientX - touchPress.x, e.clientY - touchPress.y, 0) === "drag") touchPress = undefined;
  });
  const endTouch = (e: PointerEvent) => {
    touchesDown.delete(e.pointerId);
    if (C.gizmoPaused && touchesDown.size === 0) {
      C.gizmoPaused = false;
      gizmo.enabled = !C.sculpting();
    }
    if (!touchPress || e.pointerId !== touchPress.id) return;
    const press = touchPress;
    touchPress = undefined;
    clearTimeout(holdTimer);
    if (!press.held && pressKind(e.clientX - press.x, e.clientY - press.y, performance.now() - press.at) === "tap" && doc.mode === "edit") C.selectAt(press.x, press.y);
  };
  window.addEventListener("pointerup", endTouch);
  window.addEventListener("pointercancel", endTouch);
  // Right-click (without dragging to pan) opens the same entity menu.
  let rightDown: { x: number; y: number } | undefined;
  C.renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
  });
  C.renderer.domElement.addEventListener("contextmenu", (e) => {
    if (doc.mode !== "edit") return;
    e.preventDefault();
    if (rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) > 6) return;
    if (C.selectAt(e.clientX, e.clientY)) C.openEntityMenu(e.clientX, e.clientY);
  });
  // Trackpads: two-finger scroll orbits and Shift + scroll pans (a pinch
  // and a mouse wheel still zoom, through OrbitControls). Runs before
  // OrbitControls' own wheel listener on the same element.
  // The editor camera, readable by tests and tools: distance to its focus,
  // azimuth and elevation (radians), and the focus point.
  const cameraReadout = () => {
    const offset = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    viewport.dataset.camera = [sph.radius, sph.theta, sph.phi, controls.target.x, controls.target.y, controls.target.z].map((n) => n.toFixed(3)).join(",");
  };
  controls.addEventListener("change", cameraReadout);
  cameraReadout();
  if (isTouchDevice()) el("viewport-hint").textContent = "Drag to orbit · pinch to zoom · two fingers to pan · tap to select · hold for menu";
  const wheelDevice = el<HTMLSelectElement>("wheel-device");
  try {
    wheelDevice.value = localStorage.getItem("game-engine-editor:wheel-device") ?? "auto";
  } catch {
    wheelDevice.value = "auto";
  }
  wheelDevice.onchange = () => {
    try {
      localStorage.setItem("game-engine-editor:wheel-device", wheelDevice.value);
    } catch {
      // Storage blocked: the choice lasts this session.
    }
  };
  C.renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (doc.mode !== "edit" || !controls.enabled) return;
      const action = classifyWheel(event, wheelDevice.value as WheelDevice);
      if (action.kind === "zoom") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const offset = camera.position.clone().sub(controls.target);
      if (action.kind === "orbit") {
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta -= action.dx * 0.005;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi - action.dy * 0.005, 0.05, Math.PI - 0.05);
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      } else {
        const scale = offset.length() * 0.0015;
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(action.dx * scale);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(-action.dy * scale);
        camera.position.add(right).add(up);
        controls.target.add(right).add(up);
      }
      controls.update();
    },
    { capture: true, passive: false },
  );
  new ResizeObserver(() => {
    const w = viewport.clientWidth,
      h = viewport.clientHeight;
    C.renderer.setSize(w, h);
    composer?.setSize(w, h);
    C.resizeAntialias();
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    hud.width = w;
    hud.height = h;
  }).observe(viewport);
  wireResizer(el("resize-left"), "x", "--panel-left", 180, 480);
  wireResizer(el("resize-right"), "x", "--panel-right", 220, 480, true);
  wireResizer(el("resize-bottom"), "y", "--dock-height", 120, 480, true);
  wireResizer(el("resize-dock"), "x", "--dock-left-width", 220, 640);
  // tools/export_build.mjs bakes a scene straight into the exported HTML as
  // this script tag -- its presence, not a URL flag, is what turns this same
  // build into a player: no separate "player" bundle/entry point to keep in
  // sync, just the editor's own existing DOM/render/simulation code with the
  // editor-only chrome hidden by the .player-mode CSS class (style.css) and
  // Play started automatically below instead of waiting for a click.
  const exportedScene = document.getElementById("exported-scene")?.textContent;
  try {
    if (exportedScene) {
      app.classList.add("player-mode");
      C.loadDocument(JSON.parse(exportedScene));
      // Preload every catalog model this scene references before the first
      // rebuild()/Play below. Without this, Play would start immediately
      // against empty placeholder boxes -- and they'd stay boxes: the
      // catalog-load callback inside rebuild() only rebuild()s again in Edit
      // mode (mid-Play, that would reset every entity's simulated position/
      // animation state back to its authored spawn, not just swap in the one
      // placeholder that finished loading). A player build starts in Play
      // immediately, so without preloading here that race is the norm, not
      // an edge case.
      const meshIds = new Set<number>();
      for (const entity of doc.scene.eachAlive()) {
        const mesh = doc.scene.resolve(entity, "Renderable")?.mesh;
        if (mesh && mesh >= 1) meshIds.add(mesh);
        // Terrain scatter models too: without them the first rebuild()
        // would place no foliage, and Play never rebuilds again.
        const terrain = doc.scene.resolve(entity, "Terrain");
        if (terrain) for (const rule of parseScatter(terrain.scatter).rules) meshIds.add(rule.model);
        // ModelInstances models.
        const mi = doc.scene.resolve(entity, "ModelInstances");
        if (mi) for (const instance of parseModelInstances(mi.instances).instances) meshIds.add(instance.model);
        // The first-person arms' fallback character (holdFirstPersonWeapons).
        if (doc.scene.effectiveHas(entity, "Player") && doc.scene.effectiveHas(entity, "Weapons")) meshIds.add(firstPersonBodyFallback);
      }
      await Promise.all([...meshIds].map((id) => C.loadCatalogModel(id)?.catch((error) => log(`Catalog model ${id} failed to load: ${String(error)}`))));
    } else {
      const saved = localStorage.getItem("game-engine-editor:scene");
      if (saved) C.loadDocument(JSON.parse(saved));
      else {
        doc.execute({
          command: "spawn_entity",
          name: "First entity",
          transform: [0, 0.5, 0],
        });
        doc.markSaved();
      }
    }
  } catch (e) {
    log(String(e));
    // The authoring console this normally surfaces in is itself part of the
    // hidden chrome in player mode, so a broken exported scene would
    // otherwise fail silently behind a blank viewport -- also put it where a
    // player (or whoever they report the bug to) can actually find it.
    if (exportedScene) console.error(e);
  }
  C.rebuild();
  if (exportedScene) {
    el<HTMLButtonElement>("play").click();
    // That click() is script-triggered, not a real user gesture (verified:
    // navigator.userActivation isn't set by it in a real browser -- an
    // automation-driven one like Playwright's own default state already
    // reads as activated regardless, which would otherwise hide this), so
    // the AudioContext startSounds() just created inside it stays suspended
    // -- silent -- until a genuine gesture resumes it. Player mode hides
    // every button that would normally serve as that gesture, so the first
    // real pointer/key input anywhere on the page (WASD, a click to look
    // around -- whatever this particular scene expects) does it instead,
    // once, with no visible prompt. A scene with truly no player
    // interaction at all stays silent -- the one limitation browsers'
    // autoplay policy leaves no way around short of an explicit "click to
    // start" overlay, which player mode's own "just the game, no chrome"
    // goal argues against adding for this round.
    const resumeAudio = () => {
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      if (C.audioContext?.state === "suspended") void C.audioContext.resume();
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
  }
  C.governedMode = doc.mode;
  // Which entities never move while playing: no script, rig, AI, body or
  // effect of their own (they can still be destroyed or moved by a script;
  // the batcher notices and lets them go).
  const movingComponents = [
    "Script",
    "AIState",
    "Pedestrian",
    "Routine",
    "Wildlife",
    "Walker",
    "Vehicle",
    "Player",
    "Spaceship",
    "Particles",
    "Trail",
    "Health",
    "Terrain",
    "ModelInstances",
    "AICombat",
    "CharacterController",
    "Animator",
    "Site",
  ] as const;
  C.movingComponents = movingComponents;
  // Mouse steering: while flying with the mouse captured, its
  // motion moves a virtual stick (yaw right, pitch up for the mouse moving
  // up) that eases back to centre once the mouse rests; keys still win.
  const mouseStick = { x: 0, y: 0, idle: 0, sent: false, locked: false };
  C.mouseStick = mouseStick;
  // The status line's "unsaved" check serializes the whole scene; it runs
  // at most twice a second, and not at all while playing (the document
  // can't change then).
  const dirtyCheck = { at: -Infinity, value: false, mode: doc.mode };
  C.dirtyCheck = dirtyCheck;
  const cameraForwardScratch = new THREE.Vector3();
  C.cameraForwardScratch = cameraForwardScratch;
  const hudScratch = new THREE.Vector3();
  C.hudScratch = hudScratch;
  // Paints UI components on the HUD canvas (uiDraw.ts).
  const uiPainter = new UIPainter(hudCtx, (url) => resolveAssetUrl(url, importedImages));
  C.uiPainter = uiPainter;
  const drawUIElement = (ui: UIComponent, rect: UIRect, value: number) => uiPainter.draw(ui, rect, value);
  C.drawUIElement = drawUIElement;
  const uiButtonHits: UIButtonHit[] = [];
  C.uiButtonHits = uiButtonHits;
  requestAnimationFrame(C.frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent = "Editor failed: " + String(error);
});

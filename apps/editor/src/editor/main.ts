import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { transformCommand, type TransformMode, type TransformSnapshot } from "./TransformEdit";
import type {
  AIStateName,
  CameraComponent,
  CameraFollowComponent,
  EntityRef,
  EnvironmentComponent,
  MaterialComponent,
  ParticlePreset,
  ParticlesComponent,
  TrailComponent,
  UIAction,
  UIAnchor,
  UIComponent,
  UIKind,
  Vec3,
  TerrainComponent,
  ScannableComponent,
} from "../scene/Components";
import { formatIssue } from "./contentCheck";
import { ProblemsPanel } from "./problemsPanel";
import { iconEl, textSpan } from "./dom";
import { editorLayoutHtml } from "./editorLayout";
import { UIPainter } from "./uiDraw";
import { openTemplatePicker } from "./templatePicker";
import { templateScene } from "./sceneTemplates";
import { renderInspector } from "./inspector";
import { CanvasRenderer } from "./CanvasRenderer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { isNonPhysical, isSettingsOnly } from "./settingsEntity";
import { clearOffHands, holdWeapon, updateHeldWeapons, weaponGrip } from "./heldWeapons";
import { LedgerHud } from "./ledger";
import { DistrictMap } from "./minimap";
import { LightPool } from "./lightPool";
import { InkPass, attachDepth, installToonShading, markCharacter, toonUniforms } from "./manhwa";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { LocalStorageSceneStore } from "../authoring/CommandInterpreter";
import { EditorDocument } from "./Document";
import { modelCatalog, catalogCategories } from "../scene/modelCatalog";
import { soundCatalog } from "../scene/soundCatalog";
import { pickClipName, groundSpeed } from "./animationClips";
import { loadOnce } from "./loadOnce";
import type { SceneComponents } from "../scene/Scene";
import { encodeProps, reconcileProps } from "../scene/scriptProps";
import { burst, createEmitter, stepEmitter, type EmitterSettings, type EmitterState } from "./particles";
import { buildRibbon, updateTrail, type TrailPoint } from "./trail";
import { CombatView, loadCombatClips } from "./combatView";
import { assetKind, assignId, displayName, loadStoredAssets, resolveAssetUrl, storeAsset, type StoredAsset } from "./userAssets";
import { autoSize, contains, layoutRect, sliderValue, type UIRect } from "./uiLayout";
import { AnimatorRuntime, parseAnimatorGraph, parseParamValue, type AnimatorGraph } from "./animator";
import { applyMouseLook, applyStickLook, ViewEffects, type Look } from "./fpsView";
import { Sfx } from "./sfx";
import { AudioMixer, defaultMixerSettings, FootstepTracker, type Bus } from "./audioMixer";
import { parseVisor, Visor } from "./visor";
// The header shows the version package.json records (bump.sh keeps it current).
import { version as editorVersion } from "../../package.json";
import { Music } from "./music";
import { StaticBatcher } from "./staticBatcher";
import { EntityField, FighterField, SpaceField } from "./bridgeFields";
import type { RuntimeExports } from "./runtimeExports";
import { ReflectionProbe } from "./reflectionProbe";
import { nextSiteView } from "./siteView";
import { activityAliases, routineActivity } from "./routineActivity";
import { applyGesture, findGestureBones, gestureFor, type GestureBones } from "./gestures";
import { MAX_SPOTS, swayDepthMaterial, swayMaterial, swayUniforms } from "./scatterSway";
import { crowdNear, FrameGovernor, governorTiers, limitReason, presetFloor } from "./frameGovernor";
import { defaultPostSettings, gradingActive, gradingShader, shadowQualities, type PostSettings } from "./postFx";
import { EventFlag, EventKind, WeaponFx } from "./weaponFx";
import { buildViewmodel } from "./viewmodels";
import { attachToHand, faceWeaponForward, splitForWeapon } from "./characterRig";
import { instanceBox, parseModelInstances } from "./modelInstances";
import { CarFx, type CarView, type MinimapBlip, type MinimapRoad } from "./carFx";
import { EngineVoice, SirenVoice, TireVoice } from "./carAudio";
import { SpaceView, drawFlightHud, latLonDirection, parseLandmarks, parseSpaceBodies, parseSpecies, type SpaceRuntime, type Species } from "./spaceView";
import { Scanner, type ScanTarget } from "./scanner";
import { openGamesLibrary } from "./gamesLibrary";
import { drawLocalMinimap, drawSurface, drawSystem, parseMapSite, surfaceImage, type LocalBlip, type MapBody, type MapSite } from "./explorerHud";
import { ExplorerFx, parseWeather } from "./explorerFx";
import { Ambience, ambienceLayers, playCue, type AmbienceLayer } from "./ambience";
import {
  Announcer,
  codeForBinding,
  createTouchControls,
  isTouchDevice,
  keyForCode,
  loadKeyRemap,
  loadSettings,
  openSettingsPanel,
  qualityProfile,
  storeKeyRemap,
  summarizeFrames,
  type KeyRemap,
} from "./playerSettings";
import { createSkyState, skyAt } from "./timeOfDay";
import {
  applyBrush,
  decodeSculpt,
  encodeHeights,
  encodeSculpt,
  generateHeights,
  parseScatter,
  scatterInstances,
  type BrushMode,
  type TerrainParams,
} from "./terrain";
import { buildScatter, buildTerrainMesh, scatterObstacle, shapeTerrain, type TerrainLook } from "./terrainMesh";
import { defaultEnvironment } from "../authoring/CommandInterpreter";
import "./style.css";

// Each preset's emission shape/motion. `direction` is the base emit
// direction in the entity's own local space (particles are parented under
// `anchor`, same as a Light, so they rotate with the entity); `spread`
// blends that toward a uniformly-random direction (0 = exactly `direction`,
// 1 = fully random). `gravity` is a constant world-space Y acceleration
// added to every particle's velocity each frame -- negative falls
// (Confetti), a small positive value stands in for buoyancy so Smoke/Fire
// visibly rise, not real buoyancy physics.
const PARTICLE_PRESETS: Record<ParticlePreset, { direction: THREE.Vector3; spread: number; gravity: number }> = {
  Sparkle: { direction: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 0 },
  Smoke: { direction: new THREE.Vector3(0, 1, 0), spread: 0.3, gravity: 0.6 },
  Fire: { direction: new THREE.Vector3(0, 1, 0), spread: 0.55, gravity: 1.1 },
  Confetti: { direction: new THREE.Vector3(0, 1, 0), spread: 0.85, gravity: -4 },
};

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
  // Arcade cars and AI drivers (0.70.0): see editor_set_car/editor_set_driver/editor_vehicle_value.
  // Spaceflight (0.71.0): see editor_space_* and editor_set_spaceship.
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
async function startEditor() {
  const doc = new EditorDocument(new LocalStorageSceneStore("game-engine-editor:command-scene:"));
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = editorLayoutHtml({ editorVersion, catalogCategories, modelCount: modelCatalog.length });
  function el<T extends HTMLElement = HTMLElement>(id: string) {
    return document.getElementById(id) as T;
  }
  function log(value: unknown) {
    el("log").textContent = JSON.stringify(value, null, 2);
  }
  // Content checks (0.77.0): the scene's authoring mistakes, by entity
  // (problemsPanel.ts).
  const problems = new ProblemsPanel(el("problems"), {
    scene: () => doc.scene,
    modelExists: (id) => !!catalogEntry(id),
    select: (ref) => {
      doc.selection = ref;
      updatePanels();
    },
  });
  const runContentCheck = () => problems.run();
  const scheduleContentCheck = () => problems.schedule();
  const inspectorIssues = (entity: EntityRef, type: string) => problems.issuesFor(entity, type);
  const viewport = el("viewport");
  let renderer: THREE.WebGLRenderer | CanvasRenderer;
  let backend = "WebGL";
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Real-time shadows (0.52.0): the sun, plus any Light with castShadows.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch {
    renderer = new CanvasRenderer();
    backend = "Canvas compatibility";
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);
  // Screen-space HUD (Health bars): a second canvas layered over the
  // renderer's own via DOM order, sized to match it 1:1. Not part of the
  // Three.js scene graph — bars are 2D rectangles drawn from each Health
  // entity's projected screen position, the same approach the native
  // playground's BoxView::draw_bar uses. pointer-events: none so it never
  // steals the orbit/gizmo drag or click-to-select handling already wired
  // to renderer.domElement underneath it.
  const hud = document.createElement("canvas");
  hud.id = "hud";
  hud.style.pointerEvents = "none";
  viewport.appendChild(hud);
  const hudCtx = hud.getContext("2d")!;
  // The canvas HUD's text, mirrored into a visually hidden live region so
  // screen readers (and the browser test) can read what UI elements say.
  const hudText = document.createElement("div");
  hudText.id = "hud-text";
  hudText.setAttribute("aria-live", "polite");
  hudText.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
  viewport.appendChild(hudText);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101a26");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(8, 7, 10);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();
  const hemisphere = new THREE.HemisphereLight(0xd8eeff, 0x405036, 3);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
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
  // The physics ground plane (y = 0) had no visible surface; this one only
  // shows shadows, so the look is otherwise unchanged.
  const shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadowGround.rotation.x = -Math.PI / 2;
  shadowGround.receiveShadow = true;
  scene.add(shadowGround);
  // Environment (0.52.0): sky, sun, ambient, fog, exposure. Applied on every
  // rebuild(); the sky and its image-based lighting are only regenerated
  // when the Environment's values actually change.
  let environmentKey = "";
  let skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | undefined;
  let environmentTexture: THREE.Texture | undefined;
  const pmrem = renderer instanceof THREE.WebGLRenderer ? new THREE.PMREMGenerator(renderer) : undefined;
  // Authored 0-1 colors (Environment, Material, sky) are sRGB, like any
  // color picker -- so defaultEnvironment()'s backdrop matches the
  // original "#101a26" exactly.
  function colorOf(v: Vec3) {
    return new THREE.Color().setRGB(v.x, v.y, v.z, THREE.SRGBColorSpace);
  }
  function gradientTexture(env: EnvironmentComponent) {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const fill = ctx.createLinearGradient(0, 0, 0, 256);
    const css = (v: Vec3) => `#${colorOf(v).getHexString()}`;
    fill.addColorStop(0, css(env.skyColor));
    fill.addColorStop(0.5, css(env.horizonColor));
    fill.addColorStop(1, css(env.groundColor));
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  // fx.light (GATEBREAKER M4): a script's ambient and sun intensities over
  // the Environment's, so one scene can be a dark dungeon and a lit street.
  // Cleared when the scene is rebuilt.
  let lightOverride: { ambient: number; sun: number } | undefined;
  // fx.time_of_day (GATEBREAKER M4): while set, the hour's sun or moon,
  // sky colour, fog and ambient (timeOfDay.ts) stand in for the
  // Environment's and fx.light's; cleared, those come back (a Gate keeps its
  // own light). Updated in place: nothing is allocated per change.
  let timeOfDay: number | undefined;
  const skyState = createSkyState();
  const skyBackground = new THREE.Color();
  const skyFog = new THREE.FogExp2(0x000000, 0);
  let currentEnvironment: EnvironmentComponent | undefined;
  let environmentExposure = 1;
  function applyTimeOfDay(hours: number | undefined) {
    if (hours === undefined) {
      if (timeOfDay === undefined) return;
      timeOfDay = undefined;
      environmentKey = "";
      if (currentEnvironment) applyEnvironment(currentEnvironment);
      return;
    }
    timeOfDay = hours;
    skyAt(hours, skyState);
    sunDirection.copy(skyState.direction);
    sun.color.copy(skyState.sun);
    sun.intensity = skyState.sunIntensity;
    hemisphere.color.copy(skyState.sky);
    hemisphere.groundColor.copy(skyState.ground);
    hemisphere.intensity = skyState.ambient;
    skyBackground.copy(skyState.background);
    scene.background = skyBackground;
    if (skyMesh) skyMesh.visible = false;
    skyFog.color.copy(skyState.fog);
    skyFog.density = skyState.fogDensity;
    scene.fog = skyFog;
    applyExposure();
  }
  // Tone-mapping exposure: the Environment's (or the hour's), the
  // PostProcessing's and the player's brightness.
  function applyExposure() {
    if (!(renderer instanceof THREE.WebGLRenderer)) return;
    const base = timeOfDay !== undefined ? skyState.exposure : environmentExposure;
    renderer.toneMappingExposure = base * postSettings.exposure * playerSettings.brightness;
  }
  function applyEnvironment(env: EnvironmentComponent) {
    currentEnvironment = env;
    if (skyMesh) skyMesh.visible = true;
    const elevation = THREE.MathUtils.degToRad(env.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(env.sunAzimuth);
    sunDirection.set(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
    sun.color.copy(colorOf(env.sunColor));
    sun.intensity = env.sunIntensity;
    sun.castShadow = env.shadows;
    shadowGround.visible = env.shadows;
    hemisphere.intensity = env.ambientIntensity;
    if (lightOverride) {
      hemisphere.intensity = lightOverride.ambient;
      sun.intensity = lightOverride.sun;
    }
    environmentExposure = env.exposure;
    applyExposure();
    scene.fog =
      env.fog === "Linear"
        ? new THREE.Fog(colorOf(env.fogColor), env.fogNear, env.fogFar)
        : env.fog === "Exponential"
          ? new THREE.FogExp2(colorOf(env.fogColor), env.fogDensity)
          : null;
    const key = JSON.stringify([env.sky, env.skyColor, env.horizonColor, env.groundColor, env.sunElevation, env.sunAzimuth]);
    if (key === environmentKey) return;
    environmentKey = key;
    if (skyMesh) {
      scene.remove(skyMesh);
      skyMesh.geometry.dispose();
      (skyMesh.material as THREE.Material).dispose();
      skyMesh = undefined;
    }
    environmentTexture?.dispose();
    environmentTexture = undefined;
    scene.environment = null;
    if (env.sky === "Color") {
      scene.background = colorOf(env.skyColor);
      hemisphere.color.set(0xd8eeff);
      hemisphere.groundColor.set(0x405036);
      return;
    }
    hemisphere.color.copy(colorOf(env.sky === "Gradient" ? env.horizonColor : env.skyColor));
    hemisphere.groundColor.copy(colorOf(env.groundColor));
    if (env.sky === "Gradient") {
      const texture = gradientTexture(env);
      scene.background = texture;
      if (pmrem) environmentTexture = pmrem.fromEquirectangular(texture).texture;
    } else {
      skyMesh = createSky(env);
      scene.background = null;
      if (pmrem) {
        const skyScene = new THREE.Scene();
        const probe = createSky(env);
        skyScene.add(probe);
        environmentTexture = pmrem.fromScene(skyScene).texture;
        probe.geometry.dispose();
        probe.material.dispose();
      }
      scene.add(skyMesh);
    }
    if (environmentTexture) scene.environment = environmentTexture;
    // The sky's radiance is far brighter than the scene's own lights were
    // tuned for; scaled down so image-based lighting adds fill, not glare.
    scene.environmentIntensity = 0.6;
  }
  // Game cameras (0.52.0): during Play the highest-priority Camera entity
  // renders the view from its own position and rotation.
  const gamePerspective = new THREE.PerspectiveCamera();
  const shakeCamera = new THREE.PerspectiveCamera();
  const gameOrthographic = new THREE.OrthographicCamera();
  // -- First-person view (0.60.0) ----------------------------------------
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
  function playerController() {
    if (playerIndex < 0) return undefined;
    const entity = doc.scene.eachAlive()[playerIndex];
    return entity ? doc.scene.resolve(entity, "CharacterController") : undefined;
  }
  function firstPerson() {
    return doc.mode !== "edit" && playerController()?.mode === "FirstPerson" && runtime._editor_alive(playerIndex) === 1;
  }
  function playerFeet(target: THREE.Vector3) {
    return target.set(
      runtime._editor_value(playerIndex, EntityField.x),
      runtime._editor_controller_value(playerIndex, 6),
      runtime._editor_value(playerIndex, EntityField.z),
    );
  }
  function placeFirstPerson(dt: number): THREE.PerspectiveCamera {
    const settings = playerController()!;
    const alpha = Math.min(1, accumulator * 60);
    const feet = fps.previous.clone().lerp(fps.current, alpha);
    const offsets = fps.view.step(dt, {
      speed: runtime._editor_controller_value(playerIndex, 4),
      grounded: runtime._editor_controller_value(playerIndex, 2) === 1,
      landingSpeed: fpsLanding,
      eyeHeight: runtime._editor_controller_value(playerIndex, 0),
      sprinting: runtime._editor_controller_value(playerIndex, 5) === 1,
      headBob: settings.headBob,
    });
    fpsLanding = 0;
    const view = fps.camera;
    view.aspect = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
    const aiming = runtime._editor_weapon_value(playerIndex, 7) === 1;
    zoomBlend += ((aiming ? 1 : 0) - zoomBlend) * (1 - Math.exp(-dt * 14));
    const zoom = runtime._editor_weapon_value(playerIndex, 5) > 0 ? runtime._editor_weapon_value(playerIndex, 9) : 1;
    view.fov = (settings.fov + offsets.fovAdd * (1 - zoomBlend)) * (1 + (zoom - 1) * zoomBlend);
    view.updateProjectionMatrix();
    view.rotation.set(fps.look.pitch + weaponFx.punch, fps.look.yaw, offsets.roll, "YXZ");
    view.position.set(feet.x, feet.y + offsets.eyeHeight + offsets.y, feet.z);
    view.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(view.quaternion), offsets.x);
    // The player's own body would fill the view.
    const body = objects[playerIndex];
    if (body) body.visible = false;
    return view;
  }
  // A first-person player who died: the view stays where they fell,
  // sinking toward the ground and rolling over (0.66.0).
  let deathRoll = 0;
  function deathView() {
    return doc.mode !== "edit" && playerController()?.mode === "FirstPerson" && playerIndex >= 0 && runtime._editor_alive(playerIndex) === 0;
  }
  function placeDeathView(dt: number): THREE.PerspectiveCamera {
    const view = fps.camera;
    deathRoll = Math.min(1, deathRoll + dt * 1.5);
    const ease = 1 - (1 - deathRoll) * (1 - deathRoll);
    view.position.set(fps.current.x, fps.current.y + 1.6 - ease * 1.3, fps.current.z);
    view.rotation.set(fps.look.pitch * (1 - ease) - ease * 0.25, fps.look.yaw, ease * 0.9, "YXZ");
    view.aspect = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
    view.updateProjectionMatrix();
    return view;
  }
  // Largest landing speed reported by this frame's ticks.
  let fpsLanding = 0;
  function gameCamera(): THREE.Camera | undefined {
    if (doc.mode === "edit") return undefined;
    if (firstPerson()) return placeFirstPerson(rig.frameDt);
    if (deathView()) return placeDeathView(rig.frameDt);
    let best: { component: CameraComponent; index: number } | undefined;
    doc.scene.eachAlive().forEach((entity, index) => {
      const component = doc.scene.resolve(entity, "Camera");
      if (!component || !objects[index] || !runtime._editor_alive(index)) return;
      if (!best || component.priority > best.component.priority) best = { component, index };
    });
    if (!best) return undefined;
    const { component, index } = best;
    const aspect = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
    const view =
      component.projection === "Perspective"
        ? Object.assign(gamePerspective, { fov: component.fov, aspect })
        : Object.assign(gameOrthographic, {
            left: -component.orthoSize * aspect,
            right: component.orthoSize * aspect,
            top: component.orthoSize,
            bottom: -component.orthoSize,
          });
    view.near = component.near;
    view.far = component.far;
    view.updateProjectionMatrix();
    const anchor = objects[index]!;
    // The camera entity's own placeholder would sit in (or block) the view;
    // rebuild() on Stop restores its visibility.
    anchor.visible = false;
    const follow = doc.scene.resolve(doc.scene.eachAlive()[index]!, "CameraFollow");
    const target = follow ? followTarget(follow.target) : undefined;
    if (follow && target) placeRig(view, follow, target);
    else if (!spaceView?.flight.piloting) {
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(view.position);
      anchor.getWorldQuaternion(view.quaternion);
    }
    // Flying: the chase camera behind the ship (mouse-drag looks around).
    if (spaceView && view instanceof THREE.PerspectiveCamera) {
      const ship = shipIndex >= 0 ? objects[shipIndex] : undefined;
      if (spaceView.flight.piloting && ship) spaceView.placeShipCamera(view, ship, rig.frameDt);
      view.far = Math.max(view.far, 20000);
      view.updateProjectionMatrix();
    }
    return view;
  }
  // -- Camera rig (CameraFollow) and shake --------------------------------
  const rig = { position: new THREE.Vector3(), yaw: 0, pitch: 0, placed: false, frameDt: 1 / 60, fovExtra: 0 };
  const shake = { intensity: 0, remaining: 0, duration: 1 };
  const rigRaycaster = new THREE.Raycaster();
  function followTarget(name: string): THREE.Object3D | undefined {
    if (!name) return playerIndex >= 0 ? objects[playerIndex] : undefined;
    const index = doc.scene.eachAlive().findIndex((e) => doc.scene.resolve(e, "Name")?.value === name);
    return index >= 0 && runtime._editor_alive(index) ? objects[index] : undefined;
  }
  function placeRig(view: THREE.Camera, follow: CameraFollowComponent, target: THREE.Object3D) {
    const focus = target.position.clone();
    focus.y += follow.lookHeight;
    let distance = Math.hypot(follow.offset.x, follow.offset.y, follow.offset.z);
    // Following an arcade car (0.70.0): the rig trails its heading with a
    // little lag (a drift shows the car's flank), pulls back with speed,
    // and the field of view opens up with speed and nitro.
    const carIndex = objects.indexOf(target);
    const car = carIndex >= 0 && runtime._editor_vehicle_value(carIndex, 11) ? carView(carIndex) : undefined;
    if (car) distance *= 1 + 0.22 * Math.min(1, car.speed / 50);
    if (view instanceof THREE.PerspectiveCamera) {
      const wanted = car ? 16 * Math.min(1, car.speed / 60) + (car.boosting ? 8 : 0) : 0;
      rig.fovExtra += (wanted - rig.fovExtra) * (1 - Math.exp(-rig.frameDt * 3));
      view.fov += rig.fovExtra;
      view.updateProjectionMatrix();
    }
    // Melee lock-on (0.78.0): the rig swings behind the Player toward its
    // locked-on opponent and frames both, a little over the right shoulder
    // so the Player never hides the opponent.
    const lock = target === objects[playerIndex] ? combat.lockTarget() : -1;
    const opponent = lock >= 0 && runtime._editor_alive(lock) ? objects[lock] : undefined;
    if (opponent && rig.placed) {
      const behind = Math.atan2(target.position.x - opponent.position.x, target.position.z - opponent.position.z) - 0.4;
      const turn = Math.atan2(Math.sin(behind - rig.yaw), Math.cos(behind - rig.yaw));
      rig.yaw += turn * (1 - Math.exp(-rig.frameDt * 5));
      focus.lerp(opponent.position.clone().setY(focus.y), 0.15);
      distance *= 1 + Math.min(0.35, target.position.distanceTo(opponent.position) / 14);
    } else if (!rig.placed) {
      // Start from the authored offset, in the target's frame.
      rig.yaw = Math.atan2(follow.offset.x, follow.offset.z) + target.rotation.y;
      rig.pitch = Math.asin(THREE.MathUtils.clamp(follow.offset.y / Math.max(distance, 1e-6), -1, 1));
    } else if (!follow.orbit) {
      // Without orbit the rig swings behind the target as it turns.
      const behind = Math.atan2(follow.offset.x, follow.offset.z) + target.rotation.y;
      if (car) {
        const turn = Math.atan2(Math.sin(behind - rig.yaw), Math.cos(behind - rig.yaw));
        rig.yaw += turn * (1 - Math.exp(-rig.frameDt * 7));
      } else rig.yaw = behind;
    }
    const desired = new THREE.Vector3(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch))
      .multiplyScalar(distance)
      .add(target.position);
    if (follow.collision) {
      const toCamera = desired.clone().sub(focus);
      const length = toCamera.length();
      rigRaycaster.set(focus, toCamera.normalize());
      rigRaycaster.far = length;
      // Sprites (car light glows) need a camera to be raycast.
      rigRaycaster.camera = view;
      // Only objects whose bounds reach the camera's line are raycast (a
      // town is hundreds of objects; most are nowhere near it).
      const blockers = objects.filter((o) => {
        if (o === target || !o.visible) return false;
        let radius = o.userData.blockRadius as number | undefined;
        if (radius === undefined) {
          new THREE.Box3().setFromObject(o).getBoundingSphere(blockSphere);
          radius = blockSphere.radius + blockSphere.center.distanceTo(o.position);
          o.userData.blockRadius = Number.isFinite(radius) ? radius / Math.max(o.scale.x, o.scale.y, o.scale.z, 1e-6) : Infinity;
          radius = o.userData.blockRadius as number;
        }
        radius *= Math.max(o.scale.x, o.scale.y, o.scale.z);
        blockSegment.set(focus, desired);
        blockSegment.closestPointToPoint(o.position, true, blockPoint);
        return blockPoint.distanceTo(o.position) < radius + 1;
      });
      const hit = rigRaycaster.intersectObjects(blockers, true)[0];
      if (hit) desired.copy(focus).addScaledVector(toCamera, Math.max(0.3, hit.distance - 0.3));
    }
    if (!rig.placed || follow.smoothing <= 0) rig.position.copy(desired);
    else rig.position.lerp(desired, 1 - Math.exp(-rig.frameDt / follow.smoothing));
    rig.placed = true;
    view.position.copy(rig.position);
    view.lookAt(focus);
  }
  const blockSphere = new THREE.Sphere(),
    blockSegment = new THREE.Line3(),
    blockPoint = new THREE.Vector3();
  // Orbit: dragging on the viewport during Play turns the rig.
  let orbitDrag: { x: number; y: number } | undefined;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (doc.mode === "play") orbitDrag = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener("pointerup", () => (orbitDrag = undefined));
  window.addEventListener("pointermove", (event) => {
    if (!orbitDrag) return;
    const look = 0.005 * playerSettings.sensitivity;
    rig.yaw -= (event.clientX - orbitDrag.x) * look;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + (event.clientY - orbitDrag.y) * look * (playerSettings.invertY ? -1 : 1), -0.2, 1.4);
    orbitDrag = { x: event.clientX, y: event.clientY };
  });
  function applyShake(view: THREE.Camera, dt: number) {
    if (shake.remaining <= 0) return;
    shake.remaining = Math.max(0, shake.remaining - dt);
    if (!playerSettings.shake) return;
    const amount = shake.intensity * (shake.remaining / shake.duration);
    view.position.x += (Math.random() * 2 - 1) * amount;
    view.position.y += (Math.random() * 2 - 1) * amount;
    view.position.z += (Math.random() * 2 - 1) * amount;
  }
  // Procedural sky: a large inside-out sphere shaded from the Environment's
  // zenith/horizon/ground colors, with a sun disc and glow toward the sun.
  // Hand-written rather than three's Sky.js, whose raw HDR output washes the
  // scene out through bloom and rendered flat grey in headless WebGL.
  function createSky(env: EnvironmentComponent) {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: colorOf(env.skyColor) },
        horizon: { value: colorOf(env.horizonColor) },
        ground: { value: colorOf(env.groundColor) },
        sunColor: { value: colorOf(env.sunColor) },
        sunDirection: { value: sunDirection.clone() },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = clip.xyww; // always at the far plane
        }`,
      fragmentShader: `
        uniform vec3 zenith, horizon, ground, sunColor, sunDirection;
        varying vec3 vDirection;
        void main() {
          vec3 d = normalize(vDirection);
          float h = d.y;
          vec3 color = h > 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon, ground, pow(-h, 0.35));
          float s = max(dot(d, normalize(sunDirection)), 0.0);
          color += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    return sky;
  }
  // Keeps the sun's shadow frustum centered on what the camera looks at.
  function updateSunShadow() {
    sun.target.position.copy(controls.target);
    sun.position.copy(controls.target).addScaledVector(sunDirection, 50);
  }
  const grid = new THREE.GridHelper(40, 40, 0x658ca8, 0x2b3c4c);
  scene.add(grid);
  // Post-processing: a subtle, always-on bloom so a bright authored Light (or
  // the sun/hemisphere above) actually reads as glowing instead of just a
  // flat-lit surface -- no per-scene toggle, matching this project's existing
  // preference for fixing the default look rather than exposing a render
  // knob (see F32's tone-mapping fix). WebGL-only: the CanvasRenderer
  // compatibility fallback below has no render-target/shader pipeline for
  // EffectComposer to drive, so frame() falls back to a plain renderer.render
  // for it, same as before this round.
  const composer = renderer instanceof THREE.WebGLRenderer ? new EffectComposer(renderer) : undefined;
  const renderPass = new RenderPass(scene, camera);
  // The camera the last frame rendered with: the editor camera, or a game
  // Camera entity during Play. HUD projection and WASD use the same one.
  let viewCamera: THREE.Camera = camera;
  let bloomPass: UnrealBloomPass | undefined;
  // The Manhwa style (manhwa.ts): toon shading on every standard material,
  // and the ink pass reading the scene's depth.
  installToonShading();
  const inkPass = new InkPass(camera);
  if (composer) {
    attachDepth([composer.renderTarget1, composer.renderTarget2]);
    composer.addPass(renderPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.85);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  const objects: THREE.Object3D[] = [];
  // Animator state machines, indexed like objects[]: the parsed graph plus a
  // runtime that is recreated whenever Play starts.
  const animators: ({ graph: AnimatorGraph; runtime: AnimatorRuntime } | undefined)[] = [];
  const animatorErrors: string[] = [];
  interface AnimState {
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
  // Parallel to `objects`; index i holds the animation state for objects[i], or
  // undefined for a non-animated (static) entity. Reset alongside objects on every rebuild().
  const animStates: (AnimState | undefined)[] = [];
  const governor = new FrameGovernor();
  const gestureBones = new WeakMap<AnimState, GestureBones>();
  const probe = new ReflectionProbe();
  let probeScanAt = 0;
  // Static batching (0.76.0): still scenery merged per material while playing.
  const staticBatcher = new StaticBatcher();
  let batchAt = Infinity;
  let batchCheckAt = 0;
  let crowdFrame = 0;
  // Characters who can talk, and which of them stood still last tick.
  let talkerIndices: number[] = [];
  let talkerScan = -1; // objects.length when talkerIndices was built
  let talkerResting = new Set<number>();
  let talkerWasResting = new Set<number>();
  interface ParticleState {
    emitter: EmitterState;
    points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    // World-space emitters live at the scene root and spawn from this
    // anchor's world position; local ones are parented under it.
    anchor: THREE.Object3D;
    world: boolean;
    burstOnPlay: number;
  }
  // Parallel to `objects`, same shape as animStates. Reset alongside objects
  // on every rebuild().
  const particleStates: (ParticleState | undefined)[] = [];
  interface DeathState {
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
  // Parallel to `objects`, same shape as animStates/particleStates. Reset
  // (disposing any still-fading materials) alongside objects on every
  // rebuild() -- safe because rebuild() never runs mid-Play (doc.execute()
  // itself refuses outside Edit mode, and the one async rebuild trigger
  // that could fire during Play, a catalog model finishing its load, is
  // gated to doc.mode === "edit"), so a fade in progress is never
  // interrupted by one.
  const deathStates: (DeathState | undefined)[] = [];
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
  const particleFragmentShader = `
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = dot(c, c);
      if (d > 0.25) discard;
      gl_FragColor = vec4(vColor * (1.0 - d * 4.0), 1.0);
    }`;
  const particleScale = { value: 500 };
  // Weapons (0.61.0): viewmodel, effects and combat HUD (weaponFx.ts), and
  // the viewmodel's own render pass after the world (depth cleared, so the
  // gun never clips into walls).
  const weaponFx = new WeaponFx(scene, makeEffectPoints);
  // Arcade cars' presentation and HUD (0.70.0).
  const carFx = new CarFx(scene, makeEffectPoints);
  // Each car's box size (width, height, length), recorded when built.
  const carSizes = new WeakMap<THREE.Object3D, THREE.Vector3>();
  function makeEffectPoints(emitter: EmitterState) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(emitter.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(emitter.colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(emitter.sizes, 1));
    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { scale: particleScale },
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    points.frustumCulled = false;
    return points;
  }
  const viewmodelPass = new RenderPass(weaponFx.viewScene, weaponFx.viewCamera);
  viewmodelPass.clear = false;
  viewmodelPass.clearDepth = true;
  viewmodelPass.enabled = false;
  composer?.insertPass(viewmodelPass, 1);
  // Right after the scene (and the viewmodel): it needs the depth the scene left.
  composer?.insertPass(inkPass, 2);
  // Post-processing (0.65.0; postFx.ts): grading and anti-aliasing after
  // tone mapping, ambient occlusion on the world before the viewmodel.
  const gradingPass = new ShaderPass(gradingShader);
  gradingPass.enabled = false;
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.enabled = false;
  const smaaPass = new SMAAPass(1, 1);
  smaaPass.enabled = false;
  composer?.addPass(gradingPass);
  composer?.addPass(fxaaPass);
  composer?.addPass(smaaPass);
  let gtaoPass: GTAOPass | undefined;
  let postSettings: PostSettings = defaultPostSettings;
  // Ink lines: the scene's strength times the player's.
  function applyInk() {
    const ink = postSettings.ink * playerSettings.ink;
    inkPass.enabled = !!composer && postSettings.style === "Manhwa" && ink > 0;
    inkPass.ink = ink;
  }
  function applyPostProcessing(settings: PostSettings) {
    postSettings = settings;
    if (bloomPass) {
      bloomPass.strength = settings.bloom;
      bloomPass.radius = settings.bloomRadius;
      bloomPass.threshold = settings.bloomThreshold;
    }
    applyExposure();
    const manhwa = settings.style === "Manhwa";
    toonUniforms.toonOn.value = manhwa ? 1 : 0;
    toonUniforms.toonRim.value = manhwa ? settings.rim : 0;
    applyInk();
    combat.comic.enabled = manhwa;
    gradingPass.enabled = !!composer && gradingActive(settings);
    const uniforms = gradingPass.uniforms as Record<string, { value: number }>;
    uniforms.contrast!.value = settings.contrast;
    uniforms.saturation!.value = settings.saturation;
    uniforms.temperature!.value = settings.temperature;
    uniforms.vignette!.value = settings.vignette;
    uniforms.grain!.value = settings.grain;
    fxaaPass.enabled = !!composer && settings.antialias === "FXAA";
    smaaPass.enabled = !!composer && settings.antialias === "SMAA";
    // Flat fills don't want ambient occlusion, and the ink pass must read the
    // scene's own target (GTAO swaps it).
    const ambientOcclusion = settings.ambientOcclusion && !manhwa;
    if (composer && ambientOcclusion && !gtaoPass) {
      // Created on first use: it allocates its own normal and AO targets.
      gtaoPass = new GTAOPass(scene, camera, viewport.clientWidth || 1, viewport.clientHeight || 1);
      composer.insertPass(gtaoPass, 1);
    }
    if (gtaoPass) {
      gtaoPass.enabled = ambientOcclusion;
      gtaoPass.blendIntensity = settings.aoIntensity;
      gtaoPass.updateGtaoMaterial({ radius: settings.aoRadius });
    }
    const quality = shadowQualities[settings.shadowQuality];
    // The frame governor halves the map under load.
    const mapSize = quality.mapSize / (governorTier().shadows === 1 ? 2 : 1);
    if (sun.shadow.mapSize.x !== mapSize) {
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.camera.left = sun.shadow.camera.bottom = -quality.extent;
    sun.shadow.camera.right = sun.shadow.camera.top = quality.extent;
    sun.shadow.camera.updateProjectionMatrix();
    resizeAntialias();
  }
  function resizeAntialias() {
    const ratio = renderer instanceof THREE.WebGLRenderer ? renderer.getPixelRatio() : 1;
    const w = Math.max(1, viewport.clientWidth),
      h = Math.max(1, viewport.clientHeight);
    (fxaaPass.material.uniforms.resolution!.value as THREE.Vector2).set(1 / (w * ratio), 1 / (h * ratio));
    // About 2 px at 720p, scaling with the view so lines keep their weight.
    inkPass.width = ratio * Math.max(1.5, h / 360);
  }
  // Audio (0.64.0): every sound goes through the mixer's buses; world
  // sounds are positional and muffled behind solid geometry.
  let mixer: AudioMixer | undefined;
  function audioMixer(): AudioMixer {
    if (!mixer) {
      mixer = new AudioMixer(getAudioContext());
      mixer.setPlayerVolumes(playerSettings.master, playerSettings.music, playerSettings.sfx);
    }
    return mixer;
  }
  let sfx: Sfx | undefined;
  function sounds(): Sfx {
    sfx ??= new Sfx(getAudioContext(), audioMixer().buses.sfx);
    return sfx;
  }
  const listenerPosition = new THREE.Vector3();
  // A synthesized voice played at a world position.
  function soundsAt(point: THREE.Vector3, volume = 1): Sfx {
    const occluded =
      audioMixer().occlusion && runtime._editor_line_blocked(listenerPosition.x, listenerPosition.y, listenerPosition.z, point.x, point.y + 0.3, point.z) === 1;
    return sounds().at(audioMixer().source("sfx", point, { occluded, volume }).input);
  }
  // Melee (0.78.0): fighters' bodies, impacts and the fighter HUD (combatView.ts).
  // GATEBREAKER's interface (ledger.ts): system windows, panel cutscenes, the boss bar.
  const ledger = new LedgerHud();
  // GATEBREAKER M4: the minimap and the M map from a script's hud.map_layout (minimap.ts).
  const districtMap = new DistrictMap();
  // At most 8 point lights shade the scene at once (lightPool.ts).
  const lightPool = new LightPool(scene);
  const combat = new CombatView(scene, {
    value: (i, field) => runtime._editor_fighter_value(i, field),
    text: (i, move, field) => runtime.ccall("editor_fighter_text", "string", ["number", "number", "number"], [i, move, field]),
    takeEvents: () => runtime._editor_take_melee_events(),
    event: (i, field) => runtime._editor_melee_event(i, field),
    playerIndex: () => playerIndex,
    health: (i) => (runtime._editor_alive(i) ? runtime._editor_value(i, EntityField.health) : 0),
    sound: (at) => (audioContext ? (at ? soundsAt(at) : sounds()) : undefined),
    shake: (intensity, seconds) => {
      shake.intensity = Math.max(shake.intensity, intensity);
      shake.duration = shake.remaining = Math.max(shake.remaining, seconds);
    },
  });
  // The clip library once loaded, and the fighters waiting for it.
  let combatClips: THREE.AnimationClip[] | undefined;
  const waitingFighters: { index: number; object: THREE.Object3D; state: AnimState }[] = [];
  function attachFighter(index: number, object: THREE.Object3D, state: AnimState) {
    if (combatClips) {
      combat.attach(index, object, state.mixer, state.actions, combatClips, state.current);
      return;
    }
    waitingFighters.push({ index, object, state });
    loadCombatClips((path) => gltfLoader.loadAsync(path)).then(
      (clips) => {
        combatClips = clips;
        for (const waiting of waitingFighters.splice(0)) if (animStates[waiting.index] === waiting.state) combat.attach(waiting.index, waiting.object, waiting.state.mixer, waiting.state.actions, clips, waiting.state.current);
      },
      (error) => log(`Combat clips failed to load: ${String(error)}`),
    );
  }
  const fighterVelocity = new THREE.Vector3();
  const playerSteps = new FootstepTracker();
  const soldierSteps = new Map<number, { tracker: FootstepTracker; previous: THREE.Vector3 }>();
  function surfaceAt(x: number, feetY: number, z: number): "grass" | "hard" {
    const ground = runtime._editor_terrain_height(x, z);
    return Number.isFinite(ground) && Math.abs(feetY - ground) < 0.25 ? "grass" : "hard";
  }
  // Footsteps and landings for controller players and soldiers.
  function playMovementSounds(dt: number) {
    if (playerIndex >= 0 && playerController() && runtime._editor_alive(playerIndex)) {
      const speed = runtime._editor_controller_value(playerIndex, 4);
      const grounded = runtime._editor_controller_value(playerIndex, 2) === 1;
      const crouched = runtime._editor_controller_value(playerIndex, 1) === 1;
      const feet = runtime._editor_controller_value(playerIndex, 6);
      const x = runtime._editor_value(playerIndex, EntityField.x),
        z = runtime._editor_value(playerIndex, EntityField.z);
      if (playerSteps.step(dt, speed, grounded)) {
        const voice = firstPerson() ? sounds() : soundsAt(new THREE.Vector3(x, feet, z));
        voice.footstep(surfaceAt(x, feet, z), (crouched ? 0.35 : 0.8) * Math.min(1.3, speed / 4.5));
      }
      if (fpsLanding > 4) (firstPerson() ? sounds() : soundsAt(new THREE.Vector3(x, feet, z))).land(Math.min(1, fpsLanding / 12));
    }
    objects.forEach((object, i) => {
      if (runtime._editor_soldier_value(i, 0) < 0 || !runtime._editor_alive(i)) return;
      let entry = soldierSteps.get(i);
      if (!entry) soldierSteps.set(i, (entry = { tracker: new FootstepTracker(), previous: object.position.clone() }));
      const speed = dt > 0 ? Math.hypot(object.position.x - entry.previous.x, object.position.z - entry.previous.z) / dt : 0;
      entry.previous.copy(object.position);
      if (entry.tracker.step(dt, speed, true)) {
        const half = (doc.scene.resolve(doc.scene.eachAlive()[i] ?? { index: -1, generation: 0 }, "Scale")?.value.y ?? 1.8) / 2;
        const feet = new THREE.Vector3(object.position.x, object.position.y - half, object.position.z);
        soundsAt(feet, 0.9).footstep(surfaceAt(feet.x, feet.y, feet.z), 0.9);
      }
    });
  }
  // Ease in/out of the aim-down-sights zoom.
  let zoomBlend = 0;
  let viewmodelStudio: THREE.Texture | undefined;
  // First-person arms (0.69.0): the player's own animated Renderable (it may
  // be invisible) or, without one, the Mannequin, holds the weapons, tinted
  // by the player's Material.
  const firstPersonBodyFallback = 132;
  function holdFirstPersonWeapons() {
    const entity = playerIndex >= 0 ? doc.scene.eachAlive()[playerIndex] : undefined;
    if (!entity || !doc.scene.effectiveHas(entity, "Weapons")) {
      weaponFx.setBody(undefined);
      return;
    }
    const mesh = doc.scene.resolve(entity, "Renderable")?.mesh ?? 0;
    const id = catalogEntry(mesh)?.animated ? mesh : firstPersonBodyFallback;
    const material = doc.scene.resolve(entity, "Material");
    const apply = (cached: CachedModel) => {
      const root = SkeletonUtils.clone(cached.scene);
      if (material) root.traverse((child) => child instanceof THREE.Mesh && materialAppliesTo(child, material) && applyMaterial(child, material));
      weaponFx.setBody(root, cached.clips);
    };
    const cached = catalogCache.get(id);
    if (cached) apply(cached);
    else
      loadCatalogModel(id)
        ?.then((loaded) => {
          if (doc.mode !== "edit") apply(loaded);
        })
        .catch((error) => log(`Catalog model ${id} failed to load: ${String(error)}`));
  }
  function playerWeaponModel(slot?: number): string {
    if (playerIndex < 0 || runtime._editor_weapon_value(playerIndex, 5) <= 0) return "";
    const current = slot ?? runtime._editor_weapon_value(playerIndex, 0);
    return runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [playerIndex, current, 1]);
  }
  // Drains this frame's weapon events into effects, sounds, recoil and HUD.
  function processCombatEvents() {
    const count = runtime._editor_take_weapon_events();
    const at = (i: number, field: number) => runtime._editor_weapon_event(i, field);
    let pending: { shooter: number; origin: THREE.Vector3; direction: THREE.Vector3; hits: number } | undefined;
    const listener = viewCamera.getWorldPosition(new THREE.Vector3());
    const distanceVolume = (point: THREE.Vector3) => 1 / (1 + point.distanceTo(listener) / 10);
    const muzzleOf = (shooter: number, origin: THREE.Vector3, direction: THREE.Vector3) =>
      shooter === playerIndex && firstPerson() ? weaponFx.muzzleWorld(fps.camera, new THREE.Vector3()) : origin.clone().addScaledVector(direction, 0.5);
    const finishShot = () => {
      if (pending && pending.hits === 0)
        weaponFx.tracer(muzzleOf(pending.shooter, pending.origin, pending.direction), pending.origin.clone().addScaledVector(pending.direction, 80));
      pending = undefined;
    };
    for (let i = 0; i < count; i++) {
      const kind = at(i, 0),
        shooter = at(i, 1),
        target = at(i, 2),
        value = at(i, 9),
        flags = at(i, 10);
      const point = new THREE.Vector3(at(i, 3), at(i, 4), at(i, 5));
      const normal = new THREE.Vector3(at(i, 6), at(i, 7), at(i, 8));
      const mine = shooter === playerIndex;
      switch (kind) {
        case EventKind.fire: {
          finishShot();
          pending = { shooter, origin: point, direction: normal, hits: 0 };
          const model = runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [shooter, flags, 1]);
          if (mine) {
            weaponFx.fire(value);
            sounds().gunshot(model);
            // Recoil climbs the aim; aiming halves it.
            const aimed = runtime._editor_weapon_value(playerIndex, 7) === 1;
            fps.look.pitch = Math.min(1.55, fps.look.pitch + THREE.MathUtils.degToRad(value) * (aimed ? 0.4 : 0.7));
            fps.look.yaw += THREE.MathUtils.degToRad(value) * 0.3 * (Math.random() - 0.5);
          } else soundsAt(point).gunshot(model);
          weaponFx.muzzleFlashAt(muzzleOf(shooter, point, normal));
          break;
        }
        case EventKind.impact: {
          const flesh = (flags & EventFlag.flesh) !== 0;
          weaponFx.impact(point, normal, flesh);
          if (pending && pending.shooter === shooter) {
            weaponFx.tracer(muzzleOf(shooter, pending.origin, pending.direction), point);
            pending.hits++;
          }
          soundsAt(point, 0.6).impact(flesh);
          break;
        }
        case EventKind.damaged: {
          const killed = (flags & EventFlag.killed) !== 0;
          if (mine && target !== playerIndex) {
            weaponFx.hit(killed, (flags & EventFlag.headshot) !== 0);
            sounds().hitmarker(killed);
          }
          if (target === playerIndex && playerIndex >= 0) {
            const body = objects[playerIndex];
            if (body) weaponFx.hurt(point, body.position, fps.look.yaw, value);
            sounds().hurt();
            shake.intensity = Math.max(shake.intensity, 0.04);
            shake.duration = shake.remaining = 0.2;
          }
          break;
        }
        case EventKind.reload:
          if (mine) {
            if (playerWeaponModel(flags) === "shotgun") sounds().shell();
            else sounds().reload(value);
          }
          break;
        case EventKind.empty:
          if (mine) sounds().dryFire();
          break;
        case EventKind.switched:
          if (mine) {
            weaponFx.equip(playerWeaponModel(flags));
            sounds().equip();
          }
          break;
        case EventKind.explode: {
          weaponFx.explosion(point, value);
          const volume = distanceVolume(point);
          soundsAt(point).explosion();
          shake.intensity = Math.max(shake.intensity, 0.35 * volume);
          shake.duration = shake.remaining = 0.5;
          break;
        }
      }
    }
    finishShot();
  }
  function createParticles(particles: ParticlesComponent, anchor: THREE.Object3D): ParticleState {
    const preset = PARTICLE_PRESETS[particles.preset];
    const settings: EmitterSettings = {
      rate: particles.rate,
      lifetime: particles.lifetime,
      speed: particles.speed,
      size: particles.size,
      endSize: particles.endSize,
      color: [particles.color.x, particles.color.y, particles.color.z],
      endColor: [particles.endColor.x, particles.endColor.y, particles.endColor.z],
      direction: [preset.direction.x, preset.direction.y, preset.direction.z],
      spread: preset.spread,
      // The presets store an upward pull as positive; the simulation's
      // gravity pulls down.
      gravity: -preset.gravity * particles.gravityScale,
      shape: particles.shape,
      shapeSize: particles.shapeSize,
      coneAngle: particles.coneAngle,
    };
    const emitter = createEmitter(settings, particles.burst);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(emitter.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(emitter.colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(emitter.sizes, 1));
    const shader = new THREE.ShaderMaterial({
      uniforms: { scale: particleScale },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, shader);
    // Particles move away from wherever the bounding sphere was first
    // computed; culling would hide a system that is still on screen.
    points.frustumCulled = false;
    const world = particles.space === "World";
    if (world) scene.add(points);
    else anchor.add(points);
    return { emitter, points, anchor, world, burstOnPlay: particles.burst };
  }
  const particleOrigin = new THREE.Vector3();
  function stepParticles(state: ParticleState, dt: number) {
    if (state.world) {
      state.anchor.getWorldPosition(particleOrigin);
      state.emitter.origin = [particleOrigin.x, particleOrigin.y, particleOrigin.z];
    }
    stepEmitter(state.emitter, dt);
    const attributes = state.points.geometry.attributes;
    attributes.position!.needsUpdate = true;
    attributes.color!.needsUpdate = true;
    attributes.size!.needsUpdate = true;
  }
  // Trails (0.57.0): a camera-facing ribbon behind each Trail entity,
  // recorded during Play (trail.ts builds the geometry).
  interface TrailState {
    component: TrailComponent;
    anchor: THREE.Object3D;
    points: TrailPoint[];
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  }
  const trailStates: TrailState[] = [];
  function createTrail(component: TrailComponent, anchor: THREE.Object3D): TrailState {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: colorOf(component.color) } },
      vertexShader: `
        attribute float fade;
        varying float vFade;
        void main() { vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 color;
        varying float vFade;
        void main() { gl_FragColor = vec4(color * vFade, 1.0); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { component, anchor, points: [], mesh };
  }
  const trailScratch = new THREE.Vector3();
  function stepTrails(dt: number) {
    for (const trail of trailStates) {
      if (doc.mode === "edit") trail.points.length = 0;
      else if (doc.mode === "play") {
        trail.anchor.getWorldPosition(trailScratch);
        updateTrail(trail.points, trailScratch, dt, trail.component.lifetime, trail.component.minDistance);
      }
      const ribbon = buildRibbon(trail.points, viewCamera.position, trail.component.width, trail.component.lifetime);
      const geometry = trail.mesh.geometry;
      geometry.setAttribute("position", new THREE.BufferAttribute(ribbon.positions, 3));
      geometry.setAttribute("fade", new THREE.BufferAttribute(ribbon.fades, 1));
      geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
    }
  }
  const deathFadeDuration = 1.0; // seconds; how long a defeated entity lingers, fading out
  // Called once, the first frame editor_alive(i) reads false for an entity
  // that was previously alive -- starts its death sequence (a clip, if its
  // model has one, plus a fade-out) instead of the object just vanishing
  // the instant combat/AI damage brings its Health to 0.
  function startDeath(anchor: THREE.Object3D, animState: AnimState | undefined): DeathState {
    // "death"/"die" are the two conventional clip names this project's own
    // kits already use elsewhere (see animationClips.ts's pickClipName for
    // the same "look for a conventional name, fall back gracefully if this
    // particular rig doesn't have one" approach) -- not every model has a
    // death clip, so this is a bonus when present, not a requirement.
    // Matched case-insensitively (several bundled models -- Alpaca, Stag,
    // Husky, Wolf -- expose theirs as "Death" with a capital D, while
    // loadCatalogModel() keeps each clip.name exactly as authored), but
    // looked up in `actions` by its own original-case key, which is the
    // only key that's actually in that Map.
    if (animState) {
      const deathClip = [...animState.actions.keys()].find((name) => ["death", "die"].includes(name.toLowerCase()));
      if (deathClip) {
        const action = animState.actions.get(deathClip)!;
        const previous = animState.current ? animState.actions.get(animState.current) : undefined;
        action.reset().setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.fadeIn(0.15).play();
        if (previous && previous !== action) previous.fadeOut(0.15);
        animState.current = deathClip;
      }
    }
    // Every material this object's mesh hierarchy uses is shared with every
    // other placed instance of the same model (rebuild()'s own comment on
    // why cloning is skipped there for exactly this reason -- nothing to
    // dispose per rebuild otherwise) -- fading one in place would
    // incorrectly fade every other entity using that model too, so each one
    // is cloned here, lazily, only for the one object that's actually
    // dying, and disposed once its fade finishes (or on the next rebuild(),
    // whichever comes first).
    const materials: { material: THREE.Material; baseOpacity: number }[] = [];
    const cloned = new Map<THREE.Material, THREE.Material>();
    anchor.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const clone = (material: THREE.Material): THREE.Material => {
        let result = cloned.get(material);
        if (!result) {
          result = material.clone();
          // clone() already copied the source's own opacity (e.g. 0.45 for
          // vehicle glass) -- captured here, before transparent/opacity get
          // driven by the fade below, since that's the value the fade must
          // multiply down from, not overwrite.
          const baseOpacity = result.opacity;
          result.transparent = true;
          cloned.set(material, result);
          materials.push({ material: result, baseOpacity });
        }
        return result;
      };
      child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material);
    });
    return { elapsed: 0, materials };
  }
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ color: 0x61adba });
  // Blast projectiles are spawned entirely at runtime in C++ (see
  // editor_projectile_count/_value in bridge.cpp) and have no authored
  // entity of their own, so they get their own small pool of meshes here
  // instead of living in `objects`/`rebuild()`, grown/shrunk to match
  // however many currently exist each Play-mode frame.
  const projectileGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0x78c8ff });
  const projectileMeshes: THREE.Mesh[] = [];
  const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xffce70);
  selection.visible = false;
  scene.add(selection);
  const gizmo = new TransformControls(camera, renderer.domElement);
  scene.add(gizmo.getHelper());
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
  // The gizmo drags a catalog-backed object's own three.js scale, which
  // rebuild() normalizes by the model's native size (see CachedModel's own
  // doc comment) — not the literal world-space units the authored Scale
  // component stores. Undoing that normalization here, so the scale mode
  // persists literal dimensions instead of quietly shrinking the model by
  // its own native size on the very next rebuild().
  function toLiteralScale(entity: EntityRef, scale: Vec3): Vec3 {
    const meshId = doc.scene.resolve(entity, "Renderable")?.mesh ?? 0;
    const cached = meshId >= 1 ? catalogCache.get(meshId) : undefined;
    if (!cached) return scale;
    const n = cached.nativeSize;
    return {
      x: scale.x * (n.x > 1e-6 ? n.x : 1),
      y: scale.y * (n.y > 1e-6 ? n.y : 1),
      z: scale.z * (n.z > 1e-6 ? n.z : 1),
    };
  }
  gizmo.addEventListener("mouseUp", () => {
    const current = gesture;
    gesture = undefined;
    if (!current || !gizmo.object) return;
    const after = snapshot(gizmo.object);
    if (current.mode === "scale") {
      current.before.scale = toLiteralScale(current.entity, current.before.scale);
      after.scale = toLiteralScale(current.entity, after.scale);
    }
    const command = transformCommand(current.entity, current.mode, current.before, after);
    queueMicrotask(() => {
      if (command) execute(command);
      rebuild();
    });
  });
  for (const mode of ["translate", "rotate", "scale"] as const)
    el(mode).onclick = () => {
      if (doc.mode !== "edit" || gizmo.dragging) return;
      gizmo.setMode(mode);
      for (const id of ["translate", "rotate", "scale"]) el(id).setAttribute("aria-pressed", String(mode === id));
    };
  el<HTMLSelectElement>("space").onchange = () => gizmo.setSpace(el<HTMLSelectElement>("space").value as "world" | "local");
  function configureSnap() {
    const enabled = el<HTMLInputElement>("snap").checked;
    gizmo.setTranslationSnap(enabled ? Number(el<HTMLSelectElement>("snap-size").value) : null);
    gizmo.setRotationSnap(enabled ? Math.PI / 12 : null);
    gizmo.setScaleSnap(enabled ? 0.1 : null);
  }
  el("snap").onchange = configureSnap;
  el("snap-size").onchange = configureSnap;
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && gesture && gizmo.object) {
      const b = gesture.before;
      gizmo.object.position.set(b.position.x, b.position.y, b.position.z);
      gizmo.object.rotation.set(b.rotation.x, b.rotation.y, b.rotation.z);
      gizmo.object.scale.set(b.scale.x, b.scale.y, b.scale.z);
      gesture = undefined;
      gizmo.dragging = false;
      gizmo.axis = null;
      queueMicrotask(rebuild);
    }
  });
  const gltfLoader = new GLTFLoader();
  interface CachedModel {
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
    // on the entity's collision box (0.66.0).
    nativeCenter: THREE.Vector3;
  }
  const catalogCache = new Map<number, CachedModel>();
  const catalogPromises = new Map<number, Promise<CachedModel>>();
  // Ids with a rebuild()-on-load callback already attached (see the rebuild()
  // fallback branch below). A scene with N entities sharing one uncached
  // catalog id must trigger exactly one rebuild() when it resolves, not N —
  // each rebuild() re-clones the whole scene, so N would be O(N) redundant
  // full-scene rebuilds for what is, functionally, one load finishing.
  const pendingCatalogRebuilds = new Set<number>();
  function catalogEntry(meshId: number) {
    return modelCatalog.find((m) => m.id === meshId);
  }
  // Options for AnimationState.clip's inspector dropdown: this entity's own
  // Renderable model's clip names, not a fixed list -- unlike Sound.clip
  // (one catalog, PropertyMetadata.ts), every animated model has a different
  // clip set, so this has to be computed per entity rather than statically.
  function animationClipOptions(entity: EntityRef) {
    const meshId = doc.scene.resolve(entity, "Renderable")?.mesh ?? 0;
    const clips = catalogCache.get(meshId)?.clips ?? [];
    return [{ label: "(Automatic)", value: "" }, ...clips.map((clip) => ({ label: clip.name, value: clip.name }))];
  }
  function loadCatalogModel(meshId: number): Promise<CachedModel> | undefined {
    const entry = catalogEntry(meshId);
    if (!entry) return undefined;
    let promise = catalogPromises.get(meshId);
    if (!promise) {
      promise = gltfLoader.loadAsync(entry.path).then((gltf) => {
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const nativeSize = bounds.getSize(new THREE.Vector3());
        const nativeCenter = bounds.getCenter(new THREE.Vector3());
        const cached = { scene: gltf.scene, clips: gltf.animations, nativeSize, nativeCenter };
        if (entry.animated) {
          markCharacter(gltf.scene);
          // Where its lowest foot bone stands in the rest pose, relative to
          // the model's centre: combatView keeps fighters' feet there.
          gltf.scene.updateMatrixWorld(true);
          let foot = Infinity;
          gltf.scene.traverse((node) => {
            if ((node as THREE.Bone).isBone && /foot|toe/i.test(node.name)) foot = Math.min(foot, node.getWorldPosition(new THREE.Vector3()).y);
          });
          if (Number.isFinite(foot)) gltf.scene.userData.restFoot = foot - nativeCenter.y;
        }
        catalogCache.set(meshId, cached);
        return cached;
      });
      // Evict a failed load so the next attempt (a rebuild() encountering the
      // same id again, or a retried "Add") gets a fresh promise instead of
      // reusing a permanently rejected one. A separate .catch() here just
      // observes the rejection for this bookkeeping; it doesn't swallow it —
      // every other holder of `promise` still sees the original rejection.
      promise.catch(() => catalogPromises.delete(meshId));
      catalogPromises.set(meshId, promise);
    }
    return promise;
  }
  // -- Audio ------------------------------------------------------------
  // A Sound component's playback is scoped to a Play session the same way
  // Script's on_tick and AIAgent already are: autoplay starts every marked
  // entity's clip the moment Play begins, Pause suspends the whole
  // AudioContext (pausing every currently-playing sound's output in place,
  // not just muting it) and Stop tears them down. There is no per-event
  // trigger (a melee hit landing, a footstep) -- that needs the bridge to
  // expose which tick an event actually fired, which this round doesn't add.
  let audioContext: AudioContext | undefined;
  // Generative music (0.75.0): scripts pick the mood (host.send("music", ...)).
  let music: Music | undefined;
  let musicMood = "off";
  function updateMusic() {
    if (musicMood !== "off" && !music && audioContext) {
      music = new Music(audioContext, audioMixer().buses.music);
      music.setMood(musicMood);
    }
    music?.update();
  }
  const soundBuffers = new Map<number, AudioBuffer>();
  const soundBufferPromises = new Map<number, Promise<AudioBuffer>>();
  function getAudioContext(): AudioContext {
    audioContext ??= new AudioContext();
    return audioContext;
  }
  function soundEntry(clipId: number) {
    return soundCatalog.find((s) => s.id === clipId);
  }
  function loadSoundBuffer(clipId: number): Promise<AudioBuffer> | undefined {
    const entry = soundEntry(clipId);
    if (!entry) return undefined;
    let promise = soundBufferPromises.get(clipId);
    if (!promise) {
      const context = getAudioContext();
      promise = fetch(entry.path)
        .then((response) => response.arrayBuffer())
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          soundBuffers.set(clipId, buffer);
          return buffer;
        });
      promise.catch(() => soundBufferPromises.delete(clipId));
      soundBufferPromises.set(clipId, promise);
    }
    return promise;
  }
  // Keyed by entity index, the same indexing syncRuntime()/objects[] use --
  // populated on Play start, torn down on Stop, so a sound never keeps
  // playing (or gets started twice) across a Stop/Play cycle.
  const activeSounds = new Map<number, AudioBufferSourceNode>();
  // Positional Sound components, moved with their entity every frame.
  const activePanners = new Map<number, PannerNode>();
  // Bumped on every fresh Play (edit -> play). A clip load kicked off by one
  // Play session can still be in flight (loadSoundBuffer's promise cache is
  // keyed by clip id, not by session) when Stop, then Play again, happens
  // before it resolves -- without this, both the stale and the fresh
  // session's callback would fire off that one shared promise, starting two
  // independent sources for the same entity; the second activeSounds.set()
  // would then only ever let Stop reach one of them, leaking the other
  // (audibly, forever, for a looping clip) until the page reloads.
  let playSession = 0;
  function startSounds() {
    const session = ++playSession;
    const context = getAudioContext();
    doc.scene.eachAlive().forEach((entity, index) => {
      const sound = doc.scene.resolve(entity, "Sound");
      if (!sound?.autoplay) return;
      const play = (buffer: AudioBuffer) => {
        // An async clip load can resolve after the session that requested
        // it already ended: doc.mode catches "stopped, never replayed";
        // playSession catches "stopped, then replayed before this settled".
        if (session !== playSession) return;
        if (doc.mode !== "play" && doc.mode !== "pause") return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = sound.loop;
        const position = sound.spatial ? objects[index]?.position : undefined;
        const { input, panner } = audioMixer().source(sound.bus.toLowerCase() as Bus, position, {
          volume: sound.volume,
          refDistance: sound.minDistance,
          maxDistance: sound.maxDistance,
        });
        source.connect(input);
        source.start();
        activeSounds.set(index, source);
        if (panner) activePanners.set(index, panner);
      };
      const cached = soundBuffers.get(sound.clip);
      if (cached) play(cached);
      else loadSoundBuffer(sound.clip)?.then(play, (error) => log(`Sound clip ${sound.clip} failed to load: ${String(error)}`));
    });
  }
  // A one-shot from a script's sound.play(clip): `clip` is a catalog id
  // ("10") or name, matched case-insensitively, exactly or as a prefix
  // ("coin" plays "Coin Pickup").
  function playOneShot(clip: string, position?: THREE.Vector3, volume = 1) {
    const wanted = clip.trim().toLowerCase();
    // "sfx:<name>" plays a synthesized sound (0.64.0).
    if (wanted.startsWith("sfx:")) {
      const voice = position ? soundsAt(position, volume) : sounds();
      const [name = "", detail = ""] = wanted.slice(4).split(":");
      if (name === "gunshot") voice.gunshot(detail || "rifle", position ? 1 : volume);
      else if (name === "explosion") voice.explosion(position ? 1 : volume);
      else if (name === "impact") voice.impact(detail === "flesh", position ? 1 : volume);
      else if (name === "footstep") voice.footstep(detail === "grass" ? "grass" : "hard", position ? 1 : volume);
      else if (name === "reload") voice.reload(1.5, position ? 1 : volume);
      else if (name === "click") voice.dryFire(position ? 1 : volume);
      else if (name === "hit") voice.hitmarker(detail === "kill", position ? 1 : volume);
      else log(`sound.play: no synthesized sound "${name}"`);
      return;
    }
    const entry =
      soundCatalog.find((s) => String(s.id) === wanted) ??
      soundCatalog.find((s) => s.name.toLowerCase() === wanted) ??
      soundCatalog.find((s) => s.name.toLowerCase().startsWith(wanted));
    if (!entry) {
      log(`sound.play: no clip called "${clip}"`);
      return;
    }
    const session = playSession;
    const context = getAudioContext();
    const play = (buffer: AudioBuffer) => {
      if (session !== playSession || doc.mode !== "play") return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(audioMixer().source("sfx", position, { volume }).input);
      source.start();
    };
    const cached = soundBuffers.get(entry.id);
    if (cached) play(cached);
    else loadSoundBuffer(entry.id)?.then(play, () => undefined);
  }
  function stopSounds() {
    for (const source of activeSounds.values()) {
      try {
        source.stop();
      } catch {
        // Already stopped (a non-looping clip that finished on its own).
      }
    }
    activeSounds.clear();
    activePanners.clear();
    stopCarSounds();
    spaceView?.stopAudio();
    music?.dispose();
    music = undefined;
    musicMood = "off";
  }
  let runtime: Runtime;
  try {
    runtime = await createEditorRuntime();
    el("runtime").textContent = "C++ runtime ready";
  } catch (error) {
    el("status").textContent = "Runtime failed to load. Reload or check build.";
    throw error;
  }
  // Whether the last Play frame ran at least one fixed tick (see frame()).
  let inputFrameConsumed = true;
  let accumulator = 0,
    previous = performance.now(),
    ticks = 0;
  // Index into objects[]/the runtime's own entity list of the first
  // Player-tagged entity synced this Play session, or -1 if there is none.
  // Recomputed by syncRuntime() (Play, and Stop-then-Play again); stays
  // fixed for the rest of that session, matching the fact that entities
  // can't be added or removed while playing.
  let playerIndex = -1;
  // -- Spaceflight (0.71.0): the scene's SpaceSystem, drawn by SpaceView ---
  let shipIndex = -1;
  let spaceView: SpaceView | undefined;
  let spaceGround: THREE.Mesh<THREE.BufferGeometry, THREE.ShadowMaterial> | undefined;
  let spacePass: RenderPass | undefined;
  // Walking anywhere (0.72.0): the frame the scatter and ground were built
  // for, the plants and rocks around it, and authored objects hidden while
  // the frame is away from the site.
  let spaceFrame = -1;
  let spaceScatter: THREE.Object3D | undefined;
  let spaceSpecies: Species[] = [];
  let scatterTargets: ScanTarget[] = [];
  let scatterModelsReady = false;
  const hiddenAway = new Set<number>();
  // Sites (0.73.0): the Site entities' indices, and each entity's site
  // (-1: the home site).
  let siteIndices: number[] = [];
  let memberSite: number[] = [];
  // The scanner (0.72.0), for any scene with Scannable entities or species.
  const scanner = new Scanner();
  let scannableIndices: number[] = [];
  function spaceComponent() {
    const entity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "SpaceSystem"));
    return entity ? doc.scene.resolve(entity, "SpaceSystem") : undefined;
  }
  // The star and bodies, before any entity (the Spaceship needs them).
  function stageSpaceSystem() {
    const space = spaceComponent();
    if (!space) return;
    const { bodies, errors } = parseSpaceBodies(space.bodies);
    for (const error of errors) log(`SpaceSystem: ${error}`);
    const site = bodies.findIndex((b) => b.name === space.siteBody);
    if (site < 0) log(`SpaceSystem: site body "${space.siteBody}" not found; using ${bodies[0]?.name ?? "none"}`);
    runtime.ccall(
      "editor_space_begin",
      null,
      ["number", "number", "number", "number", "number", "number", "number"],
      [space.starGm, Math.max(site, 0), space.siteLatitude, space.siteLongitude, space.siteRadius, space.evaRange, space.startTime],
    );
    for (const b of bodies) {
      runtime.ccall(
        "editor_space_body",
        null,
        ["string", ...Array<"number">(12).fill("number")],
        [
          b.name,
          b.parent,
          b.orbitRadius,
          b.period,
          b.phase,
          b.inclination,
          b.radius,
          b.gravity,
          b.atmosphereHeight,
          b.atmosphereDensity,
          b.terrainAmplitude,
          b.terrainScale,
          b.seed,
        ],
      );
      if (b.sea !== undefined) runtime.ccall("editor_space_body_sea", null, ["number"], [b.sea]);
      if (b.hidden) runtime._editor_space_body_hidden(1);
      if (b.craters || b.rifts || b.dunes || b.day)
        runtime.ccall("editor_space_body_features", null, ["number", "number", "number", "number"], [b.craters, b.rifts ? 1 : 0, b.dunes ? 1 : 0, b.day]);
    }
  }
  // On Play: the system view, its render pass, and the site's ground as a
  // depth-and-shadow surface in the scene pass (hills hide what's behind
  // them; buildings cast shadows on the curved ground).
  function startSpaceView() {
    endSpaceView();
    const space = spaceComponent();
    if (!space || !runtime._editor_space_value(SpaceField.hasSpaceSystem)) return;
    const { bodies } = parseSpaceBodies(space.bodies);
    const shipEntity = shipIndex >= 0 ? doc.scene.eachAlive()[shipIndex] : undefined;
    const shipModel = (shipEntity && doc.scene.resolve(shipEntity, "Spaceship")?.model) ?? "";
    spaceView = new SpaceView(runtime as unknown as SpaceRuntime, bodies, colorOf(space.starColor), parseLandmarks(space.landmarks, bodies), shipModel);
    spaceView.chunkMs = governorTier().chunkMs;
    spaceView.sampleTick();
    grid.visible = false;
    spaceSpecies = parseSpecies(space.species, bodies);
    spaceFrame = -1;
    scatterModelsReady = false;
    const models = [...new Set(spaceSpecies.map((s) => s.model))];
    void Promise.all(models.map((id) => loadCatalogModel(id)?.catch(() => undefined))).then(() => {
      scatterModelsReady = true;
      spaceFrame = -1; // rebuild with the models in
    });
    shadowGround.visible = false;
    if (composer) {
      spacePass = new RenderPass(spaceView.scene, spaceView.camera);
      composer.insertPass(spacePass, 0);
      renderPass.clear = false;
      renderPass.clearDepth = true;
    }
    startExplorer();
    prospect = undefined;
  }
  // The walk frame's ground (a depth-and-shadow surface in the scene pass)
  // and the plants and rocks around it, rebuilt whenever the frame moves.
  function rebuildSpaceFrame() {
    const space = spaceComponent();
    if (!spaceView || !space) return;
    if (spaceGround) {
      scene.remove(spaceGround);
      spaceGround.geometry.dispose();
      spaceGround.material.dispose();
    }
    const n = 129;
    const size = space.evaRange * 2;
    const geometry = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) position.setY(i, runtime._editor_space_ground(position.getX(i), position.getZ(i)) + 0.02);
    geometry.computeVertexNormals();
    spaceGround = new THREE.Mesh(geometry, new THREE.ShadowMaterial({ opacity: 0.4 }));
    spaceGround.receiveShadow = true;
    scene.add(spaceGround);
    if (spaceScatter) scene.remove(spaceScatter);
    spaceScatter = undefined;
    scatterTargets = [];
    if (!scatterModelsReady) return;
    const away = runtime._editor_space_value(SpaceField.away) === 1;
    // Plants and rocks keep clear of the active site's solid structures; the
    // quality preset thins them on weaker devices (the mobile governor).
    const activeSite = away ? runtime._editor_space_value(SpaceField.activeSite) : -1;
    const keep: Array<{ x: number; z: number; r: number }> = [];
    if (activeSite !== -2)
      doc.scene.eachAlive().forEach((entity, i) => {
        if ((memberSite[i] ?? -1) !== activeSite || !doc.scene.effectiveHas(entity, "Collider")) return;
        const p = doc.scene.resolve(entity, "Transform")?.position;
        const size = doc.scene.resolve(entity, "Scale")?.value ?? { x: 1, y: 1, z: 1 };
        if (p) keep.push({ x: p.x, z: p.z, r: Math.max(size.x, size.z) * 0.75 + 3 });
      });
    const placed = spaceView.scatter(spaceSpecies, space.evaRange * 0.92, away ? 22 : 75, keep, qualityProfile(playerSettings.quality).scatter);
    const models = new Map<number, { scene: THREE.Object3D }>();
    for (const p of placed) {
      const cached = catalogCache.get(p.species.model);
      if (cached) models.set(p.species.model, cached);
    }
    spaceScatter = buildScatter(
      placed.map((p) => ({ model: p.species.model, x: p.x, y: p.y, z: p.z, yaw: p.yaw, scale: p.scale, collide: false })),
      models,
    );
    // Plants sway (minerals don't), in step with any structure nearby.
    const kindOf = new Map(placed.map((p) => [p.species.model, p.species.kind]));
    spaceScatter.traverse((child) => {
      if (!(child instanceof THREE.InstancedMesh)) return;
      const model = (child.userData.instances as Array<{ model: number }> | undefined)?.[0]?.model;
      if (model === undefined || kindOf.get(model) === "mineral" || Array.isArray(child.material)) return;
      let swayed = swayCache.get(child.material);
      if (!swayed) swayCache.set(child.material, (swayed = swayMaterial(child.material, sway)));
      child.material = swayed;
      child.customDepthMaterial = swayDepth;
    });
    scene.add(spaceScatter);
    applyScatterDensity(governorTier().scatter);
    scatterPlacements = placed.map((p) => ({ x: p.x, y: p.y, z: p.z, key: p.species.id, kind: p.species.kind, scale: p.scale }));
    harvested.clear();
    explorerFx?.clearPrints();
    const kind = (k: string) => k[0]!.toUpperCase() + k.slice(1);
    scatterTargets = placed.map((p) => ({
      key: p.species.id,
      name: p.species.name,
      kind: kind(p.species.kind),
      position: new THREE.Vector3(p.x, p.y + 0.4, p.z),
      range: 5,
    }));
    hideHarvestedHere();
  }
  function endSpaceView() {
    endExplorer();
    if (suitLight) {
      scene.remove(suitLight, suitLight.target);
      suitLight.dispose();
      suitLight = undefined;
    }
    suitLightLevel = 0;
    spaceView?.dispose();
    spaceView = undefined;
    if (spaceScatter) scene.remove(spaceScatter);
    spaceScatter = undefined;
    scatterTargets = [];
    hiddenAway.clear();
    if (spaceGround) {
      scene.remove(spaceGround);
      spaceGround.geometry.dispose();
      spaceGround.material.dispose();
      spaceGround = undefined;
    }
    if (spacePass && composer) {
      composer.removePass(spacePass);
      spacePass = undefined;
      renderPass.clear = true;
      renderPass.clearDepth = false;
    }
    sun.visible = true;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
  }
  // Per frame while playing: the system around the camera, and the scene's
  // light, sky and haze taken from it.
  function updateSpace(view: THREE.Camera, dt: number) {
    if (!spaceView) return;
    spaceView.update(view, dt);
    sunDirection.copy(spaceView.sunDirection);
    const day = spaceView.daylight;
    // Below the horizon the sun neither lights nor shadows; night keeps a
    // dim, cool fill so the site stays readable.
    const elevation = spaceView.sunDirection.y;
    sun.visible = elevation > -0.03;
    // The site's curved ground takes shadows at grazing angles: more bias.
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.12;
    sun.intensity = 2.6 * THREE.MathUtils.clamp(elevation * 4 + 0.15, 0, 1);
    hemisphere.intensity = 0.35 + 1.3 * spaceView.air * day;
    hemisphere.color
      .copy(spaceView.skyColor)
      .lerp(new THREE.Color(1, 1, 1), 0.4)
      .multiplyScalar(0.35 + 0.65 * day);
    scene.background = null;
    if (skyMesh) skyMesh.visible = false;
    // The scattered horizon (atmosphere.ts) colours the haze.
    scene.fog = spaceView.air > 0.02 ? new THREE.FogExp2(spaceView.horizonColor.getHex(), 6e-5 * spaceView.air) : null;
    if (playerIndex >= 0 && objects[playerIndex]) objects[playerIndex]!.visible = !spaceView.flight.piloting;
    // Warm light at sunrise and sunset.
    sun.color.setRGB(1, 1 - spaceView.sunset * 0.35, 1 - spaceView.sunset * 0.6);
    const frame = runtime._editor_space_value(SpaceField.frameGeneration);
    if (frame !== spaceFrame) {
      spaceFrame = frame;
      // Re-anchored on foot (0.75.0): what moved with the walker, the
      // camera included, shifts by the same amount, so nothing visibly jumps.
      const shift = new THREE.Vector3(
        runtime._editor_space_value(SpaceField.reframeShiftX),
        runtime._editor_space_value(SpaceField.reframeShiftY),
        runtime._editor_space_value(SpaceField.reframeShiftZ),
      );
      if (shift.lengthSq() > 1) {
        const step = shift.length();
        tickStates.forEach((state) => {
          if (state && state.previous.distanceTo(state.current) > step * 0.5) state.previous.add(shift);
        });
        rig.position.add(shift);
        view.position.add(shift);
        controls.target.add(shift);
        // The new frame's axes turn too (0.76.0): the camera swings round
        // the walker by the same angle and the look keeps its heading.
        const turn = runtime._editor_space_value(SpaceField.reframeYaw);
        const walker = playerIndex >= 0 ? objects[playerIndex] : undefined;
        if (Math.abs(turn) > 1e-5 && walker) {
          const pivot = rig.position.clone();
          const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
          for (const p of [view.position, controls.target]) p.sub(pivot).applyQuaternion(spin).add(pivot);
          view.quaternion.premultiply(spin);
          rig.yaw += turn;
          fps.look.yaw += turn;
          walker.rotation.y += turn;
        }
      }
      rebuildSpaceFrame();
    }
    // Canals and glossy floors reflect their surroundings (0.76.0), while
    // the governor still has shadows to spare.
    if (doc.mode === "play" && renderer instanceof THREE.WebGLRenderer && governorTier().shadows > 0) {
      const now = performance.now();
      if (now > probeScanAt) {
        probeScanAt = now + 5000;
        probe.attach(scene);
      }
      probe.update(renderer, scene, view.position, now, spaceView.skyColor, spaceView.horizonColor);
    }
    // Weather fog (0.73.0) thickens the haze.
    const fog = explorerFx?.weather.fog ?? 0;
    if (fog > 0.01)
      scene.fog = new THREE.FogExp2(
        spaceView.horizonColor
          .clone()
          .lerp(spaceView.skyColor.clone().multiplyScalar(day * 0.8), 0.5)
          .getHex(),
        6e-5 * spaceView.air + fog * 0.012,
      );
    updateExplorer(dt, view);
    // Only the active site's objects are here; the rest are elsewhere on
    // the planet (or another world).
    const activeSite = runtime._editor_space_value(SpaceField.away) === 1 ? runtime._editor_space_value(SpaceField.activeSite) : -1;
    const entities = doc.scene.eachAlive();
    objects.forEach((object, i) => {
      if (!object || i === shipIndex || i === playerIndex) return;
      const entity = entities[i];
      const site = memberSite[i] ?? -1;
      // Plain children follow their parent's visibility.
      if (entity && site < 0 && doc.scene.effectiveHas(entity, "Parent")) return;
      const here = siteIndices.includes(i) ? activeSite === siteIndices.indexOf(i) : site === activeSite;
      if (!here && object.visible) {
        object.visible = false;
        hiddenAway.add(i);
      } else if (here && hiddenAway.has(i)) {
        object.visible = true;
        hiddenAway.delete(i);
      }
    });
  }

  // -- Exploration (0.73.0): maps, weather, harvesting, settings ----------
  // Scripts drive these through host.send(kind, text); see handleHost.
  const playerSettings = loadSettings();
  const announcer = new Announcer(app);
  let explorerFx: ExplorerFx | undefined;
  // The visor and the suit light (0.75.0).
  const visor = new Visor();
  let suitLight: THREE.SpotLight | undefined;
  let suitLightMode: "auto" | "on" | "off" = "auto";
  let suitLightLevel = 0;
  let ambience: Ambience | undefined;
  let explorerBodies: ReturnType<typeof parseSpaceBodies>["bodies"] = [];
  let mapMode: "off" | "system" | "surface" = "off";
  let minimapAllowed = true;
  const mapSites = new Map<string, MapSite & { body: string }>();
  const latLonWaypoints = new Map<string, { body: string; latitude: number; longitude: number; label: string }>();
  const surfaceImages = new Map<number, HTMLCanvasElement>();
  const catalogued = new Set<string>();
  let scatterPlacements: Array<{ x: number; y: number; z: number; key: string; kind: string; scale: number }> = [];
  const harvested = new Set<number>();
  let nearHarvest = "";
  let softGround = true;
  // Prospecting: species keys to find and the marker label ("" = off).
  let prospect: { keys: Set<string>; label: string; range: number } | undefined;
  let touchControls: { dispose(): void } | undefined;
  let profileCapture: { frames: number[]; until: number } | undefined;
  let wasLanded = true;
  function frameQuaternion() {
    return new THREE.Quaternion(runtime._editor_space_frame(0), runtime._editor_space_frame(1), runtime._editor_space_frame(2), runtime._editor_space_frame(3));
  }
  function bodyCentre(index: number) {
    return new THREE.Vector3(
      runtime._editor_space_body_value(index, 0),
      runtime._editor_space_body_value(index, 1),
      runtime._editor_space_body_value(index, 2),
    );
  }
  // Body-fixed -> walk frame for body `index`: the frame times its turn.
  function bodyQuaternion(index: number) {
    const spin = new THREE.Quaternion(
      runtime._editor_space_body_spin(index, 0),
      runtime._editor_space_body_spin(index, 1),
      runtime._editor_space_body_spin(index, 2),
      runtime._editor_space_body_spin(index, 3),
    );
    return frameQuaternion().multiply(spin);
  }
  // A latitude/longitude on a body, as a point in the walk frame.
  function latLonToFrame(index: number, latitude: number, longitude: number, lift = 2) {
    const dir = latLonDirection(latitude, longitude);
    const radius =
      runtime._editor_space_body_value(index, 3) +
      Math.max(runtime._editor_planet_height(index, dir.x, dir.y, dir.z), explorerBodies[index]?.sea ?? -1e9) +
      lift;
    return dir.multiplyScalar(radius).applyQuaternion(bodyQuaternion(index)).add(bodyCentre(index));
  }
  function frameToLatLon(index: number, p: THREE.Vector3) {
    const dir = p.clone().sub(bodyCentre(index)).applyQuaternion(bodyQuaternion(index).invert()).normalize();
    return {
      latitude: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))),
      longitude: THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)),
    };
  }
  function cue(name: string) {
    if (!audioContext) return;
    playCue(audioContext, audioMixer().buses.ui, name);
  }
  // Gear (world.wear, GATEBREAKER M3.5): catalog models skinned to the
  // same skeleton as a character, bound to its bones by name, so they move
  // with every clip it plays; "id:#rrggbb" tints a piece. Indexed like
  // objects[].
  const outfits = new Map<number, THREE.Object3D[]>();
  function parseOutfit(text: string) {
    return text
      .split(/\s+/)
      .map((part) => /^(\d+)(?::(#[0-9a-fA-F]{6}))?$/.exec(part))
      .filter((m): m is RegExpExecArray => !!m && Number(m[1]) > 0)
      .map((m) => ({ id: Number(m[1]), tint: m[2] }));
  }
  function setOutfit(index: number, spec: { id: number; tint?: string }[]) {
    for (const piece of outfits.get(index) ?? []) piece.removeFromParent();
    outfits.delete(index);
    const anchor = objects[index];
    if (!anchor) return;
    let body: THREE.SkinnedMesh | undefined;
    anchor.traverse((node) => {
      if (!body && (node as THREE.SkinnedMesh).isSkinnedMesh) body = node as THREE.SkinnedMesh;
    });
    if (!body?.parent) return;
    const bones = new Map(body.skeleton.bones.map((bone) => [bone.name, bone]));
    const pieces: THREE.Object3D[] = [];
    for (const { id, tint } of spec) {
      const cached = catalogCache.get(id);
      if (!cached) {
        // Worn once it has loaded (unless something else was put on since).
        loadCatalogModel(id)?.then(() => {
          if (outfits.get(index) === pieces) setOutfit(index, spec);
        });
        continue;
      }
      const clone = SkeletonUtils.clone(cached.scene);
      clone.updateMatrixWorld(true);
      const meshes: THREE.SkinnedMesh[] = [];
      clone.traverse((node) => {
        if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(node as THREE.SkinnedMesh);
      });
      for (const mesh of meshes) {
        const mapped = mesh.skeleton.bones.map((bone) => bones.get(bone.name) ?? bone);
        mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        if (tint) {
          const material = (mesh.material as THREE.MeshStandardMaterial).clone();
          material.color.multiply(new THREE.Color(tint));
          mesh.material = material;
        }
        markCharacter(mesh);
        body.parent.add(mesh);
        pieces.push(mesh);
      }
    }
    outfits.set(index, pieces);
  }
  function handleHost(kind: string, text: string) {
    if (kind === "weather") {
      const weather = parseWeather(text);
      if (explorerFx) explorerFx.weather = weather;
      scanner.tuning.interference = Math.min(1, weather.rain * 0.7 + weather.fog * 0.5);
      ambience?.set("rain", weather.rain);
    } else if (kind === "map_site") {
      const site = parseMapSite(text);
      if (site) mapSites.set(site.id, site);
    } else if (kind === "map_site_clear") mapSites.delete(text);
    else if (kind === "waypoint") {
      const [id, body, lat, lon, label = ""] = text.split("|");
      if (id && body && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)))
        latLonWaypoints.set(id, { body, latitude: Number(lat), longitude: Number(lon), label });
    } else if (kind === "waypoint_clear") latLonWaypoints.delete(text);
    else if (kind === "map")
      mapMode =
        text === "toggle" ? (mapMode === "off" ? "system" : mapMode === "system" ? "surface" : "off") : text === "system" || text === "surface" ? text : "off";
    else if (kind === "minimap") minimapAllowed = text !== "0";
    else if (kind === "catalogued") catalogued.add(text);
    else if (kind === "harvest") harvest(text);
    else if (kind === "harvest_spot") {
      harvestedSpots.add(text);
      if (text.startsWith(`${scatterFrameKey()}|`)) hideScatter(Number(text.split("|")[1]));
    } else if (kind === "scanner") {
      const [range = 1, time = 1, condition = 1] = text.split(/\s+/).map(Number);
      scanner.tuning.range = Number.isFinite(range) && range > 0 ? range : 1;
      scanner.tuning.time = Number.isFinite(time) && time > 0 ? time : 1;
      scanner.tuning.condition = Number.isFinite(condition) ? THREE.MathUtils.clamp(condition, 0, 1) : 1;
    } else if (kind === "sky_scan") scanner.skyKey = text;
    else if (kind === "music") {
      musicMood = text.trim();
      music?.setMood(musicMood);
    } else if (kind === "visor") visor.state = parseVisor(text);
    else if (kind === "suitlight") suitLightMode = text === "on" || text === "off" ? text : "auto";
    else if (kind === "dust" && explorerFx) {
      const [color = "#d8cfb8", density = "0.5"] = text.split(/\s+/);
      if (/^#[0-9a-fA-F]{6}$/.test(color)) explorerFx.dustColor.set(color);
      explorerFx.dustDensity = THREE.MathUtils.clamp(Number(density) || 0, 0, 1);
    } else if (kind === "soft") softGround = text !== "0";
    else if (kind === "audio") {
      const [layer = "", level = "0"] = text.split(/\s+/);
      if ((ambienceLayers as readonly string[]).includes(layer)) ambience?.set(layer as AmbienceLayer, Number(level));
    } else if (kind === "cue") cue(text);
    else if (kind === "light") {
      const [ambient = NaN, sunLevel = NaN] = text.split(/\s+/).map(Number);
      lightOverride = Number.isFinite(ambient) && Number.isFinite(sunLevel) ? { ambient: Math.max(0, ambient), sun: Math.max(0, sunLevel) } : undefined;
      // (Under a time of day it waits until that's cleared.)
      if (lightOverride && timeOfDay === undefined) {
        hemisphere.intensity = lightOverride.ambient;
        sun.intensity = lightOverride.sun;
      }
    } else if (kind === "time_of_day") {
      const hours = Number(text);
      applyTimeOfDay(Number.isFinite(hours) && hours >= 0 ? hours : undefined);
    } else if (kind === "pause_menu") pauseMenu = text === "1";
    else if (kind === "ui_color") {
      const [name = "", hex = ""] = text.split("|");
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) uiColorOverrides.set(name, new THREE.Color(hex));
      else uiColorOverrides.delete(name);
    }

    else if (kind === "announce") announcer.say(text);
    else if (kind === "system") {
      const split = text.indexOf("|");
      ledger.system(split < 0 ? text : text.slice(0, split), split < 0 ? "" : text.slice(split + 1));
      if (text) announcer.say(ledger.systemText);
    } else if (kind === "panels") ledger.panels(text);
    else if (kind === "boss") {
      const [name = "", title = ""] = text.split("|");
      ledger.setBoss(name, title || name);
    }
    else if (kind === "settings") openPlayerSettings();
    else if (kind === "map_layout" || kind === "map_marker" || kind === "map_marker_clear") districtMap.host(kind, text);
    else if (kind === "prospect") {
      // "label|range|key,key,..." -- empty to stop.
      const [label = "", range = "300", keys = ""] = text.split("|");
      prospect = label ? { label, range: Number(range) || 300, keys: new Set(keys.split(",").filter(Boolean)) } : undefined;
      if (!prospect) uiMarkers.delete("prospect");
    }
  }
  // The settings panel while it's open: during Play the game waits and the
  // keys stay with the panel (Esc closes it).
  let settingsPanel: { close(): void } | undefined;
  // hud.pause_menu(true) (GATEBREAKER M4): Esc, or the browser taking back
  // a captured mouse (Esc never reaches the page then), opens it as a pause
  // menu. A click on Resume or outside closes it; the mouse isn't captured
  // again on its own (the browser refuses for a moment after an Esc).
  let pauseMenu = false;
  let unlockingUntil = 0;
  function releasePointer() {
    unlockingUntil = performance.now() + 500;
    document.exitPointerLock();
  }
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement || doc.mode !== "play" || !pauseMenu || performance.now() < unlockingUntil) return;
    openPlayerSettings(true);
  });
  // Rebound keys (the settings' Keys), per game: a pressed code -> the code
  // the game sees.
  let keyRemap: KeyRemap = loadKeyRemap(document.title);
  function sceneBindings() {
    const entity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "InputActions"));
    return entity ? doc.scene.resolve(entity, "InputActions")?.bindings : undefined;
  }
  // Toggle block (a setting): the codes the game's block action is bound to.
  let blockCodes = new Set<string>();
  let blockCodesFor: string | undefined;
  function isBlockCode(code: string) {
    const text = sceneBindings() ?? "";
    if (text !== blockCodesFor) {
      blockCodesFor = text;
      const names = /^\s*block\s*:(.*)$/m.exec(text)?.[1]?.split(",") ?? [];
      blockCodes = new Set(names.map((n) => codeForBinding(n.trim())).filter((c): c is string => !!c));
    }
    return blockCodes.has(code);
  }
  function openPlayerSettings(paused = false) {
    if (settingsPanel) return;
    releaseHeldKeys();
    settingsPanel = openSettingsPanel(app, playerSettings, applyPlayerSettings, {
      paused,
      bindings: sceneBindings(),
      remap: keyRemap,
      onRemap: (remap) => {
        keyRemap = remap;
        storeKeyRemap(document.title, remap);
      },
      onClose: () => (settingsPanel = undefined),
      onProfile: () => {
        profileCapture = { frames: [], until: performance.now() + 60000 };
        announcer.say("Profiling for 60 seconds");
      },
    });
  }
  function applyPlayerSettings() {
    governor.reset(presetFloor(playerSettings.quality));
    applyGovernor();
    mixer?.setPlayerVolumes(playerSettings.master, playerSettings.music, playerSettings.sfx);
    applyExposure();
    applyInk();
    if (explorerFx) {
      explorerFx.reducedMotion = playerSettings.reducedMotion;
      explorerFx.footprints = playerSettings.footprints;
    }
    const wantTouch = doc.mode !== "edit" && (playerSettings.touch === "on" || (playerSettings.touch === "auto" && isTouchDevice()));
    if (wantTouch && !touchControls)
      touchControls = createTouchControls(app, (code, key, down) => {
        if (districtMap.touchKey(code, down)) return releaseHeldKeys();
        keyQueue.push([code, down ? 1 : 0]);
        if (down) heldKeys.add(code);
        else heldKeys.delete(code);
        for (const name of key && key !== code ? [key, code] : [code]) {
          scriptKeyQueue.push([name, down ? 1 : 0]);
          if (down) heldScriptKeys.add(name);
          else heldScriptKeys.delete(name);
        }
      });
    else if (!wantTouch && touchControls) {
      touchControls.dispose();
      touchControls = undefined;
    }
  }
  function startExplorer() {
    endExplorer();
    const space = spaceComponent();
    explorerBodies = space ? parseSpaceBodies(space.bodies).bodies : [];
    explorerFx = new ExplorerFx();
    scene.add(explorerFx.group);
    if (audioContext) ambience = new Ambience(audioContext, audioMixer().buses.ambient);
    mapMode = "off";
    minimapAllowed = true;
    mapSites.clear();
    latLonWaypoints.clear();
    catalogued.clear();
    harvested.clear();
    harvestedSpots.clear();
    nearHarvest = "";
    softGround = true;
    wasLanded = true;
    scanner.tuning = { range: 1, time: 1, interference: 0, condition: 1 };
    scanner.skyKey = "";
    applyPlayerSettings();
  }
  function endExplorer() {
    if (explorerFx) {
      scene.remove(explorerFx.group);
      explorerFx.dispose();
      explorerFx = undefined;
    }
    ambience?.stop();
    ambience = undefined;
    touchControls?.dispose();
    touchControls = undefined;
    document.getElementById("player-settings")?.remove();
  }
  // Takes the nearest catalogued specimen of `key` within reach out of the
  // world and tells scripts (on_ui("harvested", key)).
  function harvest(key: string) {
    const player = playerIndex >= 0 ? objects[playerIndex] : undefined;
    if (!player || !spaceScatter) return;
    let best = -1,
      bestDistance = 3.5;
    scatterPlacements.forEach((p, i) => {
      if (p.key !== key || harvested.has(i)) return;
      const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best < 0) return;
    hideScatter(best);
    // Remembered by place (and saved by scripts), so it stays harvested.
    const spot = `${scatterFrameKey()}|${best}`;
    harvestedSpots.add(spot);
    uiEvent("harvested", key);
    uiEvent("harvest_spot", spot);
  }
  // Harvested specimens by place: "<body>:<lat>:<lon>|<index>".
  const harvestedSpots = new Set<string>();
  function scatterFrameKey() {
    return `${runtime._editor_space_value(SpaceField.frameBody)}:${runtime._editor_space_value(SpaceField.frameLatitude).toFixed(2)}:${runtime._editor_space_value(SpaceField.frameLongitude).toFixed(2)}`;
  }
  // Hides scatter placement `index` (harvested).
  function hideScatter(index: number) {
    if (!spaceScatter || harvested.has(index) || !scatterPlacements[index]) return;
    harvested.add(index);
    const placement = scatterPlacements[index]!;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    spaceScatter.traverse((o) => {
      const list = (o as THREE.InstancedMesh).userData?.instances as Array<{ x: number; z: number }> | undefined;
      if (!(o instanceof THREE.InstancedMesh) || !list) return;
      const i = list.findIndex((instance) => instance.x === placement.x && instance.z === placement.z);
      if (i >= 0) {
        o.setMatrixAt(i, zero);
        o.instanceMatrix.needsUpdate = true;
      }
    });
    scatterTargets = scatterTargets.filter((t) => !(t.position.x === placement.x && t.position.z === placement.z));
  }
  // After a frame's scatter is built: hide what was harvested there before.
  function hideHarvestedHere() {
    const prefix = `${scatterFrameKey()}|`;
    for (const spot of harvestedSpots) if (spot.startsWith(prefix)) hideScatter(Number(spot.slice(prefix.length)));
  }
  const sway = swayUniforms();
  const swayCache = new Map<THREE.Material, THREE.Material>();
  const swayDepth = swayDepthMaterial(sway);
  // The grass clock and the structures it falls into step near.
  function updateSway(dt: number) {
    if (!spaceView) return;
    sway.uSwayTime.value += dt;
    sway.uPulse.value = spaceView.grammarTime;
    const w = explorerFx?.weather;
    sway.uWind.value = w ? Math.min(1, Math.hypot(w.windX, w.windZ) / 14) : 0;
    const eye = viewCamera.position;
    const spots = spaceView.landmarks
      .map((l) => l.anchor.getWorldPosition(new THREE.Vector3()))
      .filter((p) => p.distanceTo(eye) < 3000)
      .sort((a, b) => a.distanceTo(eye) - b.distanceTo(eye));
    for (let i = 0; i < MAX_SPOTS; i++) {
      const p = spots[i];
      // Unused slots sit far away (a zero radius would be undefined).
      sway.uSpots.value[i]!.set(p?.x ?? 1e9, p?.y ?? 0, p?.z ?? 1e9, 70);
    }
  }
  // The suit light: a lamp at the walker's helmet along their facing,
  // easing on as the light fails (or forced on or off with L).
  function updateSuitLight(dt: number, walker: THREE.Object3D | undefined) {
    const dark = spaceView ? 1 - THREE.MathUtils.smoothstep(spaceView.daylight * Math.max(spaceView.air, 0.25), 0.06, 0.16) : 0;
    const want = !walker ? 0 : suitLightMode === "on" ? 1 : suitLightMode === "off" ? 0 : dark;
    suitLightLevel += (want - suitLightLevel) * (1 - Math.exp(-dt * 4));
    if (suitLightLevel < 0.01 || !walker) {
      if (suitLight) suitLight.visible = false;
      return;
    }
    if (!suitLight) {
      suitLight = new THREE.SpotLight(0xf4f2ea, 0, 30, 0.45, 0.6, 1.6);
      // Shadows from the suit light (0.76.0): a small map, near range.
      suitLight.shadow.mapSize.set(512, 512);
      suitLight.shadow.camera.near = 0.3;
      suitLight.shadow.camera.far = 30;
      suitLight.shadow.bias = -0.002;
      suitLight.shadow.normalBias = 0.05;
      scene.add(suitLight, suitLight.target);
    }
    suitLight.visible = true;
    suitLight.intensity = 14 * suitLightLevel;
    // Only while the governor still runs full shadows: one more shadow
    // pass a frame isn't free.
    suitLight.castShadow = governorTier().shadows === 2 && suitLightLevel > 0.05;
    const yaw = walker.rotation.y;
    const forward = new THREE.Vector3(Math.sin(yaw), -0.18, Math.cos(yaw)).normalize();
    suitLight.position
      .copy(walker.position)
      .add(new THREE.Vector3(0, 0.75, 0))
      .addScaledVector(forward, 0.35);
    suitLight.target.position.copy(suitLight.position).addScaledVector(forward, 10);
  }
  // Per frame while playing a SpaceSystem scene.
  function updateExplorer(dt: number, view: THREE.Camera) {
    if (!spaceView || !explorerFx) return;
    const player = playerIndex >= 0 ? objects[playerIndex] : undefined;
    const walking = !spaceView.flight.piloting;
    const moving = walking && playerIndex >= 0 && runtime._editor_controller_value(playerIndex, 4) > 0.5;
    explorerFx.update(dt, view, walking ? player : undefined, moving, (x, z) => runtime._editor_space_ground(x, z), softGround);
    visor.update(dt, walking ? explorerFx.weather.rain : 0);
    updateSway(dt);
    updateSuitLight(dt, walking ? player : undefined);
    ambience?.update(spaceView.air);
    // Touchdown: the settle bob and a thump.
    const landed = spaceView.flight.landed;
    const ship = shipIndex >= 0 ? objects[shipIndex] : undefined;
    const f = spaceView.flight;
    if (landed && !wasLanded) {
      explorerFx.touchdown(Math.abs(f.verticalSpeed));
      cue("thump");
      // A water landing throws a ring of spray.
      if (ship && f.overWater) explorerFx.splash(ship.position.clone().setY(runtime._editor_space_ground(ship.position.x, ship.position.z)), 220, 6);
    }
    wasLanded = landed;
    // Belly thrusters low over water kick up spray.
    if (ship && f.piloting && !landed && f.overWater && f.altitude < 25 && (f.engineOn || f.vertical > 0))
      explorerFx.splash(
        ship.position.clone().setY(runtime._editor_space_ground(ship.position.x, ship.position.z)),
        Math.ceil(dt * 160 * (1 - f.altitude / 25)),
        4,
      );
    if (ship) ship.position.y -= explorerFx.settleOffset();
    // Large minerals are solid: the walker is pushed back out of them.
    if (walking && player && playerIndex >= 0)
      for (const p of scatterPlacements) {
        if (p.kind !== "mineral" || p.scale < 1) continue;
        const dx = player.position.x - p.x,
          dz = player.position.z - p.z;
        const reach = 0.6 * p.scale + 0.35;
        const d = Math.hypot(dx, dz);
        if (d < reach && d > 1e-3) runtime._editor_push(playerIndex, (dx / d) * (reach - d), (dz / d) * (reach - d));
      }
    // The nearest catalogued specimen within reach, for scripts' prompts.
    let near = "";
    if (walking && player) {
      let best = 3;
      scatterPlacements.forEach((p, i) => {
        if (harvested.has(i) || !catalogued.has(p.key)) return;
        const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
        if (d < best) {
          best = d;
          near = p.key;
        }
      });
    }
    if (near !== nearHarvest) {
      nearHarvest = near;
      uiEvent("near_harvest", near);
    }
    if (profileCapture) {
      profileCapture.frames.push(dt * 1000);
      if (performance.now() > profileCapture.until) {
        const summary = summarizeFrames(profileCapture.frames);
        profileCapture = undefined;
        const text = JSON.stringify({ title: document.title, at: new Date().toISOString(), ...summary }, null, 2);
        log(text);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = "profile.json";
        a.click();
        announcer.say(`Profile done: ${summary.fps.toFixed(0)} fps average`);
      }
    }
  }
  function mapBodies(): MapBody[] {
    const star = bodyCentre(-1);
    const inverse = frameQuaternion().invert();
    const ref = runtime._editor_space_value(SpaceField.referenceBody),
      target = runtime._editor_space_value(SpaceField.targetBody);
    return explorerBodies.map((b, i) => {
      const p = bodyCentre(i).sub(star).applyQuaternion(inverse);
      return { name: b.name, x: p.x, z: p.z, radius: b.radius, color: b.color, parent: b.parent, target: i === target, current: i === ref };
    });
  }
  function drawExplorerHud(lines: string[]) {
    if (!spaceView) return;
    const ctx = hudCtx;
    const hidden = (i: number) => runtime._editor_space_body_value(i, 10) === 1;
    const star = bodyCentre(-1);
    const inverse = frameQuaternion().invert();
    const shipFrame = new THREE.Vector3(
      runtime._editor_space_value(SpaceField.shipX),
      runtime._editor_space_value(SpaceField.shipY),
      runtime._editor_space_value(SpaceField.shipZ),
    );
    const ship = shipFrame.clone().sub(star).applyQuaternion(inverse);
    const all = mapBodies();
    const bodies = all.filter((_, i) => !hidden(i));
    const visibleIndex = all.map((_, i) => i).filter((i) => !hidden(i));
    const reindexed = bodies.map((b) => ({ ...b, parent: b.parent >= 0 ? visibleIndex.indexOf(b.parent) : -1 }));
    const frameBody = runtime._editor_space_value(SpaceField.frameBody);
    // Prospecting: the nearest matching deposit as a marker.
    if (prospect) {
      const me = playerIndex >= 0 ? objects[playerIndex] : undefined;
      let best: (typeof scatterPlacements)[number] | undefined,
        bestDistance = prospect.range;
      if (me && !spaceView.flight.piloting)
        scatterPlacements.forEach((p, i) => {
          if (harvested.has(i) || !prospect!.keys.has(p.key)) return;
          const d = Math.hypot(p.x - me.position.x, p.z - me.position.z);
          if (d < bestDistance) {
            bestDistance = d;
            best = p;
          }
        });
      if (best) uiMarkers.set("prospect", { position: new THREE.Vector3(best.x, best.y + 1.2, best.z), label: prospect.label });
      else uiMarkers.delete("prospect");
    }
    // Latitude/longitude waypoints, drawn like script markers.
    for (const [id, w] of latLonWaypoints) {
      const index = explorerBodies.findIndex((b) => b.name === w.body);
      if (index < 0 || hidden(index)) continue;
      uiMarkers.set(`ll:${id}`, { position: latLonToFrame(index, w.latitude, w.longitude, 4), label: w.label });
    }
    if (mapMode === "system") {
      const span = Math.max(...bodies.filter((b) => b.parent < 0).map((b) => Math.hypot(b.x, b.z))) * 2.3;
      drawSystem(ctx, 40, 60, hud.width - 80, hud.height - 120, reindexed, ship, { x: 0, z: 0 }, span, "SYSTEM MAP  ·  M: surface map");
      lines.push("MAP system");
    } else if (mapMode === "surface") {
      const body = explorerBodies[frameBody];
      if (body) {
        let image = surfaceImages.get(frameBody);
        if (!image) {
          image = surfaceImage(
            256,
            128,
            (x, y, z) => runtime._editor_planet_height(frameBody, x, y, z),
            body.terrainAmplitude,
            body.color,
            body.sea,
            body.snow,
          );
          surfaceImages.set(frameBody, image);
        }
        const sites: MapSite[] = [...mapSites.values()].filter((s) => s.body === body.name);
        for (const landmark of spaceView.landmarks)
          if (landmark.body === frameBody)
            sites.push({ id: landmark.label, label: landmark.label, latitude: landmark.latitude, longitude: landmark.longitude, kind: "landmark" });
        for (const [id, w] of latLonWaypoints)
          if (w.body === body.name) sites.push({ id, label: w.label, latitude: w.latitude, longitude: w.longitude, kind: "waypoint" });
        const me = spaceView.flight.piloting ? shipFrame : ((playerIndex >= 0 ? objects[playerIndex]?.position : undefined) ?? shipFrame);
        const at = frameToLatLon(frameBody, me);
        sites.push({ id: "you", label: "You", ...at, kind: spaceView.flight.piloting ? "ship" : "player" });
        drawSurface(ctx, 40, 60, hud.width - 80, hud.height - 120, image, sites, `${body.name.toUpperCase()} SURVEY MAP  ·  M: close`);
        lines.push(`MAP surface ${body.name}`);
      }
    } else if (playerSettings.minimap && minimapAllowed) {
      const size = Math.min(180, hud.height * 0.24);
      if (spaceView.flight.piloting && !spaceView.flight.landed) {
        // Flight: the reference body's neighbourhood.
        const ref = runtime._editor_space_value(SpaceField.referenceBody);
        const focus = ref >= 0 ? all[ref]! : { x: 0, z: 0 };
        const near = ref >= 0 ? all[ref]!.radius * 14 : 4e6;
        drawSystem(ctx, hud.width - size - 24, hud.height - size - 24, size, size, reindexed, ship, focus, near, "NAV");
      } else {
        const me = playerIndex >= 0 && !spaceView.flight.piloting ? objects[playerIndex] : shipIndex >= 0 ? objects[shipIndex] : undefined;
        if (me) {
          const blips: LocalBlip[] = [];
          const shipObject = shipIndex >= 0 ? objects[shipIndex] : undefined;
          if (shipObject && shipObject !== me) blips.push({ x: shipObject.position.x - me.position.x, z: shipObject.position.z - me.position.z, kind: "ship" });
          for (const [, m] of uiMarkers) blips.push({ x: m.position.x - me.position.x, z: m.position.z - me.position.z, kind: "marker", label: m.label });
          scatterPlacements.forEach((p, i) => {
            if (harvested.has(i)) return;
            const dx = p.x - me.position.x,
              dz = p.z - me.position.z;
            // Only what's catalogued (and so harvestable) -- the map isn't omniscient.
            if (Math.abs(dx) > 170 || Math.abs(dz) > 170 || !catalogued.has(p.key)) return;
            blips.push({ x: dx, z: dz, kind: "resource" });
          });
          const entities = doc.scene.eachAlive();
          objects.forEach((o, i) => {
            if (!o?.visible || i === playerIndex || i === shipIndex || !runtime._editor_alive(i)) return;
            const e = entities[i];
            const wild = runtime._editor_wildlife_state(i);
            const kind = wild === 2 ? "fleeing" : wild >= 0 ? "fauna" : e && doc.scene.effectiveHas(e, "Routine") ? "npc" : undefined;
            if (kind) blips.push({ x: o.position.x - me.position.x, z: o.position.z - me.position.z, kind });
          });
          const heading = view_heading();
          drawLocalMinimap(ctx, hud.width - size - 24, hud.height - size - 24, size, heading, blips);
        }
      }
    }
  }
  // The view's heading on the minimap (0 = facing -z, "north").
  function view_heading() {
    const forward = viewCamera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(forward.x, -forward.z);
  }
  // Hold F to scan (0.72.0): Scannable entities, scattered species and
  // landmarks; a finished scan calls on_ui("scan", key) in every script.
  function scanCandidates(): ScanTarget[] {
    const list: ScanTarget[] = [];
    const entities = doc.scene.eachAlive();
    for (const i of [...scannableIndices, ...spawnedScans.keys()]) {
      const entity = entities[i];
      const object = objects[i];
      const scan = (entity && doc.scene.resolve(entity, "Scannable")) || spawnedScans.get(i);
      if (!scan || !object || !object.visible || !runtime._editor_alive(i)) continue;
      list.push({
        key: scan.id || scan.name,
        name: scan.name,
        kind: scan.kind,
        position: object.position,
        range: scan.range,
        fleeing: runtime._editor_wildlife_state(i) === 2,
      });
    }
    for (const t of scatterTargets) list.push(t);
    for (const landmark of spaceView?.landmarks ?? [])
      list.push({
        key: `landmark:${landmark.label}`,
        name: landmark.label,
        kind: "Landmark",
        position: landmark.anchor.getWorldPosition(new THREE.Vector3()),
        range: 70,
      });
    return list;
  }
  function scanHeld() {
    return heldKeys.has("KeyF") && !spaceView?.flight.piloting && playerIndex >= 0;
  }
  function updateScanner(dt: number, view: THREE.Camera) {
    if (!scannableIndices.length && !scatterTargets.length && !spaceView?.landmarks.length) return;
    const player = playerIndex >= 0 ? objects[playerIndex] : undefined;
    if (!player) return;
    const forward = view.getWorldDirection(new THREE.Vector3());
    const moving = runtime._editor_controller_value(playerIndex, 4) > 2;
    const done = scanner.update(dt, scanHeld(), moving, player.position, forward, scanCandidates());
    if (done) {
      // How sure the scan is (0..1), just before the scan itself.
      runtime.ccall("editor_ui_event", null, ["string", "string"], ["scan_confidence", scanner.confidence.toFixed(2)]);
      runtime.ccall("editor_ui_event", null, ["string", "string"], ["scan", done.key]);
    }
  }
  // The player's authored scale at the moment Play started, and its y position
  // the moment before this frame's ticks ran — the jump squash/stretch effect
  // (see frame()) needs an un-squashed baseline to scale from each frame,
  // since it mutates player.scale directly, and a per-frame vertical delta to
  // react to. Both null/0 until Play actually starts (see the Play handler).
  let playerBaseScale: THREE.Vector3 | null = null;
  let playerPrevY = 0;
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
  // Every key by KeyboardEvent.code, for the native InputState (movement,
  // F/G combat and named actions -- see editor_input_key, bridge.cpp).
  const keyQueue: Array<[code: string, down: number]> = [];
  // Codes currently held down, so a Pause or a lost window focus can force
  // them back up even when no matching keyup DOM event arrives (alt-tab, a
  // window manager shortcut eating the key, etc.).
  const heldKeys = new Set<string>();
  // C (crouch/sit) freezes Player WASD natively while held (see
  // editor.move, bridge.cpp) and plays a sit clip (see the locomotion picker).
  const crouchKeyCode = "KeyC";
  // Every physical key (not just the bound seven above) queued the same way,
  // for a Script's own input.down/input.pressed (engine::script::Runtime's
  // own doc comment, script.hpp, on why this is a separate, wider path from
  // InputState/editor_key). Keyed by event.key.toLowerCase(), not
  // event.code -- the readable form a script author actually writes
  // (input.down("f")), not a physical-layout string like "KeyF".
  const scriptKeyQueue: Array<[key: string, down: number]> = [];
  const heldScriptKeys = new Set<string>();
  // event.key depends on modifier state (Shift+1 is "!"), so recomputing it
  // on keyup can pair a key-down with a different key-up identity -- e.g.
  // Shift released before "1": the down edge queued "!", but the up edge
  // would then queue "1", leaving input.down("!") stuck true forever with
  // no matching release. Recording each physical event.code's logical key
  // at press time and releasing that same value avoids the mismatch.
  const scriptKeyByCode = new Map<string, string>();
  // Releases are accepted in both Play and Pause (only Edit is excluded) so
  // a key physically released while paused still clears its held state,
  // matching the native platform's own semantics. Guarding both on
  // doc.mode === "play" is safe for keydown even for a key pressed just
  // after Stop: syncRuntime() clears keyQueue/heldKeys and hands the next
  // Play session a brand new WASM Runtime (so a fresh, zeroed InputState)
  // anyway, so nothing here needs to carry a "this key was still down" fact
  // across sessions for that fresh state to be correct.
  function releaseHeldKeys() {
    for (const code of heldKeys) keyQueue.push([code, 0]);
    heldKeys.clear();
    for (const key of heldScriptKeys) scriptKeyQueue.push([key, 0]);
    heldScriptKeys.clear();
    scriptKeyByCode.clear();
  }
  window.addEventListener("keydown", (event) => {
    if (doc.mode !== "play" || event.repeat) return;
    if (event.code === "F10") {
      event.preventDefault();
      openPlayerSettings();
      return;
    }
    if (settingsPanel) {
      if (event.code === "Escape") {
        event.preventDefault();
        settingsPanel.close();
      }
      return;
    }
    if (event.code === "Escape" && pauseMenu && document.pointerLockElement !== renderer.domElement) {
      event.preventDefault();
      openPlayerSettings(true);
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
    const code = keyRemap[event.code] ?? event.code;
    if (ledger.playing) {
      event.preventDefault();
      if (code !== "Space" && code !== "Enter") return;
      ledger.skip();
    }
    // Toggle block: a press raises it, the next lowers it (keyup is ignored).
    if (playerSettings.blockToggle && isBlockCode(code) && heldKeys.has(code)) {
      gameKeyUp(code);
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
  function gameKeyUp(code: string, fallbackKey = "") {
    if (heldKeys.delete(code)) keyQueue.push([code, 0]);
    const key = scriptKeyByCode.get(code) ?? fallbackKey;
    scriptKeyByCode.delete(code);
    scriptKeyQueue.push([key, 0]);
    heldScriptKeys.delete(key);
    if (heldScriptKeys.delete(code)) scriptKeyQueue.push([code, 0]);
  }
  window.addEventListener("keyup", (event) => {
    if (doc.mode === "edit") return;
    const code = keyRemap[event.code] ?? event.code;
    if (playerSettings.blockToggle && isBlockCode(code)) return;
    gameKeyUp(code, code === event.code ? event.key.toLowerCase() : keyForCode(code));
  });
  window.addEventListener("blur", () => {
    if (doc.mode !== "edit") releaseHeldKeys();
  });
  // The M map holds every key and click while it is open (minimap.ts).
  districtMap.bindInput(window, () => doc.mode === "play", releaseHeldKeys);
  function execute(command: unknown) {
    const result = doc.execute(command);
    log(result);
    if (result.ok) rebuild();
    return result;
  }
  // Keyed by document.title, not a fixed string -- the exported standalone
  // player (see export_build.mjs) sets <title> per export, so two different
  // exported games hosted under the same browser origin get separate save
  // data instead of silently sharing (and clobbering) one localStorage
  // bucket. The ordinary (non-exported) editor's title never changes, so
  // its own Play-mode testing always shares one namespace -- the same
  // single-instance-per-origin assumption CommandInterpreter.ts's own
  // LocalStorageSceneStore already makes for the document autosave.
  //
  // Both components go through encodeURIComponent, not raw string
  // concatenation, so neither can ever contain the literal ":" this
  // function's own format uses as a separator -- title "Quest:Part" with
  // key "score" and title "Quest" with key "Part:score" would otherwise
  // both produce the exact same joined key (and the prefix scan below
  // would then import one game's data into the other's), since ":" is
  // valid both in export_build.mjs's --name and in an ordinary Lua string.
  function saveKey(key: string): string {
    return `game-engine-editor:save:${encodeURIComponent(document.title)}:${encodeURIComponent(key)}`;
  }
  // Restores every previously-persisted save key into the freshly committed
  // Runtime before any script's on_tick runs -- see
  // engine::script::Runtime::seed_saved's own doc comment (script.hpp) for
  // why this must happen before the first tick, not lazily on first
  // save.get(). localStorage has no "list keys under this prefix" call, so
  // this walks every key in the whole store once -- fine, since it only
  // ever runs once per syncRuntime() (Play, or Stop-then-Play again), not
  // per frame. Wrapped in one try/catch: a sandboxed iframe without
  // allow-same-origin (or any other context denying storage access) throws
  // a SecurityError on the very first property read, not just a specific
  // call -- treated as an empty store (a script's save.get sees nil for
  // everything, same as a real first-ever session) rather than a reason
  // Play can never start, since syncRuntime()'s caller only sets
  // doc.mode = "play" after this returns.
  function seedSavedProgress() {
    const prefix = saveKey("");
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (!fullKey || !fullKey.startsWith(prefix)) continue;
        const value = localStorage.getItem(fullKey);
        if (value !== null) runtime.ccall("editor_seed_save", null, ["string", "string"], [decodeURIComponent(fullKey.slice(prefix.length)), value]);
      }
    } catch {
      // Storage access denied -- see this function's own doc comment above.
    }
  }
  // Save keys a previous persistDirtySaves() call failed to write (a full
  // origin quota, or storage access denied) -- engine::script::Runtime has
  // already forgotten these were ever dirty by the time that failure
  // happens (take_dirty_saves() drains its own pending set unconditionally,
  // whether or not the write that follows actually succeeds), so this is
  // the only place left holding them. Retried on every later call until one
  // succeeds; a newly-dirty write to the same key simply replaces the
  // queued value, the same last-write-wins semantics set_saved itself uses.
  const failedSaveWrites = new Map<string, string>();
  // Polls whatever a script's save.set has actually changed since the last
  // call (see editor_take_dirty_saves's own doc comment, bridge.cpp) and
  // writes each one to localStorage -- the one place this file touches
  // browser persistence for game save data, called once per rendered frame
  // from frame() below, not per fixed tick (a save doesn't need tick
  // granularity, and localStorage writes are comparatively expensive).
  // setItem can throw (QuotaExceededError, or storage access denied);
  // caught per key, not left to escape frame() before its own trailing
  // requestAnimationFrame(frame) call, which would otherwise permanently
  // freeze rendering and simulation over a single oversized or
  // storage-denied save.
  function persistDirtySaves() {
    const count = runtime._editor_take_dirty_saves();
    for (let i = 0; i < count; i++) {
      const key = runtime.ccall("editor_dirty_save_key", "string", ["number"], [i]);
      const value = runtime.ccall("editor_dirty_save_value", "string", ["number"], [i]);
      failedSaveWrites.set(key, value);
    }
    for (const [key, value] of failedSaveWrites) {
      try {
        localStorage.setItem(saveKey(key), value);
        failedSaveWrites.delete(key);
      } catch {
        // Still failing -- leave it queued for the next frame's retry.
      }
    }
  }
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
  function resolveActionClip(state: AnimState, requested: string): string | undefined {
    const candidates = actionClipSynonyms.get(requested) ?? [requested];
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      for (const name of state.actions.keys()) if (name.toLowerCase() === lower) return name;
    }
    return undefined;
  }
  // Polls whatever was requested via editor_take_animation_request this tick
  // (bridge.cpp) and plays it as a one-shot, once per rendered frame like
  // persistDirtySaves above, not per fixed tick. The request itself may come
  // from a script's own self.animate (engine::script::Runtime's own doc
  // comment, script.hpp) or natively from editor.combat/editor.move on a F/G
  // press (see AnimState.oneShot's own doc comment above) -- both reach this
  // same channel and are resolved identically via resolveActionClip.
  // Silently ignored if the entity has no AnimState (a plain box has nothing
  // to animate) or nothing resolves to one of this model's own clips -- the
  // same "bonus when present, not a requirement" contract startDeath()'s own
  // death-clip lookup already has, not an error.
  function pollAnimationRequests() {
    const entities = doc.scene.eachAlive();
    animStates.forEach((state, i) => {
      if (!state) return;
      const requested = runtime.ccall("editor_take_animation_request", "string", ["number"], [i]);
      if (!requested) return;
      const clip = resolveActionClip(state, requested);
      if (!clip) return;
      const action = state.actions.get(clip)!;
      const previous = state.current ? state.actions.get(state.current) : undefined;
      // A still-registered listener from an earlier one-shot that hasn't
      // finished yet (e.g. F then G before punching's own clip ends) must be
      // detached now, before it's replaced -- left in place, it fires later
      // on the OLD action's own completion, still passes its own `event.action
      // !== action` identity check (that guards against a *different* clip,
      // not a *stale* one), and clobbers state.oneShot/state.current out from
      // under whatever this newer one-shot is still doing.
      if (state.oneShotHandler) {
        state.mixer.removeEventListener("finished", state.oneShotHandler);
        state.oneShotHandler = undefined;
      }
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.15).play();
      if (previous && previous !== action) previous.fadeOut(0.15);
      state.current = clip;
      state.oneShot = true;
      // Captured now, not re-resolved from doc.scene inside onFinished --
      // rebuild() never runs mid-Play (same invariant startDeath() already
      // relies on), so this entity/index pairing stays valid for as long as
      // this one-shot can still be playing.
      const entity = entities[i];
      const onFinished = (event: { action: THREE.AnimationAction }) => {
        if (event.action !== action) return;
        state.oneShot = false;
        state.mixer.removeEventListener("finished", onFinished);
        state.oneShotHandler = undefined;
        // An authored AnimationState.clip (see rebuild()) pins a specific
        // resting clip that the ground-speed picker deliberately never
        // fights (it treats `overridden` as "leave it alone"). Left
        // unhandled, that means nobody ever un-clamps this one-shot's own
        // final frame once it's done -- the entity would sit there forever
        // instead of returning to its authored pin. Replay the pin with the
        // exact same loop/time configuration rebuild() itself applies.
        const override = entity && doc.scene.resolve(entity, "AnimationState");
        if (override?.clip && state.actions.has(override.clip)) {
          const pinned = state.actions.get(override.clip)!;
          pinned.setLoop(override.looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          pinned.clampWhenFinished = !override.looping;
          if (Number.isFinite(override.time)) pinned.time = override.time;
          pinned.reset().fadeIn(0.15).play();
          if (pinned !== action) action.fadeOut(0.15);
          state.current = override.clip;
        } else {
          // No authored pin -- hand this action back to ordinary looping
          // playback instead of leaving it clamped on its final frame.
          // Needed even though the ground-speed picker below also resets
          // loop mode on every clip it (re)selects: if the requested clip
          // shares its name with whatever's already state.current (a script
          // reusing a locomotion clip's own name as its "hit" animation,
          // e.g. self.animate = "idle" while already idle), the picker's
          // `clipName !== state.current` guard is false and it never
          // revisits this action at all -- it would otherwise stay frozen
          // forever with no further event to unstick it.
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.reset().play();
        }
      };
      state.oneShotHandler = onFinished;
      state.mixer.addEventListener("finished", onFinished);
    });
  }
  // Sends one entity's components to the runtime being staged: a scene
  // entity at `index`, or (index -1) the prefab template editor_template_begin
  // just announced. `get` resolves a component the same way for both.
  function addToRuntime(
    get: <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined,
    isChild: number,
    index: number,
    name: string | undefined,
  ) {
    const p = get("Transform")?.position ?? { x: 0, y: 0, z: 0 };
    const v = get("Velocity")?.value ?? { x: 0, y: 0, z: 0 };
    const s = get("Scale")?.value ?? { x: 1, y: 1, z: 1 };
    const isPlayer = get("Player") ? 1 : 0;
    const collider = get("Collider");
    const isCollider = collider ? 1 : 0;
    // "Sphere"/radius have been authorable here for a while (PropertyMetadata's
    // Collider.type dropdown), previously discarded entirely -- editor_add
    // now actually resolves the shape it's told, not always an AABB from Scale.
    const colliderShape = collider?.type === "Sphere" ? 1 : 0;
    const colliderRadius = collider?.radius ?? 0.5;
    const isVehicle = get("Vehicle") ? 1 : 0;
    const isAi = get("AIState") ? 1 : 0;
    const isPedestrian = get("Pedestrian") ? 1 : 0;
    // Vehicle.archetype/Pedestrian.archetype have been authorable for a
    // while (their own PropertyMetadata dropdowns below) but previously
    // discarded entirely -- editor_add now actually resolves the handling/
    // wander profile it's told, not always the same one regardless.
    const vehicleArchetype = get("Vehicle")?.archetype ?? 0;
    const pedestrianArchetype = get("Pedestrian")?.archetype ?? 0;
    const health = get("Health");
    // hp_max <= 0 is the bridge's own "no Health" sentinel (see
    // editor_add's doc comment) — a real Health always has a positive max.
    const hpCurrent = health?.current ?? 0;
    const hpMax = health?.maximum ?? 0;
    if (
      !runtime._editor_add(
        p.x,
        p.y,
        p.z,
        v.x,
        v.y,
        v.z,
        s.x,
        s.y,
        s.z,
        // Settings-only entities ride along like hierarchy children: no body.
        isChild || (isNonPhysical(get) ? 1 : 0),
        isPlayer,
        isCollider,
        hpCurrent,
        hpMax,
        isVehicle,
        isAi,
        isPedestrian,
        colliderShape,
        colliderRadius,
        vehicleArchetype,
        pedestrianArchetype,
      )
    ) {
      runtime._editor_commit();
      throw new Error("Runtime rejects coordinates/velocity outside ±1,000,000");
    }
    // Mass/dynamic and trigger/layer/mask/bounciness: see editor_set_body
    // and editor_set_collider (bridge.cpp) for what each one means.
    const body = get("RigidBody");
    runtime._editor_set_body(index, body ? 1 : 0, body?.mass ?? 1, body?.dynamic === false ? 0 : 1);
    if (collider) runtime._editor_set_collider(index, collider.isTrigger ? 1 : 0, collider.layer, collider.mask, collider.bounciness);
    // CharacterController (0.60.0): see editor_set_controller (bridge.cpp).
    const controller = get("CharacterController");
    if (controller && !isChild)
      runtime._editor_set_controller(
        index,
        controller.mode === "FirstPerson" ? 0 : 1,
        controller.walkSpeed,
        controller.sprintSpeed,
        controller.crouchSpeed,
        controller.jumpHeight,
        controller.standHeight,
        controller.crouchHeight,
        controller.stepHeight,
        controller.acceleration,
        controller.airControl,
      );
    // Arcade Vehicle and Driver (0.70.0): see editor_set_car and
    // editor_set_driver (bridge.cpp). Steering is authored in degrees.
    const vehicle = get("Vehicle");
    if (vehicle?.model === "Arcade" && !isChild) {
      runtime._editor_set_car(
        index,
        get("Rotation")?.euler.y ?? 0,
        vehicle.topSpeed,
        vehicle.acceleration,
        vehicle.braking,
        vehicle.grip,
        vehicle.driftGrip,
        (vehicle.steering * Math.PI) / 180,
        vehicle.nitroBoost,
        vehicle.nitroSeconds,
        vehicle.gears,
      );
      const driver = get("Driver");
      if (driver) {
        runtime._editor_set_driver(
          index,
          { Off: 0, Race: 1, Pursuit: 2, Traffic: 3 }[driver.mode],
          driver.loop ? 1 : 0,
          driver.skill,
          driver.aggression,
          driver.speedScale,
        );
        if (driver.route) runtime.ccall("editor_set_driver_text", null, ["number", "number", "string"], [index, 0, driver.route]);
        if (driver.target) runtime.ccall("editor_set_driver_text", null, ["number", "number", "string"], [index, 1, driver.target]);
      }
    }
    // Spaceship (0.71.0): see editor_set_spaceship (bridge.cpp); the first
    // one is flown by the scene's SpaceSystem.
    const ship = get("Spaceship");
    if (ship && !isChild && index >= 0 && index === shipIndex)
      runtime._editor_set_spaceship(
        index,
        get("Rotation")?.euler.y ?? 0,
        ship.mass,
        ship.thrust,
        ship.liftThrust,
        ship.rcs,
        (ship.maxRate * Math.PI) / 180,
        ship.fuel,
        ship.burn,
        ship.hull,
        ship.gearClearance,
        ship.startPiloting ? 1 : 0,
        ship.startOrbit,
      );
    // Routine and Wildlife (0.73.0): see editor_set_routine/editor_set_wildlife.
    const routine = get("Routine");
    if (routine && !isChild && index >= 0) runtime.ccall("editor_set_routine", null, ["number", "string", "number"], [index, routine.stops, routine.speed]);
    const wildlife = get("Wildlife");
    if (wildlife && !isChild && index >= 0) runtime._editor_set_wildlife(index, wildlife.wary, wildlife.flee, wildlife.speed, wildlife.leash);
    // Weapons (0.61.0): see editor_set_weapons (bridge.cpp).
    const weapons = get("Weapons");
    if (weapons && !isChild) runtime.ccall("editor_set_weapons", null, ["number", "string"], [index, weapons.loadout]);
    // Melee (0.78.0): see editor_set_melee (bridge_melee.cpp).
    const melee = get("Melee");
    if (melee && !isChild) {
      runtime.ccall(
        "editor_set_melee",
        null,
        ["number", "number", "string", "number", "number", "number", "number", "number", "number", "number"],
        [index, { "Martial arts": 0, Sword: 1, Custom: 2 }[melee.style], melee.moves, melee.team, melee.ai ? 1 : 0, melee.aggression, melee.skill, melee.reaction, melee.energy, melee.guard],
      );
      runtime._editor_set_melee_yaw(index, get("Rotation")?.euler.y ?? 0);
      runtime._editor_set_melee_extra(index, melee.poise, melee.breakTime, melee.manaMax, melee.manaRegen, melee.range, melee.shield ? 1 : 0);
    }
    // A Terrain entity's own body must never fall or move.
    if (get("Terrain")) runtime._editor_set_body(index, 1, 1, 0);
    // AICombat (0.62.0): see editor_set_soldier (bridge.cpp).
    const combat = get("AICombat");
    if (combat && !isChild) {
      runtime._editor_set_soldier(
        index,
        combat.team,
        { Patrol: 0, Guard: 1, Hunt: 2 }[combat.behavior],
        combat.sightRange,
        combat.fov,
        combat.hearingRange,
        combat.reactionTime,
        combat.accuracy,
        combat.preferredRange,
        combat.moveSpeed,
        combat.burst,
        combat.burstPause,
        combat.useCover ? 1 : 0,
        combat.fleeHealth,
        combat.meleeDamage,
      );
      if (combat.patrol) runtime.ccall("editor_set_soldier_patrol", null, ["number", "string"], [index, combat.patrol]);
    }
    // A rotated Box collider collides as an oriented box (0.59.0).
    const rotation = get("Rotation")?.euler;
    if (collider && rotation && (rotation.x || rotation.y || rotation.z)) runtime._editor_set_rotation(index, rotation.x, rotation.y, rotation.z);
    if (name !== undefined) runtime.ccall("editor_set_name", null, ["number", "string"], [index, name]);
    // editor_add's own all-double ABI has no way to carry a Lua source
    // string, so a scripted entity's source is set through this companion
    // call instead (see editor_set_script_source's own doc comment,
    // bridge.cpp) — same index editor_add just placed this entity at.
    const script = get("Script");
    if (script) {
      runtime.ccall("editor_set_script_source", null, ["number", "string"], [index, script.source]);
      runtime.ccall("editor_set_script_props", null, ["number", "string"], [index, encodeProps(reconcileProps(script.source, script.props))]);
    }
  }
  // Script-set UI text (ui.set_text), keyed by the UI entity's Name.
  // Play-session state only: cleared whenever the runtime is rebuilt.
  // Each object's simulated position (and soldier yaw) at the last two
  // fixed ticks, for drawing in between (see frame()). Reset when Play starts;
  // declared before the player-mode bootstrap, which starts Play.
  interface TickState {
    previous: THREE.Vector3;
    current: THREE.Vector3;
    previousYaw: number;
    currentYaw: number;
  }
  const tickStates: TickState[] = [];
  // The last tick's bulk snapshot (editor_snapshot): six doubles per index
  // after a count; undefined until play's first tick.
  let tickSnapshot: Float64Array | undefined;
  const tickSnapshotAlive = (i: number) => (tickSnapshot && i < tickSnapshot[0]! ? tickSnapshot[1 + i * 6] === 1 : runtime._editor_alive(i) === 1);
  const tickSnapshotFlags = (i: number) => (tickSnapshot && i < tickSnapshot[0]! ? tickSnapshot[1 + i * 6 + 5]! : -1);
  let tickAlpha = 1;
  // Arcade car sounds and HUD state (0.70.0; see updateCars), declared
  // before the player-mode bootstrap, which rebuilds and starts Play.
  let engineVoice: EngineVoice | undefined;
  let tireVoice: TireVoice | undefined;
  const sirens = new Map<number, { voice: SirenVoice; panner?: PannerNode }>();
  let playerCarSpeed = 0;
  // Roads for the minimap: road-category ModelInstances, gathered by rebuild().
  let minimapRoads: MinimapRoad[] = [];
  // Play-session UI state from scripts and interaction, keyed by the UI
  // entity's Name: values (Bar/Slider/Toggle) and visibility. Cleared
  // whenever the runtime is rebuilt, like uiTextOverrides. Declared before
  // the player-mode bootstrap starts Play, whose first scripts set them.
  const uiValues = new Map<string, number>();
  const uiVisibility = new Map<string, boolean>();
  let draggingSlider: UIButtonHit | undefined;
  const uiTextOverrides = new Map<string, string>();
  // ui.set_color: a UI element's text colour, by name (cleared like the text).
  const uiColorOverrides = new Map<string, THREE.Color>();
  // Script waypoints (ui.marker), by name (0.66.0).
  const uiMarkers = new Map<string, { position: THREE.Vector3; label: string }>();
  // Runtime-spawned prefab instances (world.spawn) get render objects at the
  // same index the bridge appended them at.
  function adoptSpawnedEntities() {
    const count = runtime._editor_entity_count();
    while (objects.length < count) {
      const index = objects.length;
      const prefab = runtime.ccall("editor_spawned_prefab", "string", ["number"], [index]);
      const components = (doc.scene.getPrefab(prefab)?.components ?? {}) as Partial<SceneComponents>;
      const position = {
        x: runtime._editor_value(index, EntityField.x),
        y: runtime._editor_value(index, EntityField.y),
        z: runtime._editor_value(index, EntityField.z),
      };
      createEntityObject((type) => (type === "Transform" ? ({ position } as SceneComponents[typeof type]) : components[type]));
      // Spawned scannables (0.73.0: wildlife a script releases) can be scanned too.
      if (components.Scannable) spawnedScans.set(index, components.Scannable);
    }
  }
  const spawnedScans = new Map<number, ScannableComponent>();
  // One Animator step for entity i: built-in parameters, events to the
  // entity's script, and a crossfade when the state changes.
  function runAnimator(i: number, state: AnimState, animator: AnimatorRuntime, speed: number, verticalSpeed: number, dt: number) {
    animator.set("speed", speed);
    animator.set("vy", verticalSpeed);
    animator.set("grounded", Math.abs(verticalSpeed) < 0.2);
    const clip = state.actions.get(animator.current.clip)?.getClip();
    const result = animator.step(dt, clip?.duration);
    for (const name of result.events) runtime.ccall("editor_script_notify", null, ["number", "string", "string"], [i, "on_anim_event", name]);
    if (!result.entered) return;
    const next = state.actions.get(result.entered.state.clip);
    if (next) {
      const previous = state.current ? state.actions.get(state.current) : undefined;
      next.setLoop(result.entered.state.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !result.entered.state.loop;
      next.setEffectiveTimeScale(result.entered.state.speed);
      next.reset().fadeIn(result.entered.fade).play();
      if (previous && previous !== next) previous.fadeOut(result.entered.fade);
      state.current = result.entered.state.clip;
    }
    runtime.ccall("editor_script_notify", null, ["number", "string", "string"], [i, "on_anim_state", result.entered.state.name]);
  }
  // -- Mouse, touch and gamepad (0.55.0) ---------------------------------
  // Pointer events cover mouse, pen and touch alike (a tap is a left click).
  // Positions are viewport pixels; queued and applied once per frame with
  // the keys, so every tick of a frame sees the same edges.
  const pointerQueue: Array<() => void> = [];
  function viewportPoint(event: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  // Right-drag look shouldn't open the browser menu during Play.
  renderer.domElement.addEventListener("contextmenu", (event) => {
    if (doc.mode !== "edit") event.preventDefault();
  });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (doc.mode !== "play") return;
    // Flying with the mouse captured: it moves the virtual stick
    // (0.75.0). Otherwise dragging looks around the ship.
    if (spaceView?.stick.active && document.pointerLockElement === renderer.domElement) {
      const gain = 0.0035 * playerSettings.sensitivity;
      mouseStick.x += event.movementX * gain;
      mouseStick.y += event.movementY * gain * (playerSettings.invertY ? -1 : 1);
      const length = Math.hypot(mouseStick.x, mouseStick.y);
      if (length > 1) {
        mouseStick.x /= length;
        mouseStick.y /= length;
      }
      mouseStick.idle = 0;
    } else if (spaceView?.flight.piloting && event.buttons & 3)
      spaceView.look(event.movementX * playerSettings.sensitivity, event.movementY * playerSettings.sensitivity * (playerSettings.invertY ? -1 : 1));
    // Right-drag looks around in first person without capturing the mouse.
    const controller = playerController();
    if (controller?.mode === "FirstPerson" && event.buttons & 2 && document.pointerLockElement !== renderer.domElement)
      applyMouseLook(
        fps.look,
        event.movementX,
        event.movementY,
        controller.lookSensitivity * playerSettings.sensitivity,
        controller.invertY !== playerSettings.invertY,
      );
    const { x, y } = viewportPoint(event);
    pointerQueue.push(() => runtime._editor_input_mouse_move(x, y, event.movementX, event.movementY));
  });
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (doc.mode !== "play" || event.button > 2) return;
    // A left click while flying captures the mouse for steering.
    if (event.button === 0 && spaceView?.stick.available && document.pointerLockElement !== renderer.domElement)
      void renderer.domElement.requestPointerLock?.();
    const { x, y } = viewportPoint(event);
    pointerQueue.push(() => runtime._editor_input_mouse_button(event.button, 1, x, y));
  });
  window.addEventListener("pointerup", (event) => {
    if (doc.mode === "edit" || event.button > 2) return;
    const { x, y } = viewportPoint(event);
    pointerQueue.push(() => runtime._editor_input_mouse_button(event.button, 0, x, y));
  });
  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (doc.mode !== "play") return;
      pointerQueue.push(() => runtime._editor_input_wheel(-event.deltaX / 100, -event.deltaY / 100));
    },
    { passive: true },
  );
  // While the pointer is locked (a script's input.lock_mouse(true)) there is
  // no pointermove target position, only movement -- document-level events
  // still carry it.
  document.addEventListener("mousemove", (event) => {
    if (doc.mode !== "play" || document.pointerLockElement !== renderer.domElement) return;
    const controller = playerController();
    if (controller?.mode === "FirstPerson")
      applyMouseLook(
        fps.look,
        event.movementX,
        event.movementY,
        controller.lookSensitivity * playerSettings.sensitivity,
        controller.invertY !== playerSettings.invertY,
      );
    pointerQueue.push(() => runtime._editor_input_mouse_move(0, 0, event.movementX, event.movementY));
  });
  function flushPointerInput() {
    for (const apply of pointerQueue) apply();
    pointerQueue.length = 0;
  }
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
  let padSnapshot: { buttons: boolean[]; axes: number[] } | undefined;
  function pollGamepad() {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected) ?? undefined;
    if (!pad) {
      if (padSnapshot) runtime._editor_input_gamepad_connected(0);
      padSnapshot = undefined;
      return;
    }
    if (!padSnapshot) {
      runtime._editor_input_gamepad_connected(1);
      padSnapshot = { buttons: [], axes: [] };
    }
    pad.buttons.forEach((button, index) => {
      const mapped = gamepadButtonMap[index];
      if (mapped === undefined || padSnapshot!.buttons[index] === button.pressed) return;
      padSnapshot!.buttons[index] = button.pressed;
      runtime._editor_input_gamepad_button(mapped, button.pressed ? 1 : 0);
    });
    // Sticks, then the analog triggers (standard buttons 6/7) as axes 4/5.
    const axes = [...pad.axes.slice(0, 4), pad.buttons[6]?.value ?? 0, pad.buttons[7]?.value ?? 0];
    axes.forEach((value, axis) => {
      if (padSnapshot!.axes[axis] === value) return;
      padSnapshot!.axes[axis] = value;
      runtime._editor_input_gamepad_axis(axis, value);
    });
  }
  function runScriptCommands() {
    const count = runtime._editor_take_commands();
    for (let i = 0; i < count; i++) {
      const kind = runtime.ccall("editor_command_text", "string", ["number", "number"], [i, 0]);
      const a = runtime.ccall("editor_command_text", "string", ["number", "number"], [i, 1]);
      const b = runtime.ccall("editor_command_text", "string", ["number", "number"], [i, 2]);
      if (kind === "log") log(`[script] ${a}`);
      else if (kind === "sound") playOneShot(a);
      else if (kind === "sound_at") {
        const [x = 0, y = 0, z = 0, volume = 1] = b.split(",").map(Number);
        playOneShot(a, new THREE.Vector3(x, y, z), Number.isFinite(volume) ? volume : 1);
      } else if (kind === "sound_volume") {
        const bus = a.toLowerCase();
        if (["master", "sfx", "music", "ambient", "ui"].includes(bus)) audioMixer().setBusVolume(bus as Bus | "master", Number(b) || 0);
      } else if (kind === "ui_text") {
        uiTextOverrides.set(a, b);
        // Banners and objectives are read out to screen readers.
        if (a === "Banner" || a === "Objective") announcer.say(b);
      } else if (kind === "host" && a === "outfit")
        setOutfit(runtime._editor_command_entity(i), parseOutfit(b));
      else if (kind === "host") handleHost(a, b);
      else if (kind === "particles_burst" || kind === "particles_emitting") {
        const state = particleStates[runtime._editor_command_entity(i)];
        if (state && kind === "particles_burst") burst(state.emitter, Math.max(0, Math.min(1000, Number(a) || 0)));
        else if (state) state.emitter.emitting = a === "1";
      } else if (kind === "ui_value") uiValues.set(a, Math.min(1, Math.max(0, Number(b) || 0)));
      else if (kind === "ui_visible") uiVisibility.set(a, b === "1");
      else if (kind === "ui_marker") {
        const [x = 0, y = 0, z = 0] = b.split(",", 3).map(Number);
        const label = b.split(",").slice(3).join(",");
        uiMarkers.set(a, { position: new THREE.Vector3(x, y, z), label });
      } else if (kind === "ui_marker_clear") uiMarkers.delete(a);
      else if (kind === "game_pause") runUIAction("pause");
      else if (kind === "game_resume") runUIAction("resume");
      else if (kind === "mouse_lock") {
        if (a === "1") void renderer.domElement.requestPointerLock?.();
        else if (document.pointerLockElement) releasePointer();
      } else if (kind === "camera_shake") {
        shake.intensity = playerSettings.reducedMotion ? 0 : Math.max(0, Number(a) || 0);
        shake.duration = Math.max(0.01, Number(b) || 0.01);
        shake.remaining = shake.duration;
      } else if (kind === "anim_set" || kind === "anim_trigger") {
        const animator = animators[runtime._editor_command_entity(i)]?.runtime;
        if (kind === "anim_trigger") animator?.trigger(a);
        else {
          const value = parseParamValue(b);
          if (value !== undefined) animator?.set(a, value);
        }
      }
    }
  }
  function syncRuntime() {
    uiTextOverrides.clear();
    uiColorOverrides.clear();
    uiMarkers.clear();
    districtMap.reset();
    uiValues.clear();
    uiVisibility.clear();
    draggingSlider = undefined;
    padSnapshot = undefined;
    pointerQueue.length = 0;
    runtime._editor_begin();
    applySiteView(); // shows what the editor's site view hid
    playerIndex = -1;
    shipIndex = -1;
    stageSpaceSystem();
    // Prefab templates first, so a script's world.spawn("Name") can
    // instantiate any prefab (bridge.cpp's Runtime::templates).
    for (const [name, definition] of doc.scene.prefabEntries()) {
      runtime.ccall("editor_template_begin", null, ["string"], [name]);
      const components = definition.components as Partial<SceneComponents>;
      addToRuntime((type) => components[type], 0, -1, name);
    }
    // Sites (0.73.0): a Site's direct children are simulated like top-level
    // entities, at their site-local positions (the Site itself sits at the
    // origin while playing).
    const alive = doc.scene.eachAlive();
    const sites = spaceComponent() ? alive.filter((e) => doc.scene.effectiveHas(e, "Site")) : [];
    siteIndices = sites.map((e) => alive.indexOf(e));
    const siteOf = (entity: (typeof alive)[number]) => {
      const parent = doc.scene.resolve(entity, "Parent")?.entity;
      return parent ? sites.findIndex((s) => s.index === parent.index && s.generation === parent.generation) : -1;
    };
    memberSite = alive.map((e) => siteOf(e));
    alive.forEach((entity, index) => {
      const isChild = doc.scene.effectiveHas(entity, "Parent") && memberSite[index]! < 0 ? 1 : 0;
      // First Player-tagged entity wins if more than one is authored — the
      // bridge itself would happily drive every one of them from the same
      // input, but only one can sensibly own the camera and status readout.
      if (doc.scene.effectiveHas(entity, "Player") && playerIndex < 0) playerIndex = index;
      if (doc.scene.effectiveHas(entity, "Spaceship") && !isChild && shipIndex < 0 && spaceComponent()) shipIndex = index;
      const isSite = doc.scene.effectiveHas(entity, "Site");
      addToRuntime(
        (type) => (isSite && type === "Transform" ? ({ position: { x: 0, y: 0, z: 0 } } as SceneComponents[typeof type]) : doc.scene.resolve(entity, type)),
        isChild,
        index,
        doc.scene.resolve(entity, "Name")?.value,
      );
    });
    if (sites.length) {
      const { bodies } = parseSpaceBodies(spaceComponent()!.bodies);
      sites.forEach((entity, n) => {
        const site = doc.scene.resolve(entity, "Site")!;
        const body = bodies.findIndex((b) => b.name === site.body);
        if (body < 0) log(`Site "${site.name}": no body "${site.body}"`);
        runtime.ccall(
          "editor_space_site",
          null,
          ["number", "string", "number", "number", "number", "number"],
          [siteIndices[n]!, site.name, Math.max(body, 0), site.latitude, site.longitude, site.radius],
        );
      });
      memberSite.forEach((site, index) => {
        if (site >= 0) runtime._editor_space_member(index, site);
      });
    }
    // The first Terrain is the simulated one (editor_set_terrain), plus its
    // colliding scatter as static obstacles.
    const terrainEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "Terrain"));
    const terrain = terrainEntity && doc.scene.resolve(terrainEntity, "Terrain");
    if (terrainEntity && terrain) {
      const center = doc.scene.resolve(terrainEntity, "Transform")?.position ?? { x: 0, y: 0, z: 0 };
      const params = terrainParams(terrain);
      const heights = generateHeights(params);
      runtime.ccall(
        "editor_set_terrain",
        null,
        ["number", "number", "number", "number", "number", "string"],
        [center.x, center.y, center.z, params.size, params.resolution, encodeHeights(heights)],
      );
      const scatter = parseScatter(terrain.scatter);
      for (const instance of scatterInstances(params, heights, scatter.rules, scatter.exclusions)) {
        if (!instance.collide) continue;
        const box = scatterObstacle(instance, catalogCache.get(instance.model)?.nativeSize);
        runtime._editor_add_obstacle(center.x + box.x, center.y + box.y, center.z + box.z, box.sx, box.sy, box.sz);
      }
    }
    // Solid ModelInstances (0.70.0) as static obstacles, footprint and all.
    for (const entity of doc.scene.eachAlive()) {
      const mi = doc.scene.resolve(entity, "ModelInstances");
      if (!mi) continue;
      const at = doc.scene.resolve(entity, "Transform")?.position ?? { x: 0, y: 0, z: 0 };
      for (const instance of parseModelInstances(mi.instances).instances) {
        const size = instance.solid ? catalogCache.get(instance.model)?.nativeSize : undefined;
        if (!size) continue;
        const box = instanceBox(instance, size);
        runtime._editor_add_obstacle(at.x + box.x, at.y + box.y, at.z + box.z, box.sx, box.sy, box.sz);
      }
    }
    // Custom action bindings: the first InputActions component in the scene.
    const bindingsEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "InputActions"));
    const bindings = bindingsEntity && doc.scene.resolve(bindingsEntity, "InputActions");
    if (bindings) runtime.ccall("editor_set_input_bindings", null, ["string"], [bindings.bindings]);
    if (!runtime._editor_commit()) throw new Error("Runtime scene commit failed");
    const bindingsError = runtime.ccall("editor_bindings_error", "string", [], []);
    if (bindingsError) log(`Input bindings: ${bindingsError} (using the defaults)`);
    const weaponsError = runtime.ccall("editor_weapons_error", "string", [], []);
    if (weaponsError) log(`Weapons: ${weaponsError} (using the default loadout)`);
    seedSavedProgress();
    ticks = 0;
    accumulator = 0;
    keyQueue.length = 0;
    heldKeys.clear();
  }
  // A fresh THREE.Light per rebuild(), same as every other object here --
  // nothing caches or reuses it, so there's nothing extra to dispose when the
  // entity's Light is removed or changed, only the recreate-on-every-rebuild()
  // this file already does for meshes.
  //
  // Spot/Directional lights each construct their own separate `target`
  // Object3D (three.js does this internally) that is NOT part of the scene
  // graph by default, so it never inherits this entity's transform -- the
  // beam would always aim at world origin regardless of authored rotation.
  // Parenting `target` under the light itself, offset along local -Z, fixes
  // that: the target's world position then follows the light's own world
  // rotation, so aiming a Spot/Directional light is just rotating its entity.
  // Material component: on the shared placeholder box (or with keepTextures
  // off) a fresh MeshStandardMaterial replaces the mesh's own; otherwise
  // each model material is cloned and tinted, keeping its texture maps.
  // Always a new material, never an edit of the shared/cached one.
  // Material.parts: only meshes whose material is named for one of them.
  function materialAppliesTo(mesh: THREE.Mesh, m: MaterialComponent) {
    const parts = (m.parts ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return true;
    const names = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((x) => x.name.toLowerCase());
    return names.some((name) => parts.some((part) => name.includes(part)));
  }
  function applyMaterial(mesh: THREE.Mesh, m: MaterialComponent) {
    const build = (base: THREE.Material): THREE.Material => {
      const standard = m.keepTextures && base !== material && base instanceof THREE.MeshStandardMaterial ? base.clone() : new THREE.MeshStandardMaterial();
      standard.color.copy(colorOf(m.color));
      standard.metalness = m.metalness;
      standard.roughness = m.roughness;
      standard.emissive.copy(colorOf(m.emissive));
      standard.emissiveIntensity = m.emissiveIntensity;
      standard.opacity = m.opacity;
      standard.transparent = m.opacity < 1;
      const textureUrl = resolveAssetUrl(m.texture, importedImages);
      if (textureUrl) standard.map = loadTexture(textureUrl);
      standard.depthWrite = m.opacity >= 1;
      return standard;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(build) : build(mesh.material);
    for (const created of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materialOverrides.push(created);
  }
  // Textures by URL, shared by every material that uses them.
  const textureCache = new Map<string, THREE.Texture>();
  const textureLoader = new THREE.TextureLoader();
  function loadTexture(url: string) {
    let texture = textureCache.get(url);
    if (!texture) {
      texture = textureLoader.load(url, () => {
        if (doc.mode === "edit" && !gizmo.dragging) rebuild();
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      textureCache.set(url, texture);
    }
    return texture;
  }
  // Materials applyMaterial() created, disposed on the next rebuild() --
  // rebuild runs after every edit, so they would otherwise leak GPU memory.
  const materialOverrides: THREE.Material[] = [];
  function createLight(light: {
    type: "Point" | "Spot" | "Directional";
    color: Vec3;
    intensity: number;
    range: number;
    angle: number;
    castShadows: boolean;
  }): THREE.Light {
    const color = new THREE.Color(light.color.x, light.color.y, light.color.z);
    const withShadows = <L extends THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight>(l: L): L => {
      l.castShadow = light.castShadows;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.0005;
      return l;
    };
    switch (light.type) {
      case "Point":
        return withShadows(new THREE.PointLight(color, light.intensity, light.range));
      case "Spot": {
        const l = new THREE.SpotLight(color, light.intensity, light.range, light.angle);
        l.target.position.set(0, 0, -1);
        l.add(l.target);
        return withShadows(l);
      }
      case "Directional": {
        const l = new THREE.DirectionalLight(color, light.intensity);
        l.target.position.set(0, 0, -1);
        l.add(l.target);
        return withShadows(l);
      }
    }
  }
  // Builds one entity's render object (mesh or catalog model, Light,
  // Particles, animation state) and appends it to objects[]/animStates[]/
  // particleStates[]/deathStates[] at the next index. Used for every scene
  // entity by rebuild() and for runtime-spawned prefab instances by frame().
  // -- Terrain (0.63.0) ---------------------------------------------------
  function terrainParams(t: TerrainComponent): TerrainParams {
    return {
      size: t.size,
      resolution: t.resolution,
      height: t.height,
      seed: t.seed,
      frequency: t.frequency,
      octaves: t.octaves,
      sculpt: t.sculpt,
    };
  }
  function terrainLook(t: TerrainComponent): TerrainLook {
    return {
      grassColor: t.grassColor,
      rockColor: t.rockColor,
      sandColor: t.sandColor,
      snowColor: t.snowColor,
      sandHeight: t.sandHeight,
      snowHeight: t.snowHeight,
      rockSlope: t.rockSlope,
    };
  }
  // Live terrain meshes by objects[] index, for sculpting.
  const terrainMeshes = new Map<number, { mesh: THREE.Mesh; params: TerrainParams; look: TerrainLook; offsets: Int16Array }>();
  function buildInstancesObject(text: string): THREE.Object3D {
    const { instances, errors } = parseModelInstances(text);
    if (errors.length) log(`ModelInstances: ${errors.slice(0, 3).join("; ")}`);
    const models = new Map<number, { scene: THREE.Object3D }>();
    for (const id of new Set(instances.map((i) => i.model))) {
      const cached = catalogCache.get(id);
      if (cached) models.set(id, cached);
      else if (catalogEntry(id))
        loadOnce(
          pendingCatalogRebuilds,
          id,
          () => loadCatalogModel(id),
          () => {
            if (doc.mode === "edit" && !gizmo.dragging) rebuild();
          },
          (error) => log(`Catalog model ${id} failed to load: ${String(error)}`),
        );
    }
    const group = buildScatter(instances, models);
    group.name = "model-instances";
    return group;
  }
  function buildTerrainObject(t: TerrainComponent, index: number): THREE.Object3D {
    const params = terrainParams(t);
    const look = terrainLook(t);
    const offsets = decodeSculpt(t.sculpt, params.resolution * params.resolution);
    const heights = generateHeights(params, offsets);
    const group = new THREE.Group();
    const mesh = buildTerrainMesh(params, look, heights);
    group.add(mesh);
    const { rules, errors, exclusions } = parseScatter(t.scatter);
    if (errors.length) log(`Terrain scatter: ${errors.join("; ")}`);
    if (rules.length) {
      const models = new Map<number, { scene: THREE.Object3D }>();
      for (const rule of rules) {
        const cached = catalogCache.get(rule.model);
        if (cached) models.set(rule.model, cached);
        else if (catalogEntry(rule.model))
          loadOnce(
            pendingCatalogRebuilds,
            rule.model,
            () => loadCatalogModel(rule.model),
            () => {
              if (doc.mode === "edit" && !gizmo.dragging) rebuild();
            },
            (error) => log(`Catalog model ${rule.model} failed to load: ${String(error)}`),
          );
      }
      group.add(buildScatter(scatterInstances(params, heights, rules, exclusions), models));
    }
    terrainMeshes.set(index, { mesh, params, look, offsets });
    return group;
  }
  function createEntityObject(get: <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined) {
    const renderable = get("Renderable");
    const meshId = renderable?.mesh ?? 0;
    const catalog = meshId >= 1 ? catalogEntry(meshId) : undefined;
    const cached = meshId >= 1 ? catalogCache.get(meshId) : undefined;
    let object: THREE.Object3D;
    let animState: AnimState | undefined;
    if (cached) {
      if (catalog?.animated) {
        object = SkeletonUtils.clone(cached.scene);
        const mixer = new THREE.AnimationMixer(object);
        // An armed soldier (0.69.0): locomotion on the legs, a weapon-holding
        // clip on the upper body, so its own arms hold the gun it carries.
        const armed = get("AICombat") && get("Weapons") ? splitForWeapon(object, cached.clips) : undefined;
        const actions = new Map((armed?.lower ?? cached.clips).map((clip) => [clip.name, mixer.clipAction(clip)]));
        animState = { mixer, actions, prevPosition: new THREE.Vector3() };
        if (armed) {
          animState.upper = mixer.clipAction(armed.upper);
          animState.upper.play();
        }
        // An authored AnimationState.clip picks and pins a specific clip --
        // manually applied from the inspector's per-model dropdown, so it
        // previews immediately in Edit mode too, not just Play -- instead
        // of the automatic ground-speed-based pick below. "" (the default,
        // and whatever pickClipName can't find on this model) falls
        // through to that automatic behavior unchanged.
        const override = get("AnimationState");
        const overridden = override?.clip && actions.has(override.clip);
        // Play the resting clip immediately: every frame's mixer.update() keeps
        // it looping in both Edit and Play mode, so nothing here waits on the
        // Play-mode-only, tick-aligned speed measurement below to pick a clip.
        const resting = overridden ? override!.clip : pickClipName([...actions.keys()], 0);
        if (resting) {
          const action = actions.get(resting)!;
          if (overridden) {
            action.setLoop(override!.looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
            action.clampWhenFinished = !override!.looping;
            if (Number.isFinite(override!.time)) action.time = override!.time;
          }
          action.play();
          animState.current = resting;
        }
      } else {
        object = cached.scene.clone(true);
      }
    } else {
      if (meshId >= 1)
        loadOnce(
          pendingCatalogRebuilds,
          meshId,
          () => loadCatalogModel(meshId),
          () => {
            if (doc.mode === "edit" && !gizmo.dragging) rebuild();
          },
          (error) => log(`Catalog model ${meshId} failed to load: ${String(error)}`),
        );
      object = new THREE.Mesh(geometry, material);
    }
    // Terrain (0.63.0) replaces the placeholder with its own mesh and scatter;
    // ModelInstances (0.70.0) with its instanced models. Neither takes the
    // entity's Rotation or Scale.
    const terrainComponent = get("Terrain");
    const instancesComponent = get("ModelInstances");
    if (terrainComponent) {
      object = buildTerrainObject(terrainComponent, objects.length);
      animState = undefined;
    } else if (instancesComponent) {
      object = buildInstancesObject(instancesComponent.instances);
      animState = undefined;
    }
    const animatorSource = get("Animator");
    let animator: (typeof animators)[number];
    if (animatorSource) {
      const parsed = parseAnimatorGraph(animatorSource.graph);
      if (parsed.graph) {
        animator = { graph: parsed.graph, runtime: new AnimatorRuntime(parsed.graph) };
        // Edit-mode preview: the start state's clip, like any resting clip.
        const startClip = animState?.actions.get(parsed.graph.states.get(parsed.graph.start)!.clip);
        if (animState && startClip) {
          animState.mixer.stopAllAction();
          startClip.play();
          animState.current = parsed.graph.states.get(parsed.graph.start)!.clip;
        }
      } else animatorErrors.push(...parsed.errors);
    }
    animators.push(animator);
    // Scene-wide settings (a UI label, the Environment) have no body of
    // their own: their stand-in box shows only while editing (0.78.0).
    // Settings holders and invisible helpers (a light, a camera, a director
    // script): their stand-in box shows only while editing.
    // Instanced models (ModelInstances) stay out of the simulation but are
    // drawn: they have no Renderable of their own.
    const settingsOnly = isSettingsOnly(get) || (!renderable && !instancesComponent && isNonPhysical(get));
    object.visible = renderable?.visible ?? !(settingsOnly && doc.mode === "play");
    if (settingsOnly) object.userData.settingsOnly = true;
    // `anchor` -- not `object` -- carries this entity's Transform/Rotation/
    // Scale and is what's pushed into `objects` (gizmo attach, raycast
    // picking, parent-child reattachment below, and every runtime-driven
    // position/rotation write in frame()). It's always visible, so a Light
    // childed onto it (see below) keeps rendering even when the mesh's own
    // Renderable.visible is false -- three.js's render traversal skips an
    // invisible object's entire subtree, including any lights within it,
    // so the light must not live under `object` itself.
    const anchor = new THREE.Group();
    const p = get("Transform")?.position;
    if (p) anchor.position.set(p.x, p.y, p.z);
    if (animState) animState.prevPosition.copy(anchor.position);
    const r = get("Rotation")?.euler;
    if (r && !terrainComponent && !instancesComponent) anchor.rotation.set(r.x, r.y, r.z);
    const s = get("Scale")?.value;
    if (terrainComponent || instancesComponent) {
      // A terrain's size comes from the component, not Scale.
    } else if (s && cached) {
      // Normalize by the model's own native size so an authored Scale is
      // the mesh's literal world-space size, matching the physics Box's
      // dimensions (same s.x/y/z) instead of stacking on top of it.
      const n = cached.nativeSize;
      // Characters (an animated model driven by AI or a controller) keep
      // their proportions: one uniform scale from the box's height, since a
      // rig's bind pose (arms out) says nothing about its collision width.
      const character = catalog?.animated && (get("AICombat") || get("CharacterController") || get("Melee"));
      if (character && n.y > 1e-6) anchor.scale.setScalar(s.y / n.y);
      else anchor.scale.set(n.x > 1e-6 ? s.x / n.x : s.x, n.y > 1e-6 ? s.y / n.y : s.y, n.z > 1e-6 ? s.z / n.z : s.z);
    } else if (s) anchor.scale.set(s.x, s.y, s.z);
    // Center a catalog model on the box rather than standing its feet at
    // the box's center.
    if (cached && !terrainComponent) object.position.copy(cached.nativeCenter).negate();
    anchor.add(object);
    if (get("Vehicle")) carSizes.set(anchor, new THREE.Vector3(s?.x ?? 1, s?.y ?? 1, s?.z ?? 1));
    // A soldier with Weapons visibly holds its first weapon (0.62.0).
    const loadout = get("AICombat") ? get("Weapons")?.loadout : undefined;
    if (loadout !== undefined) {
      const model = /model=(\w+)/.exec(loadout.split("\n").find((line) => line.trim() && !line.trim().startsWith("#")) ?? "")?.[1] ?? "rifle";
      const held = buildViewmodel(model).group;
      // In the hands of a rig playing a weapon-holding clip (0.69.0): posed
      // once, then the gun rides the right hand bone.
      let inHand = false;
      if (animState?.upper) {
        animState.mixer.update(0);
        // Holding poses are bladed: turn the model so the gun, not the
        // hips, points where the soldier faces (+z).
        faceWeaponForward(object);
        anchor.updateMatrixWorld(true);
        inHand = attachToHand(object, held);
      }
      if (!inHand) {
        // Undo the anchor's scale so the gun keeps its real size, and point
        // it along the body's facing (+z) at chest height on the right.
        const size = get("Scale")?.value ?? { x: 1, y: 1, z: 1 };
        held.scale.set(held.scale.x / anchor.scale.x, held.scale.y / anchor.scale.y, held.scale.z / anchor.scale.z);
        held.position.set((size.x * 0.35) / anchor.scale.x, (size.y * 0.12) / anchor.scale.y, (size.z * 0.3) / anchor.scale.z);
        held.rotation.y = Math.PI;
        anchor.add(held);
      }
    }
    const light = get("Light");
    // A sibling of `object`, not a child of it -- see the comment on
    // `anchor` above for why. Not pushed into `objects` itself:
    // objects/animStates are 1:1 with refs (the parenting loop and
    // raycast-picking below both index by that), and a light has no
    // geometry of its own to pick separately -- the entity's usual
    // box/model placeholder still marks where it is and stays what gets
    // selected, same as any other entity before a real Renderable.mesh is
    // chosen. Being a child of `anchor` means it inherits this entity's
    // own position/rotation for free, no separate transform tracking.
    if (light) {
      const made = createLight(light);
      anchor.add(made);
      lightPool.register(made);
    }
    // Every mesh casts and receives shadows; a Material component overrides
    // the surface (see applyMaterial).
    const materialOverride = get("Material");
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (materialOverride && materialAppliesTo(child, materialOverride)) applyMaterial(child, materialOverride);
    });
    // A still model (no rig, nothing scripted on it) never moves inside its
    // anchor: its nodes' local matrices are composed once, not every frame
    // (0.75.0; a town is thousands of nodes).
    if (cached && !animState && !get("Script") && !get("Spaceship") && !loadout)
      object.traverse((node) => {
        node.updateMatrix();
        node.matrixAutoUpdate = false;
      });
    const particles = get("Particles");
    let particleState: ParticleState | undefined;
    if (particles) particleState = createParticles(particles, anchor);
    const trail = get("Trail");
    if (trail) trailStates.push(createTrail(trail, anchor));
    scene.add(anchor);
    objects.push(anchor);
    animStates.push(animState);
    // A rig with no clips of its own that isn't a fighter (a bystander in a
    // cutscene) stands in the library's idle instead of its bind (T) pose.
    if (!get("Melee") && animState && catalog?.animated && cached && cached.clips.length === 0) {
      const state = animState;
      loadCombatClips((path) => gltfLoader.loadAsync(path)).then(
        (clips) => {
          if (animStates[objects.indexOf(anchor)] !== state) return;
          for (const clip of clips) if (!state.actions.has(clip.name)) state.actions.set(clip.name, state.mixer.clipAction(clip));
          const pinned = get("AnimationState")?.clip;
          const name = pinned && state.actions.has(pinned) ? pinned : "idle";
          state.actions.get(name)?.play();
          state.current = name;
        },
        (error) => log(`Combat clips failed to load: ${String(error)}`),
      );
    }
    if (get("Melee") && animState) {
      attachFighter(objects.length - 1, object, animState);
      // Weapons in its hands (heldWeapons.ts), once their models load.
      const melee = get("Melee")!;
      const rig = cached!.scene;
      for (const [side, id] of [["r", melee.rightHand], ["l", melee.leftHand]] as const) {
        const entry = id > 0 ? catalogEntry(id) : undefined;
        if (!entry) continue;
        let grip = weaponGrip(entry.path);
        // A two-hander with something in the other hand (the Warlord's
        // claymore and shield) is wielded one-handed.
        if (grip.grip === "twohand" && (side === "r" ? melee.leftHand : melee.rightHand) > 0) grip = { ...grip, grip: "forward", offHand: undefined };
        const index = objects.length - 1;
        const place = (weapon: CachedModel) => {
          if (!holdWeapon(rig, object, side, weapon.scene, grip)) return;
          // A weapon fought with the sword clips takes their stance (its
          // guard pose, if it has one, goes over it); daggers and knives keep
          // the boxing guard.
          if (grip.clips === "sword") combat.arm(index, "blade");
        };
        const ready = catalogCache.get(id);
        if (ready) place(ready);
        else loadCatalogModel(id)?.then(place, (error) => log(`Catalog model ${id} failed to load: ${String(error)}`));
      }
    }
    particleStates.push(particleState);
    deathStates.push(undefined);
  }
  function rebuild() {
    talkerScan = -1;
    lightOverride = undefined;
    if (timeOfDay !== undefined) {
      timeOfDay = undefined;
      environmentKey = "";
    }
    pauseMenu = false;
    clearOffHands();
    outfits.clear();
    staticBatcher.clear();
    probe.detach();
    probeScanAt = 0;
    batchAt = doc.mode === "play" ? performance.now() + 2500 : Infinity;
    gizmo.detach();
    const environmentEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "Environment"));
    applyEnvironment((environmentEntity && doc.scene.resolve(environmentEntity, "Environment")) ?? defaultEnvironment());
    // The flat shadow catcher at y = 0 would cut through a terrain's valleys.
    if (doc.scene.eachAlive().some((e) => doc.scene.effectiveHas(e, "Terrain"))) shadowGround.visible = false;
    const postEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "PostProcessing"));
    applyPostProcessing((postEntity && doc.scene.resolve(postEntity, "PostProcessing")) ?? defaultPostSettings);
    // Road tiles placed by ModelInstances, for the driving minimap.
    minimapRoads = [];
    for (const entity of doc.scene.eachAlive()) {
      const mi = doc.scene.resolve(entity, "ModelInstances");
      if (!mi) continue;
      const at = doc.scene.resolve(entity, "Transform")?.position ?? { x: 0, y: 0, z: 0 };
      for (const instance of parseModelInstances(mi.instances).instances)
        if (catalogEntry(instance.model)?.category === "roads") minimapRoads.push({ x: at.x + instance.x, z: at.z + instance.z, size: 16 * instance.scale });
    }
    for (const object of objects) object.removeFromParent();
    objects.length = 0;
    lightPool.reset();
    terrainMeshes.clear();
    animStates.length = 0;
    combat.reset();
    ledger.clear();
    waitingFighters.length = 0;
    animators.length = 0;
    animatorErrors.length = 0;
    // Unlike a mesh (which reuses catalogCache's shared geometry/material --
    // nothing new allocated per rebuild(), so nothing to dispose), every
    // Particles emitter allocates its own fresh BufferGeometry/PointsMaterial
    // (see createParticles()) each time. `execute()` calls rebuild() after
    // every successful command -- routine property edits, undo/redo, renames
    // -- so without disposing here, an entity with Particles would leak a new
    // set of GPU buffers on essentially every editor interaction.
    for (const state of particleStates) {
      state?.points.removeFromParent();
      state?.points.geometry.dispose();
      state?.points.material.dispose();
    }
    for (const trail of trailStates) {
      trail.mesh.removeFromParent();
      trail.mesh.geometry.dispose();
      trail.mesh.material.dispose();
    }
    trailStates.length = 0;
    particleStates.length = 0;
    for (const state of deathStates) state?.materials.forEach(({ material }) => material.dispose());
    for (const created of materialOverrides) created.dispose();
    materialOverrides.length = 0;
    deathStates.length = 0;
    const refs = doc.scene.eachAlive();
    for (const entity of refs) createEntityObject((type) => doc.scene.resolve(entity, type));
    refs.forEach((entity, i) => {
      const parent = doc.scene.resolve(entity, "Parent")?.entity;
      if (parent && doc.scene.alive(parent)) {
        const pi = refs.findIndex((e) => e.index === parent.index);
        objects[pi]?.add(objects[i]!);
      }
    });
    updatePanels();
  }
  function populatePrefabSelect() {
    const select = el<HTMLSelectElement>("prefab-select");
    const previous = select.value;
    const names = doc.scene.prefabNames();
    // Options built with the Option constructor, not innerHTML string
    // interpolation -- a prefab name is arbitrary user text (it can contain
    // ", <, & ...) and innerHTML would mis-parse it instead of just
    // rendering it literally.
    select.replaceChildren(...names.map((name) => new Option(name, name)));
    if (names.includes(previous)) select.value = previous;
    const hasPrefabs = names.length > 0;
    select.hidden = !hasPrefabs;
    el<HTMLButtonElement>("prefab-place").disabled = !hasPrefabs || doc.mode !== "edit";
    el("prefab-hint").hidden = hasPrefabs;
  }
  // Site view (0.75.0): a scene's Sites keep their children at site-local
  // positions, which in the editor would pile on top of the home layout.
  // "Show" picks everything, home, or one site; selecting an entity that
  // lives elsewhere switches to it.
  let siteView = "all";
  let siteViewDefaulted = false;
  let siteViewSelection: EntityRef | undefined;
  let siteViewScene: unknown;
  function applySiteView() {
    const select = el("site-view") as HTMLSelectElement;
    // A newly opened scene gets its own default.
    if (siteViewScene !== doc.scene) {
      siteViewScene = doc.scene;
      siteViewDefaulted = false;
    }
    const refs = doc.scene.eachAlive();
    const sites = refs.flatMap((e, i) => (doc.scene.effectiveHas(e, "Site") ? [i] : []));
    select.hidden = sites.length === 0;
    if (!sites.length) {
      ({ view: siteView, defaulted: siteViewDefaulted } = nextSiteView({ view: siteView, defaulted: siteViewDefaulted }, false, undefined, []));
      return;
    }
    const siteOfEntity = (index: number): string => {
      let ref = refs[index];
      for (let guard = 0; ref && guard < 64; guard++) {
        const i = refs.findIndex((e) => e.index === ref!.index && e.generation === ref!.generation);
        if (sites.includes(i)) return String(i);
        const parent = doc.scene.resolve(ref, "Parent")?.entity;
        ref = parent && doc.scene.alive(parent) ? parent : undefined;
      }
      return "home";
    };
    // Only a new selection moves the view (a manual pick stays put).
    let selectedSite: string | undefined;
    const selection = doc.selection;
    if (selection && (selection.index !== siteViewSelection?.index || selection.generation !== siteViewSelection?.generation)) {
      const i = refs.findIndex((e) => e.index === selection.index && e.generation === selection.generation);
      if (i >= 0) selectedSite = siteOfEntity(i);
    }
    siteViewSelection = selection ?? undefined;
    const options = [
      ["all", "Show: everything"],
      ["home", "Show: home"],
      ...sites.map((i) => [String(i), `Show: ${doc.scene.resolve(refs[i]!, "Site")?.name || "site"}`]),
    ];
    if (select.options.length !== options.length || [...select.options].some((o, k) => o.value !== options[k]![0] || o.text !== options[k]![1])) {
      select.replaceChildren(...options.map(([value, text]) => new Option(text, value)));
    }
    ({ view: siteView, defaulted: siteViewDefaulted } = nextSiteView(
      { view: siteView, defaulted: siteViewDefaulted },
      true,
      selectedSite,
      options.map(([value]) => value!),
    ));
    select.value = siteView;
    refs.forEach((entity, i) => {
      const object = objects[i];
      if (!object || doc.scene.effectiveHas(entity, "Parent")) return;
      // Playing: the game decides what's where.
      if (doc.mode !== "edit") {
        if (object.userData.siteHidden) object.visible = true;
        object.userData.siteHidden = false;
        return;
      }
      const site = sites.includes(i) ? String(i) : "home";
      const shown = siteView === "all" || siteView === site;
      if (!shown) {
        if (object.visible) object.userData.siteHidden = true;
        object.visible = false;
      } else if (object.userData.siteHidden) {
        object.visible = true;
        object.userData.siteHidden = false;
      }
    });
  }
  function updatePanels() {
    if (doc.mode === "edit") scheduleContentCheck();
    applySiteView();
    updateSculptBar();
    gizmo.detach();
    populatePrefabSelect();
    for (const id of ["translate", "rotate", "scale", "space", "snap", "snap-size"]) (el(id) as HTMLButtonElement).disabled = doc.mode !== "edit";
    el("document").textContent = `${doc.project} / ${doc.name}${doc.dirty ? " • unsaved" : ""}`;
    el<HTMLButtonElement>("undo").disabled = !doc.canUndo || doc.mode !== "edit";
    el<HTMLButtonElement>("redo").disabled = !doc.canRedo || doc.mode !== "edit";
    const tree = el("tree");
    tree.replaceChildren();
    for (const entity of doc.scene.eachAlive()) {
      const name = doc.scene.resolve(entity, "Name")?.value ?? `Entity ${entity.index}`;
      if (!name.toLowerCase().includes(el<HTMLInputElement>("search").value.toLowerCase())) continue;
      const button = document.createElement("button");
      button.className = "entity";
      // Keep the exact "↳ "/"□ " text prefix (not just a decorative icon):
      // it is part of this button's accessible name, matched verbatim by
      // the browser test suite (getByRole("button", { name: "□ ..." })).
      const hasParent = doc.scene.effectiveHas(entity, "Parent");
      button.append(iconEl(hasParent ? "child" : "cube", "icon-tree"), textSpan((hasParent ? "↳ " : "□ ") + name, "entity-name"));
      if (doc.selection?.index === entity.index) button.classList.add("selected");
      button.onclick = () => {
        doc.selection = entity;
        updatePanels();
      };
      tree.append(button);
    }
    const inspector = el("inspector");
    inspector.replaceChildren();
    const entity = doc.selection;
    if (!entity || !doc.scene.alive(entity)) {
      inspector.textContent = "Select an entity.";
      selection.visible = false;
      return;
    }
    const object = objects[doc.scene.eachAlive().findIndex((e) => e.index === entity.index)];
    if (object) {
      if (doc.mode === "edit") gizmo.attach(object);
      selection.setFromObject(object);
      selection.visible = true;
    }
    renderInspector(inspector, entity, {
      doc,
      execute,
      animationClipOptions,
      catalogEntry,
      inspectorIssues,
    });
  }
  el("add").onclick = () =>
    execute({
      command: "spawn_entity",
      name: "Entity " + (doc.scene.entityCount + 1),
      transform: [0, 0.5, 0],
    });
  el("duplicate").onclick = () => {
    log(doc.duplicate());
    rebuild();
  };
  el("delete").onclick = () => execute({ command: "destroy_entity", entity: doc.selection });
  el("undo").onclick = () => {
    doc.undo();
    rebuild();
  };
  el("redo").onclick = () => {
    doc.redo();
    rebuild();
  };
  // New (0.77.0): pick a starting point -- empty, or a small playable
  // starter for a kind of game (sceneTemplates.ts).
  el("new").onclick = () => {
    if (doc.mode !== "edit") return;
    openTemplatePicker(document.body, (template) => {
      if (doc.dirty && !confirm("Discard unsaved scene?")) return;
      doc.load(templateScene(template));
      rebuild();
    });
  };
  el<HTMLInputElement>("search").oninput = updatePanels;
  el<HTMLInputElement>("project").onchange = () => {
    doc.project = el<HTMLInputElement>("project").value;
    updatePanels();
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
    updatePanels();
  };
  el("games").onclick = () =>
    openGamesLibrary(app, {
      currentScene: () => JSON.stringify(doc.save(), null, 2),
      projectName: () => doc.project,
      openScene: (text, name) => {
        if (doc.mode !== "edit") el("stop").click();
        if (doc.dirty && !confirm("Discard unsaved scene?")) return;
        try {
          doc.load(JSON.parse(text));
          doc.project = name;
          el<HTMLInputElement>("project").value = name;
          rebuild();
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
        doc.load(JSON.parse(await file.text()));
        rebuild();
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
    // 10 s (0.76.1). Nothing pending, nothing awaited: Play starts at once.
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
        // Content checks before Play (0.77.0): warn, never block.
        const issues = runContentCheck();
        if (issues.length) log(`Playing with ${issues.length} content problem${issues.length > 1 ? "s" : ""} (see Problems): ${formatIssue(issues[0]!)}`);
        prePlayTarget = controls.target.clone();
        syncRuntime();
        startSpaceView();
        scanner.reset();
        spawnedScans.clear();
        scannableIndices = doc.scene
          .eachAlive()
          .map((e, i) => (doc.scene.effectiveHas(e, "Scannable") ? i : -1))
          .filter((i) => i >= 0);
        rig.placed = false;
        shake.remaining = 0;
        for (const animator of animators) if (animator) animator.runtime = new AnimatorRuntime(animator.graph);
        for (const state of particleStates) if (state?.burstOnPlay) burst(state.emitter, state.burstOnPlay);
        if (animatorErrors.length) log(`Animator: ${animatorErrors.join("; ")}`);
        const playerObject = playerIndex >= 0 ? objects[playerIndex] : undefined;
        // First person starts looking the way the player entity faces.
        const playerRotation = playerIndex >= 0 ? doc.scene.resolve(doc.scene.eachAlive()[playerIndex]!, "Rotation") : undefined;
        fps.look.yaw = playerRotation?.euler.y ?? 0;
        fps.look.pitch = 0;
        fps.view.reset();
        deathRoll = 0;
        weaponFx.reset();
        carFx.reset();
        playerCarSpeed = 0;
        tickStates.length = 0;
        tickSnapshot = undefined;
        tickAlpha = 1;
        zoomBlend = 0;
        weaponFx.equip(playerWeaponModel());
        holdFirstPersonWeapons();
        if (playerIndex >= 0 && playerController()) {
          playerFeet(fps.previous);
          fps.current.copy(fps.previous);
        }
        playerBaseScale = playerObject ? playerObject.scale.clone() : null;
        playerPrevY = playerObject?.position.y ?? 0;
        // Set before startSounds(), not after: a clip already decoded from
        // an earlier Play session starts synchronously inside that call, and
        // its own "is this session still running" guard checks doc.mode --
        // checking it while still "edit" would silence every already-cached
        // clip on the second and later Plays.
        // Settings-only entities' stand-in boxes leave the stage.
        for (const anchor of objects) anchor.traverse((node) => node.userData.settingsOnly && (node.visible = false));
        doc.mode = "play";
        batchAt = performance.now() + 2500; // once models have loaded
        const mixEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "AudioSettings"));
        audioMixer().apply((mixEntity && doc.scene.resolve(mixEntity, "AudioSettings")) ?? defaultMixerSettings);
        soldierSteps.clear();
        startSounds();
      } else {
        if (doc.mode === "pause" && audioContext) void audioContext.resume();
        doc.mode = "play";
      }
      updatePanels();
    } catch (e) {
      log(String(e));
    }
  };
  el("pause").onclick = () => {
    if (doc.mode === "play") {
      releaseHeldKeys();
      doc.mode = "pause";
      // Suspends the whole audio clock -- every currently-playing sound's
      // output pauses in place, the same way ticks stop advancing, rather
      // than muting while still running out its buffer underneath.
      if (audioContext) void audioContext.suspend();
    }
    updatePanels();
  };
  el("stop").onclick = () => {
    doc.mode = "edit";
    if (document.pointerLockElement) releasePointer();
    accumulator = 0;
    releaseHeldKeys();
    stopSounds();
    if (audioContext?.state === "suspended") void audioContext.resume();
    if (prePlayTarget) {
      controls.target.copy(prePlayTarget);
      prePlayTarget = null;
    }
    // The runtime that owned them is discarded on Stop; drop the pool too,
    // rather than leaving stale blast meshes on screen in Edit mode.
    while (projectileMeshes.length) scene.remove(projectileMeshes.pop()!);
    weaponFx.reset();
    endSpaceView();
    rebuild();
  };
  // -- Terrain sculpting (0.63.0) -------------------------------------------
  // Looked up on use: updatePanels() can run before this section has.
  const sculptElement = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const sculptMode = () => sculptElement<HTMLSelectElement>("sculpt")?.value ?? "off";
  function selectedTerrainIndex(): number {
    if (doc.mode !== "edit" || !doc.selection || !doc.scene.effectiveHas(doc.selection, "Terrain")) return -1;
    const index = doc.scene.eachAlive().findIndex((e) => e.index === doc.selection!.index);
    return terrainMeshes.has(index) ? index : -1;
  }
  function sculpting(): boolean {
    return sculptMode() !== "off" && selectedTerrainIndex() >= 0;
  }
  // Left-drag sculpts instead of orbiting while a brush is active.
  function updateSculptBar() {
    const bar = sculptElement("sculpt-bar");
    if (!bar) return;
    bar.hidden = doc.mode !== "edit" || !doc.selection || !doc.scene.effectiveHas(doc.selection, "Terrain");
    const active = sculpting();
    controls.mouseButtons.LEFT = (active ? null : THREE.MOUSE.ROTATE) as THREE.MOUSE;
    gizmo.enabled = !active;
  }
  const sculptTool = el<HTMLSelectElement>("sculpt");
  const sculptRadius = el<HTMLInputElement>("sculpt-radius");
  const sculptStrength = el<HTMLInputElement>("sculpt-strength");
  sculptTool.onchange = updateSculptBar;
  const sculptRay = new THREE.Raycaster();
  function terrainPoint(event: PointerEvent, index: number): THREE.Vector3 | undefined {
    const rect = renderer.domElement.getBoundingClientRect();
    sculptRay.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = sculptRay.intersectObject(terrainMeshes.get(index)!.mesh, false)[0];
    return hit ? objects[index]!.worldToLocal(hit.point.clone()) : undefined;
  }
  let sculptStroke: { index: number; entity: EntityRef } | undefined;
  function sculptDab(event: PointerEvent) {
    if (!sculptStroke) return;
    const point = terrainPoint(event, sculptStroke.index);
    const live = terrainMeshes.get(sculptStroke.index);
    if (!point || !live) return;
    applyBrush(live.params, live.offsets, sculptTool.value as BrushMode, point.x, point.z, Number(sculptRadius.value), Number(sculptStrength.value) * 0.2);
    shapeTerrain(live.mesh.geometry, generateHeights(live.params, live.offsets), live.look, live.params.seed);
  }
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !sculpting()) return;
    const index = selectedTerrainIndex();
    sculptStroke = { index, entity: doc.selection! };
    sculptDab(event);
  });
  window.addEventListener("pointermove", (event) => {
    if (sculptStroke && event.buttons & 1) sculptDab(event);
  });
  window.addEventListener("pointerup", () => {
    if (!sculptStroke) return;
    const { index, entity } = sculptStroke;
    sculptStroke = undefined;
    const live = terrainMeshes.get(index);
    const current = doc.scene.resolve(entity, "Terrain");
    if (!live || !current) return;
    // One undoable edit per stroke.
    execute({ command: "set_component", entity, type: "Terrain", value: { ...current, sculpt: encodeSculpt(live.offsets) } });
  });
  // -- Imported assets (0.58.0; see userAssets.ts) ------------------------
  // Object URLs for imported images, by file name ("asset:<name>").
  const importedImages = new Map<string, string>();
  let storedAssets: StoredAsset[] = [];
  function registerAsset(asset: StoredAsset) {
    const url = URL.createObjectURL(asset.data);
    if (asset.kind === "image") importedImages.set(asset.name, url);
    else if (asset.kind === "model") {
      const existing = modelCatalog.find((m) => m.id === asset.id);
      if (existing) existing.path = url;
      else modelCatalog.push({ id: asset.id, category: "imported", name: displayName(asset.name), path: url });
      catalogPromises.delete(asset.id);
      catalogCache.delete(asset.id);
      const category = el<HTMLSelectElement>("catalog-category");
      if (![...category.options].some((o) => o.value === "imported")) category.add(new Option("Imported", "imported"));
    } else {
      const existing = soundCatalog.find((s) => s.id === asset.id);
      if (existing) existing.path = url;
      else soundCatalog.push({ id: asset.id, category: "imported", name: displayName(asset.name), path: url });
      soundBuffers.delete(asset.id);
      soundBufferPromises.delete(asset.id);
    }
  }
  async function importFiles(files: FileList | File[]) {
    const imported: string[] = [];
    for (const file of files) {
      const kind = assetKind(file.name);
      if (!kind) {
        log(`Import: ${file.name} is not a .glb model, image or audio file`);
        continue;
      }
      const asset: StoredAsset = { id: assignId(storedAssets, kind, file.name), kind, name: file.name, type: file.type, data: file };
      storedAssets = [...storedAssets.filter((a) => a.id !== asset.id), asset];
      try {
        await storeAsset(asset);
      } catch (error) {
        log(`Import: ${file.name} could not be saved in this browser (${String(error)}); it lasts until reload`);
      }
      registerAsset(asset);
      imported.push(kind === "image" ? `${file.name} (use asset:${file.name})` : `${file.name} (${kind} ${asset.id})`);
    }
    if (imported.length) {
      log(`Imported ${imported.join(", ")}`);
      populateCatalogModels();
      updatePanels();
    }
  }
  el<HTMLInputElement>("import-asset").onchange = (event) => {
    const input = event.target as HTMLInputElement;
    if (input.files) void importFiles([...input.files]).finally(() => (input.value = ""));
  };
  void loadStoredAssets()
    .then((assets) => {
      storedAssets = assets;
      assets.forEach(registerAsset);
      if (assets.length) {
        populateCatalogModels();
        rebuild();
      }
    })
    .catch((error) => log(`Imported assets unavailable: ${String(error)}`));
  // -- Stats overlay (0.58.0) --------------------------------------------
  const statsPanel = document.createElement("pre");
  statsPanel.id = "stats-panel";
  statsPanel.hidden = true;
  statsPanel.style.cssText =
    "position:absolute;top:8px;right:8px;margin:0;padding:8px 10px;background:rgba(8,12,18,0.82);" +
    "color:#cfe8ff;font:12px/1.45 ui-monospace,monospace;border-radius:6px;pointer-events:none;z-index:5";
  viewport.appendChild(statsPanel);
  const stats = { frames: 0, frameMs: 0, tickMs: 0, since: performance.now() };
  el("site-view").addEventListener("change", (event) => {
    siteView = (event.target as HTMLSelectElement).value;
    applySiteView();
  });
  el("stats").onclick = () => {
    statsPanel.hidden = !statsPanel.hidden;
    el("stats").setAttribute("aria-pressed", String(!statsPanel.hidden));
  };
  function updateStats(frameMs: number, tickMs: number) {
    stats.frames++;
    stats.frameMs += frameMs;
    stats.tickMs += tickMs;
    const now = performance.now();
    if (statsPanel.hidden || now - stats.since < 250) return;
    const fps = (stats.frames * 1000) / (now - stats.since);
    const info = renderer instanceof THREE.WebGLRenderer ? renderer.info : undefined;
    const systems = runtime
      .ccall("editor_profile_text", "string", [], [])
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const [name, ms] = entry.split("=");
        return `  ${name!.replace("editor.", "").padEnd(16)}${Number(ms).toFixed(3)} ms`;
      });
    statsPanel.textContent = [
      `FPS          ${fps.toFixed(0)}`,
      `Frame        ${(stats.frameMs / stats.frames).toFixed(2)} ms`,
      `C++ ticks    ${(stats.tickMs / stats.frames).toFixed(2)} ms/frame`,
      `Draw calls   ${info?.render.calls ?? "-"}`,
      `Batched      ${staticBatcher.size} objects in ${staticBatcher.drawn} meshes`,
      `Governor     tier ${governorTier() === governor.settings ? governor.tier : governor.floor} (${(governorTier().scale * 100).toFixed(0)}% res)`,
      `Limited by   ${limitReason((now - stats.since) / stats.frames, stats.frameMs / stats.frames, stats.tickMs / stats.frames)}`,
      `Triangles    ${info?.render.triangles ?? "-"}`,
      `Entities     ${doc.scene.entityCount} (+${Math.max(0, objects.length - doc.scene.eachAlive().length)} spawned)`,
      ...(systems.length ? ["Systems (last tick):", ...systems] : []),
    ].join("\n");
    stats.frames = 0;
    stats.frameMs = 0;
    stats.tickMs = 0;
    stats.since = now;
  }
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
    execute(el<HTMLInputElement>("json").value);
  };
  function populateCatalogModels() {
    const category = el<HTMLSelectElement>("catalog-category").value;
    el<HTMLSelectElement>("catalog-model").innerHTML = modelCatalog
      .filter((m) => m.category === category)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }
  el("catalog-category").onchange = populateCatalogModels;
  populateCatalogModels();
  el("catalog-add").onclick = async () => {
    const meshId = Number(el<HTMLSelectElement>("catalog-model").value);
    const entry = catalogEntry(meshId);
    if (!entry) return;
    try {
      if (!catalogCache.has(meshId)) await loadCatalogModel(meshId);
    } catch (error) {
      log("Catalog model failed to load: " + String(error));
      return;
    }
    const result = execute({
      command: "spawn_entity",
      name: entry.name,
      transform: [0, 0, 0],
    });
    if (result.ok)
      execute({
        command: "set_component",
        entity: result.entity,
        type: "Renderable",
        value: { mesh: entry.id, material: 0, visible: true },
      });
  };
  el("prefab-place").onclick = () => {
    const prefab = el<HTMLSelectElement>("prefab-select").value;
    if (prefab) execute({ command: "place_instance", prefab, transform: [0, 0.5, 0] });
  };
  // Runs a UI Button's authored action by clicking the real transport button
  // that already does it, rather than reimplementing (or going through
  // doc.execute(), which unconditionally rejects everything outside Edit
  // mode -- see UIComponent's own doc comment for why that ruled out a
  // free-form command here). "restart" is Stop (rebuild()s every entity back
  // to its authored Transform/state) immediately followed by Play (re-syncs
  // and starts a fresh session) -- there's no single existing button for
  // that combination, so it's the one action that chains two clicks.
  // A value change from interaction: stored for drawing and sent to every
  // script's on_ui(name, value).
  function setUIValue(name: string, value: number) {
    uiValues.set(name, value);
    uiEvent(name, String(value));
  }
  function uiEvent(name: string, value: string) {
    runtime.ccall("editor_ui_event", null, ["string", "string"], [name, value]);
  }
  window.addEventListener("pointermove", (event) => {
    if (!draggingSlider || doc.mode === "edit") return;
    const rect = renderer.domElement.getBoundingClientRect();
    const next = sliderValue(draggingSlider, event.clientX - rect.left);
    if (next !== uiValues.get(draggingSlider.name)) setUIValue(draggingSlider.name, next);
  });
  window.addEventListener("pointerup", () => (draggingSlider = undefined));
  function runUIAction(action: UIAction) {
    switch (action) {
      case "restart":
        el<HTMLButtonElement>("stop").click();
        el<HTMLButtonElement>("play").click();
        break;
      case "resume":
        el<HTMLButtonElement>("play").click();
        break;
      case "pause":
        el<HTMLButtonElement>("pause").click();
        break;
      case "quit":
        el<HTMLButtonElement>("stop").click();
        break;
    }
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || gizmo.dragging || gizmo.axis !== null) return;
    if (sculpting()) return; // the sculpt brush owns left clicks
    const rect = renderer.domElement.getBoundingClientRect();
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
    for (let i = uiButtonHits.length - 1; i >= 0; i--) {
      const hit = uiButtonHits[i]!;
      if (!contains(hit, clickX, clickY)) continue;
      if (hit.kind === "Toggle") setUIValue(hit.name, hit.value >= 0.5 ? 0 : 1);
      else if (hit.kind === "Slider") {
        draggingSlider = hit;
        setUIValue(hit.name, sliderValue(hit, clickX));
      } else if (hit.action === "script") uiEvent(hit.name, "click");
      else runUIAction(hit.action);
      return;
    }
    // First person: a click in the viewport captures the mouse for look.
    if (doc.mode === "play" && firstPerson()) {
      if (document.pointerLockElement !== renderer.domElement) void renderer.domElement.requestPointerLock?.();
      return;
    }
    // Picking entities is for editing: during Play (and in exported games)
    // a click in the world never selects anything.
    if (doc.mode !== "edit") return;
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, (-(e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(
      objects.filter((o) => o.visible),
      true,
    )[0];
    if (hit) {
      let object = hit.object;
      while (!objects.includes(object) && object.parent) object = object.parent;
      doc.selection = doc.scene.eachAlive()[objects.indexOf(object)];
      updatePanels();
    }
  });
  new ResizeObserver(() => {
    const w = viewport.clientWidth,
      h = viewport.clientHeight;
    renderer.setSize(w, h);
    composer?.setSize(w, h);
    resizeAntialias();
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
      doc.load(JSON.parse(exportedScene));
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
        // ModelInstances models (0.70.0).
        const mi = doc.scene.resolve(entity, "ModelInstances");
        if (mi) for (const instance of parseModelInstances(mi.instances).instances) meshIds.add(instance.model);
        // The first-person arms' fallback character (holdFirstPersonWeapons).
        if (doc.scene.effectiveHas(entity, "Player") && doc.scene.effectiveHas(entity, "Weapons")) meshIds.add(firstPersonBodyFallback);
      }
      await Promise.all([...meshIds].map((id) => loadCatalogModel(id)?.catch((error) => log(`Catalog model ${id} failed to load: ${String(error)}`))));
    } else {
      const saved = localStorage.getItem("game-engine-editor:scene");
      if (saved) doc.load(JSON.parse(saved));
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
  rebuild();
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
      if (audioContext?.state === "suspended") void audioContext.resume();
    };
    window.addEventListener("pointerdown", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
  }
  function sampleTickState(i: number): TickState {
    const state = (tickStates[i] ??= {
      previous: new THREE.Vector3(),
      current: new THREE.Vector3(),
      previousYaw: 0,
      currentYaw: 0,
    });
    state.current.set(runtime._editor_value(i, EntityField.x), runtime._editor_value(i, EntityField.y), runtime._editor_value(i, EntityField.z));
    // Soldiers face where they look; cars along their heading.
    state.currentYaw = runtime._editor_soldier_value(i, 0) >= 0 ? runtime._editor_soldier_value(i, 1) : runtime._editor_value(i, EntityField.headingYaw);
    if (!state.previous.lengthSq() && !state.previousYaw) {
      state.previous.copy(state.current);
      state.previousYaw = state.currentYaw;
    }
    return state;
  }
  // Every object's tick state from one bulk read (editor_snapshot).
  function sampleTickStates() {
    const base = runtime._editor_snapshot() / 8;
    const heap = (tickSnapshot = runtime.HEAPF64.slice(base, base + 1 + runtime.HEAPF64[base]! * 6));
    const count = Math.min(objects.length, heap[0]!);
    for (let i = 0; i < count; i++) {
      const row = 1 + i * 6;
      if (heap[row] !== 1) continue;
      const state = (tickStates[i] ??= {
        previous: new THREE.Vector3(),
        current: new THREE.Vector3(),
        previousYaw: 0,
        currentYaw: 0,
      });
      state.current.set(heap[row + 1]!, heap[row + 2]!, heap[row + 3]!);
      state.currentYaw = heap[row + 4]!;
      if (!state.previous.lengthSq() && !state.previousYaw) {
        state.previous.copy(state.current);
        state.previousYaw = state.currentYaw;
      }
    }
  }
  // -- Arcade cars (0.70.0): effects, sounds and the HUD's car ------------
  function stopCarSounds() {
    engineVoice?.stop();
    tireVoice?.stop();
    engineVoice = tireVoice = undefined;
    for (const { voice } of sirens.values()) voice.stop();
    sirens.clear();
  }
  function carView(i: number): CarView {
    const v = (field: number) => runtime._editor_vehicle_value(i, field);
    return {
      speed: v(0),
      forward: v(1),
      gear: v(2),
      rpm: v(3),
      nitro: v(4),
      drifting: v(5) === 1,
      boosting: v(6) === 1,
      slip: v(7),
      yawRate: v(12),
      brake: v(10),
      handbrake: v(9) === 1,
      throttle: v(13),
      pursuit: v(14) === 2,
    };
  }
  function updateCars(dt: number) {
    const live = new Set<number>();
    objects.forEach((anchor, i) => {
      if (!runtime._editor_alive(i) || !runtime._editor_vehicle_value(i, 11)) return;
      const car = carView(i);
      carFx.updateCar(anchor, carSizes.get(anchor) ?? new THREE.Vector3(2, 1.5, 4.6), car, dt);
      if (car.pursuit && audioContext) {
        live.add(i);
        let siren = sirens.get(i);
        if (!siren) {
          const source = audioMixer().source("sfx", anchor.position, { refDistance: 8, maxDistance: 400 });
          siren = { voice: new SirenVoice(getAudioContext(), source.input), panner: source.panner };
          sirens.set(i, siren);
        }
        siren.voice.update(dt);
        if (siren.panner) audioMixer().place(siren.panner, anchor.position);
      }
      if (i !== playerIndex) return;
      if (audioContext) {
        engineVoice ??= new EngineVoice(getAudioContext(), audioMixer().buses.sfx);
        tireVoice ??= new TireVoice(getAudioContext(), audioMixer().buses.sfx);
        engineVoice.update(car.rpm, car.gear, car.throttle, car.boosting);
        tireVoice.update(car.speed > 4 ? Math.min(1, Math.abs(car.slip) * 2.5 + (car.handbrake ? 0.4 : 0)) : 0);
      }
      // A sudden loss of speed is a crash.
      const lost = playerCarSpeed - car.speed;
      if (lost > 7) {
        shake.intensity = Math.min(0.5, lost * 0.025);
        shake.duration = shake.remaining = 0.35;
        playOneShot("sfx:impact", anchor.position, Math.min(1, lost / 20));
        playOneShot("sfx:explosion", anchor.position, Math.min(0.5, lost / 50));
      }
      playerCarSpeed = car.speed;
    });
    for (const [i, siren] of sirens)
      if (!live.has(i)) {
        siren.voice.stop();
        sirens.delete(i);
      }
    carFx.update(dt);
  }
  // Frame governor (0.75.0): while playing, holds 45-60 fps by stepping
  // through quality tiers (resolution, shadows, bloom, scatter, terrain
  // streaming, distant animation) -- see frameGovernor.ts. Edit mode always
  // draws at the best tier the player's preset allows.
  function governorTier() {
    return doc.mode === "play" ? governor.settings : governorTiers[governor.floor]!;
  }
  function applyGovernor() {
    const tier = governorTier();
    const profile = qualityProfile(playerSettings.quality);
    if (renderer instanceof THREE.WebGLRenderer) {
      const ratio = Math.min(devicePixelRatio, profile.pixelRatio) * tier.scale;
      if (Math.abs(renderer.getPixelRatio() - ratio) > 1e-3) {
        renderer.setPixelRatio(ratio);
        composer?.setPixelRatio(ratio);
        resizeAntialias();
      }
      renderer.shadowMap.enabled = profile.shadows && tier.shadows > 0;
    }
    if (bloomPass) bloomPass.enabled = tier.bloom;
    const mapSize = shadowQualities[postSettings.shadowQuality].mapSize / (tier.shadows === 1 ? 2 : 1);
    if (sun.shadow.mapSize.x !== mapSize) {
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    if (spaceView) {
      spaceView.chunkMs = tier.chunkMs;
      spaceView.skyLow = tier.skyLow;
    }
    runtime._editor_set_sim_stride(tier.simStride);
    applyScatterDensity(tier.scatter);
  }
  // Draws the first `fraction` of each scatter chunk's instances (their
  // order is random, so this thins evenly).
  function applyScatterDensity(fraction: number) {
    spaceScatter?.traverse((child) => {
      if (!(child instanceof THREE.InstancedMesh)) return;
      const all = (child.userData.instances as unknown[] | undefined)?.length ?? child.count;
      child.count = Math.max(0, Math.round(all * fraction));
    });
  }
  let governedMode = doc.mode;
  function governFrame(intervalMs: number) {
    if (doc.mode !== governedMode) {
      governedMode = doc.mode;
      if (doc.mode === "edit") governor.reset(presetFloor(playerSettings.quality));
      applyGovernor();
    }
    if (doc.mode === "play" && governor.sample(intervalMs)) applyGovernor();
  }
  // Which entities never move while playing: no script, rig, AI, body or
  // effect of their own (they can still be destroyed or moved by a script;
  // the batcher notices and lets them go).
  const movingComponents = [
    "Script",
    "AIState",
    "Pedestrian",
    "Routine",
    "Wildlife",
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
  function updateStaticBatches() {
    const now = performance.now();
    if (doc.mode !== "play") {
      if (staticBatcher.size) staticBatcher.clear();
      if (probe.count) probe.detach();
      return;
    }
    if (now > batchAt) {
      batchAt = Infinity;
      const entities = doc.scene.eachAlive();
      staticBatcher.build(
        objects,
        (i) => {
          const entity = entities[i];
          if (!entity || i === playerIndex || i === shipIndex || animStates[i] || particleStates[i]) return false;
          return !movingComponents.some((type) => doc.scene.effectiveHas(entity, type as never));
        },
        (i) => String(memberSite[i] ?? -1),
      );
      if (!scene.children.includes(staticBatcher.group)) scene.add(staticBatcher.group);
    }
    if (staticBatcher.size && now > batchCheckAt) {
      batchCheckAt = now + 500;
      staticBatcher.check((i) => !tickSnapshotAlive(i));
    } else staticBatcher.syncVisibility();
  }
  // Resting activities (0.75.0). A Routine stop may name one ("6 120 40
  // sit"): the clip to play once there, if the model has it (a few
  // aliases help). Two people standing close turn to each other and talk.
  // Calm animals graze, on and off.
  function firstClip(state: AnimState, wanted: string[]) {
    return wanted.find((name) => state.actions.has(name));
  }
  function restingClip(i: number, state: AnimState, entity: EntityRef | undefined, object: THREE.Object3D, tickDt: number): string | undefined {
    const routine = entity ? doc.scene.resolve(entity, "Routine") : undefined;
    if (routine) {
      const activity = routineActivity(routine.stops, runtime._editor_routine_stop(i));
      const clip = activity ? firstClip(state, activityAliases[activity] ?? [activity]) : undefined;
      if (clip) return clip;
    }
    if (state.actions.has("talk") && (routine || (entity && doc.scene.effectiveHas(entity, "Pedestrian")))) {
      // The nearest other resting talker within 2.5 m.
      let partner: THREE.Vector3 | undefined;
      let best = 2.5;
      for (const j of talkerIndices) {
        if (j === i || !talkerWasResting.has(j)) continue;
        const other = tickStates[j]?.current ?? objects[j]?.position;
        if (!other) continue;
        const d = Math.hypot(other.x - object.position.x, other.z - object.position.z);
        if (d < best) {
          best = d;
          partner = other;
        }
      }
      talkerResting.add(i);
      if (partner) {
        const yaw = Math.atan2(partner.x - object.position.x, partner.z - object.position.z);
        const turn = Math.atan2(Math.sin(yaw - object.rotation.y), Math.cos(yaw - object.rotation.y));
        object.rotation.y += Math.max(-4 * tickDt, Math.min(4 * tickDt, turn));
        return "talk";
      }
    }
    if (runtime._editor_wildlife_state(i) === 0) {
      // Head down for a while, up for a while, each animal on its own beat.
      const grazing = (performance.now() / 1000 + i * 1.7) % 11 < 7;
      if (grazing) return firstClip(state, activityAliases.graze!);
    }
    return undefined;
  }
  // Mouse steering (0.75.0): while flying with the mouse captured, its
  // motion moves a virtual stick (yaw right, pitch up for the mouse moving
  // up) that eases back to centre once the mouse rests; keys still win.
  const mouseStick = { x: 0, y: 0, idle: 0, sent: false, locked: false };
  function updateMouseStick(dt: number) {
    const f = spaceView?.flight;
    const flying = !!f && doc.mode === "play" && f.piloting && !f.landed;
    const available = flying && playerSettings.flightMouse === "steer" && !isTouchDevice();
    const active = available && document.pointerLockElement === renderer.domElement;
    if (spaceView) {
      spaceView.stick.available = available;
      spaceView.stick.active = active;
    }
    // Landing or leaving the pilot's seat hands the mouse back.
    if (!available && mouseStick.locked && document.pointerLockElement === renderer.domElement) releasePointer();
    mouseStick.locked = active;
    if (!active) {
      mouseStick.x = mouseStick.y = 0;
      if (mouseStick.sent) runtime._editor_space_stick(0, 0);
      mouseStick.sent = false;
      return;
    }
    mouseStick.idle += dt;
    if (mouseStick.idle > 0.25) {
      const k = Math.exp(-dt * 1.2);
      mouseStick.x *= k;
      mouseStick.y *= k;
    }
    const dead = spaceView!.stick.deadzone;
    const shape = (v: number) => (Math.abs(v) < dead ? 0 : Math.sign(v) * ((Math.abs(v) - dead) / (1 - dead)));
    spaceView!.stick.x = mouseStick.x;
    spaceView!.stick.y = mouseStick.y;
    runtime._editor_space_stick(shape(mouseStick.x), -shape(mouseStick.y));
    mouseStick.sent = true;
  }
  // The status line's "unsaved" check serializes the whole scene; it runs
  // at most twice a second, and not at all while playing (the document
  // can't change then).
  const dirtyCheck = { at: -Infinity, value: false, mode: doc.mode };
  function statusDirty() {
    const now = performance.now();
    if ((doc.mode !== "edit" && dirtyCheck.mode === doc.mode) || now - dirtyCheck.at < 500) return dirtyCheck.value;
    dirtyCheck.at = now;
    dirtyCheck.mode = doc.mode;
    dirtyCheck.value = doc.dirty;
    return dirtyCheck.value;
  }
  function frame(now: number) {
    const frameStart = performance.now();
    let tickMs = 0;
    const dt = Math.min((now - previous) / 1000, 5 / 60);
    governFrame(now - previous);
    updateMouseStick(dt);
    if (doc.mode === "play") updateMusic();
    previous = now;
    let steps = 0;
    const player = playerIndex >= 0 ? objects[playerIndex] : undefined;
    // UI clicks while paused (a script's on_ui) can still queue commands,
    // e.g. game.resume() from a title screen's button.
    if (doc.mode === "pause") runScriptCommands();
    if (doc.mode === "play") {
      // Once per rendered frame, before any of this frame's ticks — mirrors
      // the native platform's own begin_frame()-then-apply-events-then-step
      // loop, so key_pressed()/key_released() read as single-frame edges
      // shared by every tick this frame runs, not per-tick. Skipped after a
      // frame that ran no tick (a display faster than 60 Hz): otherwise a
      // press or click landing in that frame would be cleared before any
      // tick saw it, and mouse deltas would be dropped.
      if (inputFrameConsumed) runtime._editor_input_begin_frame();
      // Once per rendered frame too, so this frame's on-foot movement (see
      // Runtime::camera_forward_x/z's own doc comment in bridge.cpp) reflects
      // wherever the camera is pointed right now, including mid-orbit.
      viewCamera.getWorldDirection(cameraForwardScratch);
      runtime._editor_set_camera_forward(cameraForwardScratch.x, cameraForwardScratch.z);
      for (const [code, down] of keyQueue) runtime.ccall("editor_input_key", null, ["string", "number"], [code, down]);
      keyQueue.length = 0;
      flushPointerInput();
      pollGamepad();
      const controller = playerController();
      if (controller?.mode === "FirstPerson" && padSnapshot)
        applyStickLook(fps.look, padSnapshot.axes[2] ?? 0, padSnapshot.axes[3] ?? 0, dt, controller.lookSensitivity, controller.invertY);
      for (const [key, down] of scriptKeyQueue) runtime.ccall("editor_script_key", null, ["string", "number"], [key, down]);
      scriptKeyQueue.length = 0;
      // The settings panel pauses the game (input waits with it).
      if (!settingsPanel) accumulator += dt * combat.timeScale;
      const tickStart = performance.now();
      const firstPersonTicks = firstPerson();
      if (firstPersonTicks) runtime._editor_set_look(fps.look.yaw, fps.look.pitch);
      while (accumulator >= 1 / 60 && steps++ < 5) {
        if (firstPersonTicks) playerFeet(fps.previous);
        tickStates.forEach((state) => {
          state.previous.copy(state.current);
          state.previousYaw = state.currentYaw;
        });
        runtime._editor_tick();
        sampleTickStates();
        spaceView?.sampleTick();
        if (firstPersonTicks) {
          playerFeet(fps.current);
          fpsLanding = Math.max(fpsLanding, runtime._editor_controller_value(playerIndex, 3));
        }
        ticks++;
        accumulator -= 1 / 60;
      }
      tickMs = performance.now() - tickStart;
      tickAlpha = Math.min(1, accumulator * 60);
      inputFrameConsumed = steps > 0;
      persistDirtySaves();
      pollAnimationRequests();
      adoptSpawnedEntities();
      runScriptCommands();
      processCombatEvents();
      combat.events(objects);
      if (steps > 0) playMovementSounds(steps / 60);
      objects.forEach((object, i) => {
        // Combat/AI can destroy an authored entity (Health reaching 0) mid-session;
        // its index stays in objects[] (entities can't be added/removed while
        // playing), but editor_value() on a dead entity is meaningless. Rather
        // than vanish instantly, it plays a death clip (if its model has one)
        // and fades out over deathFadeDuration -- see startDeath's own doc
        // comment. Only ever forces visible false, never true: rebuild()
        // already set each object's visibility from its own authored
        // Renderable.visible, and an entity that's still alive never needs
        // that touched here.
        if (!tickSnapshotAlive(i)) {
          const state = (deathStates[i] ??= startDeath(object, combat.diedInCombat(i) ? undefined : animStates[i]));
          state.elapsed += dt;
          const progress = Math.max(0, 1 - state.elapsed / deathFadeDuration);
          for (const { material, baseOpacity } of state.materials) material.opacity = baseOpacity * progress;
          if (state.elapsed >= deathFadeDuration) object.visible = false;
          return;
        }
        // Drawn between the last two ticks, by how far into the next one
        // this frame is: the simulation steps at 60 Hz, so drawing raw tick
        // positions makes motion judder on any display not exactly in step.
        const state = tickStates[i] ?? sampleTickState(i);
        object.position.lerpVectors(state.previous, state.current, tickAlpha);
      });
      // A Vehicle+Player entity's facing comes straight from its own steered
      // heading (bridge.cpp field 4), not inferred from position deltas like
      // the animated-entity facing below — that would lag and wobble
      // mid-turn, where a real heading is exact every tick.
      // Soldiers face where their AI is looking (bridge.cpp's Soldier::yaw).
      objects.forEach((object, i) => {
        if (!tickSnapshotAlive(i)) return;
        const state = tickStates[i];
        const flags = tickSnapshotFlags(i);
        if (!state || (flags >= 0 ? !(flags & 1) : runtime._editor_soldier_value(i, 0) < 0)) return;
        const turn = Math.atan2(Math.sin(state.currentYaw - state.previousYaw), Math.cos(state.currentYaw - state.previousYaw));
        object.rotation.y = state.previousYaw + turn * tickAlpha;
      });
      const authored = doc.scene.eachAlive();
      objects.forEach((object, i) => {
        if (!tickSnapshotAlive(i)) return;
        const entity = authored[i];
        // Arcade cars (any driver, spawned ones too), drawn between ticks
        // like positions.
        const state = tickStates[i];
        const flags = tickSnapshotFlags(i);
        if ((flags >= 0 ? flags & 2 : runtime._editor_vehicle_value(i, 11)) && state) {
          const turn = Math.atan2(Math.sin(state.currentYaw - state.previousYaw), Math.cos(state.currentYaw - state.previousYaw));
          object.rotation.y = state.previousYaw + turn * tickAlpha;
        } else if (entity && doc.scene.effectiveHas(entity, "Vehicle") && doc.scene.effectiveHas(entity, "Player"))
          object.rotation.y = runtime._editor_value(i, EntityField.headingYaw);
      });
      // Jump/flight squash-and-stretch: a cheap "weight" cue so a jump doesn't
      // read as a flat vertical translation — stretches tall while rising,
      // squashes while falling, and eases back to the authored scale once
      // grounded (vertical speed settles near zero). Player only, since that
      // was the reported complaint, scaled from the authored size captured
      // when Play started (see the Play button handler) rather than a
      // hardcoded 1, so a player placed at a non-default Scale still squashes
      // proportionally instead of snapping to an unrelated size. Not for a
      // Vehicle: a car visibly deforming like a jumping character would read
      // as a rendering bug, not a style choice.
      // Only recomputed on a frame that actually ran a fixed tick: on a
      // display faster than the 60 Hz simulation, most rendered frames run
      // zero ticks, leaving position (and so playerPrevY) unchanged that
      // frame — recomputing unconditionally would read that as "stopped"
      // and snap back to the authored scale, then re-stretch on the next
      // tick-frame, flickering every render frame at 120/144 Hz instead of
      // reading as one continuous effect.
      const playerEntity = playerIndex >= 0 ? doc.scene.eachAlive()[playerIndex] : undefined;
      if (
        steps > 0 &&
        player &&
        playerBaseScale &&
        playerEntity &&
        !doc.scene.effectiveHas(playerEntity, "Vehicle") &&
        !doc.scene.effectiveHas(playerEntity, "CharacterController")
      ) {
        const verticalDelta = player.position.y - playerPrevY;
        const stretch = Math.max(-0.18, Math.min(0.18, verticalDelta * 6));
        player.scale.set(playerBaseScale.x * (1 - stretch * 0.5), playerBaseScale.y * (1 + stretch), playerBaseScale.z * (1 - stretch * 0.5));
      }
      if (steps > 0 && player) playerPrevY = player.position.y;
      const projectileCount = runtime._editor_projectile_count();
      while (projectileMeshes.length < projectileCount)
        scene.add((projectileMeshes[projectileMeshes.length] = new THREE.Mesh(projectileGeometry, projectileMaterial)));
      while (projectileMeshes.length > projectileCount) scene.remove(projectileMeshes.pop()!);
      projectileMeshes.forEach((mesh, i) =>
        mesh.position.set(runtime._editor_projectile_value(i, 0), runtime._editor_projectile_value(i, 1), runtime._editor_projectile_value(i, 2)),
      );
      updateCars(dt);
      if (spaceView && shipIndex >= 0 && objects[shipIndex]) {
        const context = audioContext;
        spaceView.placeShip(objects[shipIndex]!, tickAlpha, dt, context ? { context, output: audioMixer().buses.sfx } : undefined);
      }
      if (player) controls.target.copy(player.position);
    }
    // Always advance mixers, even in edit mode: a rigged model sitting
    // perfectly still reads as a broken rig, and an idle clip is meant to loop.
    // Beyond crowdNear, characters animate every few frames under load (the
    // frame governor's crowd stride), each catching up its skipped time.
    const stride = governorTier().crowdStride;
    crowdFrame++;
    const eye = viewCamera.position;
    lightPool.update(viewCamera.position);
    if (doc.mode === "play") combat.frame(dt, tickAlpha, viewCamera);
    // Slow motion (a finisher, a parry) slows every body with the game clock.
    const animDt = doc.mode === "play" ? dt * combat.timeScale : dt;
    animStates.forEach((state, i) => {
      if (!state) return;
      const object = objects[i];
      if (stride > 1 && object && object.position.distanceToSquared(eye) > crowdNear * crowdNear) {
        state.skipped = (state.skipped ?? 0) + animDt;
        if ((crowdFrame + i) % stride !== 0) return;
        state.mixer.update(state.skipped);
        state.skipped = 0;
        return;
      }
      state.mixer.update(animDt + (state.skipped ?? 0));
      state.skipped = 0;
      // Each near character's own gestures over a shared clip (0.76.0).
      const kind = doc.mode === "play" && object && object.position.distanceToSquared(eye) < 40 * 40 ? gestureFor(state.current) : undefined;
      if (kind && object) {
        let bones = gestureBones.get(state);
        if (!bones) gestureBones.set(state, (bones = findGestureBones(object)));
        applyGesture(bones, kind, now / 1000, i);
      }
    });
    if (doc.mode === "play") combat.plant(dt);
    // Weapon guards and two-handed grips, over the clips' poses.
    updateHeldWeapons(animDt, (body) => combat.guarding(body));
    // Same reasoning as mixers above -- a Particles emitter is as "always on"
    // as a Light, not gated to Play mode like Script/Sound.
    particleScale.value = viewport.clientHeight / 2;
    particleStates.forEach((state) => state && stepParticles(state, dt));
    updateStaticBatches();
    stepTrails(dt);
    // Ground-speed clip selection runs on the fixed-step cadence (steps/60),
    // not every render frame — see groundSpeed()'s own comment for why.
    if (doc.mode === "play" && steps > 0) {
      const tickDt = steps / 60;
      const entities = doc.scene.eachAlive();
      [talkerWasResting, talkerResting] = [talkerResting, talkerWasResting];
      talkerResting.clear();
      if (talkerScan !== objects.length) {
        talkerScan = objects.length;
        talkerIndices = entities.flatMap((entity, k) => (doc.scene.effectiveHas(entity, "Routine") || doc.scene.effectiveHas(entity, "Pedestrian") ? [k] : []));
      }
      animStates.forEach((state, i) => {
        if (!state) return;
        // A dying entity's own death clip (startDeath()) must not be
        // fought here -- its position stopped updating the moment it died
        // (see the objects.forEach block above), so an unconditional pass
        // reads that as speed 0 and immediately crossfades to "idle",
        // undoing the death clip the very frame it started. A script's own
        // self.animate one-shot (pollAnimationRequests above) is the same
        // problem one tick earlier: the entity is very much still moving,
        // so ground speed alone can't tell "mid one-shot" apart from
        // "should already be back to walk/run."
        if (deathStates[i] || state.oneShot) return;
        const object = objects[i]!;
        // Speed from the simulated positions, not the interpolated ones drawn.
        const at = tickStates[i]?.current ?? object.position;
        const dx = at.x - state.prevPosition.x;
        const dz = at.z - state.prevPosition.z;
        const speed = groundSpeed(at, state.prevPosition, tickDt);
        const verticalSpeed = (at.y - state.prevPosition.y) / tickDt;
        state.prevPosition.copy(at);
        // A fighter's body follows its fight (combatView.ts); it faces where
        // the simulation says (editor_snapshot).
        if (combat.has(i)) {
          combat.tick(i, speed, verticalSpeed, fighterVelocity.set(dx / tickDt, 0, dz / tickDt));
          return;
        }
        // Face the direction actually traveled — not for a Vehicle, whose
        // facing already comes from its own steered heading above, which is
        // exact every tick where this would lag and wobble mid-turn.
        // Without this, a walk/run clip plays while the mesh keeps whatever
        // fixed orientation it was authored with, sliding sideways or
        // backwards instead of visibly running toward where it's going.
        if (
          speed > 0.15 &&
          // Runtime-spawned objects (world.spawn) have no authored entity:
          // a spawned soldier faces where its AI looks, like authored ones.
          (entities[i]
            ? !doc.scene.effectiveHas(entities[i]!, "Vehicle") && !doc.scene.effectiveHas(entities[i]!, "AICombat")
            : runtime._editor_soldier_value(i, 0) < 0)
        ) {
          const targetYaw = Math.atan2(dx, dz);
          const diff = Math.atan2(Math.sin(targetYaw - object.rotation.y), Math.cos(targetYaw - object.rotation.y));
          const maxTurn = 10 * tickDt; // rad; generous enough not to lag a sharp turn
          object.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
        }
        const animator = animators[i];
        if (animator) {
          runAnimator(i, state, animator.runtime, speed, verticalSpeed, tickDt);
          return;
        }
        // An authored AnimationState.clip (see rebuild()) pins the clip
        // rebuild() already applied -- Play mode's own ground-speed pick
        // must not fight it every tick.
        const override = entities[i] ? doc.scene.resolve(entities[i]!, "AnimationState") : undefined;
        const overridden = override?.clip && state.actions.has(override.clip);
        // Crouching (C, key_for() code 7 -- see boundKeyCodes' own doc
        // comment) takes priority over both the authored pin and ordinary
        // ground-speed picking: it's an explicit, held player action, the
        // same way a one-shot request already preempts this whole loop via
        // the oneShot gate above, just sustained instead of one-shot.
        // Native-frozen (editor.move's own crouch gate, bridge.cpp) so
        // `speed` already reads ~0 here regardless; this only decides which
        // clip plays at that speed. Player-only: heldKeys has no meaning for
        // an AI/Pedestrian, which never receives editor_key edges at all.
        const crouching = i === playerIndex && heldKeys.has(crouchKeyCode);
        const sitClip = crouching ? resolveActionClip(state, "sit") : undefined;
        // Once crouch releases, an authored pin must be explicitly
        // re-asserted here, not merely left as undefined ("leave whatever's
        // already playing alone") -- that fallback only ever worked because
        // nothing before crouch existed could still be showing a *different*
        // clip while `overridden` was true. Now that crouching can
        // temporarily replace state.current with the sit clip, releasing it
        // needs this loop to actively restore override.clip itself; the
        // `clipName !== state.current` check below makes this a no-op once
        // it's already showing, so it's harmless in the ordinary case too.
        const restoringPin = !sitClip && overridden;
        // Standing still (0.75.0): an activity -- a job at a routine's
        // stop, talking with whoever stands close, grazing -- before plain idle.
        const resting = !sitClip && !overridden && speed < 0.15 && i !== playerIndex ? restingClip(i, state, entities[i], object, tickDt) : undefined;
        const clipName = sitClip ?? (overridden ? override!.clip : (resting ?? pickClipName([...state.actions.keys()], speed)));
        if (clipName && clipName !== state.current) {
          const next = state.actions.get(clipName);
          const previous = state.current ? state.actions.get(state.current) : undefined;
          if (next) {
            if (restoringPin) {
              // Crouch just released (or an authored pin is regaining
              // priority some other way) -- restore it with its own
              // authored looping/time settings, the exact same three lines
              // rebuild()'s initial apply and onFinished's one-shot restore
              // already use, instead of the generic always-loop-from-zero
              // locomotion configuration below. Skipping this would force a
              // non-looping pinned clip into infinite looping from frame 0,
              // silently discarding what the user authored.
              next.setLoop(override!.looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
              next.clampWhenFinished = !override!.looping;
              if (Number.isFinite(override!.time)) next.time = override!.time;
              next.reset().fadeIn(0.2).play();
            } else {
              // A script's self.animate (pollAnimationRequests above) may have
              // left this exact action set to LoopOnce/clampWhenFinished from
              // an earlier one-shot -- .reset() alone doesn't touch loop mode,
              // so without this it would play once here and freeze instead of
              // looping like ordinary locomotion.
              next.setLoop(THREE.LoopRepeat, Infinity);
              next.clampWhenFinished = false;
              next.reset().fadeIn(0.2).play();
            }
            if (previous && previous !== next) previous.fadeOut(0.2);
            state.current = clipName;
          }
        }
      });
    }
    if (selection.visible) selection.update();
    controls.update();
    rig.frameDt = dt;
    const game = gameCamera();
    viewCamera = game ?? camera;
    // A panel cutscene takes the camera while it plays.
    if (doc.mode === "play") {
      ledger.update(dt, Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight));
      if (ledger.playing) viewCamera = ledger.camera;
    }
    // Shake the game camera, or during Play a copy of the editor camera, so
    // the orbit camera itself never drifts.
    if (doc.mode !== "edit" && shake.remaining > 0) {
      if (!game) {
        shakeCamera.copy(camera);
        viewCamera = shakeCamera;
      }
      applyShake(viewCamera, dt);
    }
    const viewmodelInput =
      firstPerson() && runtime._editor_weapon_value(playerIndex, 5) > 0
        ? {
            look: fps.look,
            aiming: runtime._editor_weapon_value(playerIndex, 7) === 1,
            reloadProgress: runtime._editor_weapon_value(playerIndex, 3),
            equipProgress: runtime._editor_weapon_value(playerIndex, 6),
            speed: runtime._editor_controller_value(playerIndex, 4),
            grounded: runtime._editor_controller_value(playerIndex, 2) === 1,
            sprinting: runtime._editor_controller_value(playerIndex, 5) === 1,
          }
        : undefined;
    weaponFx.update(dt, viewmodelInput, viewport.clientWidth / Math.max(viewport.clientHeight, 1));
    viewmodelPass.enabled = !!viewmodelInput;
    // The viewmodel reflects the same sky light as the world, or a neutral
    // studio environment when the scene has none (metal would read black).
    if (viewmodelInput) {
      viewmodelStudio ??= pmrem?.fromScene(new RoomEnvironment(), 0.04).texture;
      weaponFx.viewScene.environment = scene.environment ?? viewmodelStudio ?? null;
      weaponFx.viewScene.environmentIntensity = scene.environment ? scene.environmentIntensity : 0.8;
    }
    // The listener follows the view; positional Sound components follow their entity.
    if (mixer) {
      viewCamera.getWorldPosition(listenerPosition);
      const forward = viewCamera.getWorldDirection(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(viewCamera.getWorldQuaternion(new THREE.Quaternion()));
      mixer.updateListener(listenerPosition, forward, up);
      for (const [index, panner] of activePanners) {
        const object = objects[index];
        if (object) mixer.place(panner, object.getWorldPosition(new THREE.Vector3()));
      }
    }
    if (doc.mode !== "edit") {
      updateSpace(viewCamera, dt);
      if (doc.mode === "play") updateScanner(dt, viewCamera);
    }
    updateSunShadow();
    renderPass.camera = viewCamera;
    if (gtaoPass) gtaoPass.camera = viewCamera;
    inkPass.camera = viewCamera;
    if (gradingPass.enabled) (gradingPass.uniforms as Record<string, { value: number }>).time!.value = (now / 1000) % 100;
    // Counted over every pass of the frame (bloom included), not just the
    // last one, for the Stats overlay's draw calls and triangles.
    if (renderer instanceof THREE.WebGLRenderer) {
      renderer.info.autoReset = false;
      renderer.info.reset();
    }
    inkPass.impact = combat.comic.impact * playerSettings.flash;
    if (composer) composer.render();
    else renderer.render(scene, viewCamera);
    drawHud();
    updateStats(performance.now() - frameStart, tickMs);
    const status = el("status");
    status.dataset.mode = doc.mode;
    const playerReadout =
      doc.mode === "play" && player ? ` · Player (${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})` : "";
    // Text companion to the HUD's own bar for whatever's selected — lets a
    // precise numeric value (or the "defeated" transition) be read/watched
    // without eyeballing bar width in the viewport.
    const selectedIndex = doc.selection ? doc.scene.eachAlive().findIndex((e) => e.index === doc.selection!.index) : -1;
    const selectedHealthReadout =
      doc.mode === "play" && selectedIndex >= 0 && doc.scene.effectiveHas(doc.selection!, "Health")
        ? runtime._editor_alive(selectedIndex)
          ? ` · Selected health: ${Math.round(runtime._editor_value(selectedIndex, EntityField.health) * 100)}%`
          : " · Selected: defeated"
        : "";
    // A live companion to selectedHealthReadout for an AIState entity: field 5 is
    // AIAgent.state as a plain int matching aiStateNames' own order (bridge.cpp's
    // editor_value doc comment) — watch an NPC's wander/chase/flee decisions and
    // position tick by tick without eyeballing the viewport.
    const selectedAiReadout =
      doc.mode === "play" && selectedIndex >= 0 && doc.scene.effectiveHas(doc.selection!, "AIState") && runtime._editor_alive(selectedIndex)
        ? ` · Selected AI: ${aiStateNames[runtime._editor_value(selectedIndex, EntityField.aiState)] ?? "Idle"} (${runtime._editor_value(selectedIndex, EntityField.x).toFixed(1)}, ${runtime._editor_value(selectedIndex, EntityField.z).toFixed(1)})`
        : "";
    // A script author's only feedback that something's wrong: a compile or
    // runtime error is otherwise a silently inert entity with no visible
    // cause (see editor_script_error's own doc comment, bridge.cpp, on why
    // that's the one thing surfaced here rather than every field of `self`).
    const spawnedCount = objects.length - doc.scene.eachAlive().length;
    const spawnedReadout = doc.mode !== "edit" && spawnedCount > 0 ? ` · ${spawnedCount} spawned` : "";
    const selectedScriptErrorReadout =
      doc.mode === "play" && selectedIndex >= 0 && doc.scene.effectiveHas(doc.selection!, "Script")
        ? (() => {
            const error = runtime.ccall("editor_script_error", "string", ["number"], [selectedIndex]);
            return error ? ` · Script error: ${error}` : "";
          })()
        : "";
    status.textContent = `${doc.mode.toUpperCase()} · ${backend} · ${doc.scene.entityCount} entities · ${ticks} C++ fixed ticks${spawnedReadout}${playerReadout}${selectedHealthReadout}${selectedAiReadout}${selectedScriptErrorReadout} · ${statusDirty() ? "Unsaved changes" : "Saved"} · Gravity, ground, Collider box/sphere collision, Health-based combat (F melee, G blast), Vehicle driving (W/S/A/D), AIState/Pedestrian wander/chase/flee, Script (Lua callbacks and world API), and Sound (Web Audio) are simulated`;
    requestAnimationFrame(frame);
  }
  const cameraForwardScratch = new THREE.Vector3();
  const hudScratch = new THREE.Vector3();
  // anchor -> (x/y fraction of the HUD canvas, canvas textAlign/textBaseline)
  // -- a UI element's screen position, unlike a Health bar's, is never
  // projected from a world position; it's just one of nine fixed points on
  // the viewport, the same layout language any screen-anchored HUD/menu uses.
  // Populated fresh by drawHud() every frame a Button is visible; consulted
  // by the pointerdown handler below to hit-test a click before it falls
  // through to normal 3D entity-selection raycasting. Screen-space rects,
  // not scene objects, so no relation to objects[]/animStates[]'s own
  // per-entity indexing.
  interface UIButtonHit extends UIRect {
    kind: UIKind;
    name: string;
    action: UIAction;
    value: number;
  }
  // Paints UI components on the HUD canvas (uiDraw.ts).
  const uiPainter = new UIPainter(hudCtx, (url) => resolveAssetUrl(url, importedImages));
  const drawUIElement = (ui: UIComponent, rect: UIRect, value: number) => uiPainter.draw(ui, rect, value);
  const uiButtonHits: UIButtonHit[] = [];
  // Screen-space Health bars (Play mode only, matches the player readout's
  // own scoping) and authored UI Text/Button elements (main.ts's own
  // player-mode bootstrap aside, visible per each element's own
  // `visibleWhen`, not tied to Play like Health bars) -- both drawn on the
  // same 2D canvas, redrawn from scratch every frame rather than tracked
  // incrementally, matching the Health bars' own established reasoning
  // (entities/UI state can change every tick; nothing here is worth diffing
  // against a held/released-style previous frame).
  // Script waypoints: a diamond with a label and distance, pinned to the
  // screen edge (pointing the way) when off screen or behind the view.
  function drawWaypoints() {
    if (!uiMarkers.size) return;
    const from = viewCamera.getWorldPosition(new THREE.Vector3());
    const margin = 36;
    for (const { position, label } of uiMarkers.values()) {
      hudScratch.copy(position).project(viewCamera);
      const behind = hudScratch.z > 1;
      let x = hudScratch.x,
        y = hudScratch.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const offscreen = behind || Math.abs(x) > 1 || Math.abs(y) > 1;
      if (offscreen) {
        const scale = 1 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
        x *= scale;
        y *= scale;
      }
      const px = Math.min(hud.width - margin, Math.max(margin, ((x + 1) / 2) * hud.width));
      const py = Math.min(hud.height - margin, Math.max(margin, ((1 - y) / 2) * hud.height));
      hudCtx.save();
      hudCtx.translate(px, py);
      hudCtx.rotate(Math.PI / 4);
      hudCtx.fillStyle = "rgba(255, 211, 106, 0.9)";
      hudCtx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      hudCtx.lineWidth = 2;
      hudCtx.fillRect(-6, -6, 12, 12);
      hudCtx.strokeRect(-6, -6, 12, 12);
      hudCtx.restore();
      hudCtx.font = "700 12px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      hudCtx.textAlign = "center";
      hudCtx.textBaseline = "top";
      hudCtx.lineWidth = 3;
      hudCtx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      hudCtx.fillStyle = "#ffd36a";
      const text = `${label ? label + " " : ""}${Math.round(from.distanceTo(position))}m`;
      hudCtx.strokeText(text, px, py + 10);
      hudCtx.fillText(text, px, py + 10);
    }
  }
  // "!" over soldiers in combat, "?" over ones that heard or lost something.
  function drawSoldierMarkers() {
    const alive = doc.scene.eachAlive();
    objects.forEach((object, i) => {
      if (!runtime._editor_alive(i)) return;
      const mode = runtime._editor_soldier_value(i, 0);
      if (mode < 0 || runtime._editor_soldier_value(i, 3) === 0) return;
      const fighting = mode === 2 || mode === 4;
      const curious = mode === 1 || mode === 3;
      if (!fighting && !curious) return;
      const scaleY = doc.scene.resolve(alive[i] ?? { index: -1, generation: 0 }, "Scale")?.value.y ?? 1.8;
      hudScratch.copy(object.position);
      hudScratch.y += scaleY / 2 + 0.75;
      hudScratch.project(viewCamera);
      if (hudScratch.z > 1) return;
      const x = ((hudScratch.x + 1) / 2) * hud.width;
      const y = ((1 - hudScratch.y) / 2) * hud.height;
      hudCtx.font = "800 20px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      hudCtx.textAlign = "center";
      hudCtx.textBaseline = "middle";
      hudCtx.lineWidth = 3;
      hudCtx.strokeStyle = "rgba(0,0,0,0.6)";
      hudCtx.fillStyle = fighting ? "#ff4a3a" : "#ffd36a";
      hudCtx.strokeText(fighting ? "!" : "?", x, y);
      hudCtx.fillText(fighting ? "!" : "?", x, y);
    });
  }
  // Crosshair, and a hint while the mouse isn't captured.
  // Returns text for the HUD's screen-reader mirror.
  function drawFirstPersonOverlay(): string[] {
    const cx = hud.width / 2,
      cy = hud.height / 2;
    const weaponCount = runtime._editor_weapon_value(playerIndex, 5);
    if (weaponCount > 0 || runtime._editor_value(playerIndex, EntityField.health) >= 0) {
      const names: string[] = [];
      for (let slot = 0; slot < weaponCount; slot++)
        names.push(runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [playerIndex, slot, 0]));
      const slot = runtime._editor_weapon_value(playerIndex, 0);
      weaponFx.drawHud(hudCtx, hud.width, hud.height, {
        weaponName: names[slot] ?? "",
        magazine: runtime._editor_weapon_value(playerIndex, 1),
        reserve: runtime._editor_weapon_value(playerIndex, 2),
        reloadProgress: runtime._editor_weapon_value(playerIndex, 3),
        spread: runtime._editor_weapon_value(playerIndex, 4),
        aiming: runtime._editor_weapon_value(playerIndex, 7) === 1,
        fov: fps.camera.fov,
        health: runtime._editor_value(playerIndex, EntityField.health),
        slot,
        weaponNames: names,
      });
      drawCaptureHint(cx, cy);
      const lines: string[] = [];
      if (weaponCount > 0) {
        const reserve = runtime._editor_weapon_value(playerIndex, 2);
        lines.push(`${names[slot]} ${runtime._editor_weapon_value(playerIndex, 1)}/${reserve < 0 ? "∞" : reserve}`);
        if (runtime._editor_weapon_value(playerIndex, 3) >= 0) lines.push("Reloading");
      }
      const health = runtime._editor_value(playerIndex, EntityField.health);
      if (health >= 0) lines.push(`Health ${Math.round(health * 100)}`);
      return lines;
    }
    hudCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    hudCtx.lineWidth = 2;
    hudCtx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      hudCtx.moveTo(cx + dx * 4, cy + dy * 4);
      hudCtx.lineTo(cx + dx * 11, cy + dy * 11);
    }
    hudCtx.stroke();
    drawCaptureHint(cx, cy);
    return [];
  }
  function drawCaptureHint(cx: number, cy: number) {
    if (doc.mode === "play" && document.pointerLockElement !== renderer.domElement) {
      hudCtx.font = "600 14px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      hudCtx.textAlign = "center";
      hudCtx.textBaseline = "top";
      hudCtx.fillStyle = "rgba(10, 16, 24, 0.7)";
      const text = "Click to look around (Esc releases) · right-drag also looks";
      const width = hudCtx.measureText(text).width + 20;
      hudCtx.fillRect(cx - width / 2, cy + 110, width, 26);
      hudCtx.fillStyle = "#fff";
      hudCtx.fillText(text, cx, cy + 116);
    }
  }
  // The boss bar's numbers: its entity by Name.
  function bossReadout() {
    const name = ledger.bossName;
    if (!name) return undefined;
    let index = doc.scene.eachAlive().findIndex((e) => doc.scene.resolve(e, "Name")?.value === name);
    // A boss spawned from a prefab (world.spawn) goes by the prefab's name.
    if (index < 0)
      for (let i = doc.scene.eachAlive().length; i < objects.length && index < 0; i++)
        if (runtime._editor_alive(i) && runtime.ccall("editor_spawned_prefab", "string", ["number"], [i]) === name) index = i;
    if (index < 0 || !runtime._editor_alive(index)) return { health: -1, stagger: -1, broken: false };
    return {
      health: runtime._editor_value(index, EntityField.health),
      stagger: runtime._editor_fighter_value(index, FighterField.stagger),
      broken: runtime._editor_fighter_value(index, FighterField.broken) > 0,
    };
  }
  function drawHud() {
    hudCtx.clearRect(0, 0, hud.width, hud.height);
    // The visor under everything else, while walking in a suit.
    if (doc.mode !== "edit" && spaceView && !spaceView.flight.piloting) visor.draw(hudCtx, hud.width, hud.height);
    uiButtonHits.length = 0;
    const hudLines: string[] = [];
    if (doc.mode === "play")
      doc.scene.eachAlive().forEach((entity, index) => {
        if (!doc.scene.effectiveHas(entity, "Health")) return;
        if (!runtime._editor_alive(index)) return;
        // No bar over your own head: in first person, or as a fighter (its HUD shows your health).
        if (index === playerIndex && (firstPerson() || combat.isFighter(index))) return;
        const object = objects[index];
        if (!object) return;
        const ratio = runtime._editor_value(index, EntityField.health);
        if (ratio < 0) return;
        // In first person a bar is feedback on your own hits, not a radar:
        // only damaged targets within 40 m get one.
        if (firstPerson() && (ratio >= 1 || object.position.distanceTo(viewCamera.position) > 40)) return;
        // Third person: only the ones nearby (not a sleeping room through the wall).
        if (!firstPerson() && playerIndex >= 0 && objects[playerIndex] && object.position.distanceTo(objects[playerIndex]!.position) > 14) return;
        const scaleY = doc.scene.resolve(entity, "Scale")?.value.y ?? 1;
        // Where the simulation has it: a fighter's drawn body isn't its anchor.
        hudScratch.set(runtime._editor_value(index, EntityField.x), runtime._editor_value(index, EntityField.y), runtime._editor_value(index, EntityField.z));
        hudScratch.y += scaleY / 2 + 0.35;
        hudScratch.project(viewCamera);
        if (hudScratch.z > 1) return; // behind the camera
        const x = ((hudScratch.x + 1) / 2) * hud.width;
        const y = ((1 - hudScratch.y) / 2) * hud.height;
        const barWidth = 40,
          barHeight = 5;
        hudCtx.fillStyle = "rgba(10, 16, 24, 0.75)";
        hudCtx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight);
        hudCtx.fillStyle = ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#ffb300" : "#e53935";
        hudCtx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth * Math.max(0, Math.min(1, ratio)), barHeight);
      });
    if (doc.mode !== "edit") {
      drawSoldierMarkers();
      drawWaypoints();
    }
    if (firstPerson()) hudLines.push(...drawFirstPersonOverlay());
    // Melee (0.78.0): health, energy, guard, combo and lock-on.
    if (doc.mode === "play" && !ledger.playing)
      hudLines.push(
        ...combat.drawHud(
          hudCtx,
          hud.width,
          hud.height,
          (point) => {
            hudScratch.copy(point).project(viewCamera);
            return hudScratch.z > 1 ? undefined : { x: ((hudScratch.x + 1) / 2) * hud.width, y: ((1 - hudScratch.y) / 2) * hud.height };
          },
          objects,
        ),
      );
    // Scanner reticle (0.72.0).
    if (doc.mode === "play" && (scannableIndices.length || scatterTargets.length)) {
      const text = scanner.draw(hudCtx, hud.width, hud.height, scanHeld());
      if (text) hudLines.push(text);
    }
    // Flight HUD (0.71.0).
    if (doc.mode !== "edit" && spaceView) {
      const ship = shipIndex >= 0 ? objects[shipIndex] : undefined;
      const me = playerIndex >= 0 ? objects[playerIndex] : undefined;
      const nearShip = !!ship && !!me && !spaceView.flight.piloting && spaceView.flight.landed && me.position.distanceTo(ship.position) < 9;
      // A game with its own interaction prompt (a "Prompt" UI text) owns the hint.
      drawFlightHud(hudCtx, hud.width, hud.height, spaceView, viewCamera, nearShip && !uiTextOverrides.has("Prompt"));
      drawExplorerHud(hudLines);
      // The same readout as text, for screen readers and tests.
      const f = spaceView.flight;
      if (f.piloting)
        hudLines.push(
          `ALT ${Math.round(Math.max(f.altitude, 0))} m`,
          `VS ${f.verticalSpeed.toFixed(1)} m/s`,
          `THR ${Math.round(f.throttle * 100)}%`,
          `FUEL ${Math.round(f.fuel * 100)}%`,
          f.landed ? "LANDED" : "FLYING",
        );
      else if (nearShip && !uiTextOverrides.has("Prompt")) hudLines.push("E board ship");
    }
    // Driving HUD (0.70.0): when the player is an arcade car.
    if (doc.mode !== "edit" && playerIndex >= 0 && runtime._editor_alive(playerIndex) && runtime._editor_vehicle_value(playerIndex, 11)) {
      const car = carView(playerIndex);
      const playerEntity = doc.scene.eachAlive()[playerIndex];
      const topSpeed = (playerEntity && doc.scene.resolve(playerEntity, "Vehicle")?.topSpeed) || 60;
      carFx.drawSpeedometer(hudCtx, hud.width, hud.height, car, topSpeed);
      const me = objects[playerIndex]!;
      const blips: MinimapBlip[] = [];
      objects.forEach((anchor, i) => {
        if (i === playerIndex || !runtime._editor_alive(i) || !runtime._editor_vehicle_value(i, 11)) return;
        const mode = runtime._editor_vehicle_value(i, 14);
        blips.push({ x: anchor.position.x, z: anchor.position.z, kind: mode === 2 ? "police" : mode === 1 ? "racer" : "traffic" });
      });
      for (const marker of uiMarkers.values()) blips.push({ x: marker.position.x, z: marker.position.z, kind: "marker" });
      carFx.drawMinimap(hudCtx, hud.height, { x: me.position.x, z: me.position.z, yaw: me.rotation.y }, minimapRoads, blips);
      hudLines.push(`${Math.round(car.speed * 3.6)} km/h`, `gear ${car.gear < 0 ? "R" : car.gear}`, `nitro ${Math.round(car.nitro * 100)}%`);
    }
    for (const entity of doc.scene.eachAlive()) {
      const authoredUi = doc.scene.resolve(entity, "UI");
      // A panel cutscene fills the screen alone.
      if (!authoredUi || (doc.mode === "play" && ledger.playing)) continue;
      const uiName = doc.scene.resolve(entity, "Name")?.value ?? "";
      const playing = doc.mode !== "edit";
      const override = playing ? uiTextOverrides.get(uiName) : undefined;
      const tint = playing ? uiColorOverrides.get(uiName) : undefined;
      const ui = {
        ...authoredUi,
        ...(override === undefined ? {} : { text: override }),
        ...(tint ? { color: { x: tint.r, y: tint.g, z: tint.b } } : {}),
      };
      if (ui.visibleWhen === "play" && doc.mode !== "play") continue;
      if (ui.visibleWhen === "pause" && doc.mode !== "pause") continue;
      if (playing && uiVisibility.get(uiName) === false) continue;
      const value = playing ? (uiValues.get(uiName) ?? ui.value) : ui.value;
      hudCtx.font = `600 ${ui.fontSize}px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif`;
      let auto = autoSize(ui.kind, ui.text ? hudCtx.measureText(ui.text).width : 0, ui.fontSize);
      if (ui.kind === "Text" && ui.text) {
        const lines = uiPainter.lines(ui.text, ui.width);
        auto = {
          width: Math.max(...lines.map((l) => hudCtx.measureText(l).width)),
          height: lines.length * Math.round(ui.fontSize * 1.3),
        };
      }
      const rect = layoutRect(ui.anchor, hud.width, hud.height, ui.width || auto.width, ui.height || auto.height, ui.offsetX, ui.offsetY);
      drawUIElement(ui, rect, value);
      // Clickable only outside Edit mode -- see UIComponent's own doc
      // comment (Components.ts) for why authoring a scene must never be
      // able to accidentally trigger a Button's command.
      if (playing && (ui.kind === "Button" || ui.kind === "Slider" || ui.kind === "Toggle"))
        uiButtonHits.push({ ...rect, kind: ui.kind, name: uiName, action: ui.action, value });
      if (ui.text) hudLines.push(ui.text);
      if (ui.kind === "Bar" || ui.kind === "Slider" || ui.kind === "Toggle") hudLines.push(`${uiName || ui.kind}=${Math.round(value * 100) / 100}`);
    }
    // GATEBREAKER: panels, the Ledger's windows and the boss bar, drawn last
    // so a window covers the scene's own UI text; the M map covers all.
    if (doc.mode === "play") hudLines.push(...ledger.draw(hudCtx, hud.width, hud.height, bossReadout()));
    if (doc.mode !== "edit")
      hudLines.push(
        ...districtMap.draw(hudCtx, hud.width, hud.height, {
          player: playerIndex >= 0 ? objects[playerIndex] : undefined,
          camera: viewCamera,
          project: (point) => (point.project(viewCamera).z > 1 ? undefined : { x: ((point.x + 1) / 2) * hud.width, y: ((1 - point.y) / 2) * hud.height }),
          minimap: playerSettings.minimap && minimapAllowed,
          size: (playerSettings as { minimapSize?: string }).minimapSize,
          panels: ledger.playing,
          window: ledger.systemText !== "",
        }),
      );
    const hudSummary = hudLines.join(" · ");
    if (hudText.textContent !== hudSummary) hudText.textContent = hudSummary;
  }
  requestAnimationFrame(frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent = "Editor failed: " + String(error);
});

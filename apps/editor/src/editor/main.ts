import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  transformCommand,
  type TransformMode,
  type TransformSnapshot,
} from "./TransformEdit";
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
import { propertyMetadata, componentLabel, componentGroups } from "./PropertyMetadata";
import { defaultComponent } from "../authoring/CommandInterpreter";
import { CanvasRenderer } from "./CanvasRenderer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
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
import {
  assetKind,
  assignId,
  displayName,
  loadStoredAssets,
  resolveAssetUrl,
  storeAsset,
  type StoredAsset,
} from "./userAssets";
import { autoSize, contains, layoutRect, sliderValue, type UIRect } from "./uiLayout";
import { AnimatorRuntime, parseAnimatorGraph, parseParamValue, type AnimatorGraph } from "./animator";
import { applyMouseLook, applyStickLook, ViewEffects, type Look } from "./fpsView";
import { Sfx } from "./sfx";
import { AudioMixer, defaultMixerSettings, FootstepTracker, type Bus } from "./audioMixer";
import { crowdNear, FrameGovernor, governorTiers, presetFloor } from "./frameGovernor";
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
import { Announcer, createTouchControls, isTouchDevice, loadSettings, openSettingsPanel, qualityProfile, summarizeFrames } from "./playerSettings";
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
const PARTICLE_PRESETS: Record<
  ParticlePreset,
  { direction: THREE.Vector3; spread: number; gravity: number }
> = {
  Sparkle: { direction: new THREE.Vector3(0, 1, 0), spread: 1, gravity: 0 },
  Smoke: { direction: new THREE.Vector3(0, 1, 0), spread: 0.3, gravity: 0.6 },
  Fire: { direction: new THREE.Vector3(0, 1, 0), spread: 0.55, gravity: 1.1 },
  Confetti: { direction: new THREE.Vector3(0, 1, 0), spread: 0.85, gravity: -4 },
};

// Small, hand-drawn, dependency-free icon set (no external icon font/CDN,
// consistent with this project's zero-external-asset constraints for the
// editor chrome). Each entry is the inner markup of a 0 0 16 16 viewBox svg.
const ICONS = {
  play: '<path d="M4 3l9 5-9 5V3z"/>',
  pause: '<rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/>',
  stop: '<rect x="4" y="4" width="8" height="8"/>',
  plus: '<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  copy: '<rect x="3" y="6" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3H12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  trash: '<path d="M3 4h10M6.3 4V2.6h3.4V4M4.6 4l.6 9a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.6-9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  undo: '<path d="M5 4L2 7l3 3M2 7h7a4 4 0 1 1 0 8h-1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  redo: '<path d="M11 4l3 3-3 3M14 7H7a4 4 0 1 0 0 8h1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  save: '<path d="M3 3h7.4L13 5.6V13H3V3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5 3v3.6h4.4V3M5 10h6" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  open: '<path d="M2 5.4A1.4 1.4 0 0 1 3.4 4h2.3l1 1.3h5.9A1.4 1.4 0 0 1 14 6.7v4.9A1.4 1.4 0 0 1 12.6 13H3.4A1.4 1.4 0 0 1 2 11.6V5.4z" fill="none" stroke="currentColor" stroke-width="1.15"/>',
  search: '<circle cx="6.6" cy="6.6" r="3.8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9.6 9.6L13.5 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  grid: '<path d="M2 2h12v12H2z M2 6.4h12M2 10.6h12M6.4 2v12M10.6 2v12" fill="none" stroke="currentColor" stroke-width="1"/>',
  target: '<circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.2v2.4M8 12.4v2.4M1.2 8h2.4M12.4 8h2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  cube: '<path d="M8 1.6l5.6 3v6.8L8 14.4l-5.6-3V4.6L8 1.6z" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M2.4 4.6L8 7.6l5.6-3M8 7.6v6.8" fill="none" stroke="currentColor" stroke-width="1.05"/>',
  child: '<path d="M4.2 2v5.4a2 2 0 0 0 2 2h5.4M9 7l2.6 2.4L9 11.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
  external: '<path d="M4.6 11.4L11.4 4.6M6.6 4.6h4.8v4.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;
type IconName = keyof typeof ICONS;
// For static template strings (trusted, hardcoded content only).
function iconHtml(name: IconName, extraClass = ""): string {
  return `<svg class="icon ${extraClass}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
// For DOM built at runtime, so user-provided text never flows through innerHTML.
function iconEl(name: IconName, extraClass = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", `icon ${extraClass}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICONS[name];
  return svg;
}
function textSpan(text: string, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  return span;
}
// Drag-to-resize a docked panel, matching mainstream engine editors. Reads
// and writes a CSS custom property on the document root; the stylesheet
// consumes that property in the relevant grid-template-columns/rows track.
function wireResizer(
  handle: HTMLElement,
  axis: "x" | "y",
  cssVar: string,
  min: number,
  max: number,
  invert = false,
) {
  const root = document.documentElement;
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    const startPos = axis === "x" ? down.clientX : down.clientY;
    const startValue =
      parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || min;
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

type Runtime = {
  _editor_begin(): void;
  _editor_add(...values: number[]): number;
  _editor_commit(): number;
  _editor_tick(): void;
  _editor_count(): number;
  _editor_value(index: number, field: number): number;
  _editor_alive(index: number): number;
  _editor_snapshot(): number;
  HEAPF64: Float64Array;
  _editor_input_begin_frame(): void;
  _editor_set_camera_forward(x: number, z: number): void;
  _editor_key(code: number, down: number): void;
  _editor_input_mouse_move(x: number, y: number, dx: number, dy: number): void;
  _editor_input_mouse_button(button: number, down: number, x: number, y: number): void;
  _editor_input_wheel(dx: number, dy: number): void;
  _editor_input_gamepad_connected(connected: number): void;
  _editor_input_gamepad_button(button: number, down: number): void;
  _editor_input_gamepad_axis(axis: number, value: number): void;
  ccall(name: "editor_input_key", returnType: null, argTypes: ["string", "number"], args: [string, number]): void;
  ccall(name: "editor_set_input_bindings", returnType: null, argTypes: ["string"], args: [string]): void;
  ccall(name: "editor_bindings_error", returnType: "string", argTypes: [], args: []): string;
  _editor_projectile_count(): number;
  _editor_projectile_value(index: number, field: number): number;
  _editor_take_dirty_saves(): number;
  _editor_set_body(index: number, authored: number, mass: number, dynamic: number): void;
  _editor_entity_count(): number;
  _editor_take_commands(): number;
  _editor_command_entity(index: number): number;
  // Text-in/text-out calls added with the 0.51.0 script host (bridge.cpp):
  // names, props, prefab templates, spawned-prefab lookup, command text.
  ccall(
    name: "editor_set_name" | "editor_set_script_props",
    returnType: null,
    argTypes: ["number", "string"],
    args: [number, string],
  ): void;
  ccall(name: "editor_template_begin", returnType: null, argTypes: ["string"], args: [string]): void;
  ccall(name: "editor_profile_text", returnType: "string", argTypes: [], args: []): string;
  ccall(name: "editor_ui_event", returnType: null, argTypes: ["string", "string"], args: [string, string]): void;
  ccall(
    name: "editor_script_notify",
    returnType: null,
    argTypes: ["number", "string", "string"],
    args: [number, string, string],
  ): void;
  ccall(name: "editor_spawned_prefab", returnType: "string", argTypes: ["number"], args: [number]): string;
  ccall(
    name: "editor_command_text",
    returnType: "string",
    argTypes: ["number", "number"],
    args: [number, number],
  ): string;
  _editor_set_rotation(index: number, x: number, y: number, z: number): void;
  _editor_set_controller(index: number, mode: number, ...settings: number[]): void;
  _editor_set_look(yaw: number, pitch: number): void;
  _editor_controller_value(index: number, field: number): number;
  _editor_weapon_value(index: number, field: number): number;
  _editor_set_soldier(index: number, ...settings: number[]): void;
  _editor_add_obstacle(x: number, y: number, z: number, sx: number, sy: number, sz: number): void;
  _editor_terrain_height(x: number, z: number): number;
  _editor_line_blocked(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
  _editor_soldier_value(index: number, field: number): number;
  // Arcade cars and AI drivers (0.70.0): see editor_set_car/editor_set_driver/editor_vehicle_value.
  _editor_set_car(index: number, yaw: number, ...spec: number[]): void;
  _editor_set_driver(index: number, mode: number, loop: number, skill: number, aggression: number, speedScale: number): void;
  _editor_vehicle_value(index: number, field: number): number;
  // Spaceflight (0.71.0): see editor_space_* and editor_set_spaceship.
  _editor_set_spaceship(index: number, heading: number, ...spec: number[]): void;
  _editor_space_value(field: number): number;
  _editor_space_member(index: number, site: number): void;
  _editor_space_body_hidden(hidden: number): void;
  _editor_set_wildlife(index: number, wary: number, flee: number, speed: number, leash: number): void;
  _editor_wildlife_state(index: number): number;
  _editor_push(index: number, dx: number, dz: number): void;
  _editor_space_body_value(index: number, field: number): number;
  _editor_space_frame(field: number): number;
  _editor_space_body_spin(index: number, field: number): number;
  _editor_planet_lava(index: number, x: number, y: number, z: number): number;
  _editor_planet_height(index: number, x: number, y: number, z: number): number;
  _editor_space_path(count: number, horizon: number): number;
  _editor_space_path_value(index: number, axis: number): number;
  _editor_space_ground(x: number, z: number): number;
  _editor_space_wet(x: number, z: number): number;
  _editor_take_weapon_events(): number;
  _editor_weapon_event(index: number, field: number): number;
  // Catch-all for text calls added from 0.59.0 on.
  ccall(
    name: string,
    returnType: "string" | "number" | null,
    argTypes: Array<"string" | "number">,
    args: Array<string | number>,
  ): any;
  _editor_set_collider(
    index: number,
    isTrigger: number,
    layer: number,
    mask: number,
    bounciness: number,
  ): void;
  // editor_set_script_source/editor_script_error/editor_seed_save/
  // editor_dirty_save_key/editor_dirty_save_value's own doc comments
  // (bridge.cpp) explain why these go through ccall instead of a direct
  // _editor_* binding like everything above: a Lua source string, an error
  // message, and a save key/value are text, which can't travel through the
  // all-double ABI the rest of this type uses. Exported via
  // -sEXPORTED_RUNTIME_METHODS=ccall in tools/build_editor.sh.
  ccall(
    name: "editor_set_script_source",
    returnType: null,
    argTypes: ["number", "string"],
    args: [number, string],
  ): void;
  ccall(
    name: "editor_script_error",
    returnType: "string",
    argTypes: ["number"],
    args: [number],
  ): string;
  ccall(
    name: "editor_seed_save",
    returnType: null,
    argTypes: ["string", "string"],
    args: [string, string],
  ): void;
  ccall(
    name: "editor_dirty_save_key",
    returnType: "string",
    argTypes: ["number"],
    args: [number],
  ): string;
  ccall(
    name: "editor_dirty_save_value",
    returnType: "string",
    argTypes: ["number"],
    args: [number],
  ): string;
  ccall(
    name: "editor_script_key",
    returnType: null,
    argTypes: ["string", "number"],
    args: [string, number],
  ): void;
  ccall(
    name: "editor_take_animation_request",
    returnType: "string",
    argTypes: ["number"],
    args: [number],
  ): string;
};
declare const createEditorRuntime: () => Runtime | Promise<Runtime>;
async function startEditor() {
  const doc = new EditorDocument(
    new LocalStorageSceneStore("game-engine-editor:command-scene:"),
  );
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `<header>
  <span class="brand"><span class="brand-mark" aria-hidden="true"></span><b>GAME ENGINE</b></span>
  <span class="brand-sub">BTAI Editor <span class="version">0.35.0</span></span>
  <a class="link-external" href="https://github.com/Islandyout/engine">View source${iconHtml("external")}</a>
</header>
<nav>
  <div class="btn-group">
    <button id="new" class="btn" title="New scene">${iconHtml("plus")}<span>New</span></button>
    <button id="save" class="btn" title="Save JSON">${iconHtml("save")}<span>Save</span></button>
    <label class="btn" title="Open JSON">${iconHtml("open")}<span>Open</span><input id="open" type="file" accept=".json" hidden></label>
  </div>
  <div class="btn-group">
    <button id="games" class="btn" title="Games library: engine games, your games folder, scenes saved in this browser">${iconHtml("cube")}<span>Games</span></button>
  </div>
  <div class="btn-group">
    <button id="undo" class="btn btn-icon" title="Undo" aria-label="Undo">${iconHtml("undo")}</button>
    <button id="redo" class="btn btn-icon" title="Redo" aria-label="Redo">${iconHtml("redo")}</button>
  </div>
  <div class="btn-group btn-group-transport">
    <button id="play" class="btn btn-icon btn-play" title="Play" aria-label="Play">${iconHtml("play")}</button>
    <button id="pause" class="btn btn-icon btn-pause" title="Pause" aria-label="Pause">${iconHtml("pause")}</button>
    <button id="stop" class="btn btn-icon btn-stop" title="Stop" aria-label="Stop">${iconHtml("stop")}</button>
  </div>
  <span id="document" class="doc-badge"></span>
</nav>
<main id="workspace">
  <aside id="panel-hierarchy" class="panel">
    <div class="panel-header">${iconHtml("cube")}<h2>Scene Hierarchy</h2></div>
    <div class="panel-body">
      <div class="search-box">${iconHtml("search")}<input id="search" placeholder="Search entities"></div>
      <div class="tools">
        <button id="add" class="btn btn-sm">${iconHtml("plus")}<span>Entity</span></button>
        <button id="duplicate" class="btn btn-sm">${iconHtml("copy")}<span>Duplicate</span></button>
        <button id="delete" class="btn btn-sm btn-danger-hover">${iconHtml("trash")}<span>Delete</span></button>
      </div>
      <div id="tree" class="tree" role="tree"></div>
    </div>
    <div class="panel-header panel-header-secondary"><h2>Runtime</h2></div>
    <div class="panel-body panel-body-secondary">
      <p id="runtime" class="status-line">Loading C++ WebAssembly…</p>
      <p class="hint">Editor: BTAI authoring<br>Preview: Three.js<br>Simulation: C++ World / FixedSystems</p>
    </div>
  </aside>
  <div class="resizer resizer-v" id="resize-left" role="separator" aria-orientation="vertical" aria-label="Resize hierarchy panel"></div>
  <section class="panel panel-viewport" id="panel-viewport">
    <div class="viewport-toolbar">
      <div class="btn-group" role="group" aria-label="Transform tool">
        <button id="translate" class="btn btn-sm" aria-pressed="true">${iconHtml("target")}<span>Move</span></button>
        <button id="rotate" class="btn btn-sm" aria-pressed="false"><span>Rotate</span></button>
        <button id="scale" class="btn btn-sm" aria-pressed="false"><span>Scale</span></button>
      </div>
      <select id="space" class="select-sm" aria-label="Transform space"><option value="world">World</option><option value="local">Local</option></select>
      <label class="snap-toggle"><input type="checkbox" id="snap"> Snap</label>
      <select id="snap-size" class="select-sm" aria-label="Move snap distance"><option value="0.25">0.25 m</option><option value="0.5">0.5 m</option><option value="1" selected>1 m</option></select>
      <button id="frame" class="btn btn-sm btn-ghost">${iconHtml("target")}<span>Frame selected</span></button>
      <button id="grid" class="btn btn-sm btn-ghost">${iconHtml("grid")}<span>Grid</span></button>
      <button id="stats" class="btn btn-sm btn-ghost" aria-pressed="false">${iconHtml("target")}<span>Stats</span></button>
      <span id="sculpt-bar" class="sculpt-bar" hidden>
        <select id="sculpt" class="select-sm" aria-label="Terrain sculpt tool">
          <option value="off">Sculpt: off</option><option value="raise">Raise</option><option value="lower">Lower</option><option value="smooth">Smooth</option><option value="flatten">Flatten</option>
        </select>
        <label class="sculpt-slider">Radius <input id="sculpt-radius" type="range" min="1" max="30" step="0.5" value="6" aria-label="Brush radius"></label>
        <label class="sculpt-slider">Strength <input id="sculpt-strength" type="range" min="0.05" max="2" step="0.05" value="0.5" aria-label="Brush strength"></label>
      </span>
      <span class="viewport-hint">Drag to orbit · right-drag to pan · scroll to zoom</span>
    </div>
    <div id="viewport"></div>
  </section>
  <div class="resizer resizer-v" id="resize-right" role="separator" aria-orientation="vertical" aria-label="Resize inspector panel"></div>
  <aside id="panel-inspector" class="panel">
    <div class="panel-header">${iconHtml("target")}<h2>Inspector</h2></div>
    <div id="inspector" class="panel-body">Select an entity.</div>
  </aside>
</main>
<div class="resizer resizer-h" id="resize-bottom" role="separator" aria-orientation="horizontal" aria-label="Resize bottom panel"></div>
<section class="dock" id="dock">
  <div class="dock-panel" id="dock-project">
    <div class="panel-header"><h2>Project / Content</h2></div>
    <div class="panel-body">
      <label class="field-row"><span>Project</span><input id="project" value="Untitled project" aria-label="Project name"></label>
      <div class="field-row">
        <select id="catalog-category" aria-label="Model category">
          ${catalogCategories
            .map((c) => `<option value="${c}">${c.charAt(0).toUpperCase()}${c.slice(1)}</option>`)
            .join("")}
        </select>
        <select id="catalog-model" aria-label="Model"></select>
      </div>
      <button id="catalog-add" class="btn btn-sm">${iconHtml("cube")}<span>Add from catalog</span></button>
      <p class="hint">${modelCatalog.length} bundled CC0 models · Aether kit + Quaternius</p>
      <a class="link-external" href="./ASSET-CREDITS.txt">Asset credits</a>
      <label class="btn btn-sm" id="import-label">${iconHtml("open")}<span>Import asset…</span>
        <input id="import-asset" type="file" multiple hidden aria-label="Import asset"
          accept=".glb,.png,.jpg,.jpeg,.webp,.gif,.ogg,.mp3,.wav,.m4a">
      </label>
      <p class="hint" id="import-hint">.glb models, images and audio · kept in this browser</p>
      <div class="field-row">
        <select id="prefab-select" aria-label="Prefab"></select>
      </div>
      <button id="prefab-place" class="btn btn-sm">${iconHtml("copy")}<span>Place instance</span></button>
      <p class="hint" id="prefab-hint">No prefabs yet — select an entity and use "Make prefab…" in the Inspector.</p>
    </div>
  </div>
  <div class="resizer resizer-v" id="resize-dock" role="separator" aria-orientation="vertical" aria-label="Resize console panel"></div>
  <div class="dock-panel" id="dock-console">
    <div class="panel-header"><h2>Authoring Console</h2></div>
    <div class="panel-body">
      <form id="command" class="command-row"><input id="json" aria-label="JSON command" placeholder='{"command":"list_entities"}'><button class="btn btn-sm">Execute</button></form>
      <pre id="log" role="log"></pre>
    </div>
  </div>
</section>
<footer id="status" data-mode="edit">Starting editor…</footer>`;
  function el<T extends HTMLElement = HTMLElement>(id: string) {
    return document.getElementById(id) as T;
  }
  function log(value: unknown) {
    el("log").textContent = JSON.stringify(value, null, 2);
  }
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
  hudText.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
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
  const shadowGround = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShadowMaterial({ opacity: 0.35 }),
  );
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
  function applyEnvironment(env: EnvironmentComponent) {
    const elevation = THREE.MathUtils.degToRad(env.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(env.sunAzimuth);
    sunDirection.set(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth),
    );
    sun.color.copy(colorOf(env.sunColor));
    sun.intensity = env.sunIntensity;
    sun.castShadow = env.shadows;
    shadowGround.visible = env.shadows;
    hemisphere.intensity = env.ambientIntensity;
    if (renderer instanceof THREE.WebGLRenderer) renderer.toneMappingExposure = env.exposure;
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
      runtime._editor_value(playerIndex, 0),
      runtime._editor_controller_value(playerIndex, 6),
      runtime._editor_value(playerIndex, 2),
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
    return (
      doc.mode !== "edit" &&
      playerController()?.mode === "FirstPerson" &&
      playerIndex >= 0 &&
      runtime._editor_alive(playerIndex) === 0
    );
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
    if (!rig.placed) {
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
    const desired = new THREE.Vector3(
      Math.sin(rig.yaw) * Math.cos(rig.pitch),
      Math.sin(rig.pitch),
      Math.cos(rig.yaw) * Math.cos(rig.pitch),
    )
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
  const composer =
    renderer instanceof THREE.WebGLRenderer ? new EffectComposer(renderer) : undefined;
  const renderPass = new RenderPass(scene, camera);
  // The camera the last frame rendered with: the editor camera, or a game
  // Camera entity during Play. HUD projection and WASD use the same one.
  let viewCamera: THREE.Camera = camera;
  let bloomPass: UnrealBloomPass | undefined;
  if (composer) {
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
  let crowdFrame = 0;
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
  function applyPostProcessing(settings: PostSettings) {
    postSettings = settings;
    if (bloomPass) {
      bloomPass.strength = settings.bloom;
      bloomPass.radius = settings.bloomRadius;
      bloomPass.threshold = settings.bloomThreshold;
    }
    if (renderer instanceof THREE.WebGLRenderer) renderer.toneMappingExposure *= settings.exposure;
    gradingPass.enabled = !!composer && gradingActive(settings);
    const uniforms = gradingPass.uniforms as Record<string, { value: number }>;
    uniforms.contrast!.value = settings.contrast;
    uniforms.saturation!.value = settings.saturation;
    uniforms.temperature!.value = settings.temperature;
    uniforms.vignette!.value = settings.vignette;
    uniforms.grain!.value = settings.grain;
    fxaaPass.enabled = !!composer && settings.antialias === "FXAA";
    smaaPass.enabled = !!composer && settings.antialias === "SMAA";
    if (composer && settings.ambientOcclusion && !gtaoPass) {
      // Created on first use: it allocates its own normal and AO targets.
      gtaoPass = new GTAOPass(scene, camera, viewport.clientWidth || 1, viewport.clientHeight || 1);
      composer.insertPass(gtaoPass, 1);
    }
    if (gtaoPass) {
      gtaoPass.enabled = settings.ambientOcclusion;
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
  }
  // Audio (0.64.0): every sound goes through the mixer's buses; world
  // sounds are positional and muffled behind solid geometry.
  let mixer: AudioMixer | undefined;
  function audioMixer(): AudioMixer {
    mixer ??= new AudioMixer(getAudioContext());
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
      audioMixer().occlusion &&
      runtime._editor_line_blocked(listenerPosition.x, listenerPosition.y, listenerPosition.z, point.x, point.y + 0.3, point.z) === 1;
    return sounds().at(audioMixer().source("sfx", point, { occluded, volume }).input);
  }
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
      const x = runtime._editor_value(playerIndex, 0),
        z = runtime._editor_value(playerIndex, 2);
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
      if (material) root.traverse((child) => child instanceof THREE.Mesh && applyMaterial(child, material));
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
      shooter === playerIndex && firstPerson()
        ? weaponFx.muzzleWorld(fps.camera, new THREE.Vector3())
        : origin.clone().addScaledVector(direction, 0.5);
    const finishShot = () => {
      if (pending && pending.hits === 0)
        weaponFx.tracer(
          muzzleOf(pending.shooter, pending.origin, pending.direction),
          pending.origin.clone().addScaledVector(pending.direction, 80),
        );
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
  function startDeath(
    anchor: THREE.Object3D,
    animState: AnimState | undefined,
  ): DeathState {
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
      const deathClip = [...animState.actions.keys()].find((name) =>
        ["death", "die"].includes(name.toLowerCase()),
      );
      if (deathClip) {
        const action = animState.actions.get(deathClip)!;
        const previous = animState.current
          ? animState.actions.get(animState.current)
          : undefined;
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
      child.material = Array.isArray(child.material)
        ? child.material.map(clone)
        : clone(child.material);
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
    const command = transformCommand(
      current.entity,
      current.mode,
      current.before,
      after,
    );
    queueMicrotask(() => {
      if (command) execute(command);
      rebuild();
    });
  });
  for (const mode of ["translate", "rotate", "scale"] as const)
    el(mode).onclick = () => {
      if (doc.mode !== "edit" || gizmo.dragging) return;
      gizmo.setMode(mode);
      for (const id of ["translate", "rotate", "scale"])
        el(id).setAttribute("aria-pressed", String(mode === id));
    };
  el<HTMLSelectElement>("space").onchange = () =>
    gizmo.setSpace(el<HTMLSelectElement>("space").value as "world" | "local");
  function configureSnap() {
    const enabled = el<HTMLInputElement>("snap").checked;
    gizmo.setTranslationSnap(
      enabled ? Number(el<HTMLSelectElement>("snap-size").value) : null,
    );
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
    return [
      { label: "(Automatic)", value: "" },
      ...clips.map((clip) => ({ label: clip.name, value: clip.name })),
    ];
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
      else
        loadSoundBuffer(sound.clip)?.then(play, (error) =>
          log(`Sound clip ${sound.clip} failed to load: ${String(error)}`),
        );
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
        [b.name, b.parent, b.orbitRadius, b.period, b.phase, b.inclination, b.radius, b.gravity, b.atmosphereHeight, b.atmosphereDensity, b.terrainAmplitude, b.terrainScale, b.seed],
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
    if (!space || !runtime._editor_space_value(35)) return;
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
    for (let i = 0; i < position.count; i++)
      position.setY(i, runtime._editor_space_ground(position.getX(i), position.getZ(i)) + 0.02);
    geometry.computeVertexNormals();
    spaceGround = new THREE.Mesh(geometry, new THREE.ShadowMaterial({ opacity: 0.4 }));
    spaceGround.receiveShadow = true;
    scene.add(spaceGround);
    if (spaceScatter) scene.remove(spaceScatter);
    spaceScatter = undefined;
    scatterTargets = [];
    if (!scatterModelsReady) return;
    const away = runtime._editor_space_value(37) === 1;
    // Plants and rocks keep clear of the active site's solid structures; the
    // quality preset thins them on weaker devices (the mobile governor).
    const activeSite = away ? runtime._editor_space_value(40) : -1;
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
    scene.add(spaceScatter);
    applyScatterDensity(governorTier().scatter);
    scatterPlacements = placed.map((p) => ({ x: p.x, y: p.y, z: p.z, key: p.species.id, kind: p.species.kind, scale: p.scale }));
    harvested.clear();
    explorerFx?.clearPrints();
    const kind = (k: string) => k[0]!.toUpperCase() + k.slice(1);
    scatterTargets = placed.map((p) => ({ key: p.species.id, name: p.species.name, kind: kind(p.species.kind), position: new THREE.Vector3(p.x, p.y + 0.4, p.z), range: 5 }));
  }
  function endSpaceView() {
    endExplorer();
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
    hemisphere.color.copy(spaceView.skyColor).lerp(new THREE.Color(1, 1, 1), 0.4).multiplyScalar(0.35 + 0.65 * day);
    scene.background = null;
    if (skyMesh) skyMesh.visible = false;
    scene.fog = spaceView.air > 0.02 ? new THREE.FogExp2(spaceView.skyColor.clone().multiplyScalar(day * 0.9), 6e-5 * spaceView.air) : null;
    if (playerIndex >= 0 && objects[playerIndex]) objects[playerIndex]!.visible = !spaceView.flight.piloting;
    // Warm light at sunrise and sunset.
    sun.color.setRGB(1, 1 - spaceView.sunset * 0.35, 1 - spaceView.sunset * 0.6);
    const frame = runtime._editor_space_value(38);
    if (frame !== spaceFrame) {
      spaceFrame = frame;
      rebuildSpaceFrame();
    }
    // Weather fog (0.73.0) thickens the haze.
    const fog = explorerFx?.weather.fog ?? 0;
    if (fog > 0.01) scene.fog = new THREE.FogExp2(spaceView.skyColor.clone().multiplyScalar(day * 0.8), 6e-5 * spaceView.air + fog * 0.012);
    updateExplorer(dt, view);
    // Only the active site's objects are here; the rest are elsewhere on
    // the planet (or another world).
    const activeSite = runtime._editor_space_value(37) === 1 ? runtime._editor_space_value(40) : -1;
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
    return new THREE.Quaternion(
      runtime._editor_space_frame(0),
      runtime._editor_space_frame(1),
      runtime._editor_space_frame(2),
      runtime._editor_space_frame(3),
    );
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
    const radius = runtime._editor_space_body_value(index, 3) + Math.max(runtime._editor_planet_height(index, dir.x, dir.y, dir.z), explorerBodies[index]?.sea ?? -1e9) + lift;
    return dir.multiplyScalar(radius).applyQuaternion(bodyQuaternion(index)).add(bodyCentre(index));
  }
  function frameToLatLon(index: number, p: THREE.Vector3) {
    const dir = p.clone().sub(bodyCentre(index)).applyQuaternion(bodyQuaternion(index).invert()).normalize();
    return { latitude: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))), longitude: THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)) };
  }
  function cue(name: string) {
    if (!audioContext) return;
    playCue(audioContext, audioMixer().buses.ui, name);
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
    else if (kind === "map") mapMode = text === "toggle" ? (mapMode === "off" ? "system" : mapMode === "system" ? "surface" : "off") : text === "system" || text === "surface" ? text : "off";
    else if (kind === "minimap") minimapAllowed = text !== "0";
    else if (kind === "catalogued") catalogued.add(text);
    else if (kind === "harvest") harvest(text);
    else if (kind === "scanner") {
      const [range = 1, time = 1, condition = 1] = text.split(/\s+/).map(Number);
      scanner.tuning.range = Number.isFinite(range) && range > 0 ? range : 1;
      scanner.tuning.time = Number.isFinite(time) && time > 0 ? time : 1;
      scanner.tuning.condition = Number.isFinite(condition) ? THREE.MathUtils.clamp(condition, 0, 1) : 1;
    } else if (kind === "sky_scan") scanner.skyKey = text;
    else if (kind === "dust" && explorerFx) {
      const [color = "#d8cfb8", density = "0.5"] = text.split(/\s+/);
      if (/^#[0-9a-fA-F]{6}$/.test(color)) explorerFx.dustColor.set(color);
      explorerFx.dustDensity = THREE.MathUtils.clamp(Number(density) || 0, 0, 1);
    } else if (kind === "soft") softGround = text !== "0";
    else if (kind === "audio") {
      const [layer = "", level = "0"] = text.split(/\s+/);
      if ((ambienceLayers as readonly string[]).includes(layer)) ambience?.set(layer as AmbienceLayer, Number(level));
    } else if (kind === "cue") cue(text);
    else if (kind === "announce") announcer.say(text);
    else if (kind === "settings") openPlayerSettings();
    else if (kind === "prospect") {
      // "label|range|key,key,..." -- empty to stop.
      const [label = "", range = "300", keys = ""] = text.split("|");
      prospect = label ? { label, range: Number(range) || 300, keys: new Set(keys.split(",").filter(Boolean)) } : undefined;
      if (!prospect) uiMarkers.delete("prospect");
    }
  }
  function openPlayerSettings() {
    openSettingsPanel(app, playerSettings, applyPlayerSettings, () => {
      profileCapture = { frames: [], until: performance.now() + 60000 };
      announcer.say("Profiling for 60 seconds");
    });
  }
  function applyPlayerSettings() {
    governor.reset(presetFloor(playerSettings.quality));
    applyGovernor();
    if (explorerFx) {
      explorerFx.reducedMotion = playerSettings.reducedMotion;
      explorerFx.footprints = playerSettings.footprints;
    }
    const wantTouch = doc.mode !== "edit" && (playerSettings.touch === "on" || (playerSettings.touch === "auto" && isTouchDevice()));
    if (wantTouch && !touchControls)
      touchControls = createTouchControls(app, (code, key, down) => {
        keyQueue.push([code, down ? 1 : 0]);
        if (down) heldKeys.add(code);
        else heldKeys.delete(code);
        if (key) {
          scriptKeyQueue.push([key, down ? 1 : 0]);
          if (down) heldScriptKeys.add(key);
          else heldScriptKeys.delete(key);
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
    harvested.add(best);
    const placement = scatterPlacements[best]!;
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
    uiEvent("harvested", key);
  }
  // Per frame while playing a SpaceSystem scene.
  function updateExplorer(dt: number, view: THREE.Camera) {
    if (!spaceView || !explorerFx) return;
    const player = playerIndex >= 0 ? objects[playerIndex] : undefined;
    const walking = !spaceView.flight.piloting;
    const moving = walking && playerIndex >= 0 && runtime._editor_controller_value(playerIndex, 4) > 0.5;
    explorerFx.update(dt, view, walking ? player : undefined, moving, (x, z) => runtime._editor_space_ground(x, z), softGround);
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
      explorerFx.splash(ship.position.clone().setY(runtime._editor_space_ground(ship.position.x, ship.position.z)), Math.ceil(dt * 160 * (1 - f.altitude / 25)), 4);
    if (ship) ship.position.y -= explorerFx.settleOffset();
    // Large minerals are solid: the walker is pushed back out of them.
    if (walking && player && playerIndex >= 0)
      for (const p of scatterPlacements) {
        if (p.kind !== "mineral" || p.scale < 1) continue;
        const dx = player.position.x - p.x, dz = player.position.z - p.z;
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
    const ref = runtime._editor_space_value(23), target = runtime._editor_space_value(29);
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
    const shipFrame = new THREE.Vector3(runtime._editor_space_value(1), runtime._editor_space_value(2), runtime._editor_space_value(3));
    const ship = shipFrame.clone().sub(star).applyQuaternion(inverse);
    const all = mapBodies();
    const bodies = all.filter((_, i) => !hidden(i));
    const visibleIndex = all.map((_, i) => i).filter((i) => !hidden(i));
    const reindexed = bodies.map((b) => ({ ...b, parent: b.parent >= 0 ? visibleIndex.indexOf(b.parent) : -1 }));
    const frameBody = runtime._editor_space_value(39);
    // Prospecting: the nearest matching deposit as a marker.
    if (prospect) {
      const me = playerIndex >= 0 ? objects[playerIndex] : undefined;
      let best: (typeof scatterPlacements)[number] | undefined, bestDistance = prospect.range;
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
          image = surfaceImage(256, 128, (x, y, z) => runtime._editor_planet_height(frameBody, x, y, z), body.terrainAmplitude, body.color, body.sea, body.snow);
          surfaceImages.set(frameBody, image);
        }
        const sites: MapSite[] = [...mapSites.values()].filter((s) => s.body === body.name);
        for (const landmark of spaceView.landmarks)
          if (landmark.body === frameBody) sites.push({ id: landmark.label, label: landmark.label, latitude: landmark.latitude, longitude: landmark.longitude, kind: "landmark" });
        for (const [id, w] of latLonWaypoints) if (w.body === body.name) sites.push({ id, label: w.label, latitude: w.latitude, longitude: w.longitude, kind: "waypoint" });
        const me = spaceView.flight.piloting ? shipFrame : (playerIndex >= 0 ? objects[playerIndex]?.position : undefined) ?? shipFrame;
        const at = frameToLatLon(frameBody, me);
        sites.push({ id: "you", label: "You", ...at, kind: spaceView.flight.piloting ? "ship" : "player" });
        drawSurface(ctx, 40, 60, hud.width - 80, hud.height - 120, image, sites, `${body.name.toUpperCase()} SURVEY MAP  ·  M: close`);
        lines.push(`MAP surface ${body.name}`);
      }
    } else if (playerSettings.minimap && minimapAllowed) {
      const size = Math.min(180, hud.height * 0.24);
      if (spaceView.flight.piloting && !spaceView.flight.landed) {
        // Flight: the reference body's neighbourhood.
        const ref = runtime._editor_space_value(23);
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
            const dx = p.x - me.position.x, dz = p.z - me.position.z;
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
      list.push({ key: scan.id || scan.name, name: scan.name, kind: scan.kind, position: object.position, range: scan.range, fleeing: runtime._editor_wildlife_state(i) === 2 });
    }
    for (const t of scatterTargets) list.push(t);
    for (const landmark of spaceView?.landmarks ?? [])
      list.push({ key: `landmark:${landmark.label}`, name: landmark.label, kind: "Landmark", position: landmark.anchor.getWorldPosition(new THREE.Vector3()), range: 70 });
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
  const aiStateNames: readonly AIStateName[] = [
    "Idle",
    "Walking",
    "Running",
    "Driving",
    "Fleeing",
    "Chasing",
    "Dead",
  ];
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
    // Keep Space/arrows from scrolling the page while a game has the keys --
    // unless the user is typing into a field.
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (!typing && (event.code === "Space" || event.code.startsWith("Arrow"))) event.preventDefault();
    keyQueue.push([event.code, 1]);
    heldKeys.add(event.code);
    const key = event.key.toLowerCase();
    scriptKeyByCode.set(event.code, key);
    scriptKeyQueue.push([key, 1]);
    heldScriptKeys.add(key);
  });
  window.addEventListener("keyup", (event) => {
    if (doc.mode === "edit") return;
    if (heldKeys.delete(event.code)) keyQueue.push([event.code, 0]);
    const key = scriptKeyByCode.get(event.code) ?? event.key.toLowerCase();
    scriptKeyByCode.delete(event.code);
    scriptKeyQueue.push([key, 0]);
    heldScriptKeys.delete(key);
  });
  window.addEventListener("blur", () => {
    if (doc.mode !== "edit") releaseHeldKeys();
  });
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
        if (value !== null)
          runtime.ccall(
            "editor_seed_save",
            null,
            ["string", "string"],
            [decodeURIComponent(fullKey.slice(prefix.length)), value],
          );
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
        p.x, p.y, p.z, v.x, v.y, v.z, s.x, s.y, s.z, isChild, isPlayer,
        isCollider, hpCurrent, hpMax, isVehicle, isAi, isPedestrian,
        colliderShape, colliderRadius, vehicleArchetype, pedestrianArchetype,
      )
    ) {
      runtime._editor_commit();
      throw new Error(
        "Runtime rejects coordinates/velocity outside ±1,000,000",
      );
    }
    // Mass/dynamic and trigger/layer/mask/bounciness: see editor_set_body
    // and editor_set_collider (bridge.cpp) for what each one means.
    const body = get("RigidBody");
    runtime._editor_set_body(
      index,
      body ? 1 : 0,
      body?.mass ?? 1,
      body?.dynamic === false ? 0 : 1,
    );
    if (collider)
      runtime._editor_set_collider(
        index,
        collider.isTrigger ? 1 : 0,
        collider.layer,
        collider.mask,
        collider.bounciness,
      );
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
    if (routine && !isChild && index >= 0)
      runtime.ccall("editor_set_routine", null, ["number", "string", "number"], [index, routine.stops, routine.speed]);
    const wildlife = get("Wildlife");
    if (wildlife && !isChild && index >= 0)
      runtime._editor_set_wildlife(index, wildlife.wary, wildlife.flee, wildlife.speed, wildlife.leash);
    // Weapons (0.61.0): see editor_set_weapons (bridge.cpp).
    const weapons = get("Weapons");
    if (weapons && !isChild) runtime.ccall("editor_set_weapons", null, ["number", "string"], [index, weapons.loadout]);
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
    if (collider && rotation && (rotation.x || rotation.y || rotation.z))
      runtime._editor_set_rotation(index, rotation.x, rotation.y, rotation.z);
    if (name !== undefined)
      runtime.ccall("editor_set_name", null, ["number", "string"], [index, name]);
    // editor_add's own all-double ABI has no way to carry a Lua source
    // string, so a scripted entity's source is set through this companion
    // call instead (see editor_set_script_source's own doc comment,
    // bridge.cpp) — same index editor_add just placed this entity at.
    const script = get("Script");
    if (script) {
      runtime.ccall(
        "editor_set_script_source",
        null,
        ["number", "string"],
        [index, script.source],
      );
      runtime.ccall(
        "editor_set_script_props",
        null,
        ["number", "string"],
        [index, encodeProps(reconcileProps(script.source, script.props))],
      );
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
  const tickSnapshotAlive = (i: number) =>
    tickSnapshot && i < tickSnapshot[0]! ? tickSnapshot[1 + i * 6] === 1 : runtime._editor_alive(i) === 1;
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
        x: runtime._editor_value(index, 0),
        y: runtime._editor_value(index, 1),
        z: runtime._editor_value(index, 2),
      };
      createEntityObject((type) =>
        type === "Transform"
          ? ({ position } as SceneComponents[typeof type])
          : components[type],
      );
      // Spawned scannables (0.73.0: wildlife a script releases) can be scanned too.
      if (components.Scannable) spawnedScans.set(index, components.Scannable);
    }
  }
  const spawnedScans = new Map<number, ScannableComponent>();
  // One Animator step for entity i: built-in parameters, events to the
  // entity's script, and a crossfade when the state changes.
  function runAnimator(
    i: number,
    state: AnimState,
    animator: AnimatorRuntime,
    speed: number,
    verticalSpeed: number,
    dt: number,
  ) {
    animator.set("speed", speed);
    animator.set("vy", verticalSpeed);
    animator.set("grounded", Math.abs(verticalSpeed) < 0.2);
    const clip = state.actions.get(animator.current.clip)?.getClip();
    const result = animator.step(dt, clip?.duration);
    for (const name of result.events)
      runtime.ccall("editor_script_notify", null, ["number", "string", "string"], [i, "on_anim_event", name]);
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
    // Flying: dragging looks around the ship (never steers it).
    if (spaceView?.flight.piloting && event.buttons & 3)
      spaceView.look(event.movementX * playerSettings.sensitivity, event.movementY * playerSettings.sensitivity * (playerSettings.invertY ? -1 : 1));
    // Right-drag looks around in first person without capturing the mouse.
    const controller = playerController();
    if (controller?.mode === "FirstPerson" && event.buttons & 2 && document.pointerLockElement !== renderer.domElement)
      applyMouseLook(fps.look, event.movementX, event.movementY, controller.lookSensitivity * playerSettings.sensitivity, controller.invertY !== playerSettings.invertY);
    const { x, y } = viewportPoint(event);
    pointerQueue.push(() => runtime._editor_input_mouse_move(x, y, event.movementX, event.movementY));
  });
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (doc.mode !== "play" || event.button > 2) return;
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
      applyMouseLook(fps.look, event.movementX, event.movementY, controller.lookSensitivity * playerSettings.sensitivity, controller.invertY !== playerSettings.invertY);
    pointerQueue.push(() => runtime._editor_input_mouse_move(0, 0, event.movementX, event.movementY));
  });
  function flushPointerInput() {
    for (const apply of pointerQueue) apply();
    pointerQueue.length = 0;
  }
  // Standard-mapping gamepad button index -> engine::GamepadButton.
  const gamepadButtonMap: Record<number, number> = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 9, 5: 10, 8: 4, 9: 6, 10: 7, 11: 8, 12: 11, 13: 12, 14: 13, 15: 14, 16: 5,
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
      }
      else if (kind === "ui_text") {
        uiTextOverrides.set(a, b);
        // Banners and objectives are read out to screen readers.
        if (a === "Banner" || a === "Objective") announcer.say(b);
      } else if (kind === "host") handleHost(a, b);
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
        else if (document.pointerLockElement) document.exitPointerLock();
      } else if (kind === "camera_shake") {
        shake.intensity = playerSettings.reducedMotion ? 0 : Math.max(0, Number(a) || 0);
        shake.duration = Math.max(0.01, Number(b) || 0.01);
        shake.remaining = shake.duration;
      }
      else if (kind === "anim_set" || kind === "anim_trigger") {
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
    uiMarkers.clear();
    uiValues.clear();
    uiVisibility.clear();
    draggingSlider = undefined;
    padSnapshot = undefined;
    pointerQueue.length = 0;
    runtime._editor_begin();
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
        (type) =>
          isSite && type === "Transform"
            ? ({ position: { x: 0, y: 0, z: 0 } } as SceneComponents[typeof type])
            : doc.scene.resolve(entity, type),
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
    if (!runtime._editor_commit())
      throw new Error("Runtime scene commit failed");
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
  function applyMaterial(mesh: THREE.Mesh, m: MaterialComponent) {
    const build = (base: THREE.Material): THREE.Material => {
      const standard =
        m.keepTextures && base !== material && base instanceof THREE.MeshStandardMaterial
          ? base.clone()
          : new THREE.MeshStandardMaterial();
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
    for (const created of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      materialOverrides.push(created);
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
  const terrainMeshes = new Map<
    number,
    { mesh: THREE.Mesh; params: TerrainParams; look: TerrainLook; offsets: Int16Array }
  >();
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
  function createEntityObject(
    get: <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined,
  ) {
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
        const actions = new Map(
          (armed?.lower ?? cached.clips).map((clip) => [clip.name, mixer.clipAction(clip)]),
        );
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
            action.setLoop(
              override!.looping ? THREE.LoopRepeat : THREE.LoopOnce,
              Infinity,
            );
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
    object.visible = renderable?.visible ?? true;
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
      const character = catalog?.animated && (get("AICombat") || get("CharacterController"));
      if (character && n.y > 1e-6) anchor.scale.setScalar(s.y / n.y);
      else
        anchor.scale.set(
          n.x > 1e-6 ? s.x / n.x : s.x,
          n.y > 1e-6 ? s.y / n.y : s.y,
          n.z > 1e-6 ? s.z / n.z : s.z,
        );
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
    if (light) anchor.add(createLight(light));
    // Every mesh casts and receives shadows; a Material component overrides
    // the surface (see applyMaterial).
    const materialOverride = get("Material");
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (materialOverride) applyMaterial(child, materialOverride);
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
    particleStates.push(particleState);
    deathStates.push(undefined);
  }
  function rebuild() {
    gizmo.detach();
    const environmentEntity = doc.scene.eachAlive().find((e) => doc.scene.effectiveHas(e, "Environment"));
    applyEnvironment(
      (environmentEntity && doc.scene.resolve(environmentEntity, "Environment")) ?? defaultEnvironment(),
    );
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
        if (catalogEntry(instance.model)?.category === "roads")
          minimapRoads.push({ x: at.x + instance.x, z: at.z + instance.z, size: 16 * instance.scale });
    }
    for (const object of objects) object.removeFromParent();
    objects.length = 0;
    terrainMeshes.clear();
    animStates.length = 0;
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
  function updatePanels() {
    updateSculptBar();
    gizmo.detach();
    populatePrefabSelect();
    for (const id of [
      "translate",
      "rotate",
      "scale",
      "space",
      "snap",
      "snap-size",
    ])
      (el(id) as HTMLButtonElement).disabled = doc.mode !== "edit";
    el("document").textContent =
      `${doc.project} / ${doc.name}${doc.dirty ? " • unsaved" : ""}`;
    el<HTMLButtonElement>("undo").disabled =
      !doc.canUndo || doc.mode !== "edit";
    el<HTMLButtonElement>("redo").disabled =
      !doc.canRedo || doc.mode !== "edit";
    const tree = el("tree");
    tree.replaceChildren();
    for (const entity of doc.scene.eachAlive()) {
      const name =
        doc.scene.resolve(entity, "Name")?.value ?? `Entity ${entity.index}`;
      if (
        !name
          .toLowerCase()
          .includes(el<HTMLInputElement>("search").value.toLowerCase())
      )
        continue;
      const button = document.createElement("button");
      button.className = "entity";
      // Keep the exact "↳ "/"□ " text prefix (not just a decorative icon):
      // it is part of this button's accessible name, matched verbatim by
      // the browser test suite (getByRole("button", { name: "□ ..." })).
      const hasParent = doc.scene.effectiveHas(entity, "Parent");
      button.append(
        iconEl(hasParent ? "child" : "cube", "icon-tree"),
        textSpan((hasParent ? "↳ " : "□ ") + name, "entity-name"),
      );
      if (doc.selection?.index === entity.index)
        button.classList.add("selected");
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
    const object =
      objects[doc.scene.eachAlive().findIndex((e) => e.index === entity.index)];
    if (object) {
      if (doc.mode === "edit") gizmo.attach(object);
      selection.setFromObject(object);
      selection.visible = true;
    }
    const header = document.createElement("div");
    header.className = "inspector-header";
    const name = document.createElement("input");
    name.value = doc.scene.resolve(entity, "Name")?.value ?? "Entity";
    name.setAttribute("aria-label", "Entity name");
    name.onchange = () =>
      execute({ command: "rename_entity", entity, name: name.value });
    const nameRow = document.createElement("label");
    nameRow.className = "field-row";
    nameRow.append(textSpan("Name"), name);
    header.append(nameRow);
    const parent = document.createElement("select");
    parent.setAttribute("aria-label", "Parent");
    parent.add(new Option("No parent", ""));
    for (const ref of doc.scene.eachAlive())
      if (ref.index !== entity.index)
        parent.add(
          new Option(
            doc.scene.resolve(ref, "Name")?.value ?? String(ref.index),
            String(ref.index),
          ),
        );
    parent.value = String(doc.scene.resolve(entity, "Parent")?.entity.index ?? "");
    parent.onchange = () =>
      execute({
        command: "reparent_entity",
        entity,
        parent:
          parent.value === ""
            ? null
            : doc.scene
                .eachAlive()
                .find((e) => e.index === Number(parent.value)),
      });
    const parentRow = document.createElement("label");
    parentRow.className = "field-row";
    parentRow.append(textSpan("Parent"), parent);
    header.append(parentRow);
    inspector.append(header);
    const prefabInstance = doc.scene.resolve(entity, "PrefabInstance");
    if (prefabInstance) {
      const banner = document.createElement("div");
      banner.className = "prefab-banner";
      banner.append(
        textSpan(`Instance of prefab "${prefabInstance.prefab}" — editing a shared component updates every instance.`),
      );
      const unlink = document.createElement("button");
      unlink.className = "btn btn-sm btn-ghost";
      unlink.textContent = "Unlink from prefab";
      unlink.onclick = () => execute({ command: "unlink_instance", entity });
      banner.append(unlink);
      inspector.append(banner);
    } else {
      const makePrefab = document.createElement("button");
      makePrefab.className = "btn btn-sm btn-ghost";
      makePrefab.textContent = "Make prefab…";
      makePrefab.onclick = () => {
        const name = prompt("Prefab name (used to place further instances):");
        if (name) execute({ command: "create_prefab", entity, name });
      };
      inspector.append(makePrefab);
    }
    for (const type of doc.scene.effectiveComponentNames(entity)) {
      if (type === "Parent" || type === "Name" || type === "PrefabInstance") continue;
      const section = document.createElement("details");
      section.className = "component-card";
      section.open = true;
      const legend = document.createElement("summary");
      legend.append(iconEl("cube", "icon-component"), textSpan(componentLabel(type), "component-title"));
      section.append(legend);
      // Generate fields from the component's serializable property shape; validation stays in authoring.
      const value = structuredClone(
        doc.scene.resolve(entity, type),
      ) as unknown as Record<string, unknown>;
      function fields(
        record: Record<string, unknown>,
        host: HTMLElement,
        prefix = "",
      ) {
        for (const [key, v] of Object.entries(record)) {
          if (v && typeof v === "object") {
            fields(v as Record<string, unknown>, host, prefix + key + ".");
            continue;
          }
          const label = document.createElement("label");
          const meta = propertyMetadata(type, prefix + key);
          label.textContent = meta.label ?? prefix + key;
          const dynamicOptions =
            type === "AnimationState" && prefix === "" && key === "clip"
              ? animationClipOptions(entity!)
              : undefined;
          const options = meta.options ?? dynamicOptions;
          if (options) {
            const choice = document.createElement("select");
            choice.setAttribute("aria-label", `${type}.${prefix}${key}`);
            for (const option of options)
              choice.add(new Option(option.label, String(option.value)));
            // A model with no clips loaded yet (still fetching, or not an
            // animated catalog entry at all) offers only "(Automatic)" --
            // disable rather than let a choice silently fail to apply.
            choice.disabled = dynamicOptions !== undefined && dynamicOptions.length === 1;
            choice.value = String(v);
            choice.onchange = () => {
              record[key] =
                typeof v === "number" ? Number(choice.value) : choice.value;
              execute({ command: "set_component", entity, type, value });
            };
            label.append(choice);
            host.append(label);
            continue;
          }
          if (meta.multiline) {
            label.className = "field-row-multiline";
            const textarea = document.createElement("textarea");
            textarea.setAttribute("aria-label", `${type}.${prefix}${key}`);
            textarea.className = "field-multiline";
            textarea.readOnly = meta.readOnly ?? false;
            textarea.value = String(v);
            textarea.onchange = () => {
              record[key] = textarea.value;
              execute({ command: "set_component", entity, type, value });
            };
            label.append(textarea);
            host.append(label);
            continue;
          }
          const input = document.createElement("input");
          input.setAttribute("aria-label", `${type}.${prefix}${key}`);
          input.type =
            typeof v === "number"
              ? "number"
              : typeof v === "boolean"
                ? "checkbox"
                : "text";
          input.step = meta.step ?? "any";
          input.readOnly = meta.readOnly ?? false;
          input.value = String(v);
          input.checked = v === true;
          input.onchange = () => {
            record[key] =
              typeof v === "number"
                ? Number(input.value)
                : typeof v === "boolean"
                  ? input.checked
                  : input.value;
            execute({ command: "set_component", entity, type, value });
          };
          label.append(input);
          host.append(label);
        }
      }
      fields(value, section);
      // The common path for playing a clip: right in the Renderable card,
      // next to the Model it belongs to, no separate "Add component ->
      // Animation (advanced)" detour needed -- that card (AnimationState)
      // still exists below when it's attached, for time/looping.
      if (type === "Renderable" && catalogEntry((value as { mesh: number }).mesh)?.animated) {
        const clipOptions = animationClipOptions(entity);
        const clipLabel = document.createElement("label");
        clipLabel.textContent = "Animation clip";
        const clipSelect = document.createElement("select");
        clipSelect.setAttribute("aria-label", "Renderable.animationClip");
        for (const option of clipOptions)
          clipSelect.add(new Option(option.label, String(option.value)));
        clipSelect.disabled = clipOptions.length === 1;
        clipSelect.value = doc.scene.resolve(entity, "AnimationState")?.clip ?? "";
        clipSelect.onchange = () => {
          const current = doc.scene.resolve(entity, "AnimationState") ?? {
            clip: "",
            time: 0,
            looping: true,
          };
          execute({
            command: "set_component",
            entity,
            type: "AnimationState",
            value: { ...current, clip: clipSelect.value },
          });
        };
        clipLabel.append(clipSelect);
        section.append(clipLabel);
      }
      const reset = document.createElement("button");
      reset.textContent = "Reset " + type;
      reset.onclick = () =>
        execute({
          command: "set_component",
          entity,
          type,
          value: defaultComponent(type),
        });
      section.append(reset);
      const remove = document.createElement("button");
      remove.className = "btn btn-sm btn-ghost btn-danger-hover";
      remove.append(iconEl("trash"), textSpan("Remove " + type));
      remove.onclick = () =>
        execute({ command: "remove_component", entity, type });
      section.append(remove);
      inspector.append(section);
    }
    const add = document.createElement("select");
    add.setAttribute("aria-label", "Add component");
    add.add(new Option("Add component…", ""));
    // Grouped by componentGroups (PropertyMetadata.ts) so components that
    // only make sense together (AIState/Pedestrian, Player/Vehicle,
    // Renderable/AnimationState, the movement-and-collision chain) stay next
    // to each other instead of one flat, alphabetical-ish list of 16.
    for (const group of componentGroups) {
      const available = group.types.filter(
        (type) => !doc.scene.effectiveHas(entity, type as keyof SceneComponents),
      );
      if (available.length === 0) continue;
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      for (const type of available) optgroup.append(new Option(componentLabel(type), type));
      add.add(optgroup);
    }
    add.onchange = () => {
      if (add.value)
        execute({ command: "attach_component", entity, type: add.value });
    };
    inspector.append(add);
    for (const input of inspector.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >("input,select,button"))
      input.disabled = doc.mode !== "edit";
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
  el("delete").onclick = () =>
    execute({ command: "destroy_entity", entity: doc.selection });
  el("undo").onclick = () => {
    doc.undo();
    rebuild();
  };
  el("redo").onclick = () => {
    doc.redo();
    rebuild();
  };
  el("new").onclick = () => {
    if (
      doc.mode === "edit" &&
      (!doc.dirty || confirm("Discard unsaved scene?"))
    ) {
      doc.load({ format: 1, entities: [] });
      rebuild();
    }
  };
  el<HTMLInputElement>("search").oninput = updatePanels;
  el<HTMLInputElement>("project").onchange = () => {
    doc.project = el<HTMLInputElement>("project").value;
    updatePanels();
  };
  el("save").onclick = () => {
    const text = JSON.stringify(doc.save(), null, 2);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
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
  el("play").onclick = () => {
    try {
      if (doc.mode === "edit") {
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
        for (const animator of animators)
          if (animator) animator.runtime = new AnimatorRuntime(animator.graph);
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
        doc.mode = "play";
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
    if (document.pointerLockElement) document.exitPointerLock();
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
    sculptRay.setFromCamera(
      new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1),
      camera,
    );
    const hit = sculptRay.intersectObject(terrainMeshes.get(index)!.mesh, false)[0];
    return hit ? objects[index]!.worldToLocal(hit.point.clone()) : undefined;
  }
  let sculptStroke: { index: number; entity: EntityRef } | undefined;
  function sculptDab(event: PointerEvent) {
    if (!sculptStroke) return;
    const point = terrainPoint(event, sculptStroke.index);
    const live = terrainMeshes.get(sculptStroke.index);
    if (!point || !live) return;
    applyBrush(
      live.params,
      live.offsets,
      sculptTool.value as BrushMode,
      point.x,
      point.z,
      Number(sculptRadius.value),
      Number(sculptStrength.value) * 0.2,
    );
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
      imported.push(
        kind === "image" ? `${file.name} (use asset:${file.name})` : `${file.name} (${kind} ${asset.id})`,
      );
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
      `Governor     tier ${governorTier() === governor.settings ? governor.tier : governor.floor} (${(governorTier().scale * 100).toFixed(0)}% res)`,
      `Triangles    ${info?.render.triangles ?? "-"}`,
      `Entities     ${doc.scene.entityCount} (+${Math.max(0, objects.length - doc.scene.eachAlive().length)} spawned)`,
      ...(systems.length ? ["Systems (last tick):", ...systems] : []),
    ].join("\n");
    stats.frames = 0;
    stats.frameMs = 0;
    stats.tickMs = 0;
    stats.since = now;
  }
  el("grid").onclick = () => {
    grid.visible = !grid.visible;
  };
  el("frame").onclick = () => {
    if (doc.selection) {
      const object =
        objects[
          doc.scene
            .eachAlive()
            .findIndex((e) => e.index === doc.selection!.index)
        ];
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
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(objects, true)[0];
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
        if (doc.scene.effectiveHas(entity, "Player") && doc.scene.effectiveHas(entity, "Weapons"))
          meshIds.add(firstPersonBodyFallback);
      }
      await Promise.all(
        [...meshIds].map((id) =>
          loadCatalogModel(id)?.catch((error) =>
            log(`Catalog model ${id} failed to load: ${String(error)}`),
          ),
        ),
      );
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
    state.current.set(runtime._editor_value(i, 0), runtime._editor_value(i, 1), runtime._editor_value(i, 2));
    // Soldiers face where they look; cars along their heading.
    state.currentYaw =
      runtime._editor_soldier_value(i, 0) >= 0 ? runtime._editor_soldier_value(i, 1) : runtime._editor_value(i, 4);
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
    if (spaceView) spaceView.chunkMs = tier.chunkMs;
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
      for (const [code, down] of keyQueue)
        runtime.ccall("editor_input_key", null, ["string", "number"], [code, down]);
      keyQueue.length = 0;
      flushPointerInput();
      pollGamepad();
      const controller = playerController();
      if (controller?.mode === "FirstPerson" && padSnapshot)
        applyStickLook(fps.look, padSnapshot.axes[2] ?? 0, padSnapshot.axes[3] ?? 0, dt, controller.lookSensitivity, controller.invertY);
      for (const [key, down] of scriptKeyQueue)
        runtime.ccall("editor_script_key", null, ["string", "number"], [key, down]);
      scriptKeyQueue.length = 0;
      accumulator += dt;
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
          const state = (deathStates[i] ??= startDeath(object, animStates[i]));
          state.elapsed += dt;
          const progress = Math.max(0, 1 - state.elapsed / deathFadeDuration);
          for (const { material, baseOpacity } of state.materials)
            material.opacity = baseOpacity * progress;
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
          object.rotation.y = runtime._editor_value(i, 4);
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
        player.scale.set(
          playerBaseScale.x * (1 - stretch * 0.5),
          playerBaseScale.y * (1 + stretch),
          playerBaseScale.z * (1 - stretch * 0.5),
        );
      }
      if (steps > 0 && player) playerPrevY = player.position.y;
      const projectileCount = runtime._editor_projectile_count();
      while (projectileMeshes.length < projectileCount)
        scene.add(
          (projectileMeshes[projectileMeshes.length] = new THREE.Mesh(
            projectileGeometry,
            projectileMaterial,
          )),
        );
      while (projectileMeshes.length > projectileCount)
        scene.remove(projectileMeshes.pop()!);
      projectileMeshes.forEach((mesh, i) =>
        mesh.position.set(
          runtime._editor_projectile_value(i, 0),
          runtime._editor_projectile_value(i, 1),
          runtime._editor_projectile_value(i, 2),
        ),
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
    animStates.forEach((state, i) => {
      if (!state) return;
      const object = objects[i];
      if (stride > 1 && object && object.position.distanceToSquared(eye) > crowdNear * crowdNear) {
        state.skipped = (state.skipped ?? 0) + dt;
        if ((crowdFrame + i) % stride !== 0) return;
        state.mixer.update(state.skipped);
        state.skipped = 0;
        return;
      }
      state.mixer.update(dt + (state.skipped ?? 0));
      state.skipped = 0;
    });
    // Same reasoning as mixers above -- a Particles emitter is as "always on"
    // as a Light, not gated to Play mode like Script/Sound.
    particleScale.value = viewport.clientHeight / 2;
    particleStates.forEach((state) => state && stepParticles(state, dt));
    stepTrails(dt);
    // Ground-speed clip selection runs on the fixed-step cadence (steps/60),
    // not every render frame — see groundSpeed()'s own comment for why.
    if (doc.mode === "play" && steps > 0) {
      const tickDt = steps / 60;
      const entities = doc.scene.eachAlive();
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
          const diff = Math.atan2(
            Math.sin(targetYaw - object.rotation.y),
            Math.cos(targetYaw - object.rotation.y),
          );
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
        const clipName =
          sitClip ?? (overridden ? override!.clip : pickClipName([...state.actions.keys()], speed));
        if (clipName && clipName !== state.current) {
          const next = state.actions.get(clipName);
          const previous = state.current
            ? state.actions.get(state.current)
            : undefined;
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
    if (gradingPass.enabled) (gradingPass.uniforms as Record<string, { value: number }>).time!.value = (now / 1000) % 100;
    // Counted over every pass of the frame (bloom included), not just the
    // last one, for the Stats overlay's draw calls and triangles.
    if (renderer instanceof THREE.WebGLRenderer) {
      renderer.info.autoReset = false;
      renderer.info.reset();
    }
    if (composer) composer.render();
    else renderer.render(scene, viewCamera);
    drawHud();
    updateStats(performance.now() - frameStart, tickMs);
    const status = el("status");
    status.dataset.mode = doc.mode;
    const playerReadout =
      doc.mode === "play" && player
        ? ` · Player (${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})`
        : "";
    // Text companion to the HUD's own bar for whatever's selected — lets a
    // precise numeric value (or the "defeated" transition) be read/watched
    // without eyeballing bar width in the viewport.
    const selectedIndex = doc.selection
      ? doc.scene.eachAlive().findIndex((e) => e.index === doc.selection!.index)
      : -1;
    const selectedHealthReadout =
      doc.mode === "play" &&
      selectedIndex >= 0 &&
      doc.scene.effectiveHas(doc.selection!, "Health")
        ? runtime._editor_alive(selectedIndex)
          ? ` · Selected health: ${Math.round(runtime._editor_value(selectedIndex, 3) * 100)}%`
          : " · Selected: defeated"
        : "";
    // A live companion to selectedHealthReadout for an AIState entity: field 5 is
    // AIAgent.state as a plain int matching aiStateNames' own order (bridge.cpp's
    // editor_value doc comment) — watch an NPC's wander/chase/flee decisions and
    // position tick by tick without eyeballing the viewport.
    const selectedAiReadout =
      doc.mode === "play" &&
      selectedIndex >= 0 &&
      doc.scene.effectiveHas(doc.selection!, "AIState") &&
      runtime._editor_alive(selectedIndex)
        ? ` · Selected AI: ${aiStateNames[runtime._editor_value(selectedIndex, 5)] ?? "Idle"} (${runtime._editor_value(selectedIndex, 0).toFixed(1)}, ${runtime._editor_value(selectedIndex, 2).toFixed(1)})`
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
  const uiImages = new Map<string, HTMLImageElement>();
  const css = (c: Vec3, alpha: number) =>
    `rgba(${Math.round(c.x * 255)}, ${Math.round(c.y * 255)}, ${Math.round(c.z * 255)}, ${alpha})`;
  function uiImage(url: string) {
    let image = uiImages.get(url);
    if (!image) {
      image = new Image();
      image.src = url;
      uiImages.set(url, image);
    }
    return image;
  }
  // Paints one UI element in its box. Text and Button look exactly as they
  // did before layout options existed when those options are left default.
  // A Text element's lines: "\n" breaks, then word wrap within `width` (0: none).
  function textLines(text: string, width: number): string[] {
    const out: string[] = [];
    for (const paragraph of text.split("\n")) {
      if (!(width > 0) || hudCtx.measureText(paragraph).width <= width) {
        out.push(paragraph);
        continue;
      }
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (line && hudCtx.measureText(next).width > width) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  function drawUIElement(ui: UIComponent, rect: UIRect, value: number) {
    const { left, top, width, height } = rect;
    const label = (x: number, y: number, align: CanvasTextAlign) => {
      hudCtx.textAlign = align;
      hudCtx.textBaseline = "middle";
      hudCtx.lineWidth = 3;
      hudCtx.strokeStyle = "rgba(10, 16, 24, 0.85)";
      hudCtx.strokeText(ui.text, x, y);
      hudCtx.fillStyle = "#eaf6ff";
      hudCtx.fillText(ui.text, x, y);
    };
    switch (ui.kind) {
      case "Text": {
        // A stroke outline instead of a backdrop -- legible over any scene.
        // Lines break at "\n" and wrap to the authored width (0.73.0); the
        // authored colour is used unless it's the dark default.
        hudCtx.textAlign = "left";
        hudCtx.textBaseline = "top";
        hudCtx.lineWidth = 3;
        hudCtx.strokeStyle = "rgba(10, 16, 24, 0.85)";
        const dark = ui.color.x === 0.118 && ui.color.y === 0.165 && ui.color.z === 0.22;
        hudCtx.fillStyle = dark ? "#eaf6ff" : css(ui.color, Math.max(ui.opacity, 0.35));
        const lineHeight = Math.round(ui.fontSize * 1.3);
        textLines(ui.text, ui.width).forEach((line, i) => {
          hudCtx.strokeText(line, left, top + i * lineHeight);
          hudCtx.fillText(line, left, top + i * lineHeight);
        });
        return;
      }
      case "Button":
      case "Panel":
        hudCtx.fillStyle = css(ui.color, ui.opacity);
        hudCtx.fillRect(left, top, width, height);
        hudCtx.strokeStyle = "rgba(140, 190, 220, 0.6)";
        hudCtx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
        if (ui.text) {
          // A Button's label is centered; a Panel's is its title.
          hudCtx.fillStyle = "#eaf6ff";
          hudCtx.textAlign = "center";
          hudCtx.textBaseline = "middle";
          hudCtx.fillText(ui.text, left + width / 2, ui.kind === "Button" ? top + height / 2 : top + 8 + ui.fontSize / 2);
        }
        return;
      case "Image": {
        const imageUrl = resolveAssetUrl(ui.image, importedImages);
        const image = imageUrl ? uiImage(imageUrl) : undefined;
        hudCtx.globalAlpha = ui.opacity;
        if (image?.complete && image.naturalWidth > 0) hudCtx.drawImage(image, left, top, width, height);
        else {
          hudCtx.fillStyle = css(ui.color, 1);
          hudCtx.fillRect(left, top, width, height);
        }
        hudCtx.globalAlpha = 1;
        if (ui.text) label(left + width / 2, top + height / 2, "center");
        return;
      }
      case "Bar":
      case "Slider": {
        hudCtx.fillStyle = "rgba(10, 16, 24, 0.75)";
        hudCtx.fillRect(left, top, width, height);
        hudCtx.fillStyle = css(ui.kind === "Bar" && ui.color.x === 0.118 ? { x: 0.3, y: 0.69, z: 0.31 } : ui.color, 1);
        hudCtx.fillRect(left, top, width * value, height);
        if (ui.kind === "Slider") {
          hudCtx.fillStyle = "#eaf6ff";
          hudCtx.fillRect(left + width * value - 3, top - 2, 6, height + 4);
        }
        if (ui.text) label(left + width / 2, top + height / 2, "center");
        return;
      }
      case "Toggle": {
        const box = Math.min(height, ui.fontSize + 8);
        hudCtx.fillStyle = css(ui.color, ui.opacity);
        hudCtx.fillRect(left, top, box, box);
        hudCtx.strokeStyle = "rgba(140, 190, 220, 0.8)";
        hudCtx.strokeRect(left + 0.5, top + 0.5, box - 1, box - 1);
        if (value >= 0.5) {
          hudCtx.fillStyle = "#7fd4ff";
          hudCtx.fillRect(left + 4, top + 4, box - 8, box - 8);
        }
        if (ui.text) label(left + box + 8, top + box / 2, "left");
        return;
      }
    }
  }
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
    if (weaponCount > 0 || runtime._editor_value(playerIndex, 3) >= 0) {
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
        health: runtime._editor_value(playerIndex, 3),
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
      const health = runtime._editor_value(playerIndex, 3);
      if (health >= 0) lines.push(`Health ${Math.round(health * 100)}`);
      return lines;
    }
    hudCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    hudCtx.lineWidth = 2;
    hudCtx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
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
  function drawHud() {
    hudCtx.clearRect(0, 0, hud.width, hud.height);
    uiButtonHits.length = 0;
    const hudLines: string[] = [];
    if (doc.mode === "play")
      doc.scene.eachAlive().forEach((entity, index) => {
        if (!doc.scene.effectiveHas(entity, "Health")) return;
        if (!runtime._editor_alive(index)) return;
        if (index === playerIndex && firstPerson()) return; // no bar over your own head
        const object = objects[index];
        if (!object) return;
        const ratio = runtime._editor_value(index, 3);
        if (ratio < 0) return;
        // In first person a bar is feedback on your own hits, not a radar:
        // only damaged targets within 40 m get one.
        if (firstPerson() && (ratio >= 1 || object.position.distanceTo(viewCamera.position) > 40)) return;
        const scaleY = doc.scene.resolve(entity, "Scale")?.value.y ?? 1;
        hudScratch.copy(object.position);
        hudScratch.y += scaleY / 2 + 0.35;
        hudScratch.project(viewCamera);
        if (hudScratch.z > 1) return; // behind the camera
        const x = ((hudScratch.x + 1) / 2) * hud.width;
        const y = ((1 - hudScratch.y) / 2) * hud.height;
        const barWidth = 40,
          barHeight = 5;
        hudCtx.fillStyle = "rgba(10, 16, 24, 0.75)";
        hudCtx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight);
        hudCtx.fillStyle =
          ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#ffb300" : "#e53935";
        hudCtx.fillRect(
          x - barWidth / 2,
          y - barHeight / 2,
          barWidth * Math.max(0, Math.min(1, ratio)),
          barHeight,
        );
      });
    if (doc.mode !== "edit") {
      drawSoldierMarkers();
      drawWaypoints();
    }
    if (firstPerson()) hudLines.push(...drawFirstPersonOverlay());
    // Scanner reticle (0.72.0).
    if (doc.mode === "play" && (scannableIndices.length || scatterTargets.length)) {
      const text = scanner.draw(hudCtx, hud.width, hud.height, scanHeld());
      if (text) hudLines.push(text);
    }
    // Flight HUD (0.71.0).
    if (doc.mode !== "edit" && spaceView) {
      const ship = shipIndex >= 0 ? objects[shipIndex] : undefined;
      const me = playerIndex >= 0 ? objects[playerIndex] : undefined;
      const nearShip =
        !!ship && !!me && !spaceView.flight.piloting && spaceView.flight.landed && me.position.distanceTo(ship.position) < 9;
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
      if (!authoredUi) continue;
      const uiName = doc.scene.resolve(entity, "Name")?.value ?? "";
      const playing = doc.mode !== "edit";
      const override = playing ? uiTextOverrides.get(uiName) : undefined;
      const ui = override === undefined ? authoredUi : { ...authoredUi, text: override };
      if (ui.visibleWhen === "play" && doc.mode !== "play") continue;
      if (ui.visibleWhen === "pause" && doc.mode !== "pause") continue;
      if (playing && uiVisibility.get(uiName) === false) continue;
      const value = playing ? (uiValues.get(uiName) ?? ui.value) : ui.value;
      hudCtx.font = `600 ${ui.fontSize}px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif`;
      let auto = autoSize(ui.kind, ui.text ? hudCtx.measureText(ui.text).width : 0, ui.fontSize);
      if (ui.kind === "Text" && ui.text) {
        const lines = textLines(ui.text, ui.width);
        auto = {
          width: Math.max(...lines.map((l) => hudCtx.measureText(l).width)),
          height: lines.length * Math.round(ui.fontSize * 1.3),
        };
      }
      const rect = layoutRect(
        ui.anchor,
        hud.width,
        hud.height,
        ui.width || auto.width,
        ui.height || auto.height,
        ui.offsetX,
        ui.offsetY,
      );
      drawUIElement(ui, rect, value);
      // Clickable only outside Edit mode -- see UIComponent's own doc
      // comment (Components.ts) for why authoring a scene must never be
      // able to accidentally trigger a Button's command.
      if (playing && (ui.kind === "Button" || ui.kind === "Slider" || ui.kind === "Toggle"))
        uiButtonHits.push({ ...rect, kind: ui.kind, name: uiName, action: ui.action, value });
      if (ui.text) hudLines.push(ui.text);
      if (ui.kind === "Bar" || ui.kind === "Slider" || ui.kind === "Toggle")
        hudLines.push(`${uiName || ui.kind}=${Math.round(value * 100) / 100}`);
    }
    const hudSummary = hudLines.join(" · ");
    if (hudText.textContent !== hudSummary) hudText.textContent = hudSummary;
  }
  requestAnimationFrame(frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent =
    "Editor failed: " + String(error);
});

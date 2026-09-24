import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  transformCommand,
  type TransformMode,
  type TransformSnapshot,
} from "./TransformEdit";
import type { AIStateName, EntityRef, ParticlePreset, UIAction, UIAnchor, Vec3 } from "../scene/Components";
import { propertyMetadata, componentLabel, componentGroups } from "./PropertyMetadata";
import { defaultComponent } from "../authoring/CommandInterpreter";
import { CanvasRenderer } from "./CanvasRenderer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
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
// Hard cap on one emitter's point-buffer size regardless of authored
// rate/lifetime, so an unreasonable value (e.g. rate 5000) degrades to
// dropped spawns past this cap instead of an unbounded GPU buffer.
const MAX_PARTICLES = 400;

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
  _editor_input_begin_frame(): void;
  _editor_set_camera_forward(x: number, z: number): void;
  _editor_key(code: number, down: number): void;
  _editor_projectile_count(): number;
  _editor_projectile_value(index: number, field: number): number;
  _editor_take_dirty_saves(): number;
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101a26");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(8, 7, 10);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xd8eeff, 0x405036, 3));
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(4, 8, 5);
  scene.add(sun);
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
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.85);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const objects: THREE.Object3D[] = [];
  interface AnimState {
    mixer: THREE.AnimationMixer;
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
  }
  // Parallel to `objects`; index i holds the animation state for objects[i], or
  // undefined for a non-animated (static) entity. Reset alongside objects on every rebuild().
  const animStates: (AnimState | undefined)[] = [];
  interface ParticleState {
    points: THREE.Points;
    positions: Float32Array;
    colors: Float32Array;
    velocities: Float32Array;
    ages: Float32Array;
    alive: Uint8Array;
    capacity: number;
    emitAccumulator: number;
    rate: number;
    lifetime: number;
    baseColor: THREE.Color;
    direction: THREE.Vector3;
    spread: number;
    gravity: number;
    speed: number;
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
  // A fresh THREE.Points system per rebuild(), same as every mesh/light here
  // -- nothing caches or reuses one, so there's nothing extra to dispose when
  // the entity's Particles is removed or edited. Capacity is sized from
  // rate*lifetime (how many particles are alive at once in steady state)
  // with a 1.5x safety margin, capped at MAX_PARTICLES. Positions/velocities
  // live in entity-local space -- the system is parented under `anchor` in
  // rebuild(), same as a Light, so particles inherit the entity's own
  // position/rotation for free. Renders additively (depthWrite off) and
  // fades a particle by darkening its own color toward black as it ages,
  // rather than a separate per-vertex alpha channel or a custom shader --
  // fully-aged black contributes nothing once additively blended.
  function createParticles(particles: {
    preset: ParticlePreset;
    color: Vec3;
    rate: number;
    lifetime: number;
    speed: number;
    size: number;
  }): ParticleState {
    const capacity = Math.min(
      MAX_PARTICLES,
      Math.max(4, Math.ceil(particles.rate * particles.lifetime * 1.5)),
    );
    const positions = new Float32Array(capacity * 3);
    // Every slot starts fully black (invisible once additively blended) until
    // stepParticles() spawns into it -- no separate "is this slot in use for
    // rendering" flag needed on the GPU side, just `alive` on the CPU side.
    const colors = new Float32Array(capacity * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: particles.size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const preset = PARTICLE_PRESETS[particles.preset];
    const points = new THREE.Points(geo, material);
    // Positions start (and, for a slot awaiting its next spawn, stay) at the
    // local origin, so the very first automatic frustum-cull check computes
    // and caches a near-zero bounding sphere -- three.js never recomputes it
    // as particles move, so a stale sphere would wrongly cull the whole
    // system once particles spread beyond it while the entity itself is
    // off-frustum. Disabling culling is the standard fix for a dynamic point
    // cloud like this rather than recomputing bounds every frame.
    points.frustumCulled = false;
    return {
      points,
      positions,
      colors,
      velocities: new Float32Array(capacity * 3),
      ages: new Float32Array(capacity),
      alive: new Uint8Array(capacity),
      capacity,
      emitAccumulator: 0,
      rate: particles.rate,
      lifetime: particles.lifetime,
      baseColor: new THREE.Color(particles.color.x, particles.color.y, particles.color.z),
      direction: preset.direction,
      spread: preset.spread,
      gravity: preset.gravity,
      speed: particles.speed,
    };
  }
  const particleSpawnScratch = new THREE.Vector3();
  // Advances one emitter by dt: accumulates fractional spawns from `rate`
  // (so e.g. rate=0.5 spawns a particle every other call, not every call at
  // half strength), ages and moves every alive particle, and reclaims a slot
  // the instant it expires. A spawn with no free slot is silently dropped,
  // not queued or forced -- a saturated pool caps at `capacity` particles on
  // screen rather than bursting past it.
  function stepParticles(state: ParticleState, dt: number) {
    // Ages/moves particles that were already alive *before* this call, then
    // spawns new ones after -- not the other way around. A particle spawned
    // this frame gets age 0 and isn't touched again until the next call, so
    // it always renders for at least one full frame before it can expire;
    // aging-then-spawning in the same pass would otherwise immediately kill
    // (and blacken) any particle whose authored lifetime is at or below one
    // frame's dt, before the renderer ever draws it.
    for (let i = 0; i < state.capacity; i++) {
      if (!state.alive[i]) continue;
      const age = state.ages[i]! + dt;
      state.ages[i] = age;
      if (age >= state.lifetime) {
        state.alive[i] = 0;
        state.colors[i * 3] = state.colors[i * 3 + 1] = state.colors[i * 3 + 2] = 0;
        continue;
      }
      const vx = state.velocities[i * 3]!;
      const vy = state.velocities[i * 3 + 1]! + state.gravity * dt;
      const vz = state.velocities[i * 3 + 2]!;
      state.velocities[i * 3 + 1] = vy;
      state.positions[i * 3] = state.positions[i * 3]! + vx * dt;
      state.positions[i * 3 + 1] = state.positions[i * 3 + 1]! + vy * dt;
      state.positions[i * 3 + 2] = state.positions[i * 3 + 2]! + vz * dt;
      const remaining = 1 - age / state.lifetime;
      state.colors[i * 3] = state.baseColor.r * remaining;
      state.colors[i * 3 + 1] = state.baseColor.g * remaining;
      state.colors[i * 3 + 2] = state.baseColor.b * remaining;
    }
    state.emitAccumulator += dt * state.rate;
    while (state.emitAccumulator >= 1) {
      state.emitAccumulator -= 1;
      let slot = -1;
      for (let i = 0; i < state.capacity; i++) {
        if (!state.alive[i]) {
          slot = i;
          break;
        }
      }
      if (slot === -1) break;
      state.alive[slot] = 1;
      state.ages[slot] = 0;
      particleSpawnScratch
        .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize()
        .lerp(state.direction, 1 - state.spread)
        .normalize()
        .multiplyScalar(state.speed);
      state.velocities[slot * 3] = particleSpawnScratch.x;
      state.velocities[slot * 3 + 1] = particleSpawnScratch.y;
      state.velocities[slot * 3 + 2] = particleSpawnScratch.z;
      state.positions[slot * 3] = 0;
      state.positions[slot * 3 + 1] = 0;
      state.positions[slot * 3 + 2] = 0;
      // Full brightness immediately, not left at whatever this reclaimed
      // slot's color was (0, from the aging loop above zeroing a particle
      // out the instant it dies) -- this spawn won't reach the aging loop
      // until next call, so without this it would render invisible for its
      // first frame instead of at age 0.
      state.colors[slot * 3] = state.baseColor.r;
      state.colors[slot * 3 + 1] = state.baseColor.g;
      state.colors[slot * 3 + 2] = state.baseColor.b;
    }
    state.points.geometry.attributes.position!.needsUpdate = true;
    state.points.geometry.attributes.color!.needsUpdate = true;
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
        const nativeSize = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
        const cached = { scene: gltf.scene, clips: gltf.animations, nativeSize };
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
        const gain = context.createGain();
        gain.gain.value = sound.volume;
        source.connect(gain).connect(context.destination);
        source.start();
        activeSounds.set(index, source);
      };
      const cached = soundBuffers.get(sound.clip);
      if (cached) play(cached);
      else
        loadSoundBuffer(sound.clip)?.then(play, (error) =>
          log(`Sound clip ${sound.clip} failed to load: ${String(error)}`),
        );
    });
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
  }
  let runtime: Runtime;
  try {
    runtime = await createEditorRuntime();
    el("runtime").textContent = "C++ runtime ready";
  } catch (error) {
    el("status").textContent = "Runtime failed to load. Reload or check build.";
    throw error;
  }
  let accumulator = 0,
    previous = performance.now(),
    ticks = 0;
  // Index into objects[]/the runtime's own entity list of the first
  // Player-tagged entity synced this Play session, or -1 if there is none.
  // Recomputed by syncRuntime() (Play, and Stop-then-Play again); stays
  // fixed for the rest of that session, matching the fact that entities
  // can't be added or removed while playing.
  let playerIndex = -1;
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
  const keyQueue: Array<[code: number, down: number]> = [];
  // Bound codes currently held down, so a Pause or a lost window focus can
  // force them back up even when no matching keyup DOM event arrives
  // (alt-tab, a window manager shortcut eating the key, etc.).
  const heldKeys = new Set<number>();
  // key_for()'s own contract (apps/editor/runtime/bridge.cpp): 0=W, 1=A,
  // 2=S, 3=D, 4=Shift, 5=F (melee attack), 6=G (ranged blast), 7=C
  // (crouch/sit -- freezes Player WASD input natively while held; see
  // editor.move's own doc comment, bridge.cpp).
  const boundKeyCodes: Record<string, number> = {
    KeyW: 0,
    KeyA: 1,
    KeyS: 2,
    KeyD: 3,
    ShiftLeft: 4,
    ShiftRight: 4,
    KeyF: 5,
    KeyG: 6,
    KeyC: 7,
  };
  const crouchKeyCode = 7;
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
    const code = boundKeyCodes[event.code];
    if (code !== undefined) {
      keyQueue.push([code, 1]);
      heldKeys.add(code);
    }
    const key = event.key.toLowerCase();
    scriptKeyByCode.set(event.code, key);
    scriptKeyQueue.push([key, 1]);
    heldScriptKeys.add(key);
  });
  window.addEventListener("keyup", (event) => {
    if (doc.mode === "edit") return;
    const code = boundKeyCodes[event.code];
    if (code !== undefined) {
      keyQueue.push([code, 0]);
      heldKeys.delete(code);
    }
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
  // `Attack`, Mannequin F (Mixamo)'s `punching`, Mannequin F's own `sit`;
  // see assets/CREDITS.md), so a single literal-name lookup would silently
  // no-op on most of the catalog. Not used for an ordinary Lua self.animate
  // request -- resolveActionClip below only expands a name that's actually
  // one of these three keys; anything else still resolves case-insensitively
  // against its own exact name only, the same as before this list existed.
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
  function syncRuntime() {
    runtime._editor_begin();
    playerIndex = -1;
    doc.scene.eachAlive().forEach((entity, index) => {
      const p = doc.scene.resolve(entity, "Transform")?.position ?? {
        x: 0,
        y: 0,
        z: 0,
      };
      const v = doc.scene.resolve(entity, "Velocity")?.value ?? {
        x: 0,
        y: 0,
        z: 0,
      };
      const s = doc.scene.resolve(entity, "Scale")?.value ?? { x: 1, y: 1, z: 1 };
      const isChild = doc.scene.effectiveHas(entity, "Parent") ? 1 : 0;
      const isPlayer = doc.scene.effectiveHas(entity, "Player") ? 1 : 0;
      const collider = doc.scene.resolve(entity, "Collider");
      const isCollider = collider ? 1 : 0;
      // "Sphere"/radius have been authorable here for a while (PropertyMetadata's
      // Collider.type dropdown), previously discarded entirely -- editor_add
      // now actually resolves the shape it's told, not always an AABB from Scale.
      const colliderShape = collider?.type === "Sphere" ? 1 : 0;
      const colliderRadius = collider?.radius ?? 0.5;
      const isVehicle = doc.scene.effectiveHas(entity, "Vehicle") ? 1 : 0;
      const isAi = doc.scene.effectiveHas(entity, "AIState") ? 1 : 0;
      const isPedestrian = doc.scene.effectiveHas(entity, "Pedestrian") ? 1 : 0;
      // Vehicle.archetype/Pedestrian.archetype have been authorable for a
      // while (their own PropertyMetadata dropdowns below) but previously
      // discarded entirely -- editor_add now actually resolves the handling/
      // wander profile it's told, not always the same one regardless.
      const vehicleArchetype = doc.scene.resolve(entity, "Vehicle")?.archetype ?? 0;
      const pedestrianArchetype = doc.scene.resolve(entity, "Pedestrian")?.archetype ?? 0;
      const health = doc.scene.resolve(entity, "Health");
      // hp_max <= 0 is the bridge's own "no Health" sentinel (see
      // editor_add's doc comment) — a real Health always has a positive max.
      const hpCurrent = health?.current ?? 0;
      const hpMax = health?.maximum ?? 0;
      // First Player-tagged entity wins if more than one is authored — the
      // bridge itself would happily drive every one of them from the same
      // input, but only one can sensibly own the camera and status readout.
      if (isPlayer && playerIndex < 0) playerIndex = index;
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
      // editor_add's own all-double ABI has no way to carry a Lua source
      // string, so a scripted entity's source is set through this companion
      // call instead (see editor_set_script_source's own doc comment,
      // bridge.cpp) — same index editor_add just placed this entity at.
      const script = doc.scene.resolve(entity, "Script");
      if (script)
        runtime.ccall(
          "editor_set_script_source",
          null,
          ["number", "string"],
          [index, script.source],
        );
    });
    if (!runtime._editor_commit())
      throw new Error("Runtime scene commit failed");
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
  function createLight(light: {
    type: "Point" | "Spot" | "Directional";
    color: Vec3;
    intensity: number;
    range: number;
    angle: number;
  }): THREE.Light {
    const color = new THREE.Color(light.color.x, light.color.y, light.color.z);
    switch (light.type) {
      case "Point":
        return new THREE.PointLight(color, light.intensity, light.range);
      case "Spot": {
        const l = new THREE.SpotLight(color, light.intensity, light.range, light.angle);
        l.target.position.set(0, 0, -1);
        l.add(l.target);
        return l;
      }
      case "Directional": {
        const l = new THREE.DirectionalLight(color, light.intensity);
        l.target.position.set(0, 0, -1);
        l.add(l.target);
        return l;
      }
    }
  }
  function rebuild() {
    gizmo.detach();
    for (const object of objects) object.removeFromParent();
    objects.length = 0;
    animStates.length = 0;
    // Unlike a mesh (which reuses catalogCache's shared geometry/material --
    // nothing new allocated per rebuild(), so nothing to dispose), every
    // Particles emitter allocates its own fresh BufferGeometry/PointsMaterial
    // (see createParticles()) each time. `execute()` calls rebuild() after
    // every successful command -- routine property edits, undo/redo, renames
    // -- so without disposing here, an entity with Particles would leak a new
    // set of GPU buffers on essentially every editor interaction.
    for (const state of particleStates) {
      state?.points.geometry.dispose();
      (state?.points.material as THREE.Material | undefined)?.dispose();
    }
    particleStates.length = 0;
    for (const state of deathStates) state?.materials.forEach(({ material }) => material.dispose());
    deathStates.length = 0;
    const refs = doc.scene.eachAlive();
    for (const entity of refs) {
      const renderable = doc.scene.resolve(entity, "Renderable");
      const meshId = renderable?.mesh ?? 0;
      const catalog = meshId >= 1 ? catalogEntry(meshId) : undefined;
      const cached = meshId >= 1 ? catalogCache.get(meshId) : undefined;
      let object: THREE.Object3D;
      let animState: AnimState | undefined;
      if (cached) {
        if (catalog?.animated) {
          object = SkeletonUtils.clone(cached.scene);
          const mixer = new THREE.AnimationMixer(object);
          const actions = new Map(
            cached.clips.map((clip) => [clip.name, mixer.clipAction(clip)]),
          );
          animState = { mixer, actions, prevPosition: new THREE.Vector3() };
          // An authored AnimationState.clip picks and pins a specific clip --
          // manually applied from the inspector's per-model dropdown, so it
          // previews immediately in Edit mode too, not just Play -- instead
          // of the automatic ground-speed-based pick below. "" (the default,
          // and whatever pickClipName can't find on this model) falls
          // through to that automatic behavior unchanged.
          const override = doc.scene.resolve(entity, "AnimationState");
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
      const p = doc.scene.resolve(entity, "Transform")?.position;
      if (p) anchor.position.set(p.x, p.y, p.z);
      if (animState) animState.prevPosition.copy(anchor.position);
      const r = doc.scene.resolve(entity, "Rotation")?.euler;
      if (r) anchor.rotation.set(r.x, r.y, r.z);
      const s = doc.scene.resolve(entity, "Scale")?.value;
      if (s && cached) {
        // Normalize by the model's own native size so an authored Scale is
        // the mesh's literal world-space size, matching the physics Box's
        // dimensions (same s.x/y/z) instead of stacking on top of it.
        const n = cached.nativeSize;
        anchor.scale.set(
          n.x > 1e-6 ? s.x / n.x : s.x,
          n.y > 1e-6 ? s.y / n.y : s.y,
          n.z > 1e-6 ? s.z / n.z : s.z,
        );
      } else if (s) anchor.scale.set(s.x, s.y, s.z);
      anchor.add(object);
      const light = doc.scene.resolve(entity, "Light");
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
      const particles = doc.scene.resolve(entity, "Particles");
      let particleState: ParticleState | undefined;
      if (particles) {
        particleState = createParticles(particles);
        anchor.add(particleState.points);
      }
      scene.add(anchor);
      objects.push(anchor);
      animStates.push(animState);
      particleStates.push(particleState);
      deathStates.push(undefined);
    }
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
        const playerObject = playerIndex >= 0 ? objects[playerIndex] : undefined;
        playerBaseScale = playerObject ? playerObject.scale.clone() : null;
        playerPrevY = playerObject?.position.y ?? 0;
        // Set before startSounds(), not after: a clip already decoded from
        // an earlier Play session starts synchronously inside that call, and
        // its own "is this session still running" guard checks doc.mode --
        // checking it while still "edit" would silence every already-cached
        // clip on the second and later Plays.
        doc.mode = "play";
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
    rebuild();
  };
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
      const button = uiButtonHits[i]!;
      if (
        clickX >= button.x &&
        clickX <= button.x + button.width &&
        clickY >= button.y &&
        clickY <= button.y + button.height
      ) {
        runUIAction(button.action);
        return;
      }
    }
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
  function frame(now: number) {
    const dt = Math.min((now - previous) / 1000, 5 / 60);
    previous = now;
    let steps = 0;
    const player = playerIndex >= 0 ? objects[playerIndex] : undefined;
    if (doc.mode === "play") {
      // Once per rendered frame, before any of this frame's ticks — mirrors
      // the native platform's own begin_frame()-then-apply-events-then-step
      // loop, so key_pressed()/key_released() read as single-frame edges
      // shared by every tick this frame runs, not per-tick.
      runtime._editor_input_begin_frame();
      // Once per rendered frame too, so this frame's on-foot movement (see
      // Runtime::camera_forward_x/z's own doc comment in bridge.cpp) reflects
      // wherever the camera is pointed right now, including mid-orbit.
      camera.getWorldDirection(cameraForwardScratch);
      runtime._editor_set_camera_forward(cameraForwardScratch.x, cameraForwardScratch.z);
      for (const [code, down] of keyQueue) runtime._editor_key(code, down);
      keyQueue.length = 0;
      for (const [key, down] of scriptKeyQueue)
        runtime.ccall("editor_script_key", null, ["string", "number"], [key, down]);
      scriptKeyQueue.length = 0;
      accumulator += dt;
      while (accumulator >= 1 / 60 && steps++ < 5) {
        runtime._editor_tick();
        ticks++;
        accumulator -= 1 / 60;
      }
      persistDirtySaves();
      pollAnimationRequests();
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
        if (!runtime._editor_alive(i)) {
          const state = (deathStates[i] ??= startDeath(object, animStates[i]));
          state.elapsed += dt;
          const progress = Math.max(0, 1 - state.elapsed / deathFadeDuration);
          for (const { material, baseOpacity } of state.materials)
            material.opacity = baseOpacity * progress;
          if (state.elapsed >= deathFadeDuration) object.visible = false;
          return;
        }
        object.position.set(
          runtime._editor_value(i, 0),
          runtime._editor_value(i, 1),
          runtime._editor_value(i, 2),
        );
      });
      // A Vehicle+Player entity's facing comes straight from its own steered
      // heading (bridge.cpp field 4), not inferred from position deltas like
      // the animated-entity facing below — that would lag and wobble
      // mid-turn, where a real heading is exact every tick.
      doc.scene.eachAlive().forEach((entity, i) => {
        if (!doc.scene.effectiveHas(entity, "Vehicle") || !doc.scene.effectiveHas(entity, "Player")) return;
        const object = objects[i];
        if (object && runtime._editor_alive(i)) object.rotation.y = runtime._editor_value(i, 4);
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
      if (steps > 0 && player && playerBaseScale && playerEntity && !doc.scene.effectiveHas(playerEntity, "Vehicle")) {
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
      if (player) controls.target.copy(player.position);
    }
    // Always advance mixers, even in edit mode: a rigged model sitting
    // perfectly still reads as a broken rig, and an idle clip is meant to loop.
    animStates.forEach((state) => state?.mixer.update(dt));
    // Same reasoning as mixers above -- a Particles emitter is as "always on"
    // as a Light, not gated to Play mode like Script/Sound.
    particleStates.forEach((state) => state && stepParticles(state, dt));
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
        const dx = object.position.x - state.prevPosition.x;
        const dz = object.position.z - state.prevPosition.z;
        const speed = groundSpeed(object.position, state.prevPosition, tickDt);
        state.prevPosition.copy(object.position);
        // Face the direction actually traveled — not for a Vehicle, whose
        // facing already comes from its own steered heading above, which is
        // exact every tick where this would lag and wobble mid-turn.
        // Without this, a walk/run clip plays while the mesh keeps whatever
        // fixed orientation it was authored with, sliding sideways or
        // backwards instead of visibly running toward where it's going.
        if (speed > 0.15 && !doc.scene.effectiveHas(entities[i]!, "Vehicle")) {
          const targetYaw = Math.atan2(dx, dz);
          const diff = Math.atan2(
            Math.sin(targetYaw - object.rotation.y),
            Math.cos(targetYaw - object.rotation.y),
          );
          const maxTurn = 10 * tickDt; // rad; generous enough not to lag a sharp turn
          object.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
        }
        // An authored AnimationState.clip (see rebuild()) pins the clip
        // rebuild() already applied -- Play mode's own ground-speed pick
        // must not fight it every tick.
        const override = doc.scene.resolve(entities[i]!, "AnimationState");
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
    if (composer) composer.render();
    else renderer.render(scene, camera);
    drawHud();
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
    const selectedScriptErrorReadout =
      doc.mode === "play" && selectedIndex >= 0 && doc.scene.effectiveHas(doc.selection!, "Script")
        ? (() => {
            const error = runtime.ccall("editor_script_error", "string", ["number"], [selectedIndex]);
            return error ? ` · Script error: ${error}` : "";
          })()
        : "";
    status.textContent = `${doc.mode.toUpperCase()} · ${backend} · ${doc.scene.entityCount} entities · ${ticks} C++ fixed ticks${playerReadout}${selectedHealthReadout}${selectedAiReadout}${selectedScriptErrorReadout} · ${doc.dirty ? "Unsaved changes" : "Saved"} · Gravity, ground, Collider box/sphere collision, Health-based combat (F melee, G blast), Vehicle driving (W/S/A/D), AIState/Pedestrian wander/chase/flee, Script (Lua on_tick), and Sound (Web Audio autoplay) are simulated`;
    requestAnimationFrame(frame);
  }
  const cameraForwardScratch = new THREE.Vector3();
  const hudScratch = new THREE.Vector3();
  // anchor -> (x/y fraction of the HUD canvas, canvas textAlign/textBaseline)
  // -- a UI element's screen position, unlike a Health bar's, is never
  // projected from a world position; it's just one of nine fixed points on
  // the viewport, the same layout language any screen-anchored HUD/menu uses.
  function uiAnchorLayout(anchor: UIAnchor) {
    const xFrac = anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5;
    const yFrac = anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5;
    const align: CanvasTextAlign = xFrac === 0 ? "left" : xFrac === 1 ? "right" : "center";
    const baseline: CanvasTextBaseline = yFrac === 0 ? "top" : yFrac === 1 ? "bottom" : "middle";
    return { xFrac, yFrac, align, baseline };
  }
  // Populated fresh by drawHud() every frame a Button is visible; consulted
  // by the pointerdown handler below to hit-test a click before it falls
  // through to normal 3D entity-selection raycasting. Screen-space rects,
  // not scene objects, so no relation to objects[]/animStates[]'s own
  // per-entity indexing.
  interface UIButtonHit {
    x: number;
    y: number;
    width: number;
    height: number;
    action: UIAction;
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
  function drawHud() {
    hudCtx.clearRect(0, 0, hud.width, hud.height);
    uiButtonHits.length = 0;
    if (doc.mode === "play")
      doc.scene.eachAlive().forEach((entity, index) => {
        if (!doc.scene.effectiveHas(entity, "Health")) return;
        if (!runtime._editor_alive(index)) return;
        const object = objects[index];
        if (!object) return;
        const ratio = runtime._editor_value(index, 3);
        if (ratio < 0) return;
        const scaleY = doc.scene.resolve(entity, "Scale")?.value.y ?? 1;
        hudScratch.copy(object.position);
        hudScratch.y += scaleY / 2 + 0.35;
        hudScratch.project(camera);
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
    for (const entity of doc.scene.eachAlive()) {
      const ui = doc.scene.resolve(entity, "UI");
      if (!ui) continue;
      if (ui.visibleWhen === "play" && doc.mode !== "play") continue;
      if (ui.visibleWhen === "pause" && doc.mode !== "pause") continue;
      const padding = 16;
      const { xFrac, yFrac, align, baseline } = uiAnchorLayout(ui.anchor);
      const x = xFrac * hud.width + (xFrac === 0 ? padding : xFrac === 1 ? -padding : 0);
      const y = yFrac * hud.height + (yFrac === 0 ? padding : yFrac === 1 ? -padding : 0);
      hudCtx.font = "600 16px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      hudCtx.textAlign = align;
      hudCtx.textBaseline = baseline;
      if (ui.kind === "Button") {
        const metrics = hudCtx.measureText(ui.text);
        const boxPadX = 14,
          boxPadY = 9;
        const width = metrics.width + boxPadX * 2;
        const height = 16 + boxPadY * 2;
        const left = x - (align === "left" ? 0 : align === "right" ? width : width / 2);
        const top = y - (baseline === "top" ? 0 : baseline === "bottom" ? height : height / 2);
        hudCtx.fillStyle = "rgba(30, 42, 56, 0.85)";
        hudCtx.fillRect(left, top, width, height);
        hudCtx.strokeStyle = "rgba(140, 190, 220, 0.6)";
        hudCtx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
        hudCtx.fillStyle = "#eaf6ff";
        // Set before fillText, not after -- fillText reads textAlign/
        // textBaseline at call time, and this draw point is already the
        // box's own center, not the anchor-derived point every other
        // anchor's align/baseline still describes at this point in the
        // function; leaving them unchanged shifted the label toward
        // bottom-right for every anchor except "center" itself.
        hudCtx.textAlign = "center";
        hudCtx.textBaseline = "middle";
        hudCtx.fillText(ui.text, left + width / 2, top + height / 2);
        // Clickable only outside Edit mode -- see UIComponent's own doc
        // comment (Components.ts) for why authoring a scene must never be
        // able to accidentally trigger a Button's command.
        if (doc.mode === "play" || doc.mode === "pause")
          uiButtonHits.push({ x: left, y: top, width, height, action: ui.action });
      } else {
        // Text gets a stroke outline instead of Button's background rect --
        // legible over any 3D scene content behind it without needing its
        // own backdrop.
        hudCtx.lineWidth = 3;
        hudCtx.strokeStyle = "rgba(10, 16, 24, 0.85)";
        hudCtx.strokeText(ui.text, x, y);
        hudCtx.fillStyle = "#eaf6ff";
        hudCtx.fillText(ui.text, x, y);
      }
    }
  }
  requestAnimationFrame(frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent =
    "Editor failed: " + String(error);
});

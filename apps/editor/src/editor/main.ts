import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  transformCommand,
  type TransformMode,
  type TransformSnapshot,
} from "./TransformEdit";
import type { AIStateName, EntityRef, Vec3 } from "../scene/Components";
import { propertyMetadata } from "./PropertyMetadata";
import { defaultComponent } from "../authoring/CommandInterpreter";
import { CanvasRenderer } from "./CanvasRenderer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { LocalStorageSceneStore } from "../authoring/CommandInterpreter";
import { EditorDocument } from "./Document";
import { modelCatalog, catalogCategories } from "../scene/modelCatalog";
import { pickClipName, groundSpeed } from "./animationClips";
import { loadOnce } from "./loadOnce";
import type { SceneComponents } from "../scene/Scene";
import "./style.css";

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
  // editor_set_script_source/editor_script_error's own doc comments (bridge.cpp)
  // explain why these two go through ccall instead of a direct _editor_*
  // binding like everything above: a Lua source string, and an error message
  // string, can't travel through the all-double ABI the rest of this type
  // uses. Exported via -sEXPORTED_RUNTIME_METHODS=ccall in tools/build_editor.sh.
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
};
declare const createEditorRuntime: () => Runtime | Promise<Runtime>;
async function startEditor() {
  const doc = new EditorDocument(
    new LocalStorageSceneStore("game-engine-editor:command-scene:"),
  );
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `<header>
  <span class="brand"><span class="brand-mark" aria-hidden="true"></span><b>GAME ENGINE</b></span>
  <span class="brand-sub">BTAI Editor <span class="version">0.29.0</span></span>
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
      <p class="hint">${modelCatalog.length} bundled CC0 models · Aether kit</p>
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
  const objects: THREE.Object3D[] = [];
  interface AnimState {
    mixer: THREE.AnimationMixer;
    actions: Map<string, THREE.AnimationAction>;
    current?: string;
    prevPosition: THREE.Vector3;
  }
  // Parallel to `objects`; index i holds the animation state for objects[i], or
  // undefined for a non-animated (static) entity. Reset alongside objects on every rebuild().
  const animStates: (AnimState | undefined)[] = [];
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
  // 2=S, 3=D, 4=Shift, 5=F (melee attack), 6=G (ranged blast).
  const boundKeyCodes: Record<string, number> = {
    KeyW: 0,
    KeyA: 1,
    KeyS: 2,
    KeyD: 3,
    ShiftLeft: 4,
    ShiftRight: 4,
    KeyF: 5,
    KeyG: 6,
  };
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
  }
  window.addEventListener("keydown", (event) => {
    if (doc.mode !== "play" || event.repeat) return;
    const code = boundKeyCodes[event.code];
    if (code !== undefined) {
      keyQueue.push([code, 1]);
      heldKeys.add(code);
    }
  });
  window.addEventListener("keyup", (event) => {
    if (doc.mode === "edit") return;
    const code = boundKeyCodes[event.code];
    if (code !== undefined) {
      keyQueue.push([code, 0]);
      heldKeys.delete(code);
    }
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
      const isCollider = doc.scene.effectiveHas(entity, "Collider") ? 1 : 0;
      const isVehicle = doc.scene.effectiveHas(entity, "Vehicle") ? 1 : 0;
      const isAi = doc.scene.effectiveHas(entity, "AIState") ? 1 : 0;
      const isPedestrian = doc.scene.effectiveHas(entity, "Pedestrian") ? 1 : 0;
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
    ticks = 0;
    accumulator = 0;
    keyQueue.length = 0;
    heldKeys.clear();
  }
  function rebuild() {
    gizmo.detach();
    for (const object of objects) object.removeFromParent();
    objects.length = 0;
    animStates.length = 0;
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
          // Play the resting clip immediately: every frame's mixer.update() keeps
          // it looping in both Edit and Play mode, so nothing here waits on the
          // Play-mode-only, tick-aligned speed measurement below to pick a clip.
          const resting = pickClipName([...actions.keys()], 0);
          if (resting) {
            actions.get(resting)?.play();
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
      const p = doc.scene.resolve(entity, "Transform")?.position;
      if (p) object.position.set(p.x, p.y, p.z);
      if (animState) animState.prevPosition.copy(object.position);
      const r = doc.scene.resolve(entity, "Rotation")?.euler;
      if (r) object.rotation.set(r.x, r.y, r.z);
      const s = doc.scene.resolve(entity, "Scale")?.value;
      if (s && cached) {
        // Normalize by the model's own native size so an authored Scale is
        // the mesh's literal world-space size, matching the physics Box's
        // dimensions (same s.x/y/z) instead of stacking on top of it.
        const n = cached.nativeSize;
        object.scale.set(
          n.x > 1e-6 ? s.x / n.x : s.x,
          n.y > 1e-6 ? s.y / n.y : s.y,
          n.z > 1e-6 ? s.z / n.z : s.z,
        );
      } else if (s) object.scale.set(s.x, s.y, s.z);
      scene.add(object);
      objects.push(object);
      animStates.push(animState);
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
      legend.append(iconEl("cube", "icon-component"), textSpan(type, "component-title"));
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
          if (meta.options) {
            const choice = document.createElement("select");
            choice.setAttribute("aria-label", `${type}.${prefix}${key}`);
            for (const option of meta.options)
              choice.add(new Option(option.label, String(option.value)));
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
    for (const type of [
      "Transform",
      "Rotation",
      "Scale",
      "Velocity",
      "Acceleration",
      "RigidBody",
      "Collider",
      "Health",
      "AIState",
      "Pedestrian",
      "Player",
      "Vehicle",
      "AnimationState",
      "Renderable",
      "Script",
    ])
      if (!doc.scene.effectiveHas(entity, type as keyof SceneComponents))
        add.add(new Option(type, type));
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
      }
      doc.mode = "play";
      updatePanels();
    } catch (e) {
      log(String(e));
    }
  };
  el("pause").onclick = () => {
    if (doc.mode === "play") {
      releaseHeldKeys();
      doc.mode = "pause";
    }
    updatePanels();
  };
  el("stop").onclick = () => {
    doc.mode = "edit";
    accumulator = 0;
    releaseHeldKeys();
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
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || gizmo.dragging || gizmo.axis !== null) return;
    const rect = renderer.domElement.getBoundingClientRect();
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
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    hud.width = w;
    hud.height = h;
  }).observe(viewport);
  wireResizer(el("resize-left"), "x", "--panel-left", 180, 480);
  wireResizer(el("resize-right"), "x", "--panel-right", 220, 480, true);
  wireResizer(el("resize-bottom"), "y", "--dock-height", 120, 480, true);
  wireResizer(el("resize-dock"), "x", "--dock-left-width", 220, 640);
  try {
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
  } catch (e) {
    log(String(e));
  }
  rebuild();
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
      accumulator += dt;
      while (accumulator >= 1 / 60 && steps++ < 5) {
        runtime._editor_tick();
        ticks++;
        accumulator -= 1 / 60;
      }
      objects.forEach((object, i) => {
        // Combat can destroy an authored entity (Health reaching 0) mid-session;
        // its index stays in objects[] (entities can't be added/removed while
        // playing), but editor_value() on a dead entity is meaningless, so hide
        // it instead of snapping it to the origin. Only forces visible false,
        // never true: rebuild() already set each object's visibility from its
        // own authored Renderable.visible, and an entity that's still alive
        // never needs that touched here.
        if (!runtime._editor_alive(i)) {
          object.visible = false;
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
    // Ground-speed clip selection runs on the fixed-step cadence (steps/60),
    // not every render frame — see groundSpeed()'s own comment for why.
    if (doc.mode === "play" && steps > 0) {
      const tickDt = steps / 60;
      const entities = doc.scene.eachAlive();
      animStates.forEach((state, i) => {
        if (!state) return;
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
        const clipName = pickClipName([...state.actions.keys()], speed);
        if (clipName && clipName !== state.current) {
          const next = state.actions.get(clipName);
          const previous = state.current
            ? state.actions.get(state.current)
            : undefined;
          if (next) {
            next.reset().fadeIn(0.2).play();
            if (previous && previous !== next) previous.fadeOut(0.2);
            state.current = clipName;
          }
        }
      });
    }
    if (selection.visible) selection.update();
    controls.update();
    renderer.render(scene, camera);
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
    status.textContent = `${doc.mode.toUpperCase()} · ${backend} · ${doc.scene.entityCount} entities · ${ticks} C++ fixed ticks${playerReadout}${selectedHealthReadout}${selectedAiReadout}${selectedScriptErrorReadout} · ${doc.dirty ? "Unsaved changes" : "Saved"} · Gravity, ground, Collider collision, Health-based combat (F melee, G blast), Vehicle driving (W/S/A/D), AIState/Pedestrian wander/chase/flee, and Script (Lua on_tick) are simulated`;
    requestAnimationFrame(frame);
  }
  const cameraForwardScratch = new THREE.Vector3();
  const hudScratch = new THREE.Vector3();
  // Screen-space Health bars, Play mode only (matches the player readout's
  // own scoping) — one small rectangle per alive entity that carries an
  // authored Health, positioned from its projected world position the same
  // way the native playground's BoxView::draw_bar reads a screen-space
  // position from a world one, redrawn from scratch every frame rather than
  // tracked incrementally since entities can be defeated (and combat, unlike
  // WASD, has no held/released state worth diffing against).
  function drawHud() {
    hudCtx.clearRect(0, 0, hud.width, hud.height);
    if (doc.mode !== "play") return;
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
  }
  requestAnimationFrame(frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent =
    "Editor failed: " + String(error);
});

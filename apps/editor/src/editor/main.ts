import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  transformCommand,
  type TransformMode,
  type TransformSnapshot,
} from "./TransformEdit";
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
};
declare const createEditorRuntime: () => Runtime | Promise<Runtime>;
async function startEditor() {
  const doc = new EditorDocument(
    new LocalStorageSceneStore("game-engine-editor:command-scene:"),
  );
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `<header>
  <span class="brand"><span class="brand-mark" aria-hidden="true"></span><b>GAME ENGINE</b></span>
  <span class="brand-sub">BTAI Editor <span class="version">0.9.0</span></span>
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
      <button id="bench" class="btn btn-sm">${iconHtml("cube")}<span>Add Aether bench</span></button>
      <p class="hint">bench.glb · bundled CC0 model</p>
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
  gizmo.addEventListener("mouseUp", () => {
    const current = gesture;
    gesture = undefined;
    if (!current || !gizmo.object) return;
    const command = transformCommand(
      current.entity,
      current.mode,
      current.before,
      snapshot(gizmo.object),
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
  let bench: THREE.Group | undefined;
  const gltfLoader = new GLTFLoader();
  interface CachedModel {
    scene: THREE.Group;
    clips: THREE.AnimationClip[];
  }
  const catalogCache = new Map<number, CachedModel>();
  const catalogPromises = new Map<number, Promise<CachedModel>>();
  function catalogEntry(meshId: number) {
    return modelCatalog.find((m) => m.id === meshId);
  }
  function loadCatalogModel(meshId: number): Promise<CachedModel> | undefined {
    const entry = catalogEntry(meshId);
    if (!entry) return undefined;
    let promise = catalogPromises.get(meshId);
    if (!promise) {
      promise = gltfLoader.loadAsync(entry.path).then((gltf) => {
        const cached = { scene: gltf.scene, clips: gltf.animations };
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
  function execute(command: unknown) {
    const result = doc.execute(command);
    log(result);
    if (result.ok) rebuild();
    return result;
  }
  function syncRuntime() {
    runtime._editor_begin();
    for (const entity of doc.scene.eachAlive()) {
      const p = doc.scene.get(entity, "Transform")?.position ?? {
        x: 0,
        y: 0,
        z: 0,
      };
      const v = doc.scene.get(entity, "Velocity")?.value ?? {
        x: 0,
        y: 0,
        z: 0,
      };
      const s = doc.scene.get(entity, "Scale")?.value ?? { x: 1, y: 1, z: 1 };
      const isChild = doc.scene.has(entity, "Parent") ? 1 : 0;
      if (
        !runtime._editor_add(p.x, p.y, p.z, v.x, v.y, v.z, s.x, s.y, s.z, isChild)
      ) {
        runtime._editor_commit();
        throw new Error(
          "Runtime rejects coordinates/velocity outside ±1,000,000",
        );
      }
    }
    if (!runtime._editor_commit())
      throw new Error("Runtime scene commit failed");
    ticks = 0;
    accumulator = 0;
  }
  function rebuild() {
    gizmo.detach();
    for (const object of objects) object.removeFromParent();
    objects.length = 0;
    animStates.length = 0;
    const refs = doc.scene.eachAlive();
    for (const entity of refs) {
      const renderable = doc.scene.get(entity, "Renderable");
      const meshId = renderable?.mesh ?? 0;
      const catalog = meshId >= 2 ? catalogEntry(meshId) : undefined;
      const cached = meshId >= 2 ? catalogCache.get(meshId) : undefined;
      let object: THREE.Object3D;
      let animState: AnimState | undefined;
      if (meshId === 1 && bench) {
        object = bench.clone(true);
      } else if (cached) {
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
        if (meshId >= 2)
          loadCatalogModel(meshId)
            ?.then(() => {
              if (doc.mode === "edit" && !gizmo.dragging) rebuild();
            })
            .catch((error) =>
              log(`Catalog model ${meshId} failed to load: ${String(error)}`),
            );
        object = new THREE.Mesh(geometry, material);
      }
      object.visible = renderable?.visible ?? true;
      const p = doc.scene.get(entity, "Transform")?.position;
      if (p) object.position.set(p.x, p.y, p.z);
      if (animState) animState.prevPosition.copy(object.position);
      const r = doc.scene.get(entity, "Rotation")?.euler;
      if (r) object.rotation.set(r.x, r.y, r.z);
      const s = doc.scene.get(entity, "Scale")?.value;
      if (s) object.scale.set(s.x, s.y, s.z);
      scene.add(object);
      objects.push(object);
      animStates.push(animState);
    }
    refs.forEach((entity, i) => {
      const parent = doc.scene.get(entity, "Parent")?.entity;
      if (parent && doc.scene.alive(parent)) {
        const pi = refs.findIndex((e) => e.index === parent.index);
        objects[pi]?.add(objects[i]!);
      }
    });
    updatePanels();
  }
  function updatePanels() {
    gizmo.detach();
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
        doc.scene.get(entity, "Name")?.value ?? `Entity ${entity.index}`;
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
      const hasParent = doc.scene.has(entity, "Parent");
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
    name.value = doc.scene.get(entity, "Name")?.value ?? "Entity";
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
            doc.scene.get(ref, "Name")?.value ?? String(ref.index),
            String(ref.index),
          ),
        );
    parent.value = String(doc.scene.get(entity, "Parent")?.entity.index ?? "");
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
    for (const type of doc.scene.getComponentNames(entity)) {
      if (type === "Parent" || type === "Name") continue;
      const section = document.createElement("details");
      section.className = "component-card";
      section.open = true;
      const legend = document.createElement("summary");
      legend.append(iconEl("cube", "icon-component"), textSpan(type, "component-title"));
      section.append(legend);
      // Generate fields from the component's serializable property shape; validation stays in authoring.
      const value = structuredClone(
        doc.scene.get(entity, type),
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
      "Vehicle",
      "AnimationState",
      "Renderable",
    ])
      if (!doc.scene.has(entity, type as keyof SceneComponents))
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
      if (doc.mode === "edit") syncRuntime();
      doc.mode = "play";
      updatePanels();
    } catch (e) {
      log(String(e));
    }
  };
  el("pause").onclick = () => {
    if (doc.mode === "play") doc.mode = "pause";
    updatePanels();
  };
  el("stop").onclick = () => {
    doc.mode = "edit";
    accumulator = 0;
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
  el("bench").onclick = () => {
    const result = execute({
      command: "spawn_entity",
      name: "Aether bench",
      transform: [0, 0, 0],
    });
    if (result.ok)
      execute({
        command: "set_component",
        entity: result.entity,
        type: "Renderable",
        value: { mesh: 1, material: 0, visible: true },
      });
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
  }).observe(viewport);
  wireResizer(el("resize-left"), "x", "--panel-left", 180, 480);
  wireResizer(el("resize-right"), "x", "--panel-right", 220, 480, true);
  wireResizer(el("resize-bottom"), "y", "--dock-height", 120, 480, true);
  wireResizer(el("resize-dock"), "x", "--dock-left-width", 220, 640);
  new GLTFLoader().load(
    "./bench.glb",
    (gltf) => {
      bench = gltf.scene;
      if (doc.mode === "edit" && !gizmo.dragging) rebuild();
    },
    undefined,
    (error) => log("Bench asset failed: " + String(error)),
  );
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
    if (doc.mode === "play") {
      accumulator += dt;
      while (accumulator >= 1 / 60 && steps++ < 5) {
        runtime._editor_tick();
        ticks++;
        accumulator -= 1 / 60;
      }
      objects.forEach((object, i) =>
        object.position.set(
          runtime._editor_value(i, 0),
          runtime._editor_value(i, 1),
          runtime._editor_value(i, 2),
        ),
      );
    }
    // Always advance mixers, even in edit mode: a rigged model sitting
    // perfectly still reads as a broken rig, and an idle clip is meant to loop.
    animStates.forEach((state) => state?.mixer.update(dt));
    // Ground-speed clip selection runs on the fixed-step cadence (steps/60),
    // not every render frame — see groundSpeed()'s own comment for why.
    if (doc.mode === "play" && steps > 0) {
      const tickDt = steps / 60;
      animStates.forEach((state, i) => {
        if (!state) return;
        const object = objects[i]!;
        const speed = groundSpeed(object.position, state.prevPosition, tickDt);
        state.prevPosition.copy(object.position);
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
    const status = el("status");
    status.dataset.mode = doc.mode;
    status.textContent = `${doc.mode.toUpperCase()} · ${backend} · ${doc.scene.entityCount} entities · ${ticks} C++ fixed ticks · ${doc.dirty ? "Unsaved changes" : "Saved"} · Physics components are data; collision simulation is not enabled`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent =
    "Editor failed: " + String(error);
});

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
import { LocalStorageSceneStore } from "../authoring/CommandInterpreter";
import { EditorDocument } from "./Document";
import type { SceneComponents } from "../scene/Scene";
import "./style.css";

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
  app.innerHTML = `<header><b>GAME ENGINE</b><span>BTAI Editor · 0.9.0</span><a href="../">Field Lab ↗</a></header>
<nav><button id="new">New scene</button><button id="save">Save JSON</button><label class="button">Open JSON<input id="open" type="file" accept=".json" hidden></label><button id="undo">Undo</button><button id="redo">Redo</button><button id="play">▶ Play</button><button id="pause">Pause</button><button id="stop">Stop</button><span id="document"></span></nav>
<main><aside><h2>Scene hierarchy</h2><input id="search" placeholder="Search entities"><div class="tools"><button id="add">+ Entity</button><button id="duplicate">Duplicate</button><button id="delete">Delete</button></div><div id="tree"></div><h2>Runtime</h2><p id="runtime">Loading C++ WebAssembly…</p><p>Editor: BTAI authoring<br>Preview: Three.js<br>Simulation: C++ World / FixedSystems</p></aside>
<section class="center"><div class="tools"><button id="translate" aria-pressed="true">Move</button><button id="rotate" aria-pressed="false">Rotate</button><button id="scale" aria-pressed="false">Scale</button><select id="space" aria-label="Transform space"><option value="world">World</option><option value="local">Local</option></select><label><input type="checkbox" id="snap"> Snap</label><select id="snap-size" aria-label="Move snap distance"><option value="0.25">0.25 m</option><option value="0.5">0.5 m</option><option value="1" selected>1 m</option></select><button id="frame">Frame selected</button><button id="grid">Grid</button><span>Drag to orbit · right-drag to pan · scroll to zoom</span></div><div id="viewport"></div></section>
<aside><h2>Inspector</h2><div id="inspector">Select an entity.</div></aside></main>
<section class="bottom"><div><h2>Project / Content</h2><input id="project" value="Untitled project" aria-label="Project name"><button id="bench">Add Aether bench</button><p>bench.glb · bundled CC0 model</p><a href="./ASSET-CREDITS.txt">Asset credits</a></div><div><h2>Authoring console</h2><form id="command"><input id="json" aria-label="JSON command" placeholder='{"command":"list_entities"}'><button>Execute</button></form><pre id="log" role="log"></pre></div></section><footer id="status">Starting editor…</footer>`;
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
      if (!runtime._editor_add(p.x, p.y, p.z, v.x, v.y, v.z)) {
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
    const refs = doc.scene.eachAlive();
    for (const entity of refs) {
      const renderable = doc.scene.get(entity, "Renderable");
      const object =
        renderable?.mesh === 1 && bench
          ? bench.clone(true)
          : new THREE.Mesh(geometry, material);
      object.visible = renderable?.visible ?? true;
      const p = doc.scene.get(entity, "Transform")?.position;
      if (p) object.position.set(p.x, p.y, p.z);
      const r = doc.scene.get(entity, "Rotation")?.euler;
      if (r) object.rotation.set(r.x, r.y, r.z);
      const s = doc.scene.get(entity, "Scale")?.value;
      if (s) object.scale.set(s.x, s.y, s.z);
      scene.add(object);
      objects.push(object);
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
      button.textContent =
        (doc.scene.has(entity, "Parent") ? "↳ " : "□ ") + name;
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
    const name = document.createElement("input");
    name.value = doc.scene.get(entity, "Name")?.value ?? "Entity";
    name.setAttribute("aria-label", "Entity name");
    name.onchange = () =>
      execute({ command: "rename_entity", entity, name: name.value });
    inspector.append(name);
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
    inspector.append(parent);
    for (const type of doc.scene.getComponentNames(entity)) {
      if (type === "Parent" || type === "Name") continue;
      const section = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = type;
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
      remove.textContent = "Remove " + type;
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
    if (doc.mode === "play") {
      accumulator += dt;
      let steps = 0;
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
    if (selection.visible) selection.update();
    controls.update();
    renderer.render(scene, camera);
    el("status").textContent =
      `${doc.mode.toUpperCase()} · ${backend} · ${doc.scene.entityCount} entities · ${ticks} C++ fixed ticks · ${doc.dirty ? "Unsaved changes" : "Saved"} · Physics components are data; collision simulation is not enabled`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
void startEditor().catch((error) => {
  console.error(error);
  document.getElementById("status")!.textContent =
    "Editor failed: " + String(error);
});
